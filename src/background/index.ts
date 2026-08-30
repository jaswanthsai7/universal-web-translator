import {
  TranslatorSettings,
  MESSAGE_TYPES,
  BatchTranslationRequestMessage,
  BatchTranslationResponseMessage,
} from '../types';
import { ProviderManager } from '../providers/ProviderManager';
import { TranslationCache } from '../cache/TranslationCache';
import { logger } from '../utils/logger';

const DEFAULT_SETTINGS: TranslatorSettings = {
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
  customApiUrl: 'https://api.openai.com/v1/chat/completions',
  customApiKey: '',
  customApiModel: 'gpt-4o-mini',
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

class BackgroundService {
  private providerManager: ProviderManager;
  private cache: TranslationCache;
  private settings: TranslatorSettings = { ...DEFAULT_SETTINGS };

  constructor() {
    this.providerManager = new ProviderManager();
    this.cache = new TranslationCache();
    this.initSettings();
    this.setupMessageListeners();
  }

  private async initSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get(['webtrans_settings']);
        if (stored.webtrans_settings) {
          this.settings = { ...DEFAULT_SETTINGS, ...stored.webtrans_settings };
          this.providerManager.updateFromSettings(this.settings);
        }
      }
    } catch (err) {
      logger.warn('Failed to load settings from storage:', err);
    }
  }

  private setupMessageListeners() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      this.handleMessage(message)
        .then(response => sendResponse(response))
        .catch(err => {
          logger.error('Message handler error:', err);
          sendResponse({ success: false, error: err.message || String(err) });
        });
      return true; // Keep message channel open for async response
    });
  }

  private async handleMessage(message: any): Promise<any> {
    if (!message || !message.type) return { success: false, error: 'Invalid message' };

    switch (message.type) {
      case MESSAGE_TYPES.TRANSLATE_BATCH:
        return this.handleTranslateBatch(message as BatchTranslationRequestMessage);

      case MESSAGE_TYPES.GET_SETTINGS:
        return { success: true, settings: this.settings };

      case MESSAGE_TYPES.SAVE_SETTINGS:
        if (message.settings) {
          this.settings = { ...this.settings, ...message.settings };
          this.providerManager.updateFromSettings(this.settings);
          if (chrome.storage && chrome.storage.local) {
            await chrome.storage.local.set({ webtrans_settings: this.settings });
          }
          // Broadcast to all active tabs
          this.broadcastSettingsUpdate();
          return { success: true, settings: this.settings };
        }
        return { success: false, error: 'No settings provided' };

      case MESSAGE_TYPES.CLEAR_CACHE:
        await this.cache.clear();
        return { success: true };

      case MESSAGE_TYPES.GET_CACHE_STATS:
        return { success: true, stats: this.cache.getStats() };

      default:
        return { success: false, error: `Unknown message type: ${message.type}` };
    }
  }

  private async handleTranslateBatch(
    req: BatchTranslationRequestMessage
  ): Promise<BatchTranslationResponseMessage> {
    const { texts, sourceLang, targetLang, providerOverride } = req;
    if (!texts || texts.length === 0) {
      return { success: true, translations: [] };
    }

    const providerId = providerOverride || this.settings.provider;
    const finalTranslations: string[] = new Array(texts.length);
    const missIndices: number[] = [];
    const missTexts: string[] = [];

    // Check cache first
    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(texts[i], sourceLang, targetLang, providerId);
      if (cached !== undefined) {
        finalTranslations[i] = cached;
      } else {
        missIndices.push(i);
        missTexts.push(texts[i]);
      }
    }

    // If all hit cache, return instantly!
    if (missTexts.length === 0) {
      return {
        success: true,
        translations: finalTranslations,
        providerUsed: `${providerId} (Cached)`,
      };
    }

    // Deduplicate cache misses to save API calls
    const uniqueMissMap = new Map<string, number[]>();
    for (let j = 0; j < missTexts.length; j++) {
      const txt = missTexts[j];
      const list = uniqueMissMap.get(txt) || [];
      list.push(j);
      uniqueMissMap.set(txt, list);
    }
    const uniqueTextsToTranslate = Array.from(uniqueMissMap.keys());

    // Fetch translations from provider chain
    try {
      const { translations: freshTranslations, providerUsed } =
        await this.providerManager.translateWithFallback(
          uniqueTextsToTranslate,
          sourceLang,
          targetLang,
          providerId
        );

      // Populate results and update cache
      for (let k = 0; k < uniqueTextsToTranslate.length; k++) {
        const orig = uniqueTextsToTranslate[k];
        const trans = freshTranslations[k] || orig;

        // Cache the newly translated item
        this.cache.set(orig, sourceLang, targetLang, providerUsed, trans);

        // Fill all occurrences in the batch
        const occurrences = uniqueMissMap.get(orig) || [];
        for (const occ of occurrences) {
          const originalBatchIndex = missIndices[occ];
          finalTranslations[originalBatchIndex] = trans;
        }
      }

      return {
        success: true,
        translations: finalTranslations,
        providerUsed,
      };
    } catch (err: any) {
      logger.error('Failed to translate batch:', err);
      // Fallback: fill missing with original text to prevent page break
      for (const idx of missIndices) {
        finalTranslations[idx] = texts[idx];
      }
      return {
        success: false,
        translations: finalTranslations,
        error: err.message || 'Translation failed',
      };
    }
  }

  private broadcastSettingsUpdate() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: MESSAGE_TYPES.SETTINGS_CHANGED,
              settings: this.settings,
            }).catch(() => {
              // Ignore tabs without content script
            });
          }
        }
      });
    }
  }
}

// Initialize Background Service
new BackgroundService();
