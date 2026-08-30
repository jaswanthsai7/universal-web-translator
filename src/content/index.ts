import {
  TranslatorSettings,
  MESSAGE_TYPES,
  TextExtractTarget,
} from '../types';
import { TextExtractor } from './textExtractor';
import { OverlayManager } from './overlayManager';
import { MutationManager } from './mutationManager';
import { TranslationQueue } from './translationQueue';
import { ScannerWorker } from './scannerWorker';
import { FloatingHUD } from './floatingHUD';
import { getLocalTranslation } from '../utils/localTranslator';
import { logger } from '../utils/logger';

/**
 * Fast default settings — used synchronously before settings load from storage.
 * Ensures translation can begin immediately with sensible defaults,
 * even before the async settings response arrives.
 */
const FAST_DEFAULTS: TranslatorSettings = {
  enabled: true,
  sourceLang: 'auto',
  targetLang: 'en',
  provider: 'google',
  fallbackChain: ['google', 'libretranslate', 'mymemory'],
  mode: 'translated-only',
  translateDynamic: true,
  translatePopups: true,
  translateTooltips: true,
  translatePlaceholders: true,
  customApiUrl: '',
  customApiKey: '',
  customApiModel: '',
  siteSettings: {},
  appearance: {
    fontSize: 13,
    opacity: 0.95,
    theme: 'glass-dark',
    showFloatingHUD: false,
    showOriginalOnHover: true,
    concurrency: 3,
  },
};

class ContentTranslator {
  private settings: TranslatorSettings = { ...FAST_DEFAULTS };

  private readonly textExtractor: TextExtractor;
  private readonly overlayManager: OverlayManager;
  private readonly mutationManager: MutationManager;
  private readonly scannerWorker: ScannerWorker;
  private readonly queue: TranslationQueue;
  private floatingHUD: FloatingHUD;

  private isDisconnected = false;

  constructor() {
    this.textExtractor = new TextExtractor();
    this.overlayManager = new OverlayManager(this.settings, this.textExtractor);

    // ─────────────────────────────────────────────────────────────────────
    // Create the TranslationQueue — passes translations to the overlay
    // ─────────────────────────────────────────────────────────────────────
    this.queue = new TranslationQueue(
      this.settings,
      (target, translatedText) => {
        this.overlayManager.applyTranslation(target, translatedText);
      },
      (req) => this.sendMessage(req),
    );

    // ─────────────────────────────────────────────────────────────────────
    // Chunked background scanner — feeds TranslationQueue
    // ─────────────────────────────────────────────────────────────────────
    this.scannerWorker = new ScannerWorker(
      this.textExtractor,
      this.settings,
      (targets, priority) => this.enqueueWithPriority(targets, priority),
    );

    // ─────────────────────────────────────────────────────────────────────
    // MutationObserver — start IMMEDIATELY (document_start: no body yet)
    // Captures every DOM insertion from the first parsed byte onwards.
    // ─────────────────────────────────────────────────────────────────────
    this.mutationManager = new MutationManager(
      (mutatedNodes) => {
        if (!this.isCurrentSiteEnabled()) return;
        if (!this.settings.translateDynamic) return;
        this.processMutatedNodes(mutatedNodes);
      },
      (node, val) => this.overlayManager.isSelfMutation(node, val),
    );
    this.mutationManager.start(); // Attaches to documentElement, works before body

    // ─────────────────────────────────────────────────────────────────────
    // Floating HUD (deferred — needs document.body)
    // ─────────────────────────────────────────────────────────────────────
    this.floatingHUD = new FloatingHUD(this.settings, {
      onToggleEnabled: (enabled) => this.saveSettings({ enabled }),
      onChangeMode: (mode) => this.saveSettings({ mode }),
      onChangeTargetLang: (targetLang) => {
        this.saveSettings({ targetLang });
        this.retranslateAll();
      },
      onTranslateCurrentPage: () => this.fullPageScan(),
    });

    // ─────────────────────────────────────────────────────────────────────
    // Boot sequence (async, non-blocking)
    // ─────────────────────────────────────────────────────────────────────
    this.boot();
  }

  // ── Boot sequence ────────────────────────────────────────────────────

  private async boot() {
    // Start settings load in background — don't await it before scanning
    const settingsPromise = this.loadSettings();

    // When body is available, start the page scan immediately
    const startScan = () => {
      if (!this.isCurrentSiteEnabled()) {
        this.floatingHUD.setStatus('Disabled for site');
        return;
      }

      // P0: Immediate scan of visible viewport — no settings needed for this
      this.immediateViewportScan();

      // Full prioritized background scan (continues while P0 translations are in-flight)
      this.fullPageScan();

      this.setupListeners();
    };

    if (document.body) {
      startScan();
    } else {
      document.addEventListener('DOMContentLoaded', startScan, { once: true });
    }

    // Once settings load, update queue/overlay settings and potentially re-check
    settingsPromise.then(() => {
      this.queue.updateSettings(this.settings);
      this.overlayManager.updateSettings(this.settings);
      this.scannerWorker.updateSettings(this.settings);
      this.floatingHUD.updateSettings(this.settings);

      // If site is disabled per settings, clear any in-progress work
      if (!this.isCurrentSiteEnabled()) {
        this.queue.reset();
        this.overlayManager.clear();
        this.floatingHUD.setStatus('Disabled for site');
      }
    });
  }

  // ── Immediate above-the-fold scan ─────────────────────────────────────

  /**
   * Synchronously extracts text from the header and above-the-fold navigation.
   * Runs immediately without waiting for settings to return from storage.
   */
  private immediateViewportScan() {
    const root = document.body ?? document.documentElement;
    if (!root) return;

    const targets: TextExtractTarget[] = [];

    // 1. Explicitly scan top header, subnav, and channel bars
    const prioritySelectors = [
      '.bili-header',
      '.bili-header__bar',
      '.bili-header__channel',
      '.channel-icons',
      '.channel-items__left',
      '.channel-items__right',
      '.channel-link',
      'header',
      '#bili-header-container',
      '.up-info',
      '.up-detail',
      '.video-toolbar-v1',
      '.tag-panel',
      '.bpx-player-control-bottom',
      '.bili-elevator',
      '.side-nav',
    ];

    for (const sel of prioritySelectors) {
      const els = root.querySelectorAll<HTMLElement>(sel);
      els.forEach((el) => {
        const extracted = this.textExtractor.extractFromRoot(el, this.settings);
        for (const t of extracted) { t.priority = 0; targets.push(t); }
      });
    }

    if (targets.length > 0) {
      logger.info(`Immediate viewport scan: ${targets.length} targets discovered`);
      this.dispatchTargets(targets);
      this.floatingHUD.setStatus('Active');
    }
  }

  // ── Full background page scan ─────────────────────────────────────────

  fullPageScan() {
    if (!this.isCurrentSiteEnabled()) return;
    const root = document.body ?? document.documentElement;
    if (!root) return;

    this.floatingHUD.setStatus('Scanning…', true);
    this.scannerWorker.scan(root).then(() => {
      this.floatingHUD.setStatus('Active');
    });
  }

  // ── Dynamic mutation handling ─────────────────────────────────────────

  private processMutatedNodes(nodes: Node[]) {
    if (!this.isCurrentSiteEnabled()) return;

    const targets: TextExtractTarget[] = [];
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

  private enqueueWithPriority(targets: TextExtractTarget[], priority: 0 | 1 | 2) {
    for (const t of targets) t.priority = priority;
    this.dispatchTargets(targets);
  }

  /**
   * Dispatches discovered targets:
   * 1. Checks local dictionary for instant 0ms translation (UI terms, buttons, categories)
   * 2. Routes uncached targets to TranslationQueue for batched background translation
   */
  private dispatchTargets(targets: TextExtractTarget[]) {
    if (!targets.length) return;
    const uncached: TextExtractTarget[] = [];

    for (const target of targets) {
      const local = getLocalTranslation(target.originalText, this.settings.targetLang);
      if (local) {
        // Instant 0ms synchronous in-place translation!
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

  private async sendMessage(req: any): Promise<any> {
    if (this.isDisconnected) throw new Error('Extension context invalidated');

    // Pre-flight: runtime.id disappears the moment the extension is invalidated
    if (typeof chrome === 'undefined' || !chrome?.runtime?.id) {
      this.handleExtensionInvalidated();
      throw new Error('Extension context invalidated');
    }

    try {
      return await chrome.runtime.sendMessage(req);
    } catch (err: any) {
      const msg = (err?.message ?? '').toLowerCase();
      const isContextGone =
        msg.includes('extension context') ||
        msg.includes('could not establish connection') ||
        msg.includes('receiving end does not exist') ||
        msg.includes('message channel was closed') ||
        !chrome?.runtime?.id;

      if (isContextGone) {
        this.handleExtensionInvalidated();
      }
      throw err; // Re-throw so TranslationQueue's catch also handles it
    }
  }

  private async loadSettings() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
      if (response?.success && response.settings) {
        this.settings = response.settings;
        if (this.settings.appearance) {
          this.settings.appearance.showFloatingHUD = false;
        }
      }
    } catch (err) {
      logger.warn('Could not load settings (using fast defaults):', err);
    }
  }

  private setupListeners() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

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
          this.floatingHUD.setStatus('Paused');
        } else {
          this.mutationManager.resume();
          if (!oldEnabled || oldTargetLang !== this.settings.targetLang) {
            this.retranslateAll();
          }
        }
      }
    });

    // Re-verify visible navigation once all hydration scripts complete
    if (document.readyState === 'complete') {
      setTimeout(() => this.immediateViewportScan(), 500);
    } else {
      window.addEventListener('load', () => {
        setTimeout(() => this.immediateViewportScan(), 500);
      }, { once: true });
    }
  }

  private async saveSettings(newSettings: Partial<TranslatorSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    this.overlayManager.updateSettings(this.settings);
    this.queue.updateSettings(this.settings);
    this.floatingHUD.updateSettings(this.settings);

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.SAVE_SETTINGS,
        settings: this.settings,
      }).catch(() => {});
    }

    if (!this.settings.enabled) {
      this.queue.reset();
      this.overlayManager.clear();
      this.mutationManager.pause();
      this.floatingHUD.setStatus('Paused');
    } else {
      this.mutationManager.resume();
    }
  }

  private isCurrentSiteEnabled(): boolean {
    if (!this.settings.enabled) return false;
    const hostname = window.location.hostname;
    const siteConfig = this.settings.siteSettings[hostname];
    if (siteConfig?.enabled === false) return false;
    return true;
  }

  // ── Extension context invalidation ────────────────────────────────────

  private handleExtensionInvalidated() {
    this.isDisconnected = true;
    this.mutationManager.stop();
    this.queue.invalidate();
    this.scannerWorker.abort();
    this.floatingHUD.setStatus('Extension reloaded — please refresh');
    logger.info('Extension invalidated. Content script stopped.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap — runs at document_start (before DOM is fully parsed)
// ─────────────────────────────────────────────────────────────────────────────

try {
  new ContentTranslator();
} catch (err) {
  // Guard against rare edge cases (e.g., extension injected into about:blank)
  console.warn('[UniversalTranslator] Failed to initialize:', err);
}
