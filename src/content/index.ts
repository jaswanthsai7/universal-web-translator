import {
  TranslatorSettings,
  MESSAGE_TYPES,
  TextExtractTarget,
  BatchTranslationRequestMessage,
  BatchTranslationResponseMessage,
} from '../types';
import { TextExtractor } from './textExtractor';
import { OverlayManager } from './overlayManager';
import { MutationManager } from './mutationManager';
import { FloatingHUD } from './floatingHUD';
import { logger } from '../utils/logger';

class ContentTranslator {
  private settings: TranslatorSettings = {
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
      showFloatingHUD: true,
      showOriginalOnHover: true,
    },
  };

  private textExtractor: TextExtractor;
  private overlayManager: OverlayManager;
  private mutationManager: MutationManager;
  private floatingHUD: FloatingHUD;

  private pendingQueue: TextExtractTarget[] = [];
  private batchTimer: any = null;
  private readonly BATCH_INTERVAL_MS = 80;
  private readonly MAX_BATCH_SIZE = 30;
  private isTranslating = false;
  private isDisconnected = false;

  constructor() {
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
      },
    });

    this.init();
  }

  private async init() {
    await this.loadSettings();

    if (!this.isCurrentSiteEnabled()) {
      logger.info(`Translation disabled for domain: ${window.location.hostname}`);
      this.floatingHUD.setStatus('Disabled for site');
      return;
    }

    this.setupListeners();
    this.mutationManager.start();

    // Start translating current page
    if (this.settings.enabled) {
      this.translateEntirePage();
    }
  }

  private isCurrentSiteEnabled(): boolean {
    if (!this.settings.enabled) return false;
    const hostname = window.location.hostname;
    const siteConfig = this.settings.siteSettings[hostname];
    if (siteConfig && siteConfig.enabled === false) {
      return false;
    }
    return true;
  }

  private async loadSettings() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_SETTINGS,
      });
      if (response && response.success && response.settings) {
        this.settings = response.settings;
        this.overlayManager.updateSettings(this.settings);
        this.floatingHUD.updateSettings(this.settings);
      }
    } catch (err) {
      logger.warn('Failed to load settings in content script:', err);
    }
  }

  private setupListeners() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

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
          this.floatingHUD.setStatus('Paused');
        } else {
          this.mutationManager.resume();
          if (!oldEnabled || oldTargetLang !== this.settings.targetLang) {
            this.retranslateAll();
          }
        }
      }
    });
  }

  private async saveSettings(newSettings: Partial<TranslatorSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    this.overlayManager.updateSettings(this.settings);
    this.floatingHUD.updateSettings(this.settings);

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.SAVE_SETTINGS,
        settings: this.settings,
      });
    }

    if (!this.settings.enabled) {
      this.overlayManager.clear();
      this.mutationManager.pause();
      this.floatingHUD.setStatus('Paused');
    } else {
      this.mutationManager.resume();
    }
  }

  /**
   * Scan and translate entire document
   */
  translateEntirePage() {
    if (!this.isCurrentSiteEnabled()) return;

    this.floatingHUD.setStatus('Scanning...', true);
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
  private processMutatedNodes(nodes: Node[]) {
    if (!this.isCurrentSiteEnabled()) return;

    let targets: TextExtractTarget[] = [];
    for (const node of nodes) {
      const extracted = this.textExtractor.extractFromRoot(node, this.settings);
      targets.push(...extracted);
    }

    if (targets.length > 0) {
      logger.debug(`Extracted ${targets.length} items from dynamic mutations`);
      this.enqueueTargets(targets);
    }
  }

  private enqueueTargets(targets: TextExtractTarget[]) {
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

  private async flushBatch() {
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

    if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
      this.handleExtensionInvalidated();
      return;
    }

    const currentBatch = this.pendingQueue.splice(0, this.MAX_BATCH_SIZE);
    const texts = currentBatch.map((t) => t.originalText);

    this.floatingHUD.setStatus('Translating...', true);
    this.isTranslating = true;

    try {
      const req: BatchTranslationRequestMessage = {
        type: MESSAGE_TYPES.TRANSLATE_BATCH,
        texts,
        sourceLang: this.settings.sourceLang,
        targetLang: this.settings.targetLang,
      };

      const res: BatchTranslationResponseMessage = await chrome.runtime.sendMessage(req);

      if (res && res.success && res.translations) {
        for (let i = 0; i < currentBatch.length; i++) {
          const trans = res.translations[i];
          if (trans) {
            this.overlayManager.applyTranslation(currentBatch[i], trans);
          }
        }
        this.floatingHUD.setStatus('Active');
      } else {
        logger.warn('Batch translation response error:', res?.error);
        this.floatingHUD.setStatus('Error (Retrying)');
      }
    } catch (err: any) {
      if (err?.message?.includes('Extension context invalidated') || !chrome.runtime?.id) {
        this.handleExtensionInvalidated();
        return;
      }
      logger.error('Failed to send batch translation to background:', err);
      this.floatingHUD.setStatus('Network error');
    } finally {
      this.isTranslating = false;
      if (!this.isDisconnected && this.pendingQueue.length > 0) {
        setTimeout(() => this.flushBatch(), 20);
      }
    }
  }

  private handleExtensionInvalidated() {
    this.isDisconnected = true;
    this.mutationManager.stop();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.pendingQueue = [];
    this.floatingHUD.setStatus('Extension reloaded - please refresh');
    logger.info('Extension was reloaded or updated. Stopped content script observers on stale page.');
  }
}

// Instantiate content translator when DOM is interactive or complete
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ContentTranslator());
} else {
  new ContentTranslator();
}
