import {
  TranslatorSettings,
  MESSAGE_TYPES,
  ProviderType,
  TranslationMode,
} from '../types';

let currentSettings: TranslatorSettings;
let currentHostname = '';
let currentTheme: 'auto' | 'light' | 'dark' = 'auto';

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await initActiveTabInfo();
  await loadSettings();
  await updateCacheStats();
  bindUIEvents();
});

function initTheme() {
  const saved = localStorage.getItem('bilibili_english_theme') as 'auto' | 'light' | 'dark' | null;
  if (saved) {
    applyTheme(saved);
  } else {
    applyTheme('auto');
  }
}

function applyTheme(theme: 'auto' | 'light' | 'dark') {
  currentTheme = theme;
  localStorage.setItem('bilibili_english_theme', theme);
  const icon = document.getElementById('theme-icon');

  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    if (icon) icon.textContent = '☀️';
  } else if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (icon) icon.textContent = '🌙';
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (icon) icon.textContent = '🌓';
  }
}

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

  // Synchronize custom dropdown labels & active states
  syncDropdown('source-dropdown', 'source-lang-label', s.sourceLang);
  syncDropdown('target-dropdown', 'target-lang-label', s.targetLang);
  syncDropdown('engine-dropdown', 'engine-label', s.provider);

  // Segmented mode buttons
  updateModeButtons(s.mode);
}

function syncDropdown(wrapperId: string, labelId: string, value: string) {
  const wrapper = document.getElementById(wrapperId);
  const label = document.getElementById(labelId);
  if (!wrapper) return;

  const items = wrapper.querySelectorAll<HTMLElement>('.menu-item');
  let selectedText = '';
  items.forEach((item) => {
    const val = item.getAttribute('data-value');
    const isSelected = val === value;
    item.classList.toggle('selected', isSelected);
    if (isSelected) {
      selectedText = item.textContent?.trim() ?? '';
    }
  });

  if (label && selectedText) {
    label.textContent = selectedText;
  }
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
  const btnThemeToggle = document.getElementById('theme-toggle-btn');
  const btnSwapLang = document.getElementById('btn-swap-lang');
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

  // Theme Switcher cycle: auto -> light -> dark -> auto
  btnThemeToggle?.addEventListener('click', () => {
    if (currentTheme === 'auto') {
      applyTheme('light');
    } else if (currentTheme === 'light') {
      applyTheme('dark');
    } else {
      applyTheme('auto');
    }
  });

  // Custom Dropdown Interactions
  const allDropdowns = document.querySelectorAll<HTMLElement>('.custom-dropdown');

  const setupDropdown = (
    wrapperId: string,
    triggerId: string,
    labelId: string,
    selectId: string,
  ) => {
    const wrapper = document.getElementById(wrapperId);
    const trigger = document.getElementById(triggerId);
    const select = document.getElementById(selectId) as HTMLSelectElement;
    if (!wrapper || !trigger) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = wrapper.classList.contains('open');
      allDropdowns.forEach((d) => d.classList.remove('open'));
      if (!wasOpen) wrapper.classList.add('open');
    });

    const items = wrapper.querySelectorAll<HTMLElement>('.menu-item');
    items.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = item.getAttribute('data-value') || '';
        if (select) select.value = val;
        syncDropdown(wrapperId, labelId, val);
        wrapper.classList.remove('open');
        saveCurrent();
      });
    });
  };

  setupDropdown('source-dropdown', 'source-lang-trigger', 'source-lang-label', 'source-lang');
  setupDropdown('target-dropdown', 'target-lang-trigger', 'target-lang-label', 'target-lang');
  setupDropdown('engine-dropdown', 'engine-trigger', 'engine-label', 'provider-select');

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    allDropdowns.forEach((d) => d.classList.remove('open'));
  });

  // Swap Languages Button
  btnSwapLang?.addEventListener('click', () => {
    if (!currentSettings) return;
    const prevSource = sourceLang.value;
    const prevTarget = targetLang.value;

    const newSource = prevTarget;
    const newTarget = prevSource === 'auto' ? 'zh' : prevSource;

    sourceLang.value = newSource;
    targetLang.value = newTarget;

    syncDropdown('source-dropdown', 'source-lang-label', newSource);
    syncDropdown('target-dropdown', 'target-lang-label', newTarget);
    saveCurrent();
  });

  globalToggle?.addEventListener('change', saveCurrent);
  siteToggle?.addEventListener('change', saveCurrent);
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
      cacheText.textContent = `${res.stats.inMemoryCount} cached`;
    }
  } catch {
    cacheText.textContent = 'ready';
  }
}
