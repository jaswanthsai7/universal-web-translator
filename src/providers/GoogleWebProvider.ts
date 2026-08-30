import { BaseProvider } from './BaseProvider';
import { ProviderType } from '../types';
import { logger } from '../utils/logger';

export class GoogleWebProvider extends BaseProvider {
  readonly id: ProviderType = 'google';
  readonly name: string = 'Google Web (Free)';
  readonly supportsAutoDetect: boolean = true;

  async translate(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const sl = sourceLanguage === 'auto' ? 'auto' : sourceLanguage;
    const tl = targetLanguage;

    // Single text translation
    if (texts.length === 1) {
      const single = await this.translateSingle(texts[0], sl, tl);
      return [single];
    }

    // Try batching with newline separator via clients5 endpoint
    try {
      const combinedText = texts.join('\n');
      if (combinedText.length < 2000) {
        const translatedCombined = await this.translateViaClients5(combinedText, sl, tl);
        const split = translatedCombined.split('\n');
        if (split.length === texts.length) {
          return split.map(t => t.trim());
        }
      }
    } catch (batchErr) {
      logger.warn('GoogleWebProvider batch newline translate failed, trying concurrent:', batchErr);
    }

    // Fallback: translate individually with concurrency limit = 4
    return this.mapConcurrent(texts, 4, async (text) => {
      return this.translateSingle(text, sl, tl);
    });
  }

  private async translateSingle(
    text: string,
    sl: string,
    tl: string
  ): Promise<string> {
    if (!text.trim()) return text;

    // Strategy 1: Official Chrome extension client endpoint (dict-chrome-ex) - highly reliable
    try {
      return await this.translateViaClients5(text, sl, tl);
    } catch (err) {
      logger.debug('clients5 endpoint failed, trying gtx fallback:', err);
    }

    // Strategy 2: gtx client endpoint fallback
    return this.translateViaGtx(text, sl, tl);
  }

  private async translateViaClients5(text: string, sl: string, tl: string): Promise<string> {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(
      sl
    )}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;

    const res = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }, 6000);

    if (!res.ok) {
      throw new Error(`clients5 returned status ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === 'string') {
      return data[0][0];
    }
    if (Array.isArray(data) && typeof data[0] === 'string') {
      return data[0];
    }

    throw new Error('Unexpected response format from clients5 Google Translate API');
  }

  private async translateViaGtx(text: string, sl: string, tl: string): Promise<string> {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sl
    )}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }, 6000);

    if (!res.ok) {
      throw new Error(`gtx returned status ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('Unexpected response format from gtx Google Translate API');
    }

    const translatedParts = data[0]
      .map((part: any) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
      .join('');

    return translatedParts || text;
  }
}
