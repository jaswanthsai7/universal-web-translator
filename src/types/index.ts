export type ProviderType = 'google' | 'libretranslate' | 'mymemory' | 'custom';

export type TranslationMode = 'translated-only' | 'dual' | 'hover';

export interface TranslationResult {
  sourceText: string;
  translatedText: string;
  detectedSourceLang?: string;
}

export interface TranslationProvider {
  readonly id: ProviderType;
  readonly name: string;
  readonly supportsAutoDetect: boolean;

  translate(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string[]>;
}

export interface AppearanceSettings {
  fontSize: number; // e.g. 12 (px)
  opacity: number; // 0.1 - 1.0
  theme: 'glass-dark' | 'glass-light' | 'subtle' | 'vibrant';
  showFloatingHUD: boolean;
  showOriginalOnHover: boolean;
}

export interface SiteConfig {
  enabled: boolean;
  mode?: TranslationMode;
  targetLang?: string;
}

export interface TranslatorSettings {
  enabled: boolean;
  sourceLang: string; // 'auto' or code
  targetLang: string; // 'en', 'zh', 'ja', etc.
  provider: ProviderType;
  fallbackChain: ProviderType[];
  mode: TranslationMode;
  translateDynamic: boolean;
  translatePopups: boolean;
  translateTooltips: boolean;
  translatePlaceholders: boolean;
  customApiUrl: string;
  customApiKey: string;
  customApiModel: string;
  siteSettings: Record<string, SiteConfig>;
  appearance: AppearanceSettings;
}

export interface CacheEntry {
  translatedText: string;
  timestamp: number;
}

export interface CacheStats {
  inMemoryCount: number;
  persistentCount: number;
  hitCount: number;
  missCount: number;
}

// Inter-process messaging definitions
export const MESSAGE_TYPES = {
  TRANSLATE_BATCH: 'TRANSLATE_BATCH',
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  CLEAR_CACHE: 'CLEAR_CACHE',
  GET_CACHE_STATS: 'GET_CACHE_STATS',
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  TRANSLATION_PROGRESS: 'TRANSLATION_PROGRESS',
} as const;

export interface BatchTranslationRequestMessage {
  type: typeof MESSAGE_TYPES.TRANSLATE_BATCH;
  texts: string[];
  sourceLang: string;
  targetLang: string;
  providerOverride?: ProviderType;
}

export interface BatchTranslationResponseMessage {
  success: boolean;
  translations?: string[];
  detectedLang?: string;
  providerUsed?: string;
  error?: string;
}

export interface TextExtractTarget {
  node: Node;
  type: 'text' | 'attribute';
  attributeName?: string;
  originalText: string;
  translatedText?: string;
  element: HTMLElement;
  overlayElement?: HTMLElement;
}
