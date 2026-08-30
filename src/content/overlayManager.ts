import { TextExtractTarget, TranslatorSettings } from '../types';
import type { TextExtractor } from './textExtractor';

export interface TextNodeState {
  original: string;
  injectedValue: string;
  translation: string;
  extraNode?: HTMLElement | null;
  applied: boolean;
}

/**
 * In-Place Native DOM Translation Engine.
 */
export class OverlayManager {
  private textState = new WeakMap<Node, TextNodeState>();
  private activeNodes = new Set<Node>();
  private activeExtraNodes = new Set<HTMLElement>();
  private modifiedAttributes = new Set<{ element: HTMLElement; attr: string; original: string }>();
  private settings: TranslatorSettings;
  private textExtractor?: TextExtractor;

  constructor(settings: TranslatorSettings, textExtractor?: TextExtractor) {
    this.settings = settings;
    this.textExtractor = textExtractor;
  }

  updateSettings(settings: TranslatorSettings) {
    const oldMode = this.settings.mode;
    this.settings = settings;

    if (oldMode !== settings.mode) {
      // Re-apply current translations under the new mode
      this.reapplyAll();
    }
  }

  /**
   * Applies translation to a target element or text node.
   */
  applyTranslation(target: TextExtractTarget, rawTranslatedText: string) {
    if (!rawTranslatedText) return;

    const cleanTranslation = rawTranslatedText
      .replace(/^\[(?:EN|ZH|JA|KO|ES|FR|DE|RU|PT|IT|AR|HI|TR|VI|TH|ID):\s*/i, '')
      .replace(/\]$/, '')
      .trim();

    if (!cleanTranslation) return;
    target.translatedText = cleanTranslation;

    if (target.type === 'attribute' && target.attributeName) {
      this.applyAttributeTranslation(target, cleanTranslation);
      return;
    }

    if (target.type === 'css-before' || target.type === 'css-after') {
      // Pseudo-elements cannot have nodeValue edited; apply via data-attribute or title
      target.element.setAttribute(`data-webtrans-${target.type}`, cleanTranslation);
      return;
    }

    // DOM Text Node translation
    const node = target.node;
    if (!node || node.nodeType !== Node.TEXT_NODE || !node.isConnected) return;

    this.applyTextNodeTranslation(node, target.originalText, cleanTranslation);
  }

  /**
   * Translates a text node in-place
   */
  private applyTextNodeTranslation(node: Node, originalText: string, translatedText: string) {
    let state = this.textState.get(node);
    if (!state) {
      state = {
        original: originalText || node.nodeValue || '',
        injectedValue: '',
        translation: translatedText,
        applied: false,
      };
      this.textState.set(node, state);
    }

    const mode = this.settings.mode;

    if (mode === 'translated-only') {
      // Remove any previously attached bilingual sibling
      this.removeExtraNode(state);

      const origVal = state.original || node.nodeValue || '';
      let leadWs = origVal.match(/^(\s+)/)?.[1] ?? '';
      let trailWs = origVal.match(/(\s+)$/)?.[1] ?? '';

      // Add boundary spacing if adjacent to element nodes
      if (!leadWs && node.previousSibling?.nodeType === Node.ELEMENT_NODE) leadWs = ' ';
      if (!trailWs && node.nextSibling?.nodeType === Node.ELEMENT_NODE) trailWs = ' ';

      const withWs = leadWs + translatedText + trailWs;
      if (node.nodeValue !== withWs) {
        node.nodeValue = withWs;
      }

      state.injectedValue = withWs;
      state.translation = translatedText;
      state.applied = true;
      this.activeNodes.add(node);
      if (this.textExtractor) {
        this.textExtractor.markProcessed(node, withWs.trim());
      }
    } else if (mode === 'dual') {
      // Dual / bilingual mode: keep original text in nodeValue and insert adjacent span
      if (node.nodeValue !== state.original) {
        node.nodeValue = state.original;
      }

      let extraNode = state.extraNode;
      if (!extraNode || !extraNode.isConnected) {
        extraNode = document.createElement('span');
        extraNode.setAttribute('data-webtrans-owned', '1');
        extraNode.setAttribute('data-webtrans-ignore', 'true');
        extraNode.className = 'webtrans-bilingual-tag';
        extraNode.style.cssText = 'color: #3b82f6; font-size: 0.88em; margin-left: 4px; pointer-events: none; user-select: text;';

        if (node.parentNode) {
          node.parentNode.insertBefore(extraNode, node.nextSibling);
        }
        state.extraNode = extraNode;
        this.activeExtraNodes.add(extraNode);
      }

      extraNode.textContent = ` | ${translatedText}`;
      state.injectedValue = state.original;
      state.translation = translatedText;
      state.applied = true;
      this.activeNodes.add(node);
    } else if (mode === 'hover') {
      // Hover mode: restore original text and add tooltip to parent element
      if (node.nodeValue !== state.original) {
        node.nodeValue = state.original;
      }
      this.removeExtraNode(state);

      const parent = node.parentElement;
      if (parent) {
        parent.setAttribute('title', translatedText);
      }
      state.injectedValue = state.original;
      state.applied = true;
    }
  }

  /**
   * Applies translation to an HTML attribute (placeholder, title, aria-label, alt)
   */
  private applyAttributeTranslation(target: TextExtractTarget, cleanTranslation: string) {
    const el = target.element;
    const attr = target.attributeName!;
    if (!el || !el.isConnected) return;

    const original = target.originalText;

    if (attr === 'placeholder' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      if (!el.hasAttribute('data-webtrans-orig-placeholder')) {
        el.setAttribute('data-webtrans-orig-placeholder', original);
        this.modifiedAttributes.add({ element: el, attr: 'placeholder', original });
      }
      (el as any)['__webtrans_last_placeholder'] = cleanTranslation;
      (el as any)['__webtrans_last_title'] = cleanTranslation;
      el.placeholder = cleanTranslation;
      el.setAttribute('placeholder', cleanTranslation);
      if (el.getAttribute('title') === original || !el.getAttribute('title')) {
        el.setAttribute('title', cleanTranslation);
      }
    } else if (attr === 'title') {
      if (!el.hasAttribute('data-webtrans-orig-title')) {
        el.setAttribute('data-webtrans-orig-title', original);
        this.modifiedAttributes.add({ element: el, attr: 'title', original });
      }
      (el as any)['__webtrans_last_title'] = cleanTranslation;
      el.setAttribute('title', cleanTranslation);
    } else if (attr === 'aria-label' || attr === 'aria-placeholder' || attr === 'aria-description') {
      if (!el.hasAttribute(`data-webtrans-orig-${attr}`)) {
        el.setAttribute(`data-webtrans-orig-${attr}`, original);
        this.modifiedAttributes.add({ element: el, attr, original });
      }
      el.setAttribute(attr, cleanTranslation);
    } else if (attr === 'alt' && el instanceof HTMLImageElement) {
      if (!el.hasAttribute('data-webtrans-orig-alt')) {
        el.setAttribute('data-webtrans-orig-alt', original);
        this.modifiedAttributes.add({ element: el, attr: 'alt', original });
      }
      el.alt = cleanTranslation;
    }
  }

  private removeExtraNode(state: TextNodeState) {
    if (state.extraNode) {
      if (state.extraNode.isConnected) {
        state.extraNode.remove();
      }
      this.activeExtraNodes.delete(state.extraNode);
      state.extraNode = null;
    }
  }

  /**
   * Re-applies active translations when switching modes (e.g. translated-only <-> dual)
   */
  private reapplyAll() {
    for (const node of this.activeNodes) {
      if (!node.isConnected) {
        this.activeNodes.delete(node);
        continue;
      }
      const state = this.textState.get(node);
      if (state && state.applied && state.translation) {
        this.applyTextNodeTranslation(node, state.original, state.translation);
      }
    }
  }

  /**
   * Checks if a mutation's new nodeValue was injected by this translator.
   * Used by MutationObserver to prevent infinite loops.
   */
  isSelfMutation(node: Node, newValue: string): boolean {
    const state = this.textState.get(node);
    if (!state) return false;
    return state.injectedValue === newValue;
  }

  /**
   * Notifies translator that a text node was updated externally by the host application (e.g. Vue/React).
   */
  updateOriginalText(node: Node, newOriginal: string) {
    const state = this.textState.get(node);
    if (state) {
      state.original = newOriginal;
      state.applied = false;
      state.injectedValue = '';
    }
  }

  /**
   * In-place translation naturally flows with layout; repositionAll is a no-op kept for interface compatibility.
   */
  repositionAll() {
    // No-op for in-place translations
  }

  /**
   * Compatibility helper for tests.
   */
  drainForTesting() {
    // In-place updates apply synchronously
  }

  /**
   * Restores all modified nodes and attributes to their original untranslated state.
   */
  clear() {
    // Restore text nodes
    for (const node of this.activeNodes) {
      if (node.isConnected) {
        const state = this.textState.get(node);
        if (state && state.original) {
          node.nodeValue = state.original;
        }
      }
    }
    this.activeNodes.clear();

    // Remove bilingual tags
    for (const extra of this.activeExtraNodes) {
      if (extra.isConnected) {
        extra.remove();
      }
    }
    this.activeExtraNodes.clear();

    // Restore attributes
    for (const item of this.modifiedAttributes) {
      if (item.element.isConnected) {
        if (item.attr === 'placeholder' && (item.element instanceof HTMLInputElement || item.element instanceof HTMLTextAreaElement)) {
          item.element.placeholder = item.original;
        } else if (item.attr === 'alt' && item.element instanceof HTMLImageElement) {
          item.element.alt = item.original;
        } else {
          item.element.setAttribute(item.attr, item.original);
        }
        item.element.removeAttribute(`data-webtrans-orig-${item.attr}`);
      }
    }
    this.modifiedAttributes.clear();
  }
}
