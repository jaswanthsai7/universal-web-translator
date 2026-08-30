import { isIgnoredElement } from '../utils/dom';
import { logger } from '../utils/logger';

export type MutationCallback = (mutatedNodes: Node[]) => void;
export type SelfMutationChecker = (node: Node, value: string) => boolean;

export class MutationManager {
  private observer: MutationObserver | null = null;
  private shadowObservers: Map<ShadowRoot, MutationObserver> = new Map();
  private pendingNodes: Set<Node> = new Set();
  private debounceTimer: any = null;
  private readonly debounceMs = 60;
  private callback: MutationCallback;
  private isSelfMutation?: SelfMutationChecker;
  private isPaused = false;
  private lastUrl = '';

  constructor(callback: MutationCallback, isSelfMutation?: SelfMutationChecker) {
    this.callback = callback;
    this.isSelfMutation = isSelfMutation;
    this.lastUrl = window.location.href;
    this.setupUrlWatcher();
  }

  start() {
    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      if (this.isPaused) return;
      this.handleMutations(mutations);
    });

    const target = document.body || document.documentElement;
    if (target) {
      this.observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'aria-expanded', 'hidden', 'placeholder', 'title', 'aria-label', 'alt'],
      });
      logger.info('MutationObserver started listening on DOM');
    }

    // Scan initial open shadow roots
    this.scanShadowRoots(document.documentElement);
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    for (const obs of this.shadowObservers.values()) {
      obs.disconnect();
    }
    this.shadowObservers.clear();
    this.pendingNodes.clear();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private handleMutations(mutations: MutationRecord[]) {
    let hasRelevantMutations = false;

    for (const mut of mutations) {
      // Ignore mutations originating from translator's own overlay or HUD
      if (isIgnoredElement(mut.target as Element)) {
        continue;
      }

      if (mut.type === 'childList') {
        for (let i = 0; i < mut.addedNodes.length; i++) {
          const node = mut.addedNodes[i];
          if (node instanceof Element && isIgnoredElement(node)) {
            continue;
          }
          this.pendingNodes.add(node);
          hasRelevantMutations = true;

          // Check if newly added element has shadow root
          if (node instanceof Element) {
            this.scanShadowRoots(node);
          }
        }
      } else if (mut.type === 'characterData') {
        const textNode = mut.target;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          const val = textNode.nodeValue || '';
          if (this.isSelfMutation && this.isSelfMutation(textNode, val)) {
            // Our own injected translation, ignore!
            continue;
          }
          if (textNode.parentElement && !isIgnoredElement(textNode.parentElement)) {
            this.pendingNodes.add(textNode);
            hasRelevantMutations = true;
          }
        }
      } else if (mut.type === 'attributes') {
        const el = mut.target as HTMLElement;
        if (el && !isIgnoredElement(el)) {
          // If element became visible or expanded (e.g. dropdown open)
          this.pendingNodes.add(el);
          hasRelevantMutations = true;
        }
      }
    }

    if (hasRelevantMutations) {
      this.scheduleFlush();
    }
  }

  private scheduleFlush() {
    if (this.debounceTimer) return;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.pendingNodes.size === 0) return;

      const nodes = Array.from(this.pendingNodes);
      this.pendingNodes.clear();
      this.callback(nodes);
    }, this.debounceMs);
  }

  /**
   * Traverse open shadow roots and attach sub-MutationObservers
   */
  private scanShadowRoots(root: Element) {
    if (!root) return;

    const checkElement = (el: Element) => {
      if (el.shadowRoot && !this.shadowObservers.has(el.shadowRoot)) {
        try {
          const shadowObs = new MutationObserver((mutations) => {
            if (!this.isPaused) this.handleMutations(mutations);
          });
          shadowObs.observe(el.shadowRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class'],
          });
          this.shadowObservers.set(el.shadowRoot, shadowObs);
          // Queue shadowRoot children for initial extraction
          for (const child of Array.from(el.shadowRoot.children)) {
            this.pendingNodes.add(child);
          }
          this.scheduleFlush();
        } catch (err) {
          logger.warn('Failed to observe shadowRoot:', err);
        }
      }
    };

    checkElement(root);
    const descendants = root.querySelectorAll('*');
    for (let i = 0; i < descendants.length; i++) {
      checkElement(descendants[i]);
    }
  }

  /**
   * Monitor SPA history navigation (pushState, replaceState, popstate, hashchange)
   */
  private setupUrlWatcher() {
    const onUrlChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== this.lastUrl) {
        this.lastUrl = currentUrl;
        logger.info('SPA Route changed to:', currentUrl);
        // Queue document for re-scan after route update
        setTimeout(() => {
          this.pendingNodes.add(document.body || document.documentElement);
          this.scheduleFlush();
        }, 150);
      }
    };

    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);

    // Monkey-patch history pushState / replaceState for client-side routing
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      onUrlChange();
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      onUrlChange();
      return result;
    };
  }
}
