(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const MESSAGE_TYPES = {
  TRANSLATE_BATCH: "TRANSLATE_BATCH",
  GET_SETTINGS: "GET_SETTINGS",
  SAVE_SETTINGS: "SAVE_SETTINGS",
  CLEAR_CACHE: "CLEAR_CACHE",
  GET_CACHE_STATS: "GET_CACHE_STATS",
  SETTINGS_CHANGED: "SETTINGS_CHANGED",
  TRANSLATION_PROGRESS: "TRANSLATION_PROGRESS"
};
let currentSettings;
let currentHostname = "";
let currentTheme = "auto";
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  await initActiveTabInfo();
  await loadSettings();
  await updateCacheStats();
  bindUIEvents();
});
function initTheme() {
  const saved = localStorage.getItem("bilibili_english_theme");
  if (saved) {
    applyTheme(saved);
  } else {
    applyTheme("auto");
  }
}
function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem("bilibili_english_theme", theme);
  const icon = document.getElementById("theme-icon");
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    if (icon) icon.textContent = "☀️";
  } else if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    if (icon) icon.textContent = "🌙";
  } else {
    document.documentElement.removeAttribute("data-theme");
    if (icon) icon.textContent = "🌓";
  }
}
async function initActiveTabInfo() {
  const domainLabel = document.getElementById("current-domain");
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.url) {
        const url = new URL(activeTab.url);
        currentHostname = url.hostname;
        if (domainLabel) {
          domainLabel.textContent = currentHostname || "Local / Extension";
        }
      }
    } catch {
      if (domainLabel) domainLabel.textContent = "Active Page";
    }
  }
}
async function loadSettings() {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
    if (res && res.success && res.settings) {
      currentSettings = res.settings;
      populateForm(currentSettings);
    }
  } catch (err) {
    console.error("Failed to load settings in popup:", err);
  }
}
function populateForm(s) {
  const globalToggle = document.getElementById("global-toggle");
  const siteToggle = document.getElementById("site-toggle");
  const sourceLang = document.getElementById("source-lang");
  const targetLang = document.getElementById("target-lang");
  const provider = document.getElementById("provider-select");
  const toggleDynamic = document.getElementById("toggle-dynamic");
  const togglePopups = document.getElementById("toggle-popups");
  const toggleTooltips = document.getElementById("toggle-tooltips");
  const togglePlaceholders = document.getElementById("toggle-placeholders");
  if (globalToggle) globalToggle.checked = s.enabled;
  if (sourceLang) sourceLang.value = s.sourceLang;
  if (targetLang) targetLang.value = s.targetLang;
  if (provider) provider.value = s.provider;
  if (toggleDynamic) toggleDynamic.checked = s.translateDynamic;
  if (togglePopups) togglePopups.checked = s.translatePopups;
  if (toggleTooltips) toggleTooltips.checked = s.translateTooltips;
  if (togglePlaceholders) togglePlaceholders.checked = s.translatePlaceholders;
  if (siteToggle && currentHostname) {
    const siteConfig = s.siteSettings[currentHostname];
    siteToggle.checked = siteConfig ? siteConfig.enabled : true;
  }
  syncDropdown("source-dropdown", "source-lang-label", s.sourceLang);
  syncDropdown("target-dropdown", "target-lang-label", s.targetLang);
  syncDropdown("engine-dropdown", "engine-label", s.provider);
  updateModeButtons(s.mode);
}
function syncDropdown(wrapperId, labelId, value) {
  const wrapper = document.getElementById(wrapperId);
  const label = document.getElementById(labelId);
  if (!wrapper) return;
  const items = wrapper.querySelectorAll(".menu-item");
  let selectedText = "";
  items.forEach((item) => {
    var _a;
    const val = item.getAttribute("data-value");
    const isSelected = val === value;
    item.classList.toggle("selected", isSelected);
    if (isSelected) {
      selectedText = ((_a = item.textContent) == null ? void 0 : _a.trim()) ?? "";
    }
  });
  if (label && selectedText) {
    label.textContent = selectedText;
  }
}
function updateModeButtons(mode) {
  const transOnlyBtn = document.getElementById("mode-translated-only");
  const dualBtn = document.getElementById("mode-dual");
  const hoverBtn = document.getElementById("mode-hover");
  transOnlyBtn == null ? void 0 : transOnlyBtn.classList.toggle("active", mode === "translated-only");
  dualBtn == null ? void 0 : dualBtn.classList.toggle("active", mode === "dual");
  hoverBtn == null ? void 0 : hoverBtn.classList.toggle("active", mode === "hover");
}
function bindUIEvents() {
  const globalToggle = document.getElementById("global-toggle");
  const siteToggle = document.getElementById("site-toggle");
  const sourceLang = document.getElementById("source-lang");
  const targetLang = document.getElementById("target-lang");
  const provider = document.getElementById("provider-select");
  const toggleDynamic = document.getElementById("toggle-dynamic");
  const togglePopups = document.getElementById("toggle-popups");
  const toggleTooltips = document.getElementById("toggle-tooltips");
  const togglePlaceholders = document.getElementById("toggle-placeholders");
  const btnThemeToggle = document.getElementById("theme-toggle-btn");
  const btnSwapLang = document.getElementById("btn-swap-lang");
  const btnTranslatedOnly = document.getElementById("mode-translated-only");
  const btnDual = document.getElementById("mode-dual");
  const btnHover = document.getElementById("mode-hover");
  const btnTranslateNow = document.getElementById("btn-translate-now");
  const btnClearCache = document.getElementById("btn-clear-cache");
  const btnOpenOptions = document.getElementById("btn-open-options");
  const saveCurrent = () => {
    if (!currentSettings) return;
    currentSettings.enabled = globalToggle.checked;
    currentSettings.sourceLang = sourceLang.value;
    currentSettings.targetLang = targetLang.value;
    currentSettings.provider = provider.value;
    currentSettings.translateDynamic = toggleDynamic.checked;
    currentSettings.translatePopups = togglePopups.checked;
    currentSettings.translateTooltips = toggleTooltips.checked;
    currentSettings.translatePlaceholders = togglePlaceholders.checked;
    if (currentHostname) {
      currentSettings.siteSettings[currentHostname] = {
        enabled: siteToggle.checked,
        mode: currentSettings.mode
      };
    }
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SAVE_SETTINGS,
      settings: currentSettings
    });
  };
  btnThemeToggle == null ? void 0 : btnThemeToggle.addEventListener("click", () => {
    if (currentTheme === "auto") {
      applyTheme("light");
    } else if (currentTheme === "light") {
      applyTheme("dark");
    } else {
      applyTheme("auto");
    }
  });
  const allDropdowns = document.querySelectorAll(".custom-dropdown");
  const setupDropdown = (wrapperId, triggerId, labelId, selectId) => {
    const wrapper = document.getElementById(wrapperId);
    const trigger = document.getElementById(triggerId);
    const select = document.getElementById(selectId);
    if (!wrapper || !trigger) return;
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = wrapper.classList.contains("open");
      allDropdowns.forEach((d) => d.classList.remove("open"));
      if (!wasOpen) wrapper.classList.add("open");
    });
    const items = wrapper.querySelectorAll(".menu-item");
    items.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const val = item.getAttribute("data-value") || "";
        if (select) select.value = val;
        syncDropdown(wrapperId, labelId, val);
        wrapper.classList.remove("open");
        saveCurrent();
      });
    });
  };
  setupDropdown("source-dropdown", "source-lang-trigger", "source-lang-label", "source-lang");
  setupDropdown("target-dropdown", "target-lang-trigger", "target-lang-label", "target-lang");
  setupDropdown("engine-dropdown", "engine-trigger", "engine-label", "provider-select");
  document.addEventListener("click", () => {
    allDropdowns.forEach((d) => d.classList.remove("open"));
  });
  btnSwapLang == null ? void 0 : btnSwapLang.addEventListener("click", () => {
    if (!currentSettings) return;
    const prevSource = sourceLang.value;
    const prevTarget = targetLang.value;
    const newSource = prevTarget;
    const newTarget = prevSource === "auto" ? "zh" : prevSource;
    sourceLang.value = newSource;
    targetLang.value = newTarget;
    syncDropdown("source-dropdown", "source-lang-label", newSource);
    syncDropdown("target-dropdown", "target-lang-label", newTarget);
    saveCurrent();
  });
  globalToggle == null ? void 0 : globalToggle.addEventListener("change", saveCurrent);
  siteToggle == null ? void 0 : siteToggle.addEventListener("change", saveCurrent);
  toggleDynamic == null ? void 0 : toggleDynamic.addEventListener("change", saveCurrent);
  togglePopups == null ? void 0 : togglePopups.addEventListener("change", saveCurrent);
  toggleTooltips == null ? void 0 : toggleTooltips.addEventListener("change", saveCurrent);
  togglePlaceholders == null ? void 0 : togglePlaceholders.addEventListener("change", saveCurrent);
  btnTranslatedOnly == null ? void 0 : btnTranslatedOnly.addEventListener("click", () => {
    if (currentSettings) {
      currentSettings.mode = "translated-only";
      updateModeButtons("translated-only");
      saveCurrent();
    }
  });
  btnDual == null ? void 0 : btnDual.addEventListener("click", () => {
    if (currentSettings) {
      currentSettings.mode = "dual";
      updateModeButtons("dual");
      saveCurrent();
    }
  });
  btnHover == null ? void 0 : btnHover.addEventListener("click", () => {
    if (currentSettings) {
      currentSettings.mode = "hover";
      updateModeButtons("hover");
      saveCurrent();
    }
  });
  btnTranslateNow == null ? void 0 : btnTranslateNow.addEventListener("click", async () => {
    saveCurrent();
    if (chrome.tabs && chrome.tabs.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab == null ? void 0 : tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.SETTINGS_CHANGED,
          settings: currentSettings
        }).catch(() => {
        });
      }
    }
  });
  btnClearCache == null ? void 0 : btnClearCache.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CLEAR_CACHE });
    await updateCacheStats();
  });
  btnOpenOptions == null ? void 0 : btnOpenOptions.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open("options.html");
    }
  });
}
async function updateCacheStats() {
  const cacheText = document.getElementById("cache-stats-text");
  if (!cacheText) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_CACHE_STATS });
    if (res && res.success && res.stats) {
      cacheText.textContent = `${res.stats.inMemoryCount} cached`;
    }
  } catch {
    cacheText.textContent = "ready";
  }
}
