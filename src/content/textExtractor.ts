import { TextExtractTarget, TranslatorSettings } from '../types';
import { isIgnoredElement, isTranslatableString } from '../utils/dom';

/**
 * Extracts translatable text from the DOM without touching nodes.
 *
 * Supported sources:
 *   - DOM text nodes
 *   - HTML attributes: placeholder, title, aria-label, aria-placeholder,
 *                      aria-description, alt, data-tooltip, data-title, data-tip
 *   - CSS pseudo-element content: ::before, ::after
 */
export class TextExtractor {
  private processedNodes = new WeakSet<Node>();
  private lastExtractedAttrValues = new WeakMap<HTMLElement, Map<string, string>>();

  reset() {
    this.processedNodes = new WeakSet<Node>();
    this.lastExtractedAttrValues = new WeakMap<HTMLElement, Map<string, string>>();
  }

  isProcessed(node: Node): boolean {
    return this.processedNodes.has(node);
  }

  markProcessed(node: Node) {
    this.processedNodes.add(node);
  }

  /**
   * Extract all translatable targets from a DOM subtree.
   * Returns immediately without modifying the DOM.
   */
  extractFromRoot(root: Node, settings: TranslatorSettings): TextExtractTarget[] {
    const targets: TextExtractTarget[] = [];
    if (!root) return targets;

    if (root instanceof HTMLElement && isIgnoredElement(root)) return targets;

    const doc = root.ownerDocument ?? (root as Document);
    const walker = doc.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node): number => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (isIgnoredElement(el)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_SKIP;
          }
          if (node.nodeType === Node.TEXT_NODE) {
            if (this.processedNodes.has(node)) return NodeFilter.FILTER_REJECT;
            const text = node.nodeValue?.trim();
            if (!text || !isTranslatableString(text)) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent || isIgnoredElement(parent)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        },
      },
    );

    let currentNode: Node | null = walker.nextNode();
    while (currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const text = currentNode.nodeValue?.trim() ?? '';
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

    // Attributes and CSS pseudo-elements
    if (settings.translatePlaceholders || settings.translateTooltips) {
      this.extractAttributes(root, settings, targets);
    }
    this.extractCssPseudo(root, targets);

    return targets;
  }

  // ── Attribute extraction ────────────────────────────────────────────────

  private extractAttributes(
    root: Node,
    settings: TranslatorSettings,
    targets: TextExtractTarget[],
  ) {
    const elementsToInspect: HTMLElement[] = [];

    if (root instanceof HTMLElement && !isIgnoredElement(root)) {
      elementsToInspect.push(root);
      const desc = root.querySelectorAll<HTMLElement>(
        'input, textarea, [title], [aria-label], [aria-placeholder], [aria-description], img[alt], [data-tooltip], [data-title], [data-tip]',
      );
      desc.forEach(el => { if (!isIgnoredElement(el)) elementsToInspect.push(el); });
    }

    for (const el of elementsToInspect) {
      if (settings.translatePlaceholders) {
        this.extractAttr(el, 'placeholder', targets);
        this.extractAttr(el, 'aria-placeholder', targets);
      }

      if (settings.translateTooltips) {
        this.extractAttr(el, 'title', targets);
        this.extractAttr(el, 'aria-label', targets);
        this.extractAttr(el, 'aria-description', targets);
        this.extractAttr(el, 'data-tooltip', targets);
        this.extractAttr(el, 'data-title', targets);
        this.extractAttr(el, 'data-tip', targets);
        this.extractAlt(el, targets);
      }
    }
  }

  private extractAttr(el: HTMLElement, attr: string, targets: TextExtractTarget[]) {
    let value: string | null = null;

    if (attr === 'placeholder') {
      value = (el as HTMLInputElement).placeholder || el.getAttribute('placeholder') || null;
    } else {
      value = el.getAttribute(attr);
    }

    const text = value?.trim();
    if (!text || !isTranslatableString(text)) return;

    // Avoid re-extracting our own injected translations
    const origAttr = el.getAttribute(`data-webtrans-orig-${attr}`);
    if (origAttr) {
      const lastTranslated = (el as any)[`__webtrans_last_${attr}`];
      if (lastTranslated && text === lastTranslated) return;
    }

    let attrMap = this.lastExtractedAttrValues.get(el);
    if (!attrMap) {
      attrMap = new Map<string, string>();
      this.lastExtractedAttrValues.set(el, attrMap);
    }

    if (attrMap.get(attr) === text) return;
    attrMap.set(attr, text);

    targets.push({
      node: el,
      type: 'attribute',
      attributeName: attr,
      originalText: text,
      element: el,
    });
  }

  private extractAlt(el: HTMLElement, targets: TextExtractTarget[]) {
    if (el.tagName !== 'IMG') return;
    const alt = (el as HTMLImageElement).alt?.trim();
    if (!alt || !isTranslatableString(alt)) return;

    let attrMap = this.lastExtractedAttrValues.get(el);
    if (!attrMap) {
      attrMap = new Map<string, string>();
      this.lastExtractedAttrValues.set(el, attrMap);
    }

    if (attrMap.get('alt') === alt) return;
    attrMap.set('alt', alt);

    targets.push({
      node: el,
      type: 'attribute',
      attributeName: 'alt',
      originalText: alt,
      element: el,
    });
  }

  // ── CSS ::before / ::after extraction ──────────────────────────────────

  /**
   * Reads CSS-generated content from ::before and ::after pseudo-elements.
   *
   * Only extracts when:
   *  - content is a quoted string (not `none`, `counter(...)`, URL, etc.)
   *  - the string contains at least one Unicode letter/CJK character
   *  - the string is not a single icon glyph or decorator
   */
  private extractCssPseudo(root: Node, targets: TextExtractTarget[]) {
    if (!(root instanceof Element)) return;

    const candidates = [root as HTMLElement, ...root.querySelectorAll<HTMLElement>('*')];

    for (const el of candidates) {
      if (isIgnoredElement(el)) continue;

      for (const pseudo of ['::before', '::after'] as const) {
        try {
          const computed = window.getComputedStyle(el, pseudo);
          const raw = computed.content;
          if (!raw || raw === 'none' || raw === 'normal' || raw === '""' || raw === "''") continue;

          const text = parseCssContent(raw);
          if (!text || !isTranslatableString(text)) continue;

          targets.push({
            node: el,
            type: pseudo === '::before' ? 'css-before' : 'css-after',
            originalText: text,
            element: el,
          });
        } catch {
          // getComputedStyle may throw on cross-origin frames — safe to ignore
        }
      }
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parses the CSS `content` property value and returns the human-readable string,
 * or null if it's not a translatable plain string.
 *
 * Examples:
 *   `"设置"`   → `设置`
 *   `'Login'`  → `Login`
 *   `counter(section)`  → null
 *   `url(...)`  → null
 */
function parseCssContent(content: string): string | null {
  // Must be a quoted string
  const dblQuote = content.match(/^"([\s\S]+)"$/);
  const sglQuote = content.match(/^'([\s\S]+)'$/);
  const inner = dblQuote?.[1] ?? sglQuote?.[1];
  if (!inner) return null;

  // Reject CSS escape sequences that represent icon font glyphs (\e000–\f8ff, etc.)
  if (/\\[0-9a-fA-F]{4,6}/.test(inner)) return null;

  // Reject single non-letter characters (decorators, bullets, arrows…)
  if (inner.length === 1 && !/[\p{L}\p{Script=Han}]/u.test(inner)) return null;

  return inner.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}
