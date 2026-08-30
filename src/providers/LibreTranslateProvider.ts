import { BaseProvider } from './BaseProvider';
import { ProviderType } from '../types';
import { logger } from '../utils/logger';

export class LibreTranslateProvider extends BaseProvider {
  readonly id: ProviderType = 'libretranslate';
  readonly name: string = 'LibreTranslate (Open Source)';
  readonly supportsAutoDetect: boolean = true;

  private endpoint: string;
  private apiKey?: string;

  constructor(endpoint: string = 'https://libretranslate.de', apiKey?: string) {
    super();
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  setEndpoint(endpoint: string, apiKey?: string) {
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  async translate(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const sl = sourceLanguage === 'auto' ? 'auto' : sourceLanguage;
    const tl = targetLanguage;

    // Try batch array request first
    try {
      const url = `${this.endpoint}/translate`;
      const body: Record<string, any> = {
        q: texts,
        source: sl,
        target: tl,
        format: 'text',
      };
      if (this.apiKey) {
        body.api_key = this.apiKey;
      }

      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      }, 9000);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.translatedText)) {
          return data.translatedText;
        } else if (typeof data.translatedText === 'string' && texts.length === 1) {
          return [data.translatedText];
        }
      }
    } catch (batchErr) {
      logger.warn('LibreTranslate batch request failed, falling back to single:', batchErr);
    }

    // Fallback: translate individually
    return this.mapConcurrent(texts, 3, async (text) => {
      const body: Record<string, any> = {
        q: text,
        source: sl,
        target: tl,
        format: 'text',
      };
      if (this.apiKey) {
        body.api_key = this.apiKey;
      }

      const res = await this.fetchWithTimeout(`${this.endpoint}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, 7000);

      if (!res.ok) {
        throw new Error(`LibreTranslate error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      return typeof data.translatedText === 'string' ? data.translatedText : text;
    });
  }
}
