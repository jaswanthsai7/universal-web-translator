import { BaseProvider } from './BaseProvider';
import { ProviderType } from '../types';

export class MyMemoryProvider extends BaseProvider {
  readonly id: ProviderType = 'mymemory';
  readonly name: string = 'MyMemory (Free Public)';
  readonly supportsAutoDetect: boolean = false;

  async translate(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    // MyMemory requires explicit source language, default to 'zh' if 'auto' on Bilibili or 'en'
    const sl = sourceLanguage === 'auto' ? 'zh' : sourceLanguage;
    const tl = targetLanguage;

    return this.mapConcurrent(texts, 3, async (text) => {
      if (!text.trim()) return text;

      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        text
      )}&langpair=${encodeURIComponent(sl)}|${encodeURIComponent(tl)}`;

      const res = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      }, 7000);

      if (!res.ok) {
        throw new Error(`MyMemory error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.responseStatus !== 200 && data.responseStatus !== '200') {
        throw new Error(`MyMemory returned error: ${data.responseDetails || data.responseStatus}`);
      }

      return data.responseData?.translatedText || text;
    });
  }
}
