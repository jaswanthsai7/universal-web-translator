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
    "bpx-player-danmaku",
    // Bilibili danmaku bullet comments
    "bpx-player-video-wrap",
    "webtrans-ignore",
    "webtrans-overlay",
    "webtrans-hud-root"
  ];
  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.getClientRects().length === 0) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    return true;
  }
  function isIgnoredElement(el) {
    if (!el) return false;
    let current = el;
    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current;
        if (element.tagName && IGNORED_TAGS.has(element.tagName.toUpperCase())) return true;
        if (typeof element.hasAttribute === "function" && element.hasAttribute("data-webtrans-ignore")) return true;
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
      __publicField(this, "processedNodes", /* @__PURE__ */ new WeakSet());
      __publicField(this, "processedElements", /* @__PURE__ */ new WeakSet());
    }
    reset() {
      this.processedNodes = /* @__PURE__ */ new WeakSet();
      this.processedElements = /* @__PURE__ */ new WeakSet();
    }
    isProcessed(node) {
      return this.processedNodes.has(node);
    }
    markProcessed(node) {
      this.processedNodes.add(node);
    }
    /**
     * Extracts translatable text nodes and attributes from a target root or element
     */
    extractFromRoot(root, settings) {
      var _a;
      const targets = [];
      if (!root) return targets;
      if (root instanceof HTMLElement && isIgnoredElement(root)) {
        return targets;
      }
      const doc = root.ownerDocument || root;
      const walker = doc.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            var _a2;
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node;
              if (isIgnoredElement(el)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_SKIP;
            }
            if (node.nodeType === Node.TEXT_NODE) {
              if (this.processedNodes.has(node)) {
                return NodeFilter.FILTER_REJECT;
              }
              const text = (_a2 = node.nodeValue) == null ? void 0 : _a2.trim();
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
          }
        }
      );
      let currentNode = walker.nextNode();
      while (currentNode) {
        if (currentNode.nodeType === Node.TEXT_NODE) {
          const text = ((_a = currentNode.nodeValue) == null ? void 0 : _a.trim()) || "";
          const parent = currentNode.parentElement;
          if (parent) {
            this.processedNodes.add(currentNode);
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
      return targets;
    }
    extractAttributes(root, settings, targets) {
      var _a, _b, _c;
      const elementsToInspect = [];
      if (root instanceof HTMLElement && !isIgnoredElement(root)) {
        elementsToInspect.push(root);
        const descendants = root.querySelectorAll("input, textarea, [title], [aria-label], img[alt]");
        descendants.forEach((el) => {
          if (!isIgnoredElement(el)) elementsToInspect.push(el);
        });
      }
      for (const el of elementsToInspect) {
        if (this.processedElements.has(el)) continue;
        if (settings.translatePlaceholders && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          const placeholder = (_a = el.placeholder) == null ? void 0 : _a.trim();
          if (placeholder && isTranslatableString(placeholder)) {
            targets.push({
              node: el,
              type: "attribute",
              attributeName: "placeholder",
              originalText: placeholder,
              element: el
            });
          }
        }
        if (settings.translateTooltips && el.hasAttribute("title")) {
          const title = (_b = el.getAttribute("title")) == null ? void 0 : _b.trim();
          if (title && isTranslatableString(title)) {
            targets.push({
              node: el,
              type: "attribute",
              attributeName: "title",
              originalText: title,
              element: el
            });
          }
        }
        if (settings.translateTooltips && el.hasAttribute("aria-label")) {
          const ariaLabel = (_c = el.getAttribute("aria-label")) == null ? void 0 : _c.trim();
          if (ariaLabel && isTranslatableString(ariaLabel)) {
            targets.push({
              node: el,
              type: "attribute",
              attributeName: "aria-label",
              originalText: ariaLabel,
              element: el
            });
          }
        }
        this.processedElements.add(el);
      }
    }
  }
  class OverlayManager {
    constructor(settings) {
      __publicField(this, "overlayContainer", null);
      __publicField(this, "styleSheet", null);
      __publicField(this, "activeOverlays", /* @__PURE__ */ new Map());
      __publicField(this, "typographyCache", /* @__PURE__ */ new WeakMap());
      __publicField(this, "hiddenElements", /* @__PURE__ */ new Set());
      __publicField(this, "isRepositionScheduled", false);
      __publicField(this, "settings");
      this.settings = settings;
      this.initContainer();
      this.injectStyles();
      this.bindEvents();
    }
    updateSettings(settings) {
      const oldMode = this.settings.mode;
      this.settings = settings;
      if (oldMode !== settings.mode) {
        this.clear();
        this.initContainer();
        this.injectStyles();
      } else {
        this.repositionAll();
      }
    }
    initContainer() {
      if (this.overlayContainer && this.overlayContainer.isConnected) return;
      const container = document.createElement("div");
      container.id = "universal-webtrans-overlay-container";
      container.setAttribute("data-webtrans-ignore", "true");
      container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none !important;
      z-index: 2147483640;
      overflow: visible;
      contain: layout style;
    `;
      (document.body || document.documentElement).appendChild(container);
      this.overlayContainer = container;
    }
    injectStyles() {
      if (this.styleSheet && this.styleSheet.isConnected) return;
      const style = document.createElement("style");
      style.id = "universal-webtrans-styles";
      style.setAttribute("data-webtrans-ignore", "true");
      style.textContent = `
      .webtrans-orig-hidden {
        color: transparent !important;
        text-shadow: none !important;
      }
      .webtrans-orig-hidden::placeholder {
        color: transparent !important;
      }
      .webtrans-orig-hidden > svg,
      .webtrans-orig-hidden > img,
      .webtrans-orig-hidden > i,
      .webtrans-orig-hidden > canvas,
      .webtrans-orig-hidden > [class*="icon"],
      .webtrans-orig-hidden > [class*="svg"] {
        color: initial !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      .webtrans-native-text {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        padding: 0 !important;
        margin: 0 !important;
        pointer-events: none !important;
        user-select: text;
        box-sizing: border-box;
      }
      .webtrans-dual-text {
        display: block;
        font-size: 0.88em;
        color: #3b82f6;
        opacity: 0.9;
        margin-top: 2px;
      }
    `;
      (document.head || document.documentElement).appendChild(style);
      this.styleSheet = style;
    }
    bindEvents() {
      const triggerReposition = () => {
        if (!this.isRepositionScheduled) {
          this.isRepositionScheduled = true;
          requestAnimationFrame(() => {
            this.repositionAll();
            this.isRepositionScheduled = false;
          });
        }
      };
      window.addEventListener("scroll", triggerReposition, { passive: true });
      window.addEventListener("resize", triggerReposition, { passive: true });
      document.addEventListener("fullscreenchange", triggerReposition);
    }
    /**
     * Apply natural in-place translation to the target element
     */
    applyTranslation(target, rawTranslatedText) {
      if (!rawTranslatedText) return;
      const cleanTranslation = rawTranslatedText.replace(/^\[(?:EN|ZH|JA|KO|ES|FR|DE|RU):\s*/i, "").replace(/\]$/, "").trim();
      if (!cleanTranslation || cleanTranslation === target.originalText.trim()) {
        return;
      }
      target.translatedText = cleanTranslation;
      if (target.type === "attribute" && target.attributeName) {
        this.applyAttributeTranslation(target, cleanTranslation);
        return;
      }
      const el = target.element;
      if (!el || !el.isConnected) return;
      const typography = this.getOrCacheTypography(el);
      if (this.settings.mode === "translated-only") {
        el.classList.add("webtrans-orig-hidden");
        this.hiddenElements.add(el);
        this.renderNativeOverlay(target, cleanTranslation, typography);
      } else if (this.settings.mode === "dual") {
        this.renderDualOverlay(target, cleanTranslation, typography);
      } else if (this.settings.mode === "hover") {
        el.setAttribute("title", cleanTranslation);
      }
    }
    getOrCacheTypography(el) {
      let cached = this.typographyCache.get(el);
      if (!cached) {
        const computed = window.getComputedStyle(el);
        const fontSizeStr = computed.fontSize || "14px";
        const numSize = parseFloat(fontSizeStr) || 14;
        cached = {
          color: computed.color || "#18191c",
          fontFamily: computed.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: fontSizeStr,
          fontWeight: computed.fontWeight || "400",
          fontStyle: computed.fontStyle || "normal",
          lineHeight: computed.lineHeight || "normal",
          letterSpacing: computed.letterSpacing || "normal",
          textAlign: computed.textAlign || "left",
          textTransform: computed.textTransform || "none",
          whiteSpace: computed.whiteSpace || "normal",
          wordBreak: computed.wordBreak || "break-word",
          display: computed.display || "block",
          numericFontSize: numSize
        };
        this.typographyCache.set(el, cached);
      }
      return cached;
    }
    renderNativeOverlay(target, translatedText, typography) {
      this.initContainer();
      if (!this.overlayContainer) return;
      const el = target.element;
      if (!isElementVisible(el)) return;
      let overlay = this.activeOverlays.get(target);
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "webtrans-native-text";
        overlay.setAttribute("data-webtrans-ignore", "true");
        this.overlayContainer.appendChild(overlay);
        this.activeOverlays.set(target, overlay);
      }
      overlay.textContent = translatedText;
      this.applyNativeStyle(overlay, typography, el, translatedText, target.originalText);
      this.positionOverlay(target, overlay);
    }
    renderDualOverlay(target, translatedText, typography) {
      this.initContainer();
      if (!this.overlayContainer) return;
      const el = target.element;
      if (!isElementVisible(el)) return;
      let overlay = this.activeOverlays.get(target);
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "webtrans-native-text";
        overlay.setAttribute("data-webtrans-ignore", "true");
        this.overlayContainer.appendChild(overlay);
        this.activeOverlays.set(target, overlay);
      }
      overlay.style.fontFamily = typography.fontFamily;
      overlay.innerHTML = `<span class="webtrans-dual-text">${translatedText}</span>`;
      this.positionOverlay(target, overlay);
    }
    applyNativeStyle(overlay, typography, el, translatedText, originalText) {
      let effectiveFontSize = typography.fontSize;
      const isTightButton = el.tagName === "BUTTON" || el.classList.contains("ctrl-btn") || el.classList.contains("bpx-menu-item") || el.classList.contains("nav-link") || typography.whiteSpace === "nowrap";
      if (isTightButton && translatedText.length > originalText.length * 2.2) {
        const reduced = Math.max(11, typography.numericFontSize - 1.5);
        effectiveFontSize = `${reduced}px`;
      }
      overlay.style.position = "absolute";
      overlay.style.fontFamily = typography.fontFamily;
      overlay.style.fontSize = effectiveFontSize;
      overlay.style.fontWeight = typography.fontWeight;
      overlay.style.fontStyle = typography.fontStyle;
      overlay.style.lineHeight = typography.lineHeight;
      overlay.style.letterSpacing = typography.letterSpacing;
      overlay.style.textAlign = typography.textAlign;
      overlay.style.textTransform = typography.textTransform;
      overlay.style.color = typography.color;
      overlay.style.background = "transparent";
      overlay.style.border = "none";
      overlay.style.boxShadow = "none";
      overlay.style.outline = "none";
      overlay.style.padding = "0";
      overlay.style.margin = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.userSelect = "text";
      overlay.style.zIndex = "2147483640";
      overlay.style.overflow = "visible";
      overlay.style.whiteSpace = typography.whiteSpace === "nowrap" ? "nowrap" : "normal";
      overlay.style.wordBreak = typography.wordBreak;
      if (typography.display.includes("flex")) {
        overlay.style.display = "flex";
        overlay.style.alignItems = "center";
      } else {
        overlay.style.display = "block";
      }
    }
    positionOverlay(target, overlay) {
      const el = target.element;
      if (!el || !el.isConnected) {
        overlay.remove();
        this.activeOverlays.delete(target);
        return;
      }
      if (!isElementVisible(el)) {
        overlay.style.display = "none";
        return;
      }
      overlay.style.display = "block";
      const rect = el.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      overlay.style.top = `${rect.top + scrollY}px`;
      overlay.style.left = `${rect.left + scrollX}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.minHeight = `${rect.height}px`;
    }
    repositionAll() {
      for (const [target, overlay] of this.activeOverlays.entries()) {
        if (!target.element.isConnected) {
          overlay.remove();
          this.activeOverlays.delete(target);
          continue;
        }
        this.positionOverlay(target, overlay);
      }
    }
    applyAttributeTranslation(target, translatedText) {
      const el = target.element;
      const attr = target.attributeName;
      if (attr === "placeholder" && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        if (!el.hasAttribute("data-webtrans-orig-placeholder")) {
          el.setAttribute("data-webtrans-orig-placeholder", target.originalText);
        }
        el.placeholder = translatedText;
      } else if (attr === "title") {
        if (!el.hasAttribute("data-webtrans-orig-title")) {
          el.setAttribute("data-webtrans-orig-title", target.originalText);
        }
        el.setAttribute("title", translatedText);
      } else if (attr === "aria-label") {
        el.setAttribute("aria-label", translatedText);
      }
    }
    clear() {
      if (this.overlayContainer) {
        this.overlayContainer.innerHTML = "";
      }
      this.activeOverlays.clear();
      for (const el of this.hiddenElements) {
        if (el.isConnected) {
          el.classList.remove("webtrans-orig-hidden");
        }
      }
      this.hiddenElements.clear();
      document.querySelectorAll("[data-webtrans-orig-placeholder]").forEach((el) => {
        const orig = el.getAttribute("data-webtrans-orig-placeholder");
        if (orig && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          el.placeholder = orig;
        }
        el.removeAttribute("data-webtrans-orig-placeholder");
      });
      document.querySelectorAll("[data-webtrans-orig-title]").forEach((el) => {
        const orig = el.getAttribute("data-webtrans-orig-title");
        if (orig) el.setAttribute("title", orig);
        el.removeAttribute("data-webtrans-orig-title");
      });
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
    constructor(callback) {
      __publicField(this, "observer", null);
      __publicField(this, "shadowObservers", /* @__PURE__ */ new Map());
      __publicField(this, "pendingNodes", /* @__PURE__ */ new Set());
      __publicField(this, "debounceTimer", null);
      __publicField(this, "debounceMs", 60);
      __publicField(this, "callback");
      __publicField(this, "isPaused", false);
      __publicField(this, "lastUrl", "");
      this.callback = callback;
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
          attributes: true,
          attributeFilter: ["style", "class", "aria-expanded", "hidden"]
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
  class FloatingHUD {
    constructor(settings, callbacks) {
      __publicField(this, "rootEl", null);
      __publicField(this, "settings");
      __publicField(this, "callbacks");
      __publicField(this, "isExpanded", false);
      __publicField(this, "statusText", "Ready");
      this.settings = settings;
      this.callbacks = callbacks;
      if (this.settings.appearance.showFloatingHUD) {
        this.render();
      }
    }
    updateSettings(settings) {
      this.settings = settings;
      if (!this.settings.appearance.showFloatingHUD) {
        this.destroy();
      } else {
        if (!this.rootEl) {
          this.render();
        } else {
          this.updateContent();
        }
      }
    }
    setStatus(text, isTranslating = false) {
      var _a;
      this.statusText = text;
      const statusBadge = (_a = this.rootEl) == null ? void 0 : _a.querySelector(".webtrans-hud-status");
      if (statusBadge) {
        statusBadge.textContent = text;
        statusBadge.style.color = isTranslating ? "#38bdf8" : "#4ade80";
      }
    }
    render() {
      if (this.rootEl && this.rootEl.isConnected) return;
      const hud = document.createElement("div");
      hud.id = "universal-webtrans-hud-root";
      hud.setAttribute("data-webtrans-ignore", "true");
      hud.className = "webtrans-hud-root";
      hud.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
      pointer-events: auto !important;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    `;
      document.documentElement.appendChild(hud);
      this.rootEl = hud;
      this.updateContent();
    }
    updateContent() {
      if (!this.rootEl) return;
      const enabled = this.settings.enabled;
      const mode = this.settings.mode;
      const targetLang = this.settings.targetLang;
      if (!this.isExpanded) {
        this.rootEl.innerHTML = `
        <div class="webtrans-pill" style="
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
          color: #f8fafc;
          padding: 6px 12px;
          border-radius: 9999px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s ease;
        ">
          <span style="
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${enabled ? "#22c55e" : "#ef4444"};
            box-shadow: 0 0 8px ${enabled ? "#22c55e" : "#ef4444"};
          "></span>
          <span>🌐 Translate (${targetLang.toUpperCase()})</span>
          <span class="webtrans-hud-status" style="font-size: 10px; color: #94a3b8;">${this.statusText}</span>
        </div>
      `;
        const pill = this.rootEl.querySelector(".webtrans-pill");
        pill == null ? void 0 : pill.addEventListener("click", (e) => {
          e.stopPropagation();
          this.isExpanded = true;
          this.updateContent();
        });
      } else {
        this.rootEl.innerHTML = `
        <div class="webtrans-card" style="
          width: 250px;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
          color: #f8fafc;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          font-size: 13px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
              <span>🌐 Web Translator</span>
            </div>
            <button id="webtrans-close-btn" style="
              background: transparent;
              border: none;
              color: #94a3b8;
              cursor: pointer;
              font-size: 16px;
              padding: 2px 6px;
            ">✕</button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #94a3b8; font-size: 12px;">Status:</span>
            <span class="webtrans-hud-status" style="font-weight: 500; font-size: 12px; color: #4ade80;">
              ${this.statusText}
            </span>
          </div>

          <div style="display: flex; gap: 8px;">
            <button id="webtrans-toggle-enable" style="
              flex: 1;
              padding: 6px 10px;
              border-radius: 6px;
              border: 1px solid rgba(255, 255, 255, 0.15);
              background: ${enabled ? "#1e293b" : "#3b82f6"};
              color: white;
              font-size: 12px;
              font-weight: 500;
              cursor: pointer;
            ">
              ${enabled ? "⏸ Pause" : "▶ Resume"}
            </button>

            <button id="webtrans-manual-translate" style="
              flex: 1;
              padding: 6px 10px;
              border-radius: 6px;
              border: none;
              background: #3b82f6;
              color: white;
              font-size: 12px;
              font-weight: 500;
              cursor: pointer;
            ">
              ↻ Translate
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; color: #94a3b8;">Target Language</label>
            <select id="webtrans-lang-select" style="
              background: #1e293b;
              border: 1px solid rgba(255, 255, 255, 0.15);
              color: white;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 12px;
              outline: none;
            ">
              <option value="en" ${targetLang === "en" ? "selected" : ""}>English</option>
              <option value="zh" ${targetLang === "zh" ? "selected" : ""}>Chinese (中文)</option>
              <option value="ja" ${targetLang === "ja" ? "selected" : ""}>Japanese (日本語)</option>
              <option value="ko" ${targetLang === "ko" ? "selected" : ""}>Korean (한국어)</option>
              <option value="es" ${targetLang === "es" ? "selected" : ""}>Spanish (Español)</option>
              <option value="fr" ${targetLang === "fr" ? "selected" : ""}>French (Français)</option>
              <option value="de" ${targetLang === "de" ? "selected" : ""}>German (Deutsch)</option>
              <option value="ru" ${targetLang === "ru" ? "selected" : ""}>Russian (Русский)</option>
            </select>
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; color: #94a3b8;">Translation Mode</label>
            <div style="display: flex; gap: 4px;">
              <button class="webtrans-mode-btn" data-mode="translated-only" style="
                flex: 1;
                padding: 4px 6px;
                border-radius: 5px;
                font-size: 11px;
                border: 1px solid ${mode === "translated-only" ? "#38bdf8" : "rgba(255,255,255,0.1)"};
                background: ${mode === "translated-only" ? "rgba(56, 189, 248, 0.2)" : "transparent"};
                color: ${mode === "translated-only" ? "#38bdf8" : "#94a3b8"};
                cursor: pointer;
              ">Translated</button>
              <button class="webtrans-mode-btn" data-mode="dual" style="
                flex: 1;
                padding: 4px 6px;
                border-radius: 5px;
                font-size: 11px;
                border: 1px solid ${mode === "dual" ? "#38bdf8" : "rgba(255,255,255,0.1)"};
                background: ${mode === "dual" ? "rgba(56, 189, 248, 0.2)" : "transparent"};
                color: ${mode === "dual" ? "#38bdf8" : "#94a3b8"};
                cursor: pointer;
              ">Dual</button>
              <button class="webtrans-mode-btn" data-mode="hover" style="
                flex: 1;
                padding: 4px 6px;
                border-radius: 5px;
                font-size: 11px;
                border: 1px solid ${mode === "hover" ? "#38bdf8" : "rgba(255,255,255,0.1)"};
                background: ${mode === "hover" ? "rgba(56, 189, 248, 0.2)" : "transparent"};
                color: ${mode === "hover" ? "#38bdf8" : "#94a3b8"};
                cursor: pointer;
              ">Hover</button>
            </div>
          </div>
        </div>
      `;
        this.bindCardEvents();
      }
    }
    bindCardEvents() {
      var _a, _b, _c;
      if (!this.rootEl) return;
      (_a = this.rootEl.querySelector("#webtrans-close-btn")) == null ? void 0 : _a.addEventListener("click", (e) => {
        e.stopPropagation();
        this.isExpanded = false;
        this.updateContent();
      });
      (_b = this.rootEl.querySelector("#webtrans-toggle-enable")) == null ? void 0 : _b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onToggleEnabled(!this.settings.enabled);
      });
      (_c = this.rootEl.querySelector("#webtrans-manual-translate")) == null ? void 0 : _c.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onTranslateCurrentPage();
      });
      const langSelect = this.rootEl.querySelector("#webtrans-lang-select");
      langSelect == null ? void 0 : langSelect.addEventListener("change", (e) => {
        e.stopPropagation();
        this.callbacks.onChangeTargetLang(langSelect.value);
      });
      const modeButtons = this.rootEl.querySelectorAll(".webtrans-mode-btn");
      modeButtons.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const m = btn.getAttribute("data-mode");
          if (m) this.callbacks.onChangeMode(m);
        });
      });
    }
    destroy() {
      if (this.rootEl && this.rootEl.isConnected) {
        this.rootEl.remove();
        this.rootEl = null;
      }
    }
  }
  class ContentTranslator {
    constructor() {
      __publicField(this, "settings", {
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
          showFloatingHUD: true,
          showOriginalOnHover: true
        }
      });
      __publicField(this, "textExtractor");
      __publicField(this, "overlayManager");
      __publicField(this, "mutationManager");
      __publicField(this, "floatingHUD");
      __publicField(this, "pendingQueue", []);
      __publicField(this, "batchTimer", null);
      __publicField(this, "BATCH_INTERVAL_MS", 80);
      __publicField(this, "MAX_BATCH_SIZE", 30);
      __publicField(this, "isTranslating", false);
      __publicField(this, "isDisconnected", false);
      this.textExtractor = new TextExtractor();
      this.overlayManager = new OverlayManager(this.settings);
      this.mutationManager = new MutationManager((mutatedNodes) => {
        if (!this.isCurrentSiteEnabled()) return;
        if (!this.settings.translateDynamic) return;
        this.processMutatedNodes(mutatedNodes);
      });
      this.floatingHUD = new FloatingHUD(this.settings, {
        onToggleEnabled: (enabled) => {
          this.saveSettings({ enabled });
        },
        onChangeMode: (mode) => {
          this.saveSettings({ mode });
        },
        onChangeTargetLang: (targetLang) => {
          this.saveSettings({ targetLang });
          this.retranslateAll();
        },
        onTranslateCurrentPage: () => {
          this.translateEntirePage();
        }
      });
      this.init();
    }
    async init() {
      await this.loadSettings();
      if (!this.isCurrentSiteEnabled()) {
        logger.info(`Translation disabled for domain: ${window.location.hostname}`);
        this.floatingHUD.setStatus("Disabled for site");
        return;
      }
      this.setupListeners();
      this.mutationManager.start();
      if (this.settings.enabled) {
        this.translateEntirePage();
      }
    }
    isCurrentSiteEnabled() {
      if (!this.settings.enabled) return false;
      const hostname = window.location.hostname;
      const siteConfig = this.settings.siteSettings[hostname];
      if (siteConfig && siteConfig.enabled === false) {
        return false;
      }
      return true;
    }
    async loadSettings() {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return;
      try {
        const response = await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.GET_SETTINGS
        });
        if (response && response.success && response.settings) {
          this.settings = response.settings;
          this.overlayManager.updateSettings(this.settings);
          this.floatingHUD.updateSettings(this.settings);
        }
      } catch (err) {
        logger.warn("Failed to load settings in content script:", err);
      }
    }
    setupListeners() {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === MESSAGE_TYPES.SETTINGS_CHANGED && message.settings) {
          const oldTargetLang = this.settings.targetLang;
          const oldEnabled = this.settings.enabled;
          this.settings = message.settings;
          this.overlayManager.updateSettings(this.settings);
          this.floatingHUD.updateSettings(this.settings);
          if (!this.settings.enabled) {
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
    }
    async saveSettings(newSettings) {
      this.settings = { ...this.settings, ...newSettings };
      this.overlayManager.updateSettings(this.settings);
      this.floatingHUD.updateSettings(this.settings);
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.SAVE_SETTINGS,
          settings: this.settings
        });
      }
      if (!this.settings.enabled) {
        this.overlayManager.clear();
        this.mutationManager.pause();
        this.floatingHUD.setStatus("Paused");
      } else {
        this.mutationManager.resume();
      }
    }
    /**
     * Scan and translate entire document
     */
    translateEntirePage() {
      if (!this.isCurrentSiteEnabled()) return;
      this.floatingHUD.setStatus("Scanning...", true);
      const root = document.body || document.documentElement;
      const targets = this.textExtractor.extractFromRoot(root, this.settings);
      logger.info(`Extracted ${targets.length} initial translatable items`);
      this.enqueueTargets(targets);
    }
    /**
     * Clears existing translations and re-scans the DOM (e.g. when changing target language)
     */
    retranslateAll() {
      this.overlayManager.clear();
      this.textExtractor.reset();
      this.translateEntirePage();
    }
    /**
     * Handle dynamically added nodes from MutationObserver
     */
    processMutatedNodes(nodes) {
      if (!this.isCurrentSiteEnabled()) return;
      let targets = [];
      for (const node of nodes) {
        const extracted = this.textExtractor.extractFromRoot(node, this.settings);
        targets.push(...extracted);
      }
      if (targets.length > 0) {
        logger.debug(`Extracted ${targets.length} items from dynamic mutations`);
        this.enqueueTargets(targets);
      }
    }
    enqueueTargets(targets) {
      if (targets.length === 0) return;
      this.pendingQueue.push(...targets);
      if (this.pendingQueue.length >= this.MAX_BATCH_SIZE) {
        this.flushBatch();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.batchTimer = null;
          this.flushBatch();
        }, this.BATCH_INTERVAL_MS);
      }
    }
    async flushBatch() {
      var _a, _b, _c;
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      if (this.isDisconnected) return;
      if (this.pendingQueue.length === 0) return;
      if (this.isTranslating) {
        this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_INTERVAL_MS);
        return;
      }
      if (typeof chrome === "undefined" || !((_a = chrome.runtime) == null ? void 0 : _a.id)) {
        this.handleExtensionInvalidated();
        return;
      }
      const currentBatch = this.pendingQueue.splice(0, this.MAX_BATCH_SIZE);
      const texts = currentBatch.map((t) => t.originalText);
      this.floatingHUD.setStatus("Translating...", true);
      this.isTranslating = true;
      try {
        const req = {
          type: MESSAGE_TYPES.TRANSLATE_BATCH,
          texts,
          sourceLang: this.settings.sourceLang,
          targetLang: this.settings.targetLang
        };
        const res = await chrome.runtime.sendMessage(req);
        if (res && res.success && res.translations) {
          for (let i = 0; i < currentBatch.length; i++) {
            const trans = res.translations[i];
            if (trans) {
              this.overlayManager.applyTranslation(currentBatch[i], trans);
            }
          }
          this.floatingHUD.setStatus("Active");
        } else {
          logger.warn("Batch translation response error:", res == null ? void 0 : res.error);
          this.floatingHUD.setStatus("Error (Retrying)");
        }
      } catch (err) {
        if (((_b = err == null ? void 0 : err.message) == null ? void 0 : _b.includes("Extension context invalidated")) || !((_c = chrome.runtime) == null ? void 0 : _c.id)) {
          this.handleExtensionInvalidated();
          return;
        }
        logger.error("Failed to send batch translation to background:", err);
        this.floatingHUD.setStatus("Network error");
      } finally {
        this.isTranslating = false;
        if (!this.isDisconnected && this.pendingQueue.length > 0) {
          setTimeout(() => this.flushBatch(), 20);
        }
      }
    }
    handleExtensionInvalidated() {
      this.isDisconnected = true;
      this.mutationManager.stop();
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      this.pendingQueue = [];
      this.floatingHUD.setStatus("Extension reloaded - please refresh");
      logger.info("Extension was reloaded or updated. Stopped content script observers on stale page.");
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new ContentTranslator());
  } else {
    new ContentTranslator();
  }
})();
