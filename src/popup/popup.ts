import {
  TranslatorSettings,
  MESSAGE_TYPES,
  ProviderType,
  TranslationMode,
} from '../types';

let currentSettings: TranslatorSettings;
let currentHostname = '';

document.addEventListener('DOMContentLoaded', async () => {
  await initActiveTabInfo();
  await loadSettings();
  await updateCacheStats();
  bindUIEvents();
});

async function initActiveTabInfo() {
  const domainLabel = document.getElementById('current-domain') as HTMLElement;
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.url) {
        const url = new URL(activeTab.url);
        currentHostname = url.hostname;
        if (domainLabel) {
          domainLabel.textContent = currentHostname || 'Local / Extension';
        }
      }
    } catch {
      if (domainLabel) domainLabel.textContent = 'Active Page';
    }
  }
}

async function loadSettings() {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;

  try {
    const res = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
    if (res && res.success && res.settings) {
      currentSettings = res.settings;
      populateForm(currentSettings);
    }
  } catch (err) {
    console.error('Failed to load settings in popup:', err);
  }
}

function populateForm(s: TranslatorSettings) {
  const globalToggle = document.getElementById('global-toggle') as HTMLInputElement;
  const siteToggle = document.getElementById('site-toggle') as HTMLInputElement;
  const sourceLang = document.getElementById('source-lang') as HTMLSelectElement;
  const targetLang = document.getElementById('target-lang') as HTMLSelectElement;
  const provider = document.getElementById('provider-select') as HTMLSelectElement;
  const toggleDynamic = document.getElementById('toggle-dynamic') as HTMLInputElement;
  const togglePopups = document.getElementById('toggle-popups') as HTMLInputElement;
  const toggleTooltips = document.getElementById('toggle-tooltips') as HTMLInputElement;
  const togglePlaceholders = document.getElementById('toggle-placeholders') as HTMLInputElement;

  if (globalToggle) globalToggle.checked = s.enabled;
  if (sourceLang) sourceLang.value = s.sourceLang;
  if (targetLang) targetLang.value = s.targetLang;
  if (provider) provider.value = s.provider;
  if (toggleDynamic) toggleDynamic.checked = s.translateDynamic;
  if (togglePopups) togglePopups.checked = s.translatePopups;
  if (toggleTooltips) toggleTooltips.checked = s.translateTooltips;
  if (togglePlaceholders) togglePlaceholders.checked = s.translatePlaceholders;

  // Site specific toggle
  if (siteToggle && currentHostname) {
    const siteConfig = s.siteSettings[currentHostname];
    siteToggle.checked = siteConfig ? siteConfig.enabled : true;
  }

  // Segmented mode buttons
  updateModeButtons(s.mode);
}

function updateModeButtons(mode: TranslationMode) {
  const transOnlyBtn = document.getElementById('mode-translated-only');
  const dualBtn = document.getElementById('mode-dual');
  const hoverBtn = document.getElementById('mode-hover');

  transOnlyBtn?.classList.toggle('active', mode === 'translated-only');
  dualBtn?.classList.toggle('active', mode === 'dual');
  hoverBtn?.classList.toggle('active', mode === 'hover');
}

function bindUIEvents() {
  const globalToggle = document.getElementById('global-toggle') as HTMLInputElement;
  const siteToggle = document.getElementById('site-toggle') as HTMLInputElement;
  const sourceLang = document.getElementById('source-lang') as HTMLSelectElement;
  const targetLang = document.getElementById('target-lang') as HTMLSelectElement;
  const provider = document.getElementById('provider-select') as HTMLSelectElement;
  const toggleDynamic = document.getElementById('toggle-dynamic') as HTMLInputElement;
  const togglePopups = document.getElementById('toggle-popups') as HTMLInputElement;
  const toggleTooltips = document.getElementById('toggle-tooltips') as HTMLInputElement;
  const togglePlaceholders = document.getElementById('toggle-placeholders') as HTMLInputElement;
  const btnTranslatedOnly = document.getElementById('mode-translated-only');
  const btnDual = document.getElementById('mode-dual');
  const btnHover = document.getElementById('mode-hover');
  const btnTranslateNow = document.getElementById('btn-translate-now');
  const btnClearCache = document.getElementById('btn-clear-cache');
  const btnOpenOptions = document.getElementById('btn-open-options');

  const saveCurrent = () => {
    if (!currentSettings) return;

    currentSettings.enabled = globalToggle.checked;
    currentSettings.sourceLang = sourceLang.value;
    currentSettings.targetLang = targetLang.value;
    currentSettings.provider = provider.value as ProviderType;
    currentSettings.translateDynamic = toggleDynamic.checked;
    currentSettings.translatePopups = togglePopups.checked;
    currentSettings.translateTooltips = toggleTooltips.checked;
    currentSettings.translatePlaceholders = togglePlaceholders.checked;

    if (currentHostname) {
      currentSettings.siteSettings[currentHostname] = {
        enabled: siteToggle.checked,
        mode: currentSettings.mode,
      };
    }

    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SAVE_SETTINGS,
      settings: currentSettings,
    });
  };

  globalToggle?.addEventListener('change', saveCurrent);
  siteToggle?.addEventListener('change', saveCurrent);
  sourceLang?.addEventListener('change', saveCurrent);
  targetLang?.addEventListener('change', saveCurrent);
  provider?.addEventListener('change', saveCurrent);
  toggleDynamic?.addEventListener('change', saveCurrent);
  togglePopups?.addEventListener('change', saveCurrent);
  toggleTooltips?.addEventListener('change', saveCurrent);
  togglePlaceholders?.addEventListener('change', saveCurrent);

  btnTranslatedOnly?.addEventListener('click', () => {
    if (currentSettings) {
      currentSettings.mode = 'translated-only';
      updateModeButtons('translated-only');
      saveCurrent();
    }
  });

  btnDual?.addEventListener('click', () => {
    if (currentSettings) {
      currentSettings.mode = 'dual';
      updateModeButtons('dual');
      saveCurrent();
    }
  });

  btnHover?.addEventListener('click', () => {
    if (currentSettings) {
      currentSettings.mode = 'hover';
      updateModeButtons('hover');
      saveCurrent();
    }
  });

  btnTranslateNow?.addEventListener('click', async () => {
    saveCurrent();
    if (chrome.tabs && chrome.tabs.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.SETTINGS_CHANGED,
          settings: currentSettings,
        }).catch(() => {});
      }
    }
  });

  btnClearCache?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CLEAR_CACHE });
    await updateCacheStats();
  });

  btnOpenOptions?.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('options.html');
    }
  });
}

async function updateCacheStats() {
  const cacheText = document.getElementById('cache-stats-text');
  if (!cacheText) return;

  try {
    const res = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_CACHE_STATS });
    if (res && res.success && res.stats) {
      cacheText.textContent = `Cache: ${res.stats.inMemoryCount} items (${res.stats.hitCount} hits)`;
    }
  } catch {
    cacheText.textContent = 'Cache: ready';
  }
}
