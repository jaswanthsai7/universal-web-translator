/**
 * DOM utility functions for non-destructive translation
 */

const IGNORED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'SVG',
  'CANVAS',
  'AUDIO',
  'VIDEO',
  'SOURCE',
  'TRACK',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'WEBTRANS-ANNO',
  'WEBTRANS-HUD',
]);

const IGNORED_CLASSES = [
  'bpx-player-danmaku', // Bilibili danmaku bullet comments
  'bpx-player-video-wrap',
  'webtrans-ignore',
  'webtrans-overlay',
  'webtrans-hud-root',
];

/**
 * Checks whether an element is visible in the DOM
 */
export function isElementVisible(el: HTMLElement): boolean {
  if (!el || !el.isConnected) return false;
  if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.getClientRects().length === 0) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  return true;
}

/**
 * Checks whether an element or its ancestors should be ignored
 */
export function isIgnoredElement(el: Node | Element | null): boolean {
  if (!el) return false;
  let current: Node | null = el;

  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      if (element.tagName && IGNORED_TAGS.has(element.tagName.toUpperCase())) return true;
      if (typeof element.hasAttribute === 'function') {
        if (element.hasAttribute('data-webtrans-ignore') || element.hasAttribute('data-webtrans-owned')) return true;
      }
      if (element.id && typeof element.id === 'string' && element.id.startsWith('universal-webtrans-')) return true;

      if (element.className && typeof element.className === 'string') {
        for (const cls of IGNORED_CLASSES) {
          if (element.className.includes(cls)) return true;
        }
      }
      current = element.parentElement;
    } else if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
      current = current.parentElement;
    } else {
      break;
    }
  }
  return false;
}

/**
 * Recursively find all elements, traversing open shadow roots
 */
export function getAllElementsIncludingShadow(
  root: Element | Document | ShadowRoot
): Element[] {
  const elements: Element[] = [];
  const walker = (node: Element) => {
    elements.push(node);
    if (node.shadowRoot) {
      for (const child of Array.from(node.shadowRoot.children)) {
        walker(child);
      }
    }
  };

  const children = root instanceof Document ? root.body?.children : root.children;
  if (children) {
    for (const child of Array.from(children)) {
      walker(child);
    }
  }

  return elements;
}

/**
 * Validates whether string contains translatable human language
 */
export function isTranslatableString(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  if (trimmed.length < 2) return false;

  // Skip pure numbers, times, or dates (e.g. "123", "10:30", "2024-01-01")
  if (/^[\d\s:.,\/\-—_#%()]+$/.test(trimmed)) return false;

  // Skip pure video resolutions and technical specs (e.g. "1080P", "720p", "4K", "60FPS", "4K 60FPS")
  if (/^(?:\d+p\d*|[1-8]k|\d+\s*fps|hdr|dolby|hevc|av1)(?:\s+(?:\d+p\d*|[1-8]k|\d+\s*fps|hdr|dolby|hevc|av1))*$/i.test(trimmed)) {
    return false;
  }

  // Skip pure URLs or domain names
  if (/^(https?:\/\/|[a-z0-9\-_]+\.[a-z]{2,})/i.test(trimmed)) return false;

  // Skip pure punctuation or symbols
  if (/^[^\p{L}\p{N}]+$/u.test(trimmed)) return false;

  // Check if string contains letters, Chinese, Japanese, Korean, Arabic, or Cyrillic characters
  const hasLettersOrCharacters = /[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(trimmed);
  return hasLettersOrCharacters;
}
