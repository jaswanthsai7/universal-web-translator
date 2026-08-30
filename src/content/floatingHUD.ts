import { TranslatorSettings, TranslationMode } from '../types';

export interface HUDCallbacks {
  onToggleEnabled: (enabled: boolean) => void;
  onChangeMode: (mode: TranslationMode) => void;
  onChangeTargetLang: (lang: string) => void;
  onTranslateCurrentPage: () => void;
}

export class FloatingHUD {
  private rootEl: HTMLElement | null = null;
  private settings: TranslatorSettings;
  private callbacks: HUDCallbacks;
  private isExpanded = false;
  private statusText = 'Ready';

  constructor(settings: TranslatorSettings, callbacks: HUDCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;

    // Always purge any stale HUD element from the DOM
    const existing = document.getElementById('universal-webtrans-hud-root');
    if (existing) existing.remove();

    if (this.settings.appearance?.showFloatingHUD === true) {
      this.render();
    }
  }

  updateSettings(settings: TranslatorSettings) {
    this.settings = settings;
    if (this.settings.appearance?.showFloatingHUD !== true) {
      this.destroy();
    } else {
      if (!this.rootEl) {
        this.render();
      } else {
        this.updateContent();
      }
    }
  }

  setStatus(text: string, isTranslating: boolean = false) {
    if (!this.settings.appearance.showFloatingHUD) return;
    this.statusText = text;
    const statusBadge = this.rootEl?.querySelector<HTMLElement>('.webtrans-hud-status');
    if (statusBadge) {
      statusBadge.textContent = text;
      statusBadge.style.color = isTranslating ? '#38bdf8' : '#4ade80';
    }
  }

  private render() {
    if (!this.settings.appearance.showFloatingHUD) return;
    if (this.rootEl && this.rootEl.isConnected) return;

    const hud = document.createElement('div');
    hud.id = 'universal-webtrans-hud-root';
    hud.setAttribute('data-webtrans-ignore', 'true');
    hud.className = 'webtrans-hud-root';

    hud.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
      pointer-events: auto !important;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    `;

    document.documentElement.appendChild(hud);
    this.rootEl = hud;
    this.updateContent();
  }

  private updateContent() {
    if (!this.rootEl) return;

    const enabled = this.settings.enabled;
    const mode = this.settings.mode;
    const targetLang = this.settings.targetLang;

    if (!this.isExpanded) {
      // Minimized pill view
      this.rootEl.innerHTML = `
        <div class="webtrans-pill" style="
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
          color: #f8fafc;
          padding: 6px 12px;
          border-radius: 9999px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s ease;
        ">
          <span style="
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${enabled ? '#22c55e' : '#ef4444'};
            box-shadow: 0 0 8px ${enabled ? '#22c55e' : '#ef4444'};
          "></span>
          <span>🌐 Translate (${targetLang.toUpperCase()})</span>
          <span class="webtrans-hud-status" style="font-size: 10px; color: #94a3b8;">${this.statusText}</span>
        </div>
      `;

      const pill = this.rootEl.querySelector('.webtrans-pill');
      pill?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isExpanded = true;
        this.updateContent();
      });
    } else {
      // Expanded control card
      this.rootEl.innerHTML = `
        <div class="webtrans-card" style="
          width: 250px;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
          color: #f8fafc;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          font-size: 13px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
              <span>📺 Bilibili English</span>
            </div>
            <button id="webtrans-close-btn" style="
              background: transparent;
              border: none;
              color: #94a3b8;
              cursor: pointer;
              font-size: 16px;
              padding: 2px 6px;
            ">✕</button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #94a3b8; font-size: 12px;">Status:</span>
            <span class="webtrans-hud-status" style="font-weight: 500; font-size: 12px; color: #4ade80;">
              ${this.statusText}
            </span>
          </div>

          <div style="display: flex; gap: 8px;">
            <button id="webtrans-toggle-enable" style="
              flex: 1;
              padding: 6px 10px;
              border-radius: 6px;
              border: 1px solid rgba(255, 255, 255, 0.15);
              background: ${enabled ? '#1e293b' : '#3b82f6'};
              color: white;
              font-size: 12px;
              font-weight: 500;
              cursor: pointer;
            ">
              ${enabled ? '⏸ Pause' : '▶ Resume'}
            </button>

            <button id="webtrans-manual-translate" style="
              flex: 1;
              padding: 6px 10px;
              border-radius: 6px;
              border: none;
              background: #3b82f6;
              color: white;
              font-size: 12px;
              font-weight: 500;
              cursor: pointer;
            ">
              ↻ Translate
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; color: #94a3b8;">Target Language</label>
            <select id="webtrans-lang-select" style="
              background: #1e293b;
              border: 1px solid rgba(255, 255, 255, 0.15);
              color: white;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 12px;
              outline: none;
            ">
              <option value="en" ${targetLang === 'en' ? 'selected' : ''}>English</option>
              <option value="zh" ${targetLang === 'zh' ? 'selected' : ''}>Chinese (中文)</option>
              <option value="ja" ${targetLang === 'ja' ? 'selected' : ''}>Japanese (日本語)</option>
              <option value="ko" ${targetLang === 'ko' ? 'selected' : ''}>Korean (한국어)</option>
              <option value="es" ${targetLang === 'es' ? 'selected' : ''}>Spanish (Español)</option>
              <option value="fr" ${targetLang === 'fr' ? 'selected' : ''}>French (Français)</option>
              <option value="de" ${targetLang === 'de' ? 'selected' : ''}>German (Deutsch)</option>
              <option value="ru" ${targetLang === 'ru' ? 'selected' : ''}>Russian (Русский)</option>
            </select>
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; color: #94a3b8;">Translation Mode</label>
            <div style="display: flex; gap: 4px;">
              <button class="webtrans-mode-btn" data-mode="translated-only" style="
                flex: 1;
                padding: 4px 6px;
                border-radius: 5px;
                font-size: 11px;
                border: 1px solid ${mode === 'translated-only' ? '#38bdf8' : 'rgba(255,255,255,0.1)'};
                background: ${mode === 'translated-only' ? 'rgba(56, 189, 248, 0.2)' : 'transparent'};
                color: ${mode === 'translated-only' ? '#38bdf8' : '#94a3b8'};
                cursor: pointer;
              ">Translated</button>
              <button class="webtrans-mode-btn" data-mode="dual" style="
                flex: 1;
                padding: 4px 6px;
                border-radius: 5px;
                font-size: 11px;
                border: 1px solid ${mode === 'dual' ? '#38bdf8' : 'rgba(255,255,255,0.1)'};
                background: ${mode === 'dual' ? 'rgba(56, 189, 248, 0.2)' : 'transparent'};
                color: ${mode === 'dual' ? '#38bdf8' : '#94a3b8'};
                cursor: pointer;
              ">Dual</button>
              <button class="webtrans-mode-btn" data-mode="hover" style="
                flex: 1;
                padding: 4px 6px;
                border-radius: 5px;
                font-size: 11px;
                border: 1px solid ${mode === 'hover' ? '#38bdf8' : 'rgba(255,255,255,0.1)'};
                background: ${mode === 'hover' ? 'rgba(56, 189, 248, 0.2)' : 'transparent'};
                color: ${mode === 'hover' ? '#38bdf8' : '#94a3b8'};
                cursor: pointer;
              ">Hover</button>
            </div>
          </div>
        </div>
      `;

      this.bindCardEvents();
    }
  }

  private bindCardEvents() {
    if (!this.rootEl) return;

    this.rootEl.querySelector('#webtrans-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isExpanded = false;
      this.updateContent();
    });

    this.rootEl.querySelector('#webtrans-toggle-enable')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleEnabled(!this.settings.enabled);
    });

    this.rootEl.querySelector('#webtrans-manual-translate')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onTranslateCurrentPage();
    });

    const langSelect = this.rootEl.querySelector<HTMLSelectElement>('#webtrans-lang-select');
    langSelect?.addEventListener('change', (e) => {
      e.stopPropagation();
      this.callbacks.onChangeTargetLang(langSelect.value);
    });

    const modeButtons = this.rootEl.querySelectorAll<HTMLButtonElement>('.webtrans-mode-btn');
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = btn.getAttribute('data-mode') as TranslationMode;
        if (m) this.callbacks.onChangeMode(m);
      });
    });
  }

  destroy() {
    const existing = document.getElementById('universal-webtrans-hud-root');
    if (existing) existing.remove();
    if (this.rootEl && this.rootEl.isConnected) {
      this.rootEl.remove();
    }
    this.rootEl = null;
  }
}
