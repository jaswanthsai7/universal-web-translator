import { TextExtractTarget, TranslatorSettings } from '../types';
import { TextExtractor } from './textExtractor';
import { logger } from '../utils/logger';

type EnqueueCallback = (targets: TextExtractTarget[], priority: 0 | 1 | 2) => void;

/**
 * Fast, Priority-Aware DOM Scanner.
 *
 * Uses a single comprehensive TreeWalker pass to extract all translatable
 * targets and attributes across the subtree, then partitions them into:
 *   P0 – visible viewport targets (highest priority, translated immediately)
 *   P1 – near-viewport targets (within 2.5x viewport height)
 *   P2 – deep/footer targets
 */
export class ScannerWorker {
  private readonly extractor: TextExtractor;
  private readonly enqueue: EnqueueCallback;
  private settings: TranslatorSettings;

  private scanAbortFlag = false;

  constructor(
    extractor: TextExtractor,
    settings: TranslatorSettings,
    enqueue: EnqueueCallback,
  ) {
    this.extractor = extractor;
    this.settings = settings;
    this.enqueue = enqueue;
  }

  updateSettings(settings: TranslatorSettings) {
    this.settings = settings;
  }

  abort() {
    this.scanAbortFlag = true;
  }

  async scan(root: Element) {
    this.scanAbortFlag = false;

    // Single comprehensive extraction pass across root
    const allTargets = this.extractor.extractFromRoot(root, this.settings);
    if (allTargets.length === 0) return;

    const viewportH = window.innerHeight;
    const nearLimit = viewportH * 2.5;

    const p0: TextExtractTarget[] = [];
    const p1: TextExtractTarget[] = [];
    const p2: TextExtractTarget[] = [];

    for (const target of allTargets) {
      if (this.scanAbortFlag) return;
      const roughTop = target.element ? getOffsetTop(target.element) : 0;

      if (roughTop <= viewportH * 1.2) {
        target.priority = 0;
        p0.push(target);
      } else if (roughTop <= nearLimit) {
        target.priority = 1;
        p1.push(target);
      } else {
        target.priority = 2;
        p2.push(target);
      }
    }

    if (p0.length > 0) {
      logger.debug(`Scanner: Enqueueing ${p0.length} P0 targets`);
      this.enqueue(p0, 0);
    }
    if (p1.length > 0) {
      logger.debug(`Scanner: Enqueueing ${p1.length} P1 targets`);
      this.enqueue(p1, 1);
    }
    if (p2.length > 0) {
      logger.debug(`Scanner: Enqueueing ${p2.length} P2 targets`);
      this.enqueue(p2, 2);
    }
  }
}

/** Cheap element position estimate without forcing layout thrashing */
function getOffsetTop(el: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    top += node.offsetTop || 0;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}
