import { TranslationProvider, ProviderType } from '../types';
import { logger } from '../utils/logger';

export abstract class BaseProvider implements TranslationProvider {
  abstract readonly id: ProviderType;
  abstract readonly name: string;
  abstract readonly supportsAutoDetect: boolean;

  abstract translate(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string[]>;

  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 8000
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return res;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Helper to execute tasks with limited concurrency
   */
  protected async mapConcurrent<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;

    const worker = async () => {
      while (index < items.length) {
        const currentIndex = index++;
        try {
          results[currentIndex] = await fn(items[currentIndex], currentIndex);
        } catch (err) {
          logger.error(`Error processing item ${currentIndex}:`, err);
          throw err;
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker()
    );
    await Promise.all(workers);
    return results;
  }
}
