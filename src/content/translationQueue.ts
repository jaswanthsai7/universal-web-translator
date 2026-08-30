import {
  TextExtractTarget,
  TranslatorSettings,
  MESSAGE_TYPES,
  BatchTranslationRequestMessage,
  BatchTranslationResponseMessage,
} from '../types';
import { logger } from '../utils/logger';

type TranslationCallback = (target: TextExtractTarget, translatedText: string) => void;
type SendMessageFn = (req: any) => Promise<any>;

/**
 * Returns true for any error that indicates the extension context is gone.
 * Chrome throws several distinct messages depending on timing:
 */
function isExtensionInvalidated(err: unknown): boolean {
  if (typeof chrome === 'undefined' || !chrome?.runtime?.id) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('extension context invalidated') ||
    msg.includes('extension context invalid') ||
    msg.includes('could not establish connection') ||
    msg.includes('receiving end does not exist') ||
    msg.includes('the message channel was closed') ||
    msg.includes('disconnected port')
  );
}

/**
 * Concurrent, deduplicating translation request queue.
 *
 * Key properties:
 * - MAX_CONCURRENT simultaneous network requests (configurable, default 3)
 * - Deduplication: 30 occurrences of "首页" on a page share ONE network request
 * - Batches up to BATCH_SIZE unique strings per request
 * - Short BATCH_WINDOW_MS to minimise latency without spamming requests
 * - Retry with exponential backoff
 * - Graceful extension-invalidation handling
 */
export class TranslationQueue {
  private readonly BATCH_SIZE = 45;
  private readonly BATCH_WINDOW_MS = 30;
  private readonly RETRY_DELAY_MS = 1000;
  private readonly TIMEOUT_MS = 10000;

  // Unique texts waiting for the next flush
  private pendingTexts: string[] = [];

  /**
   * Maps originalText → all targets that need that translation applied.
   * This is what enables many-to-one deduplication:
   * 30 targets with "首页" → one API call → result applied to all 30.
   */
  private textToTargets: Map<string, TextExtractTarget[]> = new Map();

  // Concurrency control
  private activeCount = 0;
  private concurrencyQueue: Array<() => void> = [];

  private batchTimer: any = null;
  private settings: TranslatorSettings;
  private readonly callback: TranslationCallback;
  private readonly sendMessage: SendMessageFn;
  private isInvalidated = false;

  /** Stats */
  private dedupSavings = 0;
  private totalRequests = 0;

  constructor(
    settings: TranslatorSettings,
    callback: TranslationCallback,
    sendMessage: SendMessageFn,
  ) {
    this.settings = settings;
    this.callback = callback;
    this.sendMessage = sendMessage;
  }

  get maxConcurrent(): number {
    return Math.max(1, Math.min(8, this.settings.appearance?.concurrency ?? 3));
  }

  updateSettings(settings: TranslatorSettings) {
    this.settings = settings;
  }

  /**
   * Enqueue an array of targets.
   * Duplicates (same originalText) are merged immediately — no extra network calls.
   */
  enqueue(targets: TextExtractTarget[]) {
    if (this.isInvalidated) return;

    for (const target of targets) {
      const text = target.originalText;

      const existing = this.textToTargets.get(text);
      if (existing) {
        // Already enqueued or in-flight — just attach this target to it
        existing.push(target);
        this.dedupSavings++;
        continue;
      }

      // New unique text — add to pending batch
      this.textToTargets.set(text, [target]);
      this.pendingTexts.push(text);
    }

    this.scheduleBatch();
  }

  private scheduleBatch() {
    if (this.pendingTexts.length >= this.BATCH_SIZE) {
      // Batch full — flush immediately
      this.flush();
      return;
    }
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;
        this.flush();
      }, this.BATCH_WINDOW_MS);
    }
  }

  private flush() {
    if (this.isInvalidated || this.pendingTexts.length === 0) return;

    const batch = this.pendingTexts.splice(0, this.BATCH_SIZE);
    // Remove from textToTargets map so new enqueues for the same text
    // don't share this (now in-flight) batch
    const batchMap = new Map<string, TextExtractTarget[]>();
    for (const text of batch) {
      const targets = this.textToTargets.get(text);
      if (targets) {
        batchMap.set(text, targets);
        this.textToTargets.delete(text);
      }
    }

    this.runWithConcurrency(() => this.executeBatch(batch, batchMap));

    // If more pending, schedule next flush
    if (this.pendingTexts.length > 0) {
      this.scheduleBatch();
    }
  }

  private runWithConcurrency(fn: () => Promise<void>) {
    const run = () => {
      this.activeCount++;
      fn().finally(() => {
        this.activeCount--;
        if (this.concurrencyQueue.length > 0) {
          const next = this.concurrencyQueue.shift()!;
          next();
        }
      });
    };

    if (this.activeCount < this.maxConcurrent) {
      run();
    } else {
      this.concurrencyQueue.push(run);
    }
  }

  private async executeBatch(
    texts: string[],
    batchMap: Map<string, TextExtractTarget[]>,
    retriesLeft = 2,
  ): Promise<void> {
    if (this.isInvalidated) return;

    this.totalRequests++;

    try {
      const req: BatchTranslationRequestMessage = {
        type: MESSAGE_TYPES.TRANSLATE_BATCH,
        texts,
        sourceLang: this.settings.sourceLang,
        targetLang: this.settings.targetLang,
      };

      const res: BatchTranslationResponseMessage = await Promise.race([
        this.sendMessage(req),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), this.TIMEOUT_MS),
        ),
      ]);

      if (res?.success && res.translations) {
        for (let i = 0; i < texts.length; i++) {
          const translatedText = res.translations[i];
          if (!translatedText) continue;

          const targets = batchMap.get(texts[i]);
          if (!targets) continue;

          // Apply to every occurrence of this text on the page
          for (const t of targets) {
            try {
              this.callback(t, translatedText);
            } catch (applyErr) {
              logger.warn('Failed to apply translation:', applyErr);
            }
          }
        }
        logger.debug(
          `Batch done: ${texts.length} strings, dedup savings so far: ${this.dedupSavings}`,
        );
      } else {
        throw new Error(res?.error ?? 'Empty translation response');
      }
    } catch (err: any) {
      if (isExtensionInvalidated(err)) {
        this.invalidate();
        return; // Silent — this is expected when extension is reloaded
      }

      logger.warn(`Batch failed (${retriesLeft} retries left):`, err?.message);

      if (retriesLeft > 0) {
        await delay(this.RETRY_DELAY_MS * (3 - retriesLeft));
        return this.executeBatch(texts, batchMap, retriesLeft - 1);
      }

      logger.error('Batch permanently failed after retries:', err);
    }
  }

  /** Hard stop — called when extension is invalidated */
  invalidate() {
    this.isInvalidated = true;
    if (this.batchTimer) { clearTimeout(this.batchTimer); this.batchTimer = null; }
    this.pendingTexts = [];
    this.textToTargets.clear();
    this.concurrencyQueue = [];
  }

  /** Soft reset — called on SPA navigation or language change */
  reset() {
    this.isInvalidated = false;
    if (this.batchTimer) { clearTimeout(this.batchTimer); this.batchTimer = null; }
    this.pendingTexts = [];
    this.textToTargets.clear();
    this.concurrencyQueue = [];
    this.activeCount = 0;
    this.dedupSavings = 0;
    this.totalRequests = 0;
  }

  getStats() {
    return {
      pending: this.pendingTexts.length,
      active: this.activeCount,
      dedupSavings: this.dedupSavings,
      totalRequests: this.totalRequests,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
