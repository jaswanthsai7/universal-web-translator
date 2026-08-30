import { TextExtractTarget, TranslatorSettings } from '../types';
import { TextExtractor } from './textExtractor';
import { logger } from '../utils/logger';

type EnqueueCallback = (targets: TextExtractTarget[], priority: 0 | 1 | 2) => void;

const CHUNK_SIZE = 50; // elements processed per async tick

/**
 * Chunked, priority-aware DOM scanner.
 *
 * Rather than walking the entire document synchronously (which blocks the
 * page), the scanner processes elements in small chunks using
 * requestIdleCallback (with setTimeout fallback) so the browser remains
 * responsive throughout.
 *
 * Priority ordering:
 *   P0 – elements currently in the visible viewport (translate first)
 *   P1 – elements within the next 2 viewport heights (translate in background)
 *   P2 – everything else (translate during idle time)
 *
 * This ensures the user sees translations immediately without needing to
 * scroll, while offscreen content is translated continuously in the background.
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

  /** Abort any current in-progress scan (called on SPA navigation) */
  abort() {
    this.scanAbortFlag = true;
  }

  /**
   * Full prioritized scan of a root element.
   *
   * Step 1: Immediately collect and translate P0 (visible viewport) using a
   *         fast, synchronous mini-scan of only what's currently visible.
   *
   * Step 2: Walk the remaining DOM asynchronously in CHUNK_SIZE chunks,
   *         classifying each element as P1 or P2 and enqueueing accordingly.
   */
  async scan(root: Element) {
    this.scanAbortFlag = false;

    // ── P0: Immediate viewport scan (synchronous, very fast) ──────────────
    const viewportH = window.innerHeight;
    const p0Targets = this.extractViewportTargets(root, viewportH);
    if (p0Targets.length > 0) {
      this.enqueue(p0Targets, 0);
      logger.debug(`P0 (viewport): ${p0Targets.length} targets enqueued immediately`);
    }

    // ── P1 + P2: Background chunked scan ────────────────────────────────
    const allElements = Array.from(root.querySelectorAll<HTMLElement>('*'));
    const nearLimit = viewportH * 3; // P1 threshold: 3× viewport height from top
    let i = 0;

    const processChunk = () => {
      if (this.scanAbortFlag || i >= allElements.length) return;

      const chunkEnd = Math.min(i + CHUNK_SIZE, allElements.length);
      const p1: TextExtractTarget[] = [];
      const p2: TextExtractTarget[] = [];

      for (; i < chunkEnd; i++) {
        const el = allElements[i];
        const roughTop = getOffsetTop(el);

        const targets = this.extractor.extractFromRoot(el, this.settings);
        if (targets.length === 0) continue;

        if (roughTop < nearLimit) {
          p1.push(...targets);
        } else {
          p2.push(...targets);
        }
      }

      if (p1.length > 0) this.enqueue(p1, 1);
      if (p2.length > 0) this.enqueue(p2, 2);

      // Schedule next chunk
      scheduleIdle(processChunk);
    };

    // Give P0 translations a head-start before background scan begins
    scheduleIdle(processChunk);
  }

  /**
   * Fast synchronous scan of visible-viewport elements.
   */
  private extractViewportTargets(root: Element, viewportH: number): TextExtractTarget[] {
    const targets: TextExtractTarget[] = [];

    // Collect candidate elements that are visually in or near the viewport
    const candidates = root.querySelectorAll<HTMLElement>('*');
    const limit = Math.min(candidates.length, 800); // scan first 800 elements without premature break

    for (let i = 0; i < limit; i++) {
      const el = candidates[i];
      const top = getOffsetTop(el);
      if (top > viewportH * 1.5) continue; // Skip elements far below, but do NOT break early

      const extracted = this.extractor.extractFromRoot(el, this.settings);
      for (const t of extracted) {
        t.priority = 0;
        targets.push(t);
      }
    }

    return targets;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Cheap element position estimate without forcing a layout reflow */
function getOffsetTop(el: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node) {
    top += node.offsetTop || 0;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}

/** requestIdleCallback with setTimeout fallback for environments that lack it */
function scheduleIdle(fn: () => void) {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(fn, { timeout: 500 });
  } else {
    setTimeout(fn, 0);
  }
}
