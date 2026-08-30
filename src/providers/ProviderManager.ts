import { TranslationProvider, ProviderType, TranslatorSettings } from '../types';
import { GoogleWebProvider } from './GoogleWebProvider';
import { LibreTranslateProvider } from './LibreTranslateProvider';
import { MyMemoryProvider } from './MyMemoryProvider';
import { CustomAPIProvider } from './CustomAPIProvider';
import { logger } from '../utils/logger';

export class ProviderManager {
  private providers: Map<ProviderType, TranslationProvider> = new Map();
  private activeProviderId: ProviderType = 'google';
  private fallbackChain: ProviderType[] = ['google', 'libretranslate', 'mymemory'];

  constructor() {
    this.registerProvider(new GoogleWebProvider());
    this.registerProvider(new LibreTranslateProvider());
    this.registerProvider(new MyMemoryProvider());
    this.registerProvider(new CustomAPIProvider());
  }

  registerProvider(provider: TranslationProvider) {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: ProviderType): TranslationProvider | undefined {
    return this.providers.get(id);
  }

  updateFromSettings(settings: Partial<TranslatorSettings>) {
    if (settings.provider) {
      this.activeProviderId = settings.provider;
    }
    if (settings.fallbackChain) {
      this.fallbackChain = settings.fallbackChain;
    }

    const customProv = this.providers.get('custom') as CustomAPIProvider | undefined;
    if (customProv && (settings.customApiUrl || settings.customApiKey || settings.customApiModel)) {
      customProv.updateConfig(
        settings.customApiUrl || '',
        settings.customApiKey || '',
        settings.customApiModel || 'gpt-4o-mini'
      );
    }
  }

  /**
   * Translates an array of texts with automatic fallback to secondary providers
   */
  async translateWithFallback(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string,
    preferredProvider?: ProviderType
  ): Promise<{ translations: string[]; providerUsed: ProviderType }> {
    if (texts.length === 0) {
      return { translations: [], providerUsed: this.activeProviderId };
    }

    const primaryId = preferredProvider || this.activeProviderId;
    // Construct chain starting with primary, followed by fallbacks excluding primary
    const chain: ProviderType[] = [
      primaryId,
      ...this.fallbackChain.filter(id => id !== primaryId),
    ];

    let lastError: Error | null = null;

    for (const providerId of chain) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;

      try {
        logger.info(`Attempting translation with provider: ${provider.name} (${texts.length} texts)`);
        const translations = await provider.translate(texts, sourceLanguage, targetLanguage);
        if (translations && translations.length === texts.length) {
          return { translations, providerUsed: providerId };
        }
      } catch (err: any) {
        lastError = err;
        logger.warn(`Provider ${providerId} failed:`, err.message || err);
        // Continue loop to next fallback provider
      }
    }

    // If all providers failed, return original texts defensively without breaking webpage
    logger.error('All translation providers failed in fallback chain. Preserving original texts.', lastError);
    return { translations: [...texts], providerUsed: primaryId };
  }
}
