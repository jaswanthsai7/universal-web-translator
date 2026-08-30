import { TranslatorSettings, TranslationMode } from '../types';

export interface HUDCallbacks {
  onToggleEnabled: (enabled: boolean) => void;
  onChangeMode: (mode: TranslationMode) => void;
  onChangeTargetLang: (lang: string) => void;
  onTranslateCurrentPage: () => void;
}

/**
 * FloatingHUD - Clean, non-intrusive HUD manager.
 * By user preference, on-page floating badges/buttons are completely disabled
 * to keep the browsing interface 100% clean and clutter-free. All controls
 * are exclusively managed via the toolbar Popup and Options page.
 */
export class FloatingHUD {
  constructor(_settings?: TranslatorSettings, _callbacks?: HUDCallbacks) {
    this.purgeStaleHUD();
  }

  updateSettings(_settings?: TranslatorSettings) {
    this.purgeStaleHUD();
  }

  setStatus(_text: string, _isTranslating: boolean = false) {
    // No-op: on-page badge is suppressed
  }

  destroy() {
    this.purgeStaleHUD();
  }

  private purgeStaleHUD() {
    const existing = document.getElementById('universal-webtrans-hud-root');
    if (existing) existing.remove();

    const staleElements = document.querySelectorAll('.webtrans-hud-root, #universal-webtrans-hud-root');
    staleElements.forEach((el) => el.remove());
  }
}
