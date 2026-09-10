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
  'bpx-player-row-dm', // Flying bullet comments on video canvas
  'bpx-player-danmaku-item',
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

export interface IgnoredElementOptions {
  allowInputForAttributes?: boolean;
}

/**
 * Checks whether an element or any ancestor is an editable field,
 * rich text editor, chat box, active typing area, or explicitly marked as notranslate.
 * This guarantees typing in chat boxes (Gemini, ChatGPT, Claude, Slack, Discord, etc.)
 * and inputs is never interrupted or corrupted by in-place translation.
 */
export function isEditableOrActiveInput(
  node: Node | Element | null,
  options?: IgnoredElementOptions
): boolean {
  if (!node) return false;

  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node) as HTMLElement | null;
  if (!el || typeof el.getAttribute !== 'function') return false;

  // 1. Native input / textarea / select tags
  const tag = el.tagName ? el.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'RICH-TEXTAREA' || tag === 'SELECT') {
    if (options?.allowInputForAttributes) {
      // For placeholder attribute extraction: only allow if not currently focused
      if (typeof document !== 'undefined' && document.activeElement === el) {
        return true;
      }
      return false;
    }
    return true;
  }

  // 2. Native HTML isContentEditable
  if (el.isContentEditable) return true;

  // 3. Ancestor check for editable attributes, roles, and rich-editor framework classes
  let curr: HTMLElement | null = el;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    if (curr.isContentEditable) return true;

    const cTag = curr.tagName ? curr.tagName.toUpperCase() : '';
    if (cTag === 'INPUT' || cTag === 'TEXTAREA' || cTag === 'RICH-TEXTAREA' || cTag === 'SELECT') {
      if (options?.allowInputForAttributes && curr === el) {
        if (typeof document !== 'undefined' && document.activeElement === el) {
          return true;
        }
        return false;
      }
      return true;
    }

    if (typeof curr.hasAttribute === 'function') {
      if (curr.hasAttribute('contenteditable')) {
        const ce = curr.getAttribute('contenteditable');
        if (ce !== 'false') return true;
      }
      const role = curr.getAttribute('role');
      if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
        return true;
      }
      if (curr.hasAttribute('data-lexical-editor') || curr.hasAttribute('data-slate-editor')) {
        return true;
      }
      if (curr.getAttribute('translate') === 'no') {
        return true;
      }
    }

    const className = typeof curr.className === 'string' ? curr.className : '';
    if (className) {
      if (
        className.includes('ql-editor') ||
        className.includes('ql-container') ||
        className.includes('ProseMirror') ||
        className.includes('DraftEditor-root') ||
        className.includes('public-DraftEditor-content') ||
        className.includes('monaco-editor') ||
        className.includes('cm-editor') ||
        className.includes('CodeMirror') ||
        className.includes('ace_editor') ||
        className.includes('reply-box-textarea') ||
        className.includes('bili-rich-text-input') ||
        className.includes('comment-send-input') ||
        className.includes('notranslate')
      ) {
        return true;
      }
    }

    curr = curr.parentElement;
  }

  // 4. Check if element is active or inside the active focused element
  if (typeof document !== 'undefined' && document.activeElement) {
    const active = document.activeElement as HTMLElement;
    if (active && active !== document.body && active !== document.documentElement) {
      if (active === el || el.contains(active) || active.contains(el)) {
        const aTag = active.tagName ? active.tagName.toUpperCase() : '';
        if (
          active.isContentEditable ||
          aTag === 'INPUT' ||
          aTag === 'TEXTAREA' ||
          aTag === 'RICH-TEXTAREA' ||
          active.getAttribute('role') === 'textbox'
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Checks whether an element or its ancestors should be ignored
 */
export function isIgnoredElement(
  el: Node | Element | null,
  options?: IgnoredElementOptions
): boolean {
  if (!el) return false;
  if (isEditableOrActiveInput(el, options)) return true;

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
export function isTranslatableString(
  str: string,
  targetLang?: string,
  sourceLang?: string
): boolean {
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

  // When target language is English ('en'):
  if (targetLang && (targetLang === 'en' || targetLang.startsWith('en-'))) {
    // If source language is specified as Chinese ('zh'), require Chinese characters
    if (sourceLang === 'zh' || sourceLang === 'zh-CN' || sourceLang === 'zh-TW') {
      return /[\p{Script=Han}]/u.test(trimmed);
    }

    // When source language is 'auto' and target is English:
    // Check if string contains foreign/non-Latin scripts (Chinese, Japanese, Korean, Cyrillic, Arabic, etc.)
    const hasForeignScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Thai}]/u.test(trimmed);
    if (!hasForeignScript) {
      // If it is already standard ASCII English text, no translation needed
      const isPureAsciiEnglish = /^[a-zA-Z0-9\s.,!?'"()\-–—_#%&*+/:;<>@~`=\[\]{}^$|\\]+$/.test(trimmed);
      if (isPureAsciiEnglish) {
        return false;
      }
    }
  }

  // Check if string contains letters, Chinese, Japanese, Korean, Arabic, or Cyrillic characters
  const hasLettersOrCharacters = /[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(trimmed);
  return hasLettersOrCharacters;
}
