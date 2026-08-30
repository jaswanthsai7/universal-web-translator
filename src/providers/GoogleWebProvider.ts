import { BaseProvider } from './BaseProvider';
import { ProviderType } from '../types';
import { logger } from '../utils/logger';

export class GoogleWebProvider extends BaseProvider {
  readonly id: ProviderType = 'google';
  readonly name: string = 'Google Web (Free)';
  readonly supportsAutoDetect: boolean = true;

  private readonly DELIMITER = '⟦§§⟧';

  async translate(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const sl = sourceLanguage === 'auto' ? 'auto' : sourceLanguage;
    const tl = targetLanguage;

    // For single text or very small batches
    if (texts.length === 1) {
      const single = await this.translateSingle(texts[0], sl, tl);
      return [single];
    }

    // Try batching with delimiter to save network roundtrips
    try {
      const combinedText = texts.join(`\n${this.DELIMITER}\n`);
      // Google single URL limit is ~2000 chars safely, or use POST
      if (combinedText.length < 1800) {
        const translatedCombined = await this.translateSingle(combinedText, sl, tl);
        const split = translatedCombined.split(new RegExp(`\\s*${this.DELIMITER}\\s*`));
        if (split.length === texts.length) {
          return split.map(t => t.trim());
        }
      }
    } catch (batchErr) {
      logger.warn('GoogleWebProvider batch translate failed, falling back to concurrent single:', batchErr);
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

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sl
    )}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }, 7000);

    if (!res.ok) {
      throw new Error(`Google translate returned status ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('Unexpected response format from Google Translate API');
    }

    // data[0] contains array of sentence segments: [["Translated text", "Original text", ...], ...]
    const translatedParts = data[0]
      .map((part: any) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
      .join('');

    return translatedParts || text;
  }
}
