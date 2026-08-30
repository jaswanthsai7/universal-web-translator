import { TextExtractTarget, TranslatorSettings } from '../types';
import { isIgnoredElement, isTranslatableString } from '../utils/dom';

export class TextExtractor {
  private processedNodes = new WeakSet<Node>();
  private processedElements = new WeakSet<HTMLElement>();

  reset() {
    this.processedNodes = new WeakSet<Node>();
    this.processedElements = new WeakSet<HTMLElement>();
  }

  isProcessed(node: Node): boolean {
    return this.processedNodes.has(node);
  }

  markProcessed(node: Node) {
    this.processedNodes.add(node);
  }

  /**
   * Extracts translatable text nodes and attributes from a target root or element
   */
  extractFromRoot(
    root: Node,
    settings: TranslatorSettings
  ): TextExtractTarget[] {
    const targets: TextExtractTarget[] = [];
    if (!root) return targets;

    // If root itself is an element and ignored, skip completely
    if (root instanceof HTMLElement && isIgnoredElement(root)) {
      return targets;
    }

    // Use standard DOM TreeWalker to find Text nodes efficiently
    const doc = root.ownerDocument || (root as Document);
    const walker = doc.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (isIgnoredElement(el)) {
              return NodeFilter.FILTER_REJECT; // Reject element and all its children
            }
            return NodeFilter.FILTER_SKIP; // Continue to child text nodes
          }

          if (node.nodeType === Node.TEXT_NODE) {
            if (this.processedNodes.has(node)) {
              return NodeFilter.FILTER_REJECT;
            }
            const text = node.nodeValue?.trim();
            if (!text || !isTranslatableString(text)) {
              return NodeFilter.FILTER_REJECT;
            }
            const parent = node.parentElement;
            if (!parent || isIgnoredElement(parent)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_SKIP;
        },
      }
    );

    let currentNode: Node | null = walker.nextNode();
    while (currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const text = currentNode.nodeValue?.trim() || '';
        const parent = currentNode.parentElement;
        if (parent) {
          this.processedNodes.add(currentNode);
          targets.push({
            node: currentNode,
            type: 'text',
            originalText: text,
            element: parent,
          });
        }
      }
      currentNode = walker.nextNode();
    }

    // Process translatable attributes on elements if configured
    if (
      settings.translatePlaceholders ||
      settings.translateTooltips
    ) {
      this.extractAttributes(root, settings, targets);
    }

    return targets;
  }

  private extractAttributes(
    root: Node,
    settings: TranslatorSettings,
    targets: TextExtractTarget[]
  ) {
    const elementsToInspect: HTMLElement[] = [];
    if (root instanceof HTMLElement && !isIgnoredElement(root)) {
      elementsToInspect.push(root);
      const descendants = root.querySelectorAll<HTMLElement>('input, textarea, [title], [aria-label], img[alt]');
      descendants.forEach(el => {
        if (!isIgnoredElement(el)) elementsToInspect.push(el);
      });
    }

    for (const el of elementsToInspect) {
      if (this.processedElements.has(el)) continue;

      // Placeholder on inputs
      if (settings.translatePlaceholders && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        const placeholder = el.placeholder?.trim();
        if (placeholder && isTranslatableString(placeholder)) {
          targets.push({
            node: el,
            type: 'attribute',
            attributeName: 'placeholder',
            originalText: placeholder,
            element: el,
          });
        }
      }

      // Title attribute (tooltips)
      if (settings.translateTooltips && el.hasAttribute('title')) {
        const title = el.getAttribute('title')?.trim();
        if (title && isTranslatableString(title)) {
          targets.push({
            node: el,
            type: 'attribute',
            attributeName: 'title',
            originalText: title,
            element: el,
          });
        }
      }

      // ARIA label
      if (settings.translateTooltips && el.hasAttribute('aria-label')) {
        const ariaLabel = el.getAttribute('aria-label')?.trim();
        if (ariaLabel && isTranslatableString(ariaLabel)) {
          targets.push({
            node: el,
            type: 'attribute',
            attributeName: 'aria-label',
            originalText: ariaLabel,
            element: el,
          });
        }
      }

      this.processedElements.add(el);
    }
  }
}
