var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
(function() {
  "use strict";
  const MESSAGE_TYPES = {
    TRANSLATE_BATCH: "TRANSLATE_BATCH",
    GET_SETTINGS: "GET_SETTINGS",
    SAVE_SETTINGS: "SAVE_SETTINGS",
    CLEAR_CACHE: "CLEAR_CACHE",
    GET_CACHE_STATS: "GET_CACHE_STATS",
    SETTINGS_CHANGED: "SETTINGS_CHANGED",
    TRANSLATION_PROGRESS: "TRANSLATION_PROGRESS"
  };
  const IGNORED_TAGS = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "CODE",
    "PRE",
    "SVG",
    "CANVAS",
    "AUDIO",
    "VIDEO",
    "SOURCE",
    "TRACK",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "WEBTRANS-ANNO",
    "WEBTRANS-HUD"
  ]);
  const IGNORED_CLASSES = [
    "bpx-player-row-dm",
    // Flying bullet comments on video canvas
    "bpx-player-danmaku-item",
    "webtrans-ignore",
    "webtrans-overlay",
    "webtrans-hud-root"
  ];
  function isIgnoredElement(el) {
    if (!el) return false;
    let current = el;
    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current;
        if (element.tagName && IGNORED_TAGS.has(element.tagName.toUpperCase())) return true;
        if (typeof element.hasAttribute === "function") {
          if (element.hasAttribute("data-webtrans-ignore") || element.hasAttribute("data-webtrans-owned")) return true;
        }
        if (element.id && typeof element.id === "string" && element.id.startsWith("universal-webtrans-")) return true;
        if (element.className && typeof element.className === "string") {
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
  function isTranslatableString(str) {
    if (!str) return false;
    const trimmed = str.trim();
    if (trimmed.length < 2) return false;
    if (/^[\d\s:.,\/\-—_#%()]+$/.test(trimmed)) return false;
    if (/^(?:\d+p\d*|[1-8]k|\d+\s*fps|hdr|dolby|hevc|av1)(?:\s+(?:\d+p\d*|[1-8]k|\d+\s*fps|hdr|dolby|hevc|av1))*$/i.test(trimmed)) {
      return false;
    }
    if (/^(https?:\/\/|[a-z0-9\-_]+\.[a-z]{2,})/i.test(trimmed)) return false;
    if (/^[^\p{L}\p{N}]+$/u.test(trimmed)) return false;
    const hasLettersOrCharacters = /[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(trimmed);
    return hasLettersOrCharacters;
  }
  class TextExtractor {
    constructor() {
      __publicField(this, "lastExtractedText", /* @__PURE__ */ new WeakMap());
      __publicField(this, "lastExtractedAttrValues", /* @__PURE__ */ new WeakMap());
    }
    reset() {
      this.lastExtractedText = /* @__PURE__ */ new WeakMap();
      this.lastExtractedAttrValues = /* @__PURE__ */ new WeakMap();
    }
    isProcessed(node) {
      var _a;
      const text = (_a = node.nodeValue) == null ? void 0 : _a.trim();
      return this.lastExtractedText.get(node) === text;
    }
    markProcessed(node, text) {
      var _a;
      const val = text ?? (((_a = node.nodeValue) == null ? void 0 : _a.trim()) || "");
      this.lastExtractedText.set(node, val);
    }
    /**
     * Extract all translatable targets from a DOM subtree.
     * Returns immediately without modifying the DOM.
     */
    extractFromRoot(root, settings) {
      var _a, _b;
      const targets = [];
      if (!root) return targets;
      if (root.nodeType === Node.TEXT_NODE) {
        const textNode = root;
        const parent = textNode.parentElement;
        if (parent && !isIgnoredElement(parent)) {
          const text = ((_a = textNode.nodeValue) == null ? void 0 : _a.trim()) ?? "";
          if (text && isTranslatableString(text) && this.lastExtractedText.get(textNode) !== text) {
            this.lastExtractedText.set(textNode, text);
            targets.push({
              node: textNode,
              type: "text",
              originalText: text,
              element: parent
            });
          }
        }
        return targets;
      }
      if (root instanceof HTMLElement && isIgnoredElement(root)) return targets;
      const doc = root.ownerDocument ?? root;
      const walker = doc.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            var _a2;
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node;
              if (isIgnoredElement(el)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_SKIP;
            }
            if (node.nodeType === Node.TEXT_NODE) {
              const text = (_a2 = node.nodeValue) == null ? void 0 : _a2.trim();
              if (!text || !isTranslatableString(text)) return NodeFilter.FILTER_REJECT;
              if (this.lastExtractedText.get(node) === text) return NodeFilter.FILTER_REJECT;
              const parent = node.parentElement;
              if (!parent || isIgnoredElement(parent)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
      let currentNode = walker.nextNode();
      while (currentNode) {
        if (currentNode.nodeType === Node.TEXT_NODE) {
          const text = ((_b = currentNode.nodeValue) == null ? void 0 : _b.trim()) ?? "";
          const parent = currentNode.parentElement;
          if (parent) {
            this.lastExtractedText.set(currentNode, text);
            targets.push({
              node: currentNode,
              type: "text",
              originalText: text,
              element: parent
            });
          }
        }
        currentNode = walker.nextNode();
      }
      if (settings.translatePlaceholders || settings.translateTooltips) {
        this.extractAttributes(root, settings, targets);
      }
      this.extractCssPseudo(root, targets);
      return targets;
    }
    // ── Attribute extraction ────────────────────────────────────────────────
    extractAttributes(root, settings, targets) {
      const elementsToInspect = [];
      if (root instanceof HTMLElement && !isIgnoredElement(root)) {
        elementsToInspect.push(root);
        const desc = root.querySelectorAll(
          "input, textarea, [title], [aria-label], [aria-placeholder], [aria-description], img[alt], [data-tooltip], [data-title], [data-tip]"
        );
        desc.forEach((el) => {
          if (!isIgnoredElement(el)) elementsToInspect.push(el);
        });
      }
      for (const el of elementsToInspect) {
        if (settings.translatePlaceholders) {
          this.extractAttr(el, "placeholder", targets);
          this.extractAttr(el, "aria-placeholder", targets);
        }
        if (settings.translateTooltips) {
          this.extractAttr(el, "title", targets);
          this.extractAttr(el, "aria-label", targets);
          this.extractAttr(el, "aria-description", targets);
          this.extractAttr(el, "data-tooltip", targets);
          this.extractAttr(el, "data-title", targets);
          this.extractAttr(el, "data-tip", targets);
          this.extractAlt(el, targets);
        }
      }
    }
    extractAttr(el, attr, targets) {
      let value = null;
      if (attr === "placeholder") {
        value = el.placeholder || el.getAttribute("placeholder") || null;
      } else {
        value = el.getAttribute(attr);
      }
      const text = value == null ? void 0 : value.trim();
      if (!text || !isTranslatableString(text)) return;
      const origAttr = el.getAttribute(`data-webtrans-orig-${attr}`);
      if (origAttr) {
        const lastTranslated = el[`__webtrans_last_${attr}`];
        if (lastTranslated && text === lastTranslated) return;
      }
      let attrMap = this.lastExtractedAttrValues.get(el);
      if (!attrMap) {
        attrMap = /* @__PURE__ */ new Map();
        this.lastExtractedAttrValues.set(el, attrMap);
      }
      if (attrMap.get(attr) === text) return;
      attrMap.set(attr, text);
      targets.push({
        node: el,
        type: "attribute",
        attributeName: attr,
        originalText: text,
        element: el
      });
    }
    extractAlt(el, targets) {
      var _a;
      if (el.tagName !== "IMG") return;
      const alt = (_a = el.alt) == null ? void 0 : _a.trim();
      if (!alt || !isTranslatableString(alt)) return;
      let attrMap = this.lastExtractedAttrValues.get(el);
      if (!attrMap) {
        attrMap = /* @__PURE__ */ new Map();
        this.lastExtractedAttrValues.set(el, attrMap);
      }
      if (attrMap.get("alt") === alt) return;
      attrMap.set("alt", alt);
      targets.push({
        node: el,
        type: "attribute",
        attributeName: "alt",
        originalText: alt,
        element: el
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
    extractCssPseudo(root, targets) {
      if (!(root instanceof Element)) return;
      const candidates = [root, ...root.querySelectorAll("*")];
      for (const el of candidates) {
        if (isIgnoredElement(el)) continue;
        for (const pseudo of ["::before", "::after"]) {
          try {
            const computed = window.getComputedStyle(el, pseudo);
            const raw = computed.content;
            if (!raw || raw === "none" || raw === "normal" || raw === '""' || raw === "''") continue;
            const text = parseCssContent(raw);
            if (!text || !isTranslatableString(text)) continue;
            targets.push({
              node: el,
              type: pseudo === "::before" ? "css-before" : "css-after",
              originalText: text,
              element: el
            });
          } catch {
          }
        }
      }
    }
  }
  function parseCssContent(content) {
    const dblQuote = content.match(/^"([\s\S]+)"$/);
    const sglQuote = content.match(/^'([\s\S]+)'$/);
    const inner = (dblQuote == null ? void 0 : dblQuote[1]) ?? (sglQuote == null ? void 0 : sglQuote[1]);
    if (!inner) return null;
    if (/\\[0-9a-fA-F]{4,6}/.test(inner)) return null;
    if (inner.length === 1 && !/[\p{L}\p{Script=Han}]/u.test(inner)) return null;
    return inner.replace(/\\n/g, "\n").replace(/\\t/g, "	");
  }
  class OverlayManager {
    constructor(settings, textExtractor) {
      __publicField(this, "textState", /* @__PURE__ */ new WeakMap());
      __publicField(this, "activeNodes", /* @__PURE__ */ new Set());
      __publicField(this, "activeExtraNodes", /* @__PURE__ */ new Set());
      __publicField(this, "modifiedAttributes", /* @__PURE__ */ new Set());
      __publicField(this, "settings");
      __publicField(this, "textExtractor");
      this.settings = settings;
      this.textExtractor = textExtractor;
    }
    updateSettings(settings) {
      const oldMode = this.settings.mode;
      this.settings = settings;
      if (oldMode !== settings.mode) {
        this.reapplyAll();
      }
    }
    /**
     * Applies translation to a target element or text node.
     */
    applyTranslation(target, rawTranslatedText) {
      if (!rawTranslatedText) return;
      const cleanTranslation = rawTranslatedText.replace(/^\[(?:EN|ZH|JA|KO|ES|FR|DE|RU|PT|IT|AR|HI|TR|VI|TH|ID):\s*/i, "").replace(/\]$/, "").trim();
      if (!cleanTranslation) return;
      target.translatedText = cleanTranslation;
      if (target.type === "attribute" && target.attributeName) {
        this.applyAttributeTranslation(target, cleanTranslation);
        return;
      }
      if (target.type === "css-before" || target.type === "css-after") {
        target.element.setAttribute(`data-webtrans-${target.type}`, cleanTranslation);
        return;
      }
      const node = target.node;
      if (!node || node.nodeType !== Node.TEXT_NODE || !node.isConnected) return;
      this.applyTextNodeTranslation(node, target.originalText, cleanTranslation);
    }
    /**
     * Translates a text node in-place
     */
    applyTextNodeTranslation(node, originalText, translatedText) {
      var _a, _b, _c, _d;
      let state = this.textState.get(node);
      if (!state) {
        state = {
          original: originalText || node.nodeValue || "",
          injectedValue: "",
          translation: translatedText,
          applied: false
        };
        this.textState.set(node, state);
      }
      const mode = this.settings.mode;
      if (mode === "translated-only") {
        this.removeExtraNode(state);
        const origVal = state.original || node.nodeValue || "";
        let leadWs = ((_a = origVal.match(/^(\s+)/)) == null ? void 0 : _a[1]) ?? "";
        let trailWs = ((_b = origVal.match(/(\s+)$/)) == null ? void 0 : _b[1]) ?? "";
        if (!leadWs && ((_c = node.previousSibling) == null ? void 0 : _c.nodeType) === Node.ELEMENT_NODE) leadWs = " ";
        if (!trailWs && ((_d = node.nextSibling) == null ? void 0 : _d.nodeType) === Node.ELEMENT_NODE) trailWs = " ";
        const withWs = leadWs + translatedText + trailWs;
        if (node.nodeValue !== withWs) {
          node.nodeValue = withWs;
        }
        const parentEl = node.parentElement;
        if (parentEl) {
          const pTitle = parentEl.getAttribute("title");
          const cleanOrig = origVal.trim();
          if (pTitle && (pTitle === cleanOrig || cleanOrig.length > 3 && pTitle.includes(cleanOrig))) {
            parentEl.setAttribute("title", translatedText);
          }
          const pAria = parentEl.getAttribute("aria-label");
          if (pAria && (pAria === cleanOrig || cleanOrig.length > 3 && pAria.includes(cleanOrig))) {
            parentEl.setAttribute("aria-label", translatedText);
          }
        }
        state.injectedValue = withWs;
        state.translation = translatedText;
        state.applied = true;
        this.activeNodes.add(node);
        if (this.textExtractor) {
          this.textExtractor.markProcessed(node, withWs.trim());
        }
      } else if (mode === "dual") {
        if (node.nodeValue !== state.original) {
          node.nodeValue = state.original;
        }
        let extraNode = state.extraNode;
        if (!extraNode || !extraNode.isConnected) {
          extraNode = document.createElement("span");
          extraNode.setAttribute("data-webtrans-owned", "1");
          extraNode.setAttribute("data-webtrans-ignore", "true");
          extraNode.className = "webtrans-bilingual-tag";
          extraNode.style.cssText = "color: #3b82f6; font-size: 0.88em; margin-left: 4px; pointer-events: none; user-select: text;";
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
      } else if (mode === "hover") {
        if (node.nodeValue !== state.original) {
          node.nodeValue = state.original;
        }
        this.removeExtraNode(state);
        const parent = node.parentElement;
        if (parent) {
          parent.setAttribute("title", translatedText);
        }
        state.injectedValue = state.original;
        state.applied = true;
      }
    }
    /**
     * Applies translation to an HTML attribute (placeholder, title, aria-label, alt)
     */
    applyAttributeTranslation(target, cleanTranslation) {
      const el = target.element;
      const attr = target.attributeName;
      if (!el || !el.isConnected) return;
      const original = target.originalText;
      if (attr === "placeholder" && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        if (!el.hasAttribute("data-webtrans-orig-placeholder")) {
          el.setAttribute("data-webtrans-orig-placeholder", original);
          this.modifiedAttributes.add({ element: el, attr: "placeholder", original });
        }
        el["__webtrans_last_placeholder"] = cleanTranslation;
        el["__webtrans_last_title"] = cleanTranslation;
        el.placeholder = cleanTranslation;
        el.setAttribute("placeholder", cleanTranslation);
        if (el.getAttribute("title") === original || !el.getAttribute("title")) {
          el.setAttribute("title", cleanTranslation);
        }
      } else if (attr === "title") {
        if (!el.hasAttribute("data-webtrans-orig-title")) {
          el.setAttribute("data-webtrans-orig-title", original);
          this.modifiedAttributes.add({ element: el, attr: "title", original });
        }
        el["__webtrans_last_title"] = cleanTranslation;
        el.setAttribute("title", cleanTranslation);
      } else if (attr === "aria-label" || attr === "aria-placeholder" || attr === "aria-description") {
        if (!el.hasAttribute(`data-webtrans-orig-${attr}`)) {
          el.setAttribute(`data-webtrans-orig-${attr}`, original);
          this.modifiedAttributes.add({ element: el, attr, original });
        }
        el.setAttribute(attr, cleanTranslation);
      } else if (attr === "alt" && el instanceof HTMLImageElement) {
        if (!el.hasAttribute("data-webtrans-orig-alt")) {
          el.setAttribute("data-webtrans-orig-alt", original);
          this.modifiedAttributes.add({ element: el, attr: "alt", original });
        }
        el.alt = cleanTranslation;
      }
    }
    removeExtraNode(state) {
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
    reapplyAll() {
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
    isSelfMutation(node, newValue) {
      const state = this.textState.get(node);
      if (!state) return false;
      return state.injectedValue === newValue;
    }
    /**
     * Notifies translator that a text node was updated externally by the host application (e.g. Vue/React).
     */
    updateOriginalText(node, newOriginal) {
      const state = this.textState.get(node);
      if (state) {
        state.original = newOriginal;
        state.applied = false;
        state.injectedValue = "";
      }
    }
    /**
     * In-place translation naturally flows with layout; repositionAll is a no-op kept for interface compatibility.
     */
    repositionAll() {
    }
    /**
     * Compatibility helper for tests.
     */
    drainForTesting() {
    }
    /**
     * Restores all modified nodes and attributes to their original untranslated state.
     */
    clear() {
      for (const node of this.activeNodes) {
        if (node.isConnected) {
          const state = this.textState.get(node);
          if (state && state.original) {
            node.nodeValue = state.original;
          }
        }
      }
      this.activeNodes.clear();
      for (const extra of this.activeExtraNodes) {
        if (extra.isConnected) {
          extra.remove();
        }
      }
      this.activeExtraNodes.clear();
      for (const item of this.modifiedAttributes) {
        if (item.element.isConnected) {
          if (item.attr === "placeholder" && (item.element instanceof HTMLInputElement || item.element instanceof HTMLTextAreaElement)) {
            item.element.placeholder = item.original;
          } else if (item.attr === "alt" && item.element instanceof HTMLImageElement) {
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
  const PREFIX = "[UniversalTranslator]";
  const logger = {
    debug: (...args) => {
      if (typeof window !== "undefined" && window.__WEBTRANS_DEBUG__) {
        console.debug(PREFIX, ...args);
      }
    },
    info: (...args) => {
      console.info(PREFIX, ...args);
    },
    warn: (...args) => {
      console.warn(PREFIX, ...args);
    },
    error: (...args) => {
      console.error(PREFIX, ...args);
    }
  };
  class MutationManager {
    constructor(callback, isSelfMutation) {
      __publicField(this, "observer", null);
      __publicField(this, "shadowObservers", /* @__PURE__ */ new Map());
      __publicField(this, "pendingNodes", /* @__PURE__ */ new Set());
      __publicField(this, "debounceTimer", null);
      __publicField(this, "debounceMs", 60);
      __publicField(this, "callback");
      __publicField(this, "isSelfMutation");
      __publicField(this, "isPaused", false);
      __publicField(this, "lastUrl", "");
      this.callback = callback;
      this.isSelfMutation = isSelfMutation;
      this.lastUrl = window.location.href;
      this.setupUrlWatcher();
    }
    start() {
      if (this.observer) return;
      this.observer = new MutationObserver((mutations) => {
        if (this.isPaused) return;
        this.handleMutations(mutations);
      });
      const target = document.body || document.documentElement;
      if (target) {
        this.observer.observe(target, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["style", "class", "aria-expanded", "hidden", "placeholder", "title", "aria-label", "alt"]
        });
        logger.info("MutationObserver started listening on DOM");
      }
      this.scanShadowRoots(document.documentElement);
    }
    pause() {
      this.isPaused = true;
    }
    resume() {
      this.isPaused = false;
    }
    stop() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      for (const obs of this.shadowObservers.values()) {
        obs.disconnect();
      }
      this.shadowObservers.clear();
      this.pendingNodes.clear();
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
    }
    handleMutations(mutations) {
      let hasRelevantMutations = false;
      for (const mut of mutations) {
        if (isIgnoredElement(mut.target)) {
          continue;
        }
        if (mut.type === "childList") {
          for (let i = 0; i < mut.addedNodes.length; i++) {
            const node = mut.addedNodes[i];
            if (node instanceof Element && isIgnoredElement(node)) {
              continue;
            }
            this.pendingNodes.add(node);
            hasRelevantMutations = true;
            if (node instanceof Element) {
              this.scanShadowRoots(node);
            }
          }
        } else if (mut.type === "characterData") {
          const textNode = mut.target;
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            const val = textNode.nodeValue || "";
            if (this.isSelfMutation && this.isSelfMutation(textNode, val)) {
              continue;
            }
            if (textNode.parentElement && !isIgnoredElement(textNode.parentElement)) {
              this.pendingNodes.add(textNode);
              hasRelevantMutations = true;
            }
          }
        } else if (mut.type === "attributes") {
          const el = mut.target;
          if (el && !isIgnoredElement(el)) {
            this.pendingNodes.add(el);
            hasRelevantMutations = true;
          }
        }
      }
      if (hasRelevantMutations) {
        this.scheduleFlush();
      }
    }
    scheduleFlush() {
      if (this.debounceTimer) return;
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        if (this.pendingNodes.size === 0) return;
        const nodes = Array.from(this.pendingNodes);
        this.pendingNodes.clear();
        this.callback(nodes);
      }, this.debounceMs);
    }
    /**
     * Traverse open shadow roots and attach sub-MutationObservers
     */
    scanShadowRoots(root) {
      if (!root) return;
      const checkElement = (el) => {
        if (el.shadowRoot && !this.shadowObservers.has(el.shadowRoot)) {
          try {
            const shadowObs = new MutationObserver((mutations) => {
              if (!this.isPaused) this.handleMutations(mutations);
            });
            shadowObs.observe(el.shadowRoot, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ["style", "class"]
            });
            this.shadowObservers.set(el.shadowRoot, shadowObs);
            for (const child of Array.from(el.shadowRoot.children)) {
              this.pendingNodes.add(child);
            }
            this.scheduleFlush();
          } catch (err) {
            logger.warn("Failed to observe shadowRoot:", err);
          }
        }
      };
      checkElement(root);
      const descendants = root.querySelectorAll("*");
      for (let i = 0; i < descendants.length; i++) {
        checkElement(descendants[i]);
      }
    }
    /**
     * Monitor SPA history navigation (pushState, replaceState, popstate, hashchange)
     */
    setupUrlWatcher() {
      const onUrlChange = () => {
        const currentUrl = window.location.href;
        if (currentUrl !== this.lastUrl) {
          this.lastUrl = currentUrl;
          logger.info("SPA Route changed to:", currentUrl);
          setTimeout(() => {
            this.pendingNodes.add(document.body || document.documentElement);
            this.scheduleFlush();
          }, 150);
        }
      };
      window.addEventListener("popstate", onUrlChange);
      window.addEventListener("hashchange", onUrlChange);
      const originalPushState = history.pushState;
      history.pushState = function(...args) {
        const result = originalPushState.apply(this, args);
        onUrlChange();
        return result;
      };
      const originalReplaceState = history.replaceState;
      history.replaceState = function(...args) {
        const result = originalReplaceState.apply(this, args);
        onUrlChange();
        return result;
      };
    }
  }
  function isExtensionInvalidated(err) {
    var _a;
    if (typeof chrome === "undefined" || !((_a = chrome == null ? void 0 : chrome.runtime) == null ? void 0 : _a.id)) return true;
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return msg.includes("extension context invalidated") || msg.includes("extension context invalid") || msg.includes("could not establish connection") || msg.includes("receiving end does not exist") || msg.includes("the message channel was closed") || msg.includes("disconnected port");
  }
  class TranslationQueue {
    constructor(settings, callback, sendMessage) {
      __publicField(this, "BATCH_SIZE", 45);
      __publicField(this, "BATCH_WINDOW_MS", 30);
      __publicField(this, "RETRY_DELAY_MS", 1e3);
      __publicField(this, "TIMEOUT_MS", 1e4);
      // Unique texts waiting for the next flush
      __publicField(this, "pendingTexts", []);
      /**
       * Maps originalText → all targets that need that translation applied.
       * This is what enables many-to-one deduplication:
       * 30 targets with "首页" → one API call → result applied to all 30.
       */
      __publicField(this, "textToTargets", /* @__PURE__ */ new Map());
      // Concurrency control
      __publicField(this, "activeCount", 0);
      __publicField(this, "concurrencyQueue", []);
      __publicField(this, "batchTimer", null);
      __publicField(this, "settings");
      __publicField(this, "callback");
      __publicField(this, "sendMessage");
      __publicField(this, "isInvalidated", false);
      /** Stats */
      __publicField(this, "dedupSavings", 0);
      __publicField(this, "totalRequests", 0);
      this.settings = settings;
      this.callback = callback;
      this.sendMessage = sendMessage;
    }
    get maxConcurrent() {
      var _a;
      return Math.max(1, Math.min(8, ((_a = this.settings.appearance) == null ? void 0 : _a.concurrency) ?? 3));
    }
    updateSettings(settings) {
      this.settings = settings;
    }
    /**
     * Enqueue an array of targets.
     * Duplicates (same originalText) are merged immediately — no extra network calls.
     */
    enqueue(targets) {
      if (this.isInvalidated) return;
      for (const target of targets) {
        const text = target.originalText;
        const existing = this.textToTargets.get(text);
        if (existing) {
          existing.push(target);
          this.dedupSavings++;
          continue;
        }
        this.textToTargets.set(text, [target]);
        this.pendingTexts.push(text);
      }
      this.scheduleBatch();
    }
    scheduleBatch() {
      if (this.pendingTexts.length >= this.BATCH_SIZE) {
        this.flush();
        return;
      }
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.batchTimer = null;
          this.flush();
        }, this.BATCH_WINDOW_MS);
      }
    }
    flush() {
      if (this.isInvalidated || this.pendingTexts.length === 0) return;
      const batch = this.pendingTexts.splice(0, this.BATCH_SIZE);
      const batchMap = /* @__PURE__ */ new Map();
      for (const text of batch) {
        const targets = this.textToTargets.get(text);
        if (targets) {
          batchMap.set(text, targets);
          this.textToTargets.delete(text);
        }
      }
      this.runWithConcurrency(() => this.executeBatch(batch, batchMap));
      if (this.pendingTexts.length > 0) {
        this.scheduleBatch();
      }
    }
    runWithConcurrency(fn) {
      const run = () => {
        this.activeCount++;
        fn().finally(() => {
          this.activeCount--;
          if (this.concurrencyQueue.length > 0) {
            const next = this.concurrencyQueue.shift();
            next();
          }
        });
      };
      if (this.activeCount < this.maxConcurrent) {
        run();
      } else {
        this.concurrencyQueue.push(run);
      }
    }
    async executeBatch(texts, batchMap, retriesLeft = 2) {
      if (this.isInvalidated) return;
      this.totalRequests++;
      try {
        const req = {
          type: MESSAGE_TYPES.TRANSLATE_BATCH,
          texts,
          sourceLang: this.settings.sourceLang,
          targetLang: this.settings.targetLang
        };
        const res = await Promise.race([
          this.sendMessage(req),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error("Request timeout")), this.TIMEOUT_MS)
          )
        ]);
        if ((res == null ? void 0 : res.success) && res.translations) {
          for (let i = 0; i < texts.length; i++) {
            const translatedText = res.translations[i];
            if (!translatedText) continue;
            const targets = batchMap.get(texts[i]);
            if (!targets) continue;
            for (const t of targets) {
              try {
                this.callback(t, translatedText);
              } catch (applyErr) {
                logger.warn("Failed to apply translation:", applyErr);
              }
            }
          }
          logger.debug(
            `Batch done: ${texts.length} strings, dedup savings so far: ${this.dedupSavings}`
          );
        } else {
          throw new Error((res == null ? void 0 : res.error) ?? "Empty translation response");
        }
      } catch (err) {
        if (isExtensionInvalidated(err)) {
          this.invalidate();
          return;
        }
        logger.warn(`Batch failed (${retriesLeft} retries left):`, err == null ? void 0 : err.message);
        if (retriesLeft > 0) {
          await delay(this.RETRY_DELAY_MS * (3 - retriesLeft));
          return this.executeBatch(texts, batchMap, retriesLeft - 1);
        }
        logger.error("Batch permanently failed after retries:", err);
      }
    }
    /** Hard stop — called when extension is invalidated */
    invalidate() {
      this.isInvalidated = true;
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      this.pendingTexts = [];
      this.textToTargets.clear();
      this.concurrencyQueue = [];
    }
    /** Soft reset — called on SPA navigation or language change */
    reset() {
      this.isInvalidated = false;
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      this.pendingTexts = [];
      this.textToTargets.clear();
      this.concurrencyQueue = [];
      this.activeCount = 0;
      this.dedupSavings = 0;
      this.totalRequests = 0;
    }
    getStats() {
      return {
        pending: this.pendingTexts.length,
        active: this.activeCount,
        dedupSavings: this.dedupSavings,
        totalRequests: this.totalRequests
      };
    }
  }
  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  class ScannerWorker {
    constructor(extractor, settings, enqueue) {
      __publicField(this, "extractor");
      __publicField(this, "enqueue");
      __publicField(this, "settings");
      __publicField(this, "scanAbortFlag", false);
      this.extractor = extractor;
      this.settings = settings;
      this.enqueue = enqueue;
    }
    updateSettings(settings) {
      this.settings = settings;
    }
    abort() {
      this.scanAbortFlag = true;
    }
    async scan(root) {
      this.scanAbortFlag = false;
      const allTargets = this.extractor.extractFromRoot(root, this.settings);
      if (allTargets.length === 0) return;
      const viewportH = window.innerHeight;
      const nearLimit = viewportH * 2.5;
      const p0 = [];
      const p1 = [];
      const p2 = [];
      for (const target of allTargets) {
        if (this.scanAbortFlag) return;
        const roughTop = target.element ? getOffsetTop(target.element) : 0;
        if (roughTop <= viewportH * 1.2) {
          target.priority = 0;
          p0.push(target);
        } else if (roughTop <= nearLimit) {
          target.priority = 1;
          p1.push(target);
        } else {
          target.priority = 2;
          p2.push(target);
        }
      }
      if (p0.length > 0) {
        logger.debug(`Scanner: Enqueueing ${p0.length} P0 targets`);
        this.enqueue(p0, 0);
      }
      if (p1.length > 0) {
        logger.debug(`Scanner: Enqueueing ${p1.length} P1 targets`);
        this.enqueue(p1, 1);
      }
      if (p2.length > 0) {
        logger.debug(`Scanner: Enqueueing ${p2.length} P2 targets`);
        this.enqueue(p2, 2);
      }
    }
  }
  function getOffsetTop(el) {
    let top = 0;
    let node = el;
    while (node && node !== document.body) {
      top += node.offsetTop || 0;
      node = node.offsetParent;
    }
    return top;
  }
  class FloatingHUD {
    constructor(_settings, _callbacks) {
      this.purgeStaleHUD();
    }
    updateSettings(_settings) {
      this.purgeStaleHUD();
    }
    setStatus(_text, _isTranslating = false) {
    }
    destroy() {
      this.purgeStaleHUD();
    }
    purgeStaleHUD() {
      const existing = document.getElementById("universal-webtrans-hud-root");
      if (existing) existing.remove();
      const staleElements = document.querySelectorAll(".webtrans-hud-root, #universal-webtrans-hud-root");
      staleElements.forEach((el) => el.remove());
    }
  }
  const BILIBILI_EN_DICT = {
    "专栏": "Posts",
    "活动": "Events",
    "社区中心": "Community",
    "直播": "Live",
    "新歌热榜": "Charts",
    "新歌热榜榜单": "Hot Songs Chart",
    "权益中心": "Benefits Center",
    "实时数据查询": "Real-time data query",
    "视频素材": "Video Materials",
    "贴纸素材": "Sticker Materials",
    "统计截至": "Stats as of",
    "每日12点更新": "Updated daily at 12:00",
    "课堂": "Classes",
    "我关注的主播": "Following",
    "我的稿件": "Drafts",
    "预约": "Reserve",
    "我的音频": "Audio",
    "我的合集和视频列表": "Collections",
    "最近点赞的视频": "Liked",
    "新版反馈": "New Feedback",
    "返回旧版": "Old Version",
    "顶部": "Top",
    "底部": "Bottom",
    "实名认证成功后,可以享受开通直播间等服务!": "After Verification, You Can Use Live Streaming and More!",
    "注意事项": "Precautions",
    "每个证件只能绑定一个账号": "Each Document Can Only Be Linked to One Account",
    "证件照不清晰或与输入的信息不匹配,将导致实名认证被驳回": "If the ID Photo is Unclear or Mismatched, Verification Will Be Rejected",
    "您提供的证件信息将受到严格保护，仅用于身份验证,未经本人许可不会用于其他用途": "The ID Information You Provide Will Be Strictly Protected and Used Only for Verification, and Will Not Be Used for Other Purposes Without Your Permission",
    "除原证件无效（如：改名、移民）等特殊情况外，实名认证审核通过后将不能修改": "Except for Special Cases Like Name Changes or Immigration, Verification Cannot Be Modified After Approval",
    "证件要求": "Document Requirements",
    "需上传本人露脸手持二代身份证背面照＋身份证正反面照片（不需手持）": "Upload a Clear Photo of Yourself Holding Your ID Card's Back Side, Plus Photos of the Front and Back of the ID Card (No Need to Hold)",
    "下载历史": "Download History",
    "证件必须在有效期内，有效期需在一个月以上": "The ID Must Be Valid with More Than One Month Remaining",
    "照片要求": "Photo Requirements",
    "我的个人标签": "Tags",
    "本人手持证件正面露脸，五官清晰可辨": "A Clear Photo of You Holding the ID Card's Front Side, Face Visible",
    "证件照上信息需完整且清晰可辨（无反光、遮挡、水印、证件套、logo等）": "The ID Photo Must Be Complete and Clear (No Reflections, Obstructions, Watermarks, Card Holders, Logos, etc.)",
    "申请人填写的“真实姓名”和“证件号码”需和提交证件照片信息一致": "The 'Real Name' and 'ID Number' Filled by the Applicant Must Match the Submitted ID Photo Information",
    "证件必须真实拍摄，不能使用复印件": "The ID Must Be Real and Cannot Be a Copy",
    "确保照片完整（不缺边角），证件周围不允许加上边角框（如：加上红框等）": "Ensure the Photo is Complete (No Missing Corners), and No Borders Should Be Added Around the ID (e.g., Red Frames)",
    "预约游戏": "Reservation",
    "填写信息": "Fill Information",
    "证件类型": "Document Type ",
    "身份证": "ID Card",
    "港澳居民来往内地通行证": "Hong Kong and Macau Resident Permit",
    "台湾居民来往大陆通行证": "Taiwan Resident Permit",
    "外国人永久居留身份证": "Foreign Permanent Resident ID",
    "点击上传": "Upload",
    "其他国家或地区身份证明": "Other ID from Foreign Countries",
    "真实姓名": "Real Name",
    "证号号码": "ID Number",
    "对准上方二维码即可自动扫描": "Scan the QR Code Above",
    "验证手机": "Verify Phone",
    "手机验证码": "Phone Code",
    "点击获取": "Get Code",
    "我已阅读并同意": "I Have Read and Agree to ",
    "《实名认证服务协议》": "ID Verification Service Agreement",
    "提交认证": "Submit Verification",
    "手机号码": "Phone Number",
    "实名认证": "ID Verification",
    "打开哔哩哔哩客户端-点击“我的”": "Open BiliBili App - Click 'My'",
    "个人中心右上角-点击“扫一扫”": "In Profile, Top Right - Click 'Scan'",
    "浏览历史": "History",
    "安卓下载": "Android Download",
    "最近看过的频道": "Watched",
    "下载PC版": "Download For PC",
    "大会员礼包": "VIP Gift",
    "充值中心": "Recharge",
    "我的": "My",
    "已玩游戏": "Played",
    "热门热血番剧榜": "Popular Anime",
    "登录后你可以": "After Login, You Can:",
    "暂停记录历史": "Pause History",
    "清空历史": "Clear History",
    "系统通知": "Notifications",
    "虚拟UP主": "VTuber",
    "验证身份": "Verify",
    "设置密保": "Security",
    "设置成功": "Done",
    "原手机号": "Old Phone",
    "请输入内容": "Enter Text",
    "获取验证码": "Get Code",
    "收到的赞": "Likes",
    "公开我的收藏": "Favorites",
    "忘记密码？": "Forgot Password?",
    "请输入手机号": "Enter Phone",
    "验证码": "Verification Code",
    "请输入验证码": "Enter Code",
    "公开最近点赞的视频": "Recent Likes",
    "公开订阅标签": "Subscriptions",
    "公开我的关注列表": "Following",
    "公开我的生日、个人标签": "Bio",
    "账号": "Account",
    "其他方式登录": "Other Login",
    "密码": "Password",
    "微信登录": "WeChat",
    "微博登录": "Weibo",
    "QQ登录": "QQ",
    "未注册过哔哩哔哩的手机号，我们将自动帮你注册账号": "BiliBili will auto-register your phone number",
    "扫码登录或扫码下载APP": "Scan to Login or Download App",
    "密码登录": "Password Login",
    "扫描二维码登录": "Scan QR Code",
    "短信登录": "SMS Login",
    "公开学校信息": "School",
    "登录或完成注册即代表你同意": "By logging in or completing registration, you agree to",
    "公开最近玩过的游戏": "Recent Games",
    "我自己": "Me",
    "新访客": "New",
    "列表": "List",
    "���币": "Coins",
    "我的消息": "Messages",
    "视角": "View",
    "稍后再看": "Later",
    "默认": "Default",
    "音量均衡": "Volume",
    "默认收藏夹": "Default",
    "标准": "Standard",
    "高动态": "High Dynamic",
    "其他设置": "Other Settings",
    "隐藏黑边": "Hide Borders",
    "关灯模式": "Dark Mode",
    "回复我的": "Replies",
    "有新动态，点击查看": "Updates",
    "话题收藏夹": "Topics",
    "专栏收藏夹": "Articles",
    "相簿收藏夹": "Albums",
    "课程收藏夹": "Courses",
    "消息中心": "Inbox",
    "消息设置": "Msg Settings",
    "私信存档": "Archives",
    "@ 我的": "Mentions",
    "有什么想和大家分享的？": "Share?",
    "未经作者授权，禁止转载": "No Repost Allowed Without Author's Permission",
    "个人中心": "Profile",
    "登录哔哩哔哩，高清视频免费看！": "Login to BiliBili for Free Streaming!",
    "更多登录后权益等你解锁": "More Benefits After Login",
    "免费看高清视频": "Free HD Videos",
    "热剧抢先看": "Watch New Shows First",
    "会员免费看": "VIP Watch Free",
    "4K超清画质": "4K Quality",
    "专栏投稿": "Article",
    "近30日": "30d",
    "分析": "Analytics",
    "规则": "Rules",
    "音频投稿": "Audio",
    "贴纸投稿": "Sticker",
    "近1年": "1y",
    "点击复制链接": "Copy Link",
    "粉丝列表": "Followers",
    "获取视频分享链接": "Get Video Link",
    "粉丝勋章": "Badges",
    "我的粉丝勋章": "My Badges",
    "开设粉丝勋章同时，你也会成为 bilibili link 的一位爱抖露，拥有自己的粉丝应援团哦～": "By Setting Up a Fan Badge, You Will Become a BiliBili Link User and Have Your Own Fan Group!",
    "骑士团": "Knights",
    "勋章名称设置后将同步到bilibili直播": "Badge Name Will Sync to Bilibili Live",
    "勋章状态": "Badge Status",
    "勋章名称": "Badge Name",
    "充电1B币或直播间投喂粉丝团灯牌、开通大航海": "Donate 1 Bcoin or Feed the Fan Badge in Live Room, or Open Grand Voyage",
    "领取条件": "Requirements",
    "用户可见评论": "Visible Comments",
    "最近发布": "Recent",
    "全选": "Select All",
    "尚未具备开通资格": "Not Eligible to Open",
    "回复最多": "Most Replies",
    "视频评论": "Video Comments",
    "点赞最多": "Most Likes",
    "待精选评论": "Pending Featured Comments",
    "音频评论": "Audio Comments",
    "专栏评论": "Article Comments",
    "粉丝勋章状态": "Badge Status",
    "粉丝管理": "Fans",
    "最近领取": "Recent",
    "互动管理": "Interactions",
    "收益管理": "Earnings",
    "弹幕管理": "Danmakus",
    "评论管理": "Comments",
    "当前点亮��户": "Current User",
    "骑士团状态": "Knight Status",
    "文集": "Collections",
    "一个稿件都没有，请换个筛选条件": "No Submissions, Try Different Filters",
    "已装填": "Loaded",
    "图文": "Articles",
    "条弹幕": "Danmakus",
    "视频投稿": "Upload",
    "投稿管理": "Submissions",
    "站庆特惠": "Anniversary Sale",
    "大会员限时4.6折，最高再赠366天": "VIP 46% Off, Up to 366 Days Free",
    "会员专属装扮": "VIP Exclusive Skins",
    "发表弹幕/评论": "Post And View Comments",
    "多端同步播放记录": "Sync Watch History",
    "当前没有贴纸稿件": "No Stickers",
    "进入学习中心": "Go to Learning",
    "学习记录": "Learning",
    "操作": "Actions",
    "热门番剧影视看不停": "Watch Popular Anime/Movies",
    "课程收藏": "Courses",
    "最近观看": "Recently Watched",
    "批量操作": "Batch",
    "次学习": "Learning Views",
    "精选专题": "Featured",
    "最近收藏": "Recent",
    "视频管理": "Videos",
    "账号运营": "Account",
    "新建收藏夹": "New Folder",
    "视频制作": "Video Studio",
    "分区创作": "Video Creation",
    "内容变现": "Monetization",
    "电商带货": "E-commerce",
    "开播学院": "Live Academy",
    "返回创作中心": "Back to Studio",
    "学习中心": "Learning",
    "最高减": "Up to",
    "基础知识": "Basics",
    "直播商��点击": "Live Product Clicks",
    "提升直播进房": "Promote Live Views",
    "首单优惠券": "First Order Coupon",
    "三单优惠券": "Third Order Coupon",
    "自定义": "Custom",
    "订单提交": "Submit Order",
    "蓝链点击": "Click Throughs",
    "小时前": "h ago",
    "预计进房量": "Estimated Views",
    "二单优惠券": "Second Order Coupon",
    "切换账号": "Switch Account",
    "切换至自定义": "Switch to Custom",
    "收藏于：": "Saved:",
    "特惠套餐": "Special Packages",
    "基础套餐": "Basic",
    "长投套餐": "Long-Term",
    "仅自己可见": "Private",
    "互动": "Interactions",
    "我的专栏": "Posts",
    "提升支付转化": "Promote Payments",
    "交易经营": "Transactions",
    "热度助推": "Boost",
    "我的收藏夹": "Folders",
    "订阅番剧": "Anime",
    "订阅标签": "Tags",
    "提升稿件数据": "Promote",
    "最近投币的视频": "Donated",
    "粉丝量": "Followers",
    "我的相簿": "Albums",
    "新访客会看到": "Visitor View",
    "创建频道": "Create",
    "投稿视频可以分类展示了": "Categorized",
    "还没有上传过视频哦~": "No Videos",
    "立即上传": "Upload",
    "设置置顶视频": "Pin",
    "设置代表作": "Highlight",
    "个人资料": "Profile",
    "追番追剧": "Watching",
    "隐私设置": "Privacy",
    "隐藏": "Hide",
    "我的���藏": "Favorites",
    "官方活动": "Events",
    "排序设置": "Sort",
    "特别推荐": "Featured",
    "人气推荐": "Popular",
    "免费漫画推荐": "Free Manga",
    "前往TA的直播间": "Go Live",
    "我的粉丝会看到": "Fan View",
    "我的视频": "Videos",
    "我的频道": "Channels",
    "10分钟以下": "<10 min",
    "10-30分钟": "10–30 min",
    "30-60分钟": "30–60 min",
    "60分钟以上": ">60 min",
    "bilibili直播签约主播": "Official Streamer",
    "单机Games": "Singleplayer",
    "TA的视频": "Their Videos",
    "TA的相簿": "Their Albums",
    "黑名单管理": "Blacklist",
    "人正在看": "Watching",
    "下载APP": "Download",
    "新番时间表": "Schedule",
    "特别关注": "Favorite",
    "设置分组": "Group",
    "游戏中心": "Games",
    "创作中心": "Studio",
    "取消关注": "Unfollow",
    "视频选集": "Playlists",
    "全部动态": "All",
    "投稿视频": "Uploads",
    "信仰充值": "Recharge",
    "最新发布": "Latest",
    "最多播放": "Views",
    "最多收藏": "Saves",
    "最多点击": "Clicks",
    "最多弹幕": "Danmaku",
    "全部时长": "Duration",
    "全部分区": "Sections",
    "下载客户端": "Client",
    "综合排序": "Default",
    "弹幕列表": "Comments",
    "相关推荐": "Related",
    "直播回放": "Replays",
    "我的信息": "Info",
    "我的头像": "Avatar",
    "我的钱包": "Wallet",
    "个人空间": "Space",
    "直播中心": "Broadcast",
    "我的勋章": "Badges",
    "账号安全": "Security",
    "答题转正直升Lv.1": "Quiz to Lv.1",
    "我的课程": "Courses",
    "深色": "Dark",
    "浅色": "Light",
    "内测": "Beta",
    "会员中心": "Membership",
    "成为大会员": "Become VIP",
    "最热": "Popular",
    "解锁专享漫画礼包": "Unlock Manga Gift",
    "我的硬币": "Bcoins",
    "直播数据": "Live",
    "会员积分": "Points",
    "我的记录": "History",
    "发送弹幕的类型": "Danmaku Types",
    "作品分析": "Music",
    "数据中心": "Analytics",
    "核心数据概览": "Overview",
    "粉丝画像": "Audience",
    "高级弹幕请求": "Advanced Danmaku Requests",
    "时间选择": "Time Range",
    "收益数据": "Earnings",
    "近7天播放量": "Views (7d)",
    "空间访客": "Visitors",
    "净增粉丝": "Followers (Net)",
    "点赞": "Like",
    "播放量": "Views",
    "收藏": "Saved",
    "近7天粉丝数": "Followers (7d)",
    "内容分析": "Content",
    "粉丝播放量": "Fan Views",
    "弹幕内容": "Danmaku Content",
    "允许发送所有类型的弹幕": "Allow All Danmakus",
    "允许发送纯文字弹幕": "Allow Text Danmakus",
    "添加": "Add",
    "允许发送指定类型的弹幕": "Allow Specific Danmakus",
    "发送者": "Sender",
    "弹幕举报": "Report Danmakus",
    "弹幕保护": "Danmaku Protection",
    "高级请求": "Advanced Requests",
    "播放时间": "Play Time",
    "黑名单": "Blacklist",
    "允许发送": "Allow",
    "关键词过滤": "Keyword Filter",
    "输入关键词进行过滤，例如mdzz。观众将不能在你的视频中发送包含指定关键词的弹幕": "Enter Keywords to Filter, e.g., mdzz. Viewers Will Not Be Able to Send Danmakus Containing These Keywords in Your Videos",
    "观众将不能在你的视频中发送匹配指定正则表达式的弹幕": "Viewers Will Not Be Able to Send Danmakus Matching the Specified Regular Expression in Your Videos",
    "正则表达式过滤": "Regex Filter",
    "禁止发送": "Block",
    "稿件弹幕": "Submissions with Danmakus",
    "有奖活动": "Contests",
    "收益中心": "Earnings",
    "商业活动": "Brand Deals",
    "总播放量": "Total Views",
    "弹幕反馈": "Danmaku Feedback",
    "弹幕设置": "Danmaku Settings",
    "总粉丝数": "Total Followers",
    "创作激励": "Incentives",
    "收益学院": "Earnings Academy",
    "已开通服务": "Active Services",
    "悬赏带货": "Rewards",
    "稿件管理": "Submissions",
    "去报名": "Sign Up",
    "可提现收益": "Withdrawable Earnings",
    "充电计划": "Earnings Plan",
    "活动推荐": "Recommended Events",
    "任务广场": "Tasks",
    "推荐开通服务": "Recommended Services",
    "模板激励": "Template Incentives",
    "视频格式": "Video Format",
    "去提现": "Withdraw",
    "花火平台": "Huohuo",
    "视频大小": "Video Size",
    "具体结算金额以实际到账为准": "Actual Earnings May Vary",
    "收益数据��览": "Earnings Overview",
    "全部视频": "All Videos",
    "较前30日": "vs Last 30d",
    "机构资质申报": "Organization Qualification",
    "视频分辨率": "Video Resolution",
    "视频大小16G以内，时长10小时以内 粉丝数 ≥ 1000，可自动解锁64G超大文件": "Video Size Must Be Under 16GB and 10 Hours. With ≥1000 Followers, You Can Unlock Up to 64GB",
    "推荐上传 MP4/MOV/MKV 格式，转码更快、过审更顺利～": "Recommended Formats: MP4/MOV/MKV for Faster Transcoding and Smoother Approval",
    "推荐分辨率：1080P 、4K ，高分辨率更清晰流畅～": "Recommended Resolutions: 1080P, 4K for Clearer and Smoother Videos",
    "短剧投稿": "Shorts",
    "进阶技巧": "Pro Tips",
    "您尚未完成实名认证，无法使用投稿!": "You Haven't Completed ID Verification, Unable to Post!",
    "热门活动": "Popular Events",
    "真人短剧": "Live Action Short Videos",
    "尺寸": "Dimensions",
    "未申报": "Not Declared",
    "动画短剧": "Animated Short Videos",
    "文件大小": "File Size",
    "750*750像素": "750x750 px",
    "支持JPG/PNG/GIF": "Supports JPG/PNG/GIF",
    "单个5MB以内": "Under 5MB Each",
    "什么是视频素材？": "What Are Video Materials?",
    "单支500MB以内": "Under 500MB Each",
    "支持3秒-3分钟": "Supports 3s–3min",
    "违背公序良俗": "Inappropriate Content",
    "色情低俗": "Sexually Explicit Content",
    "危害或影响未成年人身心健康": "Content Harmful to Minors",
    "违背科学与真实性": "Misinformation",
    "违法违禁": "Illegal Content",
    "他们都在做": "What Others Are Doing",
    "优秀模板案例": "Great Template Examples",
    "相关附则": "Related Rules",
    "低质及不良观": "Low Quality and Inappropriate Content",
    "他们都在用": "What Others Are Using",
    "扰乱平台秩序": "Disrupting Platform Order",
    "不友善行为": "Unfriendly Conduct",
    "支持MP4、FLV": "Supports MP4, FLV",
    "「哔哩哔哩」是一个由大家共同创建的内容社区，社区鼓励大家围绕各自的爱好认真创作和交流，结识同好，收获成长。 为了能让所有用户享有开放、友善和有收获感的社区，我们希望以下能成为社区的共识：": "BiliBili is a Content Community Created by Everyone. We Encourage Everyone to Create and Communicate Seriously Around Their Hobbies, Meet Like-Minded People, and Grow. To Ensure an Open, Friendly, and Rewarding Community for All Users, We Hope the Following Can Be a Consensus in the Community:",
    "拖拽多个文件到此也可上传，单次最多上传20张": "Drag Multiple Files Here to Upload, Up to 20 Files at a Time",
    "互动视频投稿": "Interactive Videos",
    "拥抱创新": "Embrace Innovation",
    "我们鼓励大家用认真的态度创作内容，基于真实的信息表达观点，杜绝抄袭捏造，不造谣传谣，不有意误导和歪曲。": "We Encourage Everyone to Create Content with a Serious Attitude, Express Opinions Based on Real Information, Avoid Plagiarism and Fabrication, Not Spread Rumors, and Not Intentionally Mislead or Distort.",
    "我们鼓励用户表达个人观点的同时尊重他人观点，不引战、人身攻击、不诋毁、辱骂他人，避免制造分裂和对立，交朋友而不是制造敌人。": "We Encourage Users to Respect Others' Opinions While Expressing Their Own, Avoid Provocation, Personal Attacks, Defamation, and Insults, and Avoid Creating Division and Hostility. Make Friends, Not Enemies.",
    "创新是社区内容活力的源泉，我们应该鼓励他人进行创新，尊重他人个性，包容差异。": "Innovation is the Source of Community Content Vitality. We Should Encourage Others to Innovate, Respect Individuality, and Embrace Differences.",
    "公约目录": "Community Guidelines",
    "账号与行为": "Accounts and Conduct",
    "违规行为判断": "Violation Judgement",
    "投稿规范": "Posting Guidelines",
    "违规分类": "Violation Categories",
    "违规行为处置": "Violation Handling",
    "友善交流": "Communicate Kindly",
    "认真创作": "Create Seriously",
    "商业合作": "Brand Partnerships",
    "查看任务": "View Tasks",
    "新手任务": "New Tasks",
    "投下你的第一个视频稿件": "Publish Your First Video",
    "关注“哔哩哔哩创作中心”账号": "Follow 'BiliBili Studio' Account",
    "完成": "Done",
    "分享我的自制视频稿件至站外": "Share Your Original Video Outside the Platform",
    "积分明细": "Points",
    "去创作学院观看一个教程": "Go to Academy for a Tutorial",
    "待支付": "Pending Payment",
    "投放管理": "Campaigns",
    "推广中": "Active",
    "抱歉，当前暂无满足条件的订单": "Sorry, there are currently no orders that meet the requirements.",
    "审核拒绝": "Rejected",
    "作品数据": "Video",
    "消耗金额": "Amount Spent",
    "导出数据": "Export Data",
    "推广终止": "Terminated",
    "推广方式": "Type",
    "输入支持视频名称/订单ID": "Search by Video Name/Order ID",
    "已取消": "Cancelled",
    "常用功能": "Quick Actions",
    "新手推荐": "Recommended",
    "推广目标": "Goals",
    "订单提交成本": "Cost Per Order",
    "直播推广": "Live Promotion",
    "互动成本": "Cost Per Interaction",
    "账号经营": "Account Management",
    "推广学院": "Promotion Academy",
    "充电成本": "Cost Per Charge",
    "粉丝成本": "Cost Per Follower",
    "蓝链点击成本": "Cost Per Click",
    "待���广": "Pending",
    "课程提交成本": "Cost Per Course",
    "播放成本": "Cost Per View",
    "创作任务": "Tasks",
    "优惠券": "Coupons",
    "限时消耗任务": "Limited-Time Tasks",
    "新稿自动推": "Auto-Promote New Videos",
    "新春涨粉双周消耗任务": "New Year Double-Week Tasks",
    "你的推广目标是": "Your Goals Are",
    "选择的套餐": "Selected Package",
    "%返赠": "% Cashback",
    "观众画像": "Audience",
    "你想要提升": "You Want to Boost",
    "你要推广的稿件": "The Video You Want to Promote",
    "推广类型": "Type",
    "审核中": "Under Review",
    "积分": "Points",
    "已领奖": "Claimed",
    "带你初步了解创作投稿": "Get Started with Creation and Posting",
    "历史任务": "Past Tasks",
    "社会名人认证": "Public Figure Verification",
    "助力创作成长，有奖挑战持续更新": "Tasks to Help You Grow, With Rewards",
    "兑换商城": "Rewards Store",
    "bilibili 身份认证": "BiliBili ID Verification",
    "立即申请": "Apply Now",
    "作品发行": "Distribution",
    "帮助中心": "Help Center",
    "作品商业化": "Monetization",
    "值得信赖的发行商 推广作品到站内站外": "Trusted Distributor, Promoting Works Within and Beyond the Platform",
    "动听的音乐作品 带给全部乐迷": "Beautiful Music Works for All Music Lovers",
    "立即入驻": "Join Now",
    "歌声如山涧清泉、明月繁星般动听": "Songs as Beautiful as Mountain Streams, Moonlight, and Stars",
    "指间音符流淌出行云流水般的天籁": "Notes Flowing Like Clouds and Water",
    "妙笔生花刻画每一个娓娓动听的故事": "Wonderful Stories Told with a Magic Pen",
    "编排和弦与音符叙述每小节灵动与柔情": "Chords and Notes Arranged to Tell Every Bar of Liveliness and Tenderness",
    "驾驭每一种曲式和风格": "Master Every Musical Style and Genre",
    "精准制作、设计每一曲当红热歌": "Precisely Produce and Design Every Popular Song",
    "作品管理": "Manage Works",
    "作品宣推": "Promote Works",
    "歌手/演奏者": "Singers/Musicians",
    "制作人": "Producers",
    "作词人/作曲人": "Lyricists/Composers",
    "最热点的创作活动 加速创作成长": "Most Popular Creation Activities, Accelerating Creation Growth",
    "多元化介质管理 词曲、音画版权服务": "Multi-Format Media Management, Lyrics and Audiovisual Copyright Services",
    "创作活动": "Contests",
    "全站热歌榜": "Top Music",
    "部分服务项目逐步开放中": "Some Services Are Gradually Opening",
    "查看说明": "Instructions",
    "维权指南": "Rights Protection Guide",
    "为您和作品提供贴心音乐服务": "Music Services for You and Your Work",
    "商务合作": "Brand Partnerships",
    "共创广阔合作空间": "Collaborate with Brands",
    "成为他们，加入聚光": "Join the Spotlight",
    "bilibili 认证条件": "BiliBili Verification Requirements",
    "绑定手机用户": "Phone Verified",
    "传送门": "Portal",
    "更多福利": "More Benefits",
    "认证账号可升级为专车号获取商业推广权限": "Verified Accounts Can Upgrade to Verified Accounts for Commercial Promotion",
    "后续更多精彩": "More Exciting Benefits Coming Soon",
    "优先成为合作伙伴": "Priority Partnerships",
    "更多机会曝光作品": "More Opportunities to Expose Your Work",
    "彰显身份": "Show Your Status",
    "企业认证": "Enterprise Verification",
    "专车号高级能力": "Verified Accounts",
    "认证专属标识": "Exclusive Badge",
    "官方合作优先": "Official Partnerships",
    "搜索优先": "Search Priority",
    "站外粉丝数>=50w": "External Followers >= 500K",
    "素材格式": "Material Format",
    "bilibili知名UP主": "Famous UP",
    "社会知名人士": "Public Figures",
    "大V达人": "Top Creators",
    "提交实名认证": "Submit ID Verification",
    "UP主认证": "UP Verify",
    "知名UP主认证": "Famous UP Verify",
    "身份认证": "Identity Verification",
    "上传贴纸": "Upload Stickers",
    "开通UP主版权保护计划": "Join Copyright Protection",
    "互动视频投稿流程": "Interactive Video Submission Process",
    "机构认证": "Org, Verify",
    "职业资质信息申请": "Professional Qualification Application",
    "bilibili认证优势": "BiliBili Verification Benefits",
    "bilibili认证体系": "BiliBili Verification",
    "待维权视频": "Videos Pending Rights Protection",
    "维权成功视频": "Videos with Successful Rights Protection",
    "疑似站外侵权视频": "Suspected Infringing Videos",
    "被侵权视频": "Infringing Videos",
    "站外视频播放量预估": "Estimated Views for External Videos",
    "《贴纸投稿版权保护》": "Sticker Submission Copyright Protection",
    "主动对UP主自制稿件进行外部平台搬运监测": "Monitor for Reposts of Your Original Content on External Platforms",
    "主动对UP主确认后的被搬运的稿件进行维权处理": "Take Rights Protection Actions Against Reposts Confirmed by UPs",
    "主动对监测及维权结果进行反馈": "Provide Feedback on Monitoring and Rights Protection Results",
    "版权保护": "Copyright Protection",
    "立即查看": "View",
    "《贴纸投稿设计规范》": "Sticker Submission Guidelines",
    "点击上传或将视频拖拽到此区域": "Click or Drag Video Here to Upload",
    "投稿的字幕": "Submissions with Subtitles",
    "bilibili认证": "BiliBili Verified",
    "音乐人服务": "Musician Services",
    "视频数据": "Video Analytics",
    "必剪桌面端": "BiliCut Desktop",
    "一键字幕，海量素材，全能剪辑，支持一键投稿": "One-Click Subtitles, Massive Materials, All-in-One Editing, Supports One-Click Posting",
    "专栏数据": "Article Analytics",
    "立即下载": "Download",
    "去认证": "Verify",
    "视频素材投稿": "Video Materials",
    "近30日总收益": "Earnings (30d)",
    "体育运动": "Sports",
    "科技数码": "Tech",
    "人工智能": "AI",
    "创作素材": "Materials",
    "开始阅读 预告": "Start Reading",
    "户外潮流": "Outdoor",
    "畅销热门": "Best Sellers",
    "粉丝总数": "Total Followers",
    "章节列表": "Chapters",
    "小剧场": "Shorts",
    "生活兴趣": "Lifestyle",
    "追漫": "Manga",
    "完结佳作": "Completed",
    "超高清": "Ultra HD",
    "旅游出行": "Travel",
    "韩漫榜": "Korean Manhwa",
    "全网热议": "Trending",
    "国漫榜": "Chinese Manhua",
    "时尚美妆": "Style",
    "日漫榜": "Japanese Manga",
    "统计截至：- -（每日12点更新）": "Data as of -- (Updated Daily at 12 PM)",
    "高能排行": "Top",
    "联合投稿被邀请权限设置": "Co-Author Invitation Settings",
    "非转载视频添加水印设置": "Watermark Settings for Non-Reposted Videos",
    "我的粉丝数": "Followers",
    "推荐漫画": "Recommended",
    "爆款指南": "Hit Guide",
    "虚拟形象": "VTuber Avatar",
    "投稿私信推送设置": "Submission DM Settings",
    "哔哩哔哩客服": "BiliBili Support",
    "投稿内容下是否支持公开笔记设置": "Public Notes for Submissions",
    "极速发布设置": "Quick Publish Settings",
    "云视听小电视贴标（未开启）": "Cloud TV Label (Off)",
    "创作学院": "Academy",
    "编辑": "Edit",
    "前往": "Go To",
    "必火推广": "Promotion",
    "智能字幕": "Smart Subtitles",
    "允许平台自动生成字幕": "Allow Auto-Generated Subtitles",
    "申诉管理": "Appeals",
    "近30天": "30d",
    "创作成长": "Growth",
    "up主骑士团": "Knight Group",
    "up主骑士团日志": "Knight Logs",
    "社区公约": "Guidelines",
    "创作权益": "Rights",
    "没有骑士日志哦~": "No Knight Logs",
    "创作设置": "Settings",
    "还没有骑士，马上 添": "No Knights Yet, Add One Now",
    "添加骑士": "Add Knight",
    "隐藏评论": "Hidden Comments",
    "全部评论": "All Comments",
    "昨日": "Yesterday",
    "总收益（元）": "Earnings",
    "1. 帮助您了解近期流量来源渠道，为您的视频营销策略调整提供参考": "1. Understand Recent Traffic Sources to Inform Your Video Marketing Strategy",
    "2. 分终端占比": "2. Breakdown by Device",
    "PC：网页及pc版客户端": "PC: Web and Desktop Client",
    "移动端：iOS、安卓及pad": "Mobile: iOS, Android, and iPad",
    "h5及小程序：站外分享链接及小程序": "H5 and Mini Programs: External Share Links and Mini Programs",
    "云视听小电视：TV版应用": "Cloud TV: TV App",
    "其他：上述未统计到的来源": "Other: Sources Not Included Above",
    "近30天总收益（元）": "Earnings (30d)",
    "近30天总播放": "Views (30d)",
    "近30天总粉丝": "Followers (30d)",
    "内容管理": "Manage",
    "邀请注册": "Invite",
    "正在直播": "Live",
    "虚拟主播": "VTubers",
    "追番追到": "Subscribed",
    "视频唱见": "Singing",
    "视频聊天": "Chatting",
    "搜索主播": "Search",
    "推荐主播": "Recs",
    "移出日历": "Remove",
    "发现频道": "Discover",
    "加入日历": "Add",
    "热门频道": "Popular",
    "排行榜": "Ranks",
    "直播排行": "Ranks",
    "历史": "History",
    "关注的主播": "Following",
    "为你推荐": "For You",
    "分类": "Categories",
    "哔哩哔哩漫画": "BiliBili Manga",
    "更新": "Updates",
    "历史记录": "History",
    "换一换": "Refresh",
    "Windows端": "Windows",
    "安卓版": "Android",
    "iPhone版": "iPhone",
    "PC客户端": "PC",
    "TV版": "TV",
    "车机版": "Car",
    "iPad HD版": "iPad",
    "更新情报": "Updates",
    "标清": "SD",
    "手机版": "Mobile",
    "AI小助手": "AI Assistant",
    "影音馆": "Media",
    "会员购": "Store",
    "60帧": "60 FPS",
    "已关注": "Following",
    "大会员": "VIP",
    "美食圈": "Food",
    "直播间": "Room",
    "公告栏": "Announcements",
    "发消息": " Message",
    "关注数": "Follows",
    "粉丝数": "Fans",
    "获赞数": "Likes",
    "播放数": "Views",
    "阅读数": "Reads",
    "电视剧": "TV",
    "粉丝团": "Group",
    "动物圈": "Pets",
    "纪录片": "Docs",
    "直播中": "Live",
    "未开播": "Offline",
    "漫画": "Manga",
    "消息": "Inbox",
    "动态": "Feed",
    "已完成": "Completed",
    "首页": "Home",
    "主站": "Main",
    "进行中": "Ongoing",
    "已完结": "Completed",
    "频道": "Channels",
    "推广": "Promo",
    "草稿": "Drafts",
    "音频管理": "Audio",
    "投稿时间": "Upload Time",
    "状态": "Status",
    "贴纸管理": "Stickers",
    "互动视频管理": "Interactive",
    "被使用次数": "Used",
    "封面": "Cover",
    "弹幕数排序": "Danmaku",
    "贴纸名称": "Sticker Name",
    "投稿时间排序": "Upload Time",
    "贴纸素材提交并审核通过后，您的贴纸素材将被推荐上线，您可以在必剪APP中搜索查看您的贴纸素材。": "After your sticker material is submitted and approved, it will be recommended online. You can search for and view your sticker material in the BiliBili APP.",
    "播放数排序": "Views",
    "全部贴纸": "All Stickers",
    "收藏数排序": "Saves",
    "全部稿件": "All",
    "评论数排序": "Comments",
    "视频素材管理": "Materials",
    "音乐": "Music",
    "动画": "Anime",
    "图文管理": "Articles",
    "生活": "Life",
    "搞笑": "Comedy",
    "游戏": "Games",
    "全部": "All",
    "关注": "Follow",
    "粉丝": "Fans",
    "我的奖品": "Prizes",
    "举报": "Report",
    "投稿": "Upload",
    "暂无数据": "No data available",
    "兴趣分布": "Interests",
    "主页": "Home",
    "活跃时段近30天": "Active Time (30d)",
    "我的指标": "My Metrics",
    "同类UP主": "Similar Creators",
    "地域分布": "Locations",
    "播放分布": "Views",
    "人群分布": "Audience",
    "来源稿件占比": "Submissions",
    "分享": "Share",
    "包里": "Bag",
    "公告": "Announcements",
    "稿件": "Submissions",
    "舞蹈": "Dance",
    "表现总结": "Summary",
    "知识": "Knowledge",
    "番剧": "Series",
    "国创": "Local",
    "时尚": "Fashion",
    "娱乐": "Fun",
    "影视": "Film",
    "视频": "Video",
    "用户": "Users",
    "播放策略": "Playback",
    "综合": "All",
    "评论": "Comments",
    "自动": "Auto",
    "流畅": "Smooth",
    "高清": "HD",
    "分辨率": "Resolution",
    "播放": "Play",
    "弹幕": "Comments",
    "赛事": "Events",
    "签到": "Check-in",
    "下载": "Download",
    "网游": "MMO",
    "手游": "Mobile",
    "单机": "Offline",
    "其他": "Other",
    "电台": "Radio",
    "全部图文": "All Images",
    "电影": "Movies",
    "设置": "Settings",
    "订阅": "Subscribe",
    "数码": "Digital",
    "鬼畜": "Memes",
    "资讯": "News",
    "放映厅": "Theater",
    "充电粉丝数": "Donations",
    "更多": "More",
    "年龄": "Age",
    "活跃时间": "Active Time",
    "粉丝粘性": "Engagement",
    "近7天粉丝总数": "Followers (7d)",
    "性别": "Gender",
    "观看互动粉丝": "Engaged Fans",
    "个人信息举报": "Report User",
    "新增关注": "Follow",
    "性别分布": "Gender",
    "年龄分布": "Age",
    "粉丝来源": "Fan Sources",
    "近30天粉丝画像": "Audience (30d)",
    "活跃粉丝占比": "Active Fans",
    "游客画像": "Visitor Audience",
    "粉丝排行近30天": "Fan Rankings (30d)",
    "近期你的粉丝活跃度较低，多多跟粉丝互动哦": "Your Fans Have Been Inactive Recently, Try Interacting More!",
    "加入黑名单": "Blacklist",
    "取消黑��单": "Unblacklist",
    "未知": "Unknown",
    "合作": "Cooperate",
    "话题": "Topics",
    "发布": "Post",
    "音频": "Audio",
    "确定": "Confirm",
    "取消": "Cancel",
    "公开": "Public",
    "最新": "New",
    "自动连播": "Auto Play",
    "舞见": "Dancer",
    "接下来播放": "Next Up",
    "美食": "Food",
    "学习": "Study",
    "萌宠": "Pets",
    "手艺": "Craft",
    "户外": "Outdoors",
    "周一": "Mon",
    "周二": "Tue",
    "周三": "Wed",
    "周四": "Thu",
    "周五": "Fri",
    "周六": "Sat",
    "周日": "Sun",
    "1 月": "Jan",
    "2 月": "Feb",
    "3 月": "Mar",
    "4 月": "Apr",
    "5 月": "May",
    "6 月": "Jun",
    "7 月": "Jul",
    "8 月": "Aug",
    "9 月": "Sep",
    "10 月": "Oct",
    "11 月": "Nov",
    "12 月": "Dec",
    "星期一": "Mon",
    "星期二": "Tue",
    "星期三": "Wed",
    "星期四": "Thu",
    "星期五": "Fri",
    "星期六": "Sat",
    "星期日": "Sun",
    "科技": "Tech",
    "动漫": "Anime",
    "体育": "Sports",
    "明星": "Celeb",
    "收起": "Minimize",
    "展开": "Expand",
    "星海": "Military",
    "相声": "Crosstalk",
    "电竞": "Esports",
    "综艺": "Variety",
    "热门": "Hot",
    "萌新": "New",
    "推荐": "Recs",
    "配音": "Dubbing",
    "唱见": "Singer",
    "放松": "Relax",
    "聊天": "Chat",
    "简介": "Bio",
    "TA的": "Their",
    "闲置": "Idle",
    "轮播": "Loop",
    "今天": "Today",
    "昨天": "Yesterday",
    "进1周": "This Week",
    "1月前": "1 mo ago",
    "1个月前": "Last Month",
    "登录": "Login",
    "注册": "Sign Up",
    "退出登录": "Logout",
    "搜索": "Search",
    "评论区": "Comments",
    "投币": "Coin",
    "反馈": "Feedback",
    "帮助": "Help",
    "客服": "Support",
    "夜间模式": "Dark Mode",
    "语言": "Language",
    "暂停": "Pause",
    "下一集": "Next",
    "上一集": "Previous",
    "跳过": "Skip",
    "分区": "Category",
    "清除缓存": "Clear Cache",
    "上传": "Upload",
    "私信": "DM",
    "排行": "Ranking",
    "加载中": "Loading",
    "准高清": "HD",
    "出错啦": "Error",
    "重试": "Retry",
    "下拉刷新": "Refresh",
    "自动切集": "Auto Next",
    "播完暂停": "Pause After End",
    "登录即享": "Login",
    "视频比例": "Aspect Ratio",
    "查看更多": "More",
    "更多播放设置": "More Settings",
    "播放方式": "Playback",
    "单集循环": "Loop",
    "投屏": "Cast",
    "画质": "Quality",
    "清晰度": "Resolution",
    "倍速播放": "Speed",
    "自动开播": "Auto Play",
    "镜像画面": "Mirror",
    "倍速": "Speed",
    "播放列表": "Playlist",
    "礼物": "Gifts",
    "送出礼物": "Send Gift",
    "我的礼物": "My Gifts",
    "字幕": "Subtitles",
    "开通大会员": "Become VIP",
    "大会员权益": "VIP Perks",
    "创作者中心": "Creator",
    "创作主页": "Creator Home",
    "活动中心": "Events",
    "成长中心": "Growth",
    "任务中心": "Tasks",
    "消息提醒": "Alerts",
    "系统设置": "System",
    "隐私政策": "Privacy",
    "用户协议": "Terms",
    "关于我们": "About",
    "帮助与反馈": "Support",
    "意见反馈": "Feedback",
    "视频详情": "Details",
    "视频分区": "Category",
    "直播分类": "Live Cats",
    "直播列表": "Live List",
    "直播详情": "Live Info",
    "弹幕关闭": "Danmaku Off",
    "弹幕开启": "Danmaku On",
    "关闭": "Off",
    "开启": "On",
    "送花": "Flowers",
    "送心": "Hearts",
    "关注成功": "Followed",
    "已取消关注": "Unfollowed",
    "发送": "Send",
    "发送中": "Sending",
    "已发送": "Sent",
    "投币成功": "Coined",
    "搜索历史": "Search Log",
    "热门搜索": "Hot Searches",
    "清除历史": "Clear Log",
    "收藏成功": "Saved",
    "移除收藏": "Unsave",
    "播放中": "Playing",
    "电���": "Movies",
    "汽车": "Cars",
    "美妆": "Beauty",
    "动物": "Animals",
    "vlog": "Vlog",
    "绘画": "Art",
    "AI": "AI",
    "家装房产": "Home",
    "健身": "Fitness",
    "手工": "Craft",
    "旅行": "Travel",
    "三农": "Agriculture",
    "亲子": "Family",
    "健康": "Health",
    "情感": "Emotion",
    "兴趣生活": "Lifestyle",
    "生活经验": "Experience",
    "公益": "Charity",
    "超清": "HD",
    "社区": "Community",
    "榜单": "Charts",
    "账号和密码": "Credentials",
    "忘记密码": "Forgot Password",
    "客户端": "Client",
    "BiliBili客户端": "BiliBili Client",
    "修改密码": "Change Password",
    "显示密码": "Show Password",
    "隐藏密码": "Hide Password",
    "记住密码": "Remember Me",
    "登出": "Logout",
    "检查更新": "Check Update",
    "版本信息": "Version",
    "语言设置": "Language",
    "地区设置": "Region",
    "安全中心": "Security Center",
    "两��验证": "2FA",
    "设备管理": "Devices",
    "授权管理": "Permissions",
    "主题": "Theme",
    "亮色模式": "Light Mode",
    "暗色模式": "Dark Mode"
  };
  function getLocalTranslation(text, targetLang = "en") {
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (targetLang === "en") {
      const directMatch = BILIBILI_EN_DICT[trimmed];
      if (directMatch) return directMatch;
      const lowerMatch = BILIBILI_EN_DICT[trimmed.toLowerCase()];
      if (lowerMatch) return lowerMatch;
      const timeMatch = localizeRelativeTime(trimmed);
      if (timeMatch) return timeMatch;
      const statsMatch = localizeStats(trimmed);
      if (statsMatch) return statsMatch;
      const prefixMatch = localizePlayerPrefix(trimmed);
      if (prefixMatch) return prefixMatch;
      const phraseMatch = localizeDynamicPhrases(trimmed);
      if (phraseMatch) return phraseMatch;
    }
    return null;
  }
  function localizeDynamicPhrases(str) {
    const followMatch = str.match(/^[+＋]?\s*(关注|已关注|互相关注)\s*(\d+(?:\.\d+)?[万kKwW]?)?$/);
    if (followMatch) {
      const type = followMatch[1];
      const count = followMatch[2] ? ` ${followMatch[2]}` : "";
      if (type === "已关注") return `Following${count}`;
      if (type === "互相关注") return `Mutual Follow${count}`;
      return `+ Follow${count}`;
    }
    if (/^发消息$/.test(str)) return "Send Message";
    if (/^发个友善的弹幕见证当下$/.test(str)) return "Send a friendly danmaku...";
    if (/^发[条个]?弹幕$/.test(str)) return "Send Danmaku";
    if (/^小窗$/.test(str)) return "Pop-out";
    if (/^客服$/.test(str)) return "Support";
    if (/^顶部$/.test(str)) return "Top";
    if (/^底部$/.test(str)) return "Bottom";
    if (/^反馈$/.test(str)) return "Feedback";
    if (/^点赞$/.test(str)) return "Like";
    if (/^投币$/.test(str)) return "Coin";
    if (/^收藏$/.test(str)) return "Favorite";
    if (/^分享$/.test(str)) return "Share";
    if (/^稿件投诉$/.test(str)) return "Manuscript report";
    if (/^记笔记$/.test(str)) return "Take notes";
    if (/^弹幕礼仪$/.test(str)) return "Barrage etiquette";
    if (/^发送$/.test(str)) return "Send";
    const discMatch = str.match(/^发现\s*[《<](.+?)[》>]$/);
    if (discMatch) return `Discover "${discMatch[1]}"`;
    const catTagMatch = str.match(/^(电影|电视剧|纪录片|番剧|国创)\s*(.+)$/);
    if (catTagMatch) {
      const cat = catTagMatch[1] === "电影" ? "Movie" : catTagMatch[1] === "电视剧" ? "TV" : catTagMatch[1] === "纪录片" ? "Documentary" : catTagMatch[1] === "番剧" ? "Anime" : "Donghua";
      return `${cat}: ${catTagMatch[2]}`;
    }
    let m = str.match(/^(视频素材|贴纸素材)\s*([\d+]+)$/);
    if (m) {
      const label = m[1] === "视频素材" ? "Video Materials" : "Sticker Materials";
      return `${label} ${m[2]}`;
    }
    m = str.match(/^统计截至[:：]?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*[（(](.*)[）)]$/);
    if (m) {
      const note = m[2].replace(/每日(\d+)点更新/, "Updated daily at $1:00");
      return `Stats as of: ${m[1]} (${note})`;
    }
    return null;
  }
  function localizePlayerPrefix(str) {
    let m = str.match(/^倍速[:：]\s*(.*)$/);
    if (m) return `Speed: ${m[1]}`;
    m = str.match(/^清晰度[:：]\s*(.*)$/);
    if (m) return `Resolution: ${m[1]}`;
    return null;
  }
  function localizeRelativeTime(str) {
    if (str === "刚刚") return "Just now";
    if (str === "昨天") return "Yesterday";
    if (str === "前天") return "2 days ago";
    let m = str.match(/^(\d+)\s*秒前$/);
    if (m) return `${m[1]}s ago`;
    m = str.match(/^(\d+)\s*分钟前$/);
    if (m) return `${m[1]}m ago`;
    m = str.match(/^(\d+)\s*小时前$/);
    if (m) return `${m[1]}h ago`;
    m = str.match(/^(\d+)\s*天前$/);
    if (m) return `${m[1]}d ago`;
    m = str.match(/^昨天\s*(\d{1,2}:\d{2})$/);
    if (m) return `Yesterday ${m[1]}`;
    m = str.match(/^前天\s*(\d{1,2}:\d{2})$/);
    if (m) return `2 days ago ${m[1]}`;
    return null;
  }
  function localizeStats(str) {
    let m = str.match(/^([\d.]+)\s*万\s*(?:次)?\s*(?:播放|观看)$/);
    if (m) {
      const num = parseFloat(m[1]) * 10;
      return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}K views`;
    }
    m = str.match(/^([\d.]+)\s*亿\s*(?:次)?\s*(?:播放|观看)$/);
    if (m) {
      const num = parseFloat(m[1]) * 100;
      return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}M views`;
    }
    m = str.match(/^(\d+)\s*条?\s*弹幕$/);
    if (m) {
      const count = parseInt(m[1], 10);
      return `${count.toLocaleString()} danmaku`;
    }
    m = str.match(/^([\d.]+)\s*万\s*条?\s*弹幕$/);
    if (m) {
      const num = parseFloat(m[1]) * 10;
      return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}K danmaku`;
    }
    m = str.match(/^([\d.]+)\s*万$/);
    if (m) {
      const num = parseFloat(m[1]) * 10;
      return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}K`;
    }
    return null;
  }
  const FAST_DEFAULTS = {
    enabled: true,
    sourceLang: "auto",
    targetLang: "en",
    provider: "google",
    fallbackChain: ["google", "libretranslate", "mymemory"],
    mode: "translated-only",
    translateDynamic: true,
    translatePopups: true,
    translateTooltips: true,
    translatePlaceholders: true,
    customApiUrl: "",
    customApiKey: "",
    customApiModel: "",
    siteSettings: {},
    appearance: {
      fontSize: 13,
      opacity: 0.95,
      theme: "glass-dark",
      showFloatingHUD: false,
      showOriginalOnHover: true,
      concurrency: 3
    }
  };
  class ContentTranslator {
    constructor() {
      __publicField(this, "settings", { ...FAST_DEFAULTS });
      __publicField(this, "textExtractor");
      __publicField(this, "overlayManager");
      __publicField(this, "mutationManager");
      __publicField(this, "scannerWorker");
      __publicField(this, "queue");
      __publicField(this, "floatingHUD");
      __publicField(this, "isDisconnected", false);
      this.textExtractor = new TextExtractor();
      this.overlayManager = new OverlayManager(this.settings, this.textExtractor);
      this.queue = new TranslationQueue(
        this.settings,
        (target, translatedText) => {
          this.overlayManager.applyTranslation(target, translatedText);
        },
        (req) => this.sendMessage(req)
      );
      this.scannerWorker = new ScannerWorker(
        this.textExtractor,
        this.settings,
        (targets, priority) => this.enqueueWithPriority(targets, priority)
      );
      this.mutationManager = new MutationManager(
        (mutatedNodes) => {
          if (!this.isCurrentSiteEnabled()) return;
          if (!this.settings.translateDynamic) return;
          this.processMutatedNodes(mutatedNodes);
        },
        (node, val) => this.overlayManager.isSelfMutation(node, val)
      );
      this.mutationManager.start();
      this.floatingHUD = new FloatingHUD(this.settings, {
        onToggleEnabled: (enabled) => this.saveSettings({ enabled }),
        onChangeMode: (mode) => this.saveSettings({ mode }),
        onChangeTargetLang: (targetLang) => {
          this.saveSettings({ targetLang });
          this.retranslateAll();
        },
        onTranslateCurrentPage: () => this.fullPageScan()
      });
      this.boot();
    }
    // ── Boot sequence ────────────────────────────────────────────────────
    async boot() {
      const settingsPromise = this.loadSettings();
      const startScan = () => {
        if (!this.isCurrentSiteEnabled()) {
          this.floatingHUD.setStatus("Disabled for site");
          return;
        }
        this.immediateViewportScan();
        this.fullPageScan();
        this.setupListeners();
      };
      if (document.body) {
        startScan();
      } else {
        document.addEventListener("DOMContentLoaded", startScan, { once: true });
      }
      settingsPromise.then(() => {
        this.queue.updateSettings(this.settings);
        this.overlayManager.updateSettings(this.settings);
        this.scannerWorker.updateSettings(this.settings);
        this.floatingHUD.updateSettings(this.settings);
        if (!this.isCurrentSiteEnabled()) {
          this.queue.reset();
          this.overlayManager.clear();
          this.floatingHUD.setStatus("Disabled for site");
        }
      });
    }
    // ── Immediate above-the-fold scan ─────────────────────────────────────
    /**
     * Synchronously extracts text from the header and above-the-fold navigation.
     * Runs immediately without waiting for settings to return from storage.
     */
    immediateViewportScan() {
      const root = document.body ?? document.documentElement;
      if (!root) return;
      const targets = [];
      const prioritySelectors = [
        ".bili-header",
        ".bili-header__bar",
        ".bili-header__channel",
        ".channel-icons",
        ".channel-items__left",
        ".channel-items__right",
        ".channel-link",
        "header",
        "#bili-header-container",
        ".up-info",
        ".up-detail",
        ".video-toolbar-v1",
        ".tag-panel",
        ".bpx-player-control-bottom",
        ".bili-elevator",
        ".side-nav"
      ];
      for (const sel of prioritySelectors) {
        const els = root.querySelectorAll(sel);
        els.forEach((el) => {
          const extracted = this.textExtractor.extractFromRoot(el, this.settings);
          for (const t of extracted) {
            t.priority = 0;
            targets.push(t);
          }
        });
      }
      if (targets.length > 0) {
        logger.info(`Immediate viewport scan: ${targets.length} targets discovered`);
        this.dispatchTargets(targets);
        this.floatingHUD.setStatus("Active");
      }
    }
    // ── Full background page scan ─────────────────────────────────────────
    fullPageScan() {
      if (!this.isCurrentSiteEnabled()) return;
      const root = document.body ?? document.documentElement;
      if (!root) return;
      this.floatingHUD.setStatus("Scanning…", true);
      this.scannerWorker.scan(root).then(() => {
        this.floatingHUD.setStatus("Active");
      });
    }
    // ── Dynamic mutation handling ─────────────────────────────────────────
    processMutatedNodes(nodes) {
      if (!this.isCurrentSiteEnabled()) return;
      const targets = [];
      for (const node of nodes) {
        const extracted = this.textExtractor.extractFromRoot(node, this.settings);
        targets.push(...extracted);
      }
      if (targets.length > 0) {
        logger.debug(`Dynamic: ${targets.length} targets from mutations`);
        this.dispatchTargets(targets);
      }
    }
    // ── Priority-aware enqueue ────────────────────────────────────────────
    enqueueWithPriority(targets, priority) {
      for (const t of targets) t.priority = priority;
      this.dispatchTargets(targets);
    }
    /**
     * Dispatches discovered targets:
     * 1. Checks local dictionary for instant 0ms translation (UI terms, buttons, categories)
     * 2. Routes uncached targets to TranslationQueue for batched background translation
     */
    dispatchTargets(targets) {
      if (!targets.length) return;
      const uncached = [];
      for (const target of targets) {
        const local = getLocalTranslation(target.originalText, this.settings.targetLang);
        if (local) {
          this.overlayManager.applyTranslation(target, local);
        } else {
          uncached.push(target);
        }
      }
      if (uncached.length > 0) {
        this.queue.enqueue(uncached);
      }
    }
    // ── Re-translate (language change, settings change) ───────────────────
    retranslateAll() {
      this.overlayManager.clear();
      this.textExtractor.reset();
      this.queue.reset();
      this.scannerWorker.abort();
      this.fullPageScan();
    }
    // ── Chrome messaging ──────────────────────────────────────────────────
    async sendMessage(req) {
      var _a, _b;
      if (this.isDisconnected) throw new Error("Extension context invalidated");
      if (typeof chrome === "undefined" || !((_a = chrome == null ? void 0 : chrome.runtime) == null ? void 0 : _a.id)) {
        this.handleExtensionInvalidated();
        throw new Error("Extension context invalidated");
      }
      try {
        return await chrome.runtime.sendMessage(req);
      } catch (err) {
        const msg = ((err == null ? void 0 : err.message) ?? "").toLowerCase();
        const isContextGone = msg.includes("extension context") || msg.includes("could not establish connection") || msg.includes("receiving end does not exist") || msg.includes("message channel was closed") || !((_b = chrome == null ? void 0 : chrome.runtime) == null ? void 0 : _b.id);
        if (isContextGone) {
          this.handleExtensionInvalidated();
        }
        throw err;
      }
    }
    async loadSettings() {
      var _a;
      if (typeof chrome === "undefined" || !((_a = chrome.runtime) == null ? void 0 : _a.sendMessage)) return;
      try {
        const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
        if ((response == null ? void 0 : response.success) && response.settings) {
          this.settings = response.settings;
          if (this.settings.appearance) {
            this.settings.appearance.showFloatingHUD = false;
          }
        }
      } catch (err) {
        logger.warn("Could not load settings (using fast defaults):", err);
      }
    }
    setupListeners() {
      var _a;
      if (typeof chrome === "undefined" || !((_a = chrome.runtime) == null ? void 0 : _a.onMessage)) return;
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === MESSAGE_TYPES.SETTINGS_CHANGED && message.settings) {
          const oldTargetLang = this.settings.targetLang;
          const oldEnabled = this.settings.enabled;
          this.settings = message.settings;
          if (this.settings.appearance) {
            this.settings.appearance.showFloatingHUD = false;
          }
          this.overlayManager.updateSettings(this.settings);
          this.queue.updateSettings(this.settings);
          this.scannerWorker.updateSettings(this.settings);
          this.floatingHUD.updateSettings(this.settings);
          if (!this.settings.enabled) {
            this.queue.reset();
            this.overlayManager.clear();
            this.mutationManager.pause();
            this.floatingHUD.setStatus("Paused");
          } else {
            this.mutationManager.resume();
            if (!oldEnabled || oldTargetLang !== this.settings.targetLang) {
              this.retranslateAll();
            }
          }
        }
      });
      if (document.readyState === "complete") {
        setTimeout(() => this.immediateViewportScan(), 500);
      } else {
        window.addEventListener("load", () => {
          setTimeout(() => this.immediateViewportScan(), 500);
        }, { once: true });
      }
    }
    async saveSettings(newSettings) {
      var _a;
      this.settings = { ...this.settings, ...newSettings };
      this.overlayManager.updateSettings(this.settings);
      this.queue.updateSettings(this.settings);
      this.floatingHUD.updateSettings(this.settings);
      if (typeof chrome !== "undefined" && ((_a = chrome.runtime) == null ? void 0 : _a.sendMessage)) {
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.SAVE_SETTINGS,
          settings: this.settings
        }).catch(() => {
        });
      }
      if (!this.settings.enabled) {
        this.queue.reset();
        this.overlayManager.clear();
        this.mutationManager.pause();
        this.floatingHUD.setStatus("Paused");
      } else {
        this.mutationManager.resume();
      }
    }
    isCurrentSiteEnabled() {
      if (!this.settings.enabled) return false;
      const hostname = window.location.hostname;
      const siteConfig = this.settings.siteSettings[hostname];
      if ((siteConfig == null ? void 0 : siteConfig.enabled) === false) return false;
      return true;
    }
    // ── Extension context invalidation ────────────────────────────────────
    handleExtensionInvalidated() {
      this.isDisconnected = true;
      this.mutationManager.stop();
      this.queue.invalidate();
      this.scannerWorker.abort();
      this.floatingHUD.setStatus("Extension reloaded — please refresh");
      logger.info("Extension invalidated. Content script stopped.");
    }
  }
  try {
    new ContentTranslator();
  } catch (err) {
    console.warn("[UniversalTranslator] Failed to initialize:", err);
  }
})();
