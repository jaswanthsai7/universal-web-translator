import { TextExtractTarget, TranslatorSettings } from '../types';
import { isElementVisible } from '../utils/dom';

interface CachedTypography {
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  lineHeight: string;
  letterSpacing: string;
  textAlign: string;
  textTransform: string;
  whiteSpace: string;
  wordBreak: string;
  display: string;
  numericFontSize: number;
}

export class OverlayManager {
  private overlayContainer: HTMLElement | null = null;
  private styleSheet: HTMLStyleElement | null = null;
  private activeOverlays: Map<TextExtractTarget, HTMLElement> = new Map();
  private typographyCache: WeakMap<HTMLElement, CachedTypography> = new WeakMap();
  private hiddenElements: Set<HTMLElement> = new Set();
  private isRepositionScheduled = false;
  private settings: TranslatorSettings;

  constructor(settings: TranslatorSettings) {
    this.settings = settings;
    this.initContainer();
    this.injectStyles();
    this.bindEvents();
  }

  updateSettings(settings: TranslatorSettings) {
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

  private initContainer() {
    if (this.overlayContainer && this.overlayContainer.isConnected) return;

    const container = document.createElement('div');
    container.id = 'universal-webtrans-overlay-container';
    container.setAttribute('data-webtrans-ignore', 'true');
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

  private injectStyles() {
    if (this.styleSheet && this.styleSheet.isConnected) return;

    const style = document.createElement('style');
    style.id = 'universal-webtrans-styles';
    style.setAttribute('data-webtrans-ignore', 'true');
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

  private bindEvents() {
    const triggerReposition = () => {
      if (!this.isRepositionScheduled) {
        this.isRepositionScheduled = true;
        requestAnimationFrame(() => {
          this.repositionAll();
          this.isRepositionScheduled = false;
        });
      }
    };

    window.addEventListener('scroll', triggerReposition, { passive: true });
    window.addEventListener('resize', triggerReposition, { passive: true });
    document.addEventListener('fullscreenchange', triggerReposition);
  }

  /**
   * Apply natural in-place translation to the target element
   */
  applyTranslation(target: TextExtractTarget, rawTranslatedText: string) {
    if (!rawTranslatedText) return;

    // Clean any unwanted tags or prefix labels
    const cleanTranslation = rawTranslatedText
      .replace(/^\[(?:EN|ZH|JA|KO|ES|FR|DE|RU):\s*/i, '')
      .replace(/\]$/, '')
      .trim();

    if (!cleanTranslation || cleanTranslation === target.originalText.trim()) {
      return;
    }
    target.translatedText = cleanTranslation;

    // Handle attributes (placeholder, title, aria-label)
    if (target.type === 'attribute' && target.attributeName) {
      this.applyAttributeTranslation(target, cleanTranslation);
      return;
    }

    const el = target.element;
    if (!el || !el.isConnected) return;

    // Cache typography before hiding original text
    const typography = this.getOrCacheTypography(el);

    if (this.settings.mode === 'translated-only') {
      // 1. Visually hide original text glyphs without altering layout geometry
      el.classList.add('webtrans-orig-hidden');
      this.hiddenElements.add(el);

      // 2. Render clean native-looking text overlay in exact same visual region
      this.renderNativeOverlay(target, cleanTranslation, typography);
    } else if (this.settings.mode === 'dual') {
      // Dual mode: show both original and translated text
      this.renderDualOverlay(target, cleanTranslation, typography);
    } else if (this.settings.mode === 'hover') {
      // Hover mode: attach native title tooltip
      el.setAttribute('title', cleanTranslation);
    }
  }

  private getOrCacheTypography(el: HTMLElement): CachedTypography {
    let cached = this.typographyCache.get(el);
    if (!cached) {
      const computed = window.getComputedStyle(el);
      const fontSizeStr = computed.fontSize || '14px';
      const numSize = parseFloat(fontSizeStr) || 14;

      cached = {
        color: computed.color || '#18191c',
        fontFamily: computed.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: fontSizeStr,
        fontWeight: computed.fontWeight || '400',
        fontStyle: computed.fontStyle || 'normal',
        lineHeight: computed.lineHeight || 'normal',
        letterSpacing: computed.letterSpacing || 'normal',
        textAlign: computed.textAlign || 'left',
        textTransform: computed.textTransform || 'none',
        whiteSpace: computed.whiteSpace || 'normal',
        wordBreak: computed.wordBreak || 'break-word',
        display: computed.display || 'block',
        numericFontSize: numSize,
      };
      this.typographyCache.set(el, cached);
    }
    return cached;
  }

  private renderNativeOverlay(
    target: TextExtractTarget,
    translatedText: string,
    typography: CachedTypography
  ) {
    this.initContainer();
    if (!this.overlayContainer) return;

    const el = target.element;
    if (!isElementVisible(el)) return;

    let overlay = this.activeOverlays.get(target);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'webtrans-native-text';
      overlay.setAttribute('data-webtrans-ignore', 'true');
      this.overlayContainer.appendChild(overlay);
      this.activeOverlays.set(target, overlay);
    }

    overlay.textContent = translatedText;
    this.applyNativeStyle(overlay, typography, el, translatedText, target.originalText);
    this.positionOverlay(target, overlay);
  }

  private renderDualOverlay(
    target: TextExtractTarget,
    translatedText: string,
    typography: CachedTypography
  ) {
    this.initContainer();
    if (!this.overlayContainer) return;

    const el = target.element;
    if (!isElementVisible(el)) return;

    let overlay = this.activeOverlays.get(target);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'webtrans-native-text';
      overlay.setAttribute('data-webtrans-ignore', 'true');
      this.overlayContainer.appendChild(overlay);
      this.activeOverlays.set(target, overlay);
    }

    overlay.style.fontFamily = typography.fontFamily;
    overlay.innerHTML = `<span class="webtrans-dual-text">${translatedText}</span>`;
    this.positionOverlay(target, overlay);
  }

  private applyNativeStyle(
    overlay: HTMLElement,
    typography: CachedTypography,
    el: HTMLElement,
    translatedText: string,
    originalText: string
  ) {
    let effectiveFontSize = typography.fontSize;

    // For tight button/tag containers where English is longer than Chinese,
    // subtly scale font size by 1-1.5px so it fits into the same visual region without wrapping
    const isTightButton =
      el.tagName === 'BUTTON' ||
      el.classList.contains('ctrl-btn') ||
      el.classList.contains('bpx-menu-item') ||
      el.classList.contains('nav-link') ||
      typography.whiteSpace === 'nowrap';

    if (isTightButton && translatedText.length > originalText.length * 2.2) {
      const reduced = Math.max(11, typography.numericFontSize - 1.5);
      effectiveFontSize = `${reduced}px`;
    }

    overlay.style.position = 'absolute';
    overlay.style.fontFamily = typography.fontFamily;
    overlay.style.fontSize = effectiveFontSize;
    overlay.style.fontWeight = typography.fontWeight;
    overlay.style.fontStyle = typography.fontStyle;
    overlay.style.lineHeight = typography.lineHeight;
    overlay.style.letterSpacing = typography.letterSpacing;
    overlay.style.textAlign = typography.textAlign;
    overlay.style.textTransform = typography.textTransform;
    overlay.style.color = typography.color;
    overlay.style.background = 'transparent';
    overlay.style.border = 'none';
    overlay.style.boxShadow = 'none';
    overlay.style.outline = 'none';
    overlay.style.padding = '0';
    overlay.style.margin = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.userSelect = 'text';
    overlay.style.zIndex = '2147483640';
    overlay.style.overflow = 'visible';
    overlay.style.whiteSpace = typography.whiteSpace === 'nowrap' ? 'nowrap' : 'normal';
    overlay.style.wordBreak = typography.wordBreak;

    if (typography.display.includes('flex')) {
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
    } else {
      overlay.style.display = 'block';
    }
  }

  private positionOverlay(target: TextExtractTarget, overlay: HTMLElement) {
    const el = target.element;
    if (!el || !el.isConnected) {
      overlay.remove();
      this.activeOverlays.delete(target);
      return;
    }

    if (!isElementVisible(el)) {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'block';
    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // Anchor overlay exactly in the original element's visual location
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

  private applyAttributeTranslation(target: TextExtractTarget, translatedText: string) {
    const el = target.element;
    const attr = target.attributeName!;

    if (attr === 'placeholder' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      if (!el.hasAttribute('data-webtrans-orig-placeholder')) {
        el.setAttribute('data-webtrans-orig-placeholder', target.originalText);
      }
      el.placeholder = translatedText;
    } else if (attr === 'title') {
      if (!el.hasAttribute('data-webtrans-orig-title')) {
        el.setAttribute('data-webtrans-orig-title', target.originalText);
      }
      el.setAttribute('title', translatedText);
    } else if (attr === 'aria-label') {
      el.setAttribute('aria-label', translatedText);
    }
  }

  clear() {
    // Remove all native text overlays
    if (this.overlayContainer) {
      this.overlayContainer.innerHTML = '';
    }
    this.activeOverlays.clear();

    // Restore original text visibility by removing hidden class
    for (const el of this.hiddenElements) {
      if (el.isConnected) {
        el.classList.remove('webtrans-orig-hidden');
      }
    }
    this.hiddenElements.clear();

    // Restore original attributes
    document.querySelectorAll<HTMLElement>('[data-webtrans-orig-placeholder]').forEach(el => {
      const orig = el.getAttribute('data-webtrans-orig-placeholder');
      if (orig && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        el.placeholder = orig;
      }
      el.removeAttribute('data-webtrans-orig-placeholder');
    });

    document.querySelectorAll<HTMLElement>('[data-webtrans-orig-title]').forEach(el => {
      const orig = el.getAttribute('data-webtrans-orig-title');
      if (orig) el.setAttribute('title', orig);
      el.removeAttribute('data-webtrans-orig-title');
    });
  }
}
