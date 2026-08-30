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
document.addEventListener("DOMContentLoaded", async () => {
  await initActiveTabInfo();
  await loadSettings();
  await updateCacheStats();
  bindUIEvents();
});
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
  updateModeButtons(s.mode);
}
function updateModeButtons(mode) {
  const overlayBtn = document.getElementById("mode-overlay");
  const inlineBtn = document.getElementById("mode-inline");
  if (overlayBtn && inlineBtn) {
    if (mode === "overlay") {
      overlayBtn.classList.add("active");
      inlineBtn.classList.remove("active");
    } else {
      inlineBtn.classList.add("active");
      overlayBtn.classList.remove("active");
    }
  }
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
  const btnOverlay = document.getElementById("mode-overlay");
  const btnInline = document.getElementById("mode-inline");
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
  globalToggle == null ? void 0 : globalToggle.addEventListener("change", saveCurrent);
  siteToggle == null ? void 0 : siteToggle.addEventListener("change", saveCurrent);
  sourceLang == null ? void 0 : sourceLang.addEventListener("change", saveCurrent);
  targetLang == null ? void 0 : targetLang.addEventListener("change", saveCurrent);
  provider == null ? void 0 : provider.addEventListener("change", saveCurrent);
  toggleDynamic == null ? void 0 : toggleDynamic.addEventListener("change", saveCurrent);
  togglePopups == null ? void 0 : togglePopups.addEventListener("change", saveCurrent);
  toggleTooltips == null ? void 0 : toggleTooltips.addEventListener("change", saveCurrent);
  togglePlaceholders == null ? void 0 : togglePlaceholders.addEventListener("change", saveCurrent);
  btnOverlay == null ? void 0 : btnOverlay.addEventListener("click", () => {
    if (currentSettings) {
      currentSettings.mode = "overlay";
      updateModeButtons("overlay");
      saveCurrent();
    }
  });
  btnInline == null ? void 0 : btnInline.addEventListener("click", () => {
    if (currentSettings) {
      currentSettings.mode = "inline";
      updateModeButtons("inline");
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
      cacheText.textContent = `Cache: ${res.stats.inMemoryCount} items (${res.stats.hitCount} hits)`;
    }
  } catch {
    cacheText.textContent = "Cache: ready";
  }
}
