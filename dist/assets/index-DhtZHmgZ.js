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
document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  await loadSettings();
  bindEvents();
});
function setupTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      if (!targetId) return;
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabPanels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add("active");
      }
    });
  });
}
async function loadSettings() {
  try {
    const res = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
    if (res && res.success && res.settings) {
      currentSettings = res.settings;
      populateForm(currentSettings);
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}
function populateForm(s) {
  const primaryProvider = document.getElementById("primary-provider");
  const fallback1 = document.getElementById("fallback-1");
  const fallback2 = document.getElementById("fallback-2");
  const customUrl = document.getElementById("custom-api-url");
  const customKey = document.getElementById("custom-api-key");
  const customModel = document.getElementById("custom-api-model");
  const fontSize = document.getElementById("font-size");
  const fontSizeVal = document.getElementById("font-size-val");
  const opacity = document.getElementById("opacity");
  const opacityVal = document.getElementById("opacity-val");
  const themeSelect = document.getElementById("theme-select");
  const showHud = document.getElementById("show-hud");
  if (primaryProvider) primaryProvider.value = s.provider;
  if (fallback1) fallback1.value = s.fallbackChain[0] || "none";
  if (fallback2) fallback2.value = s.fallbackChain[1] || "none";
  if (customUrl) customUrl.value = s.customApiUrl || "";
  if (customKey) customKey.value = s.customApiKey || "";
  if (customModel) customModel.value = s.customApiModel || "";
  if (fontSize) {
    fontSize.value = String(s.appearance.fontSize || 13);
    if (fontSizeVal) fontSizeVal.textContent = fontSize.value;
  }
  if (opacity) {
    opacity.value = String(Math.round((s.appearance.opacity || 0.95) * 100));
    if (opacityVal) opacityVal.textContent = opacity.value;
  }
  if (themeSelect) themeSelect.value = s.appearance.theme || "auto";
  if (showHud) showHud.checked = s.appearance.showFloatingHUD === true;
  renderSiteRules(s.siteSettings);
}
function renderSiteRules(siteSettings) {
  const container = document.getElementById("site-rules-container");
  if (!container) return;
  const entries = Object.entries(siteSettings);
  if (entries.length === 0) {
    container.innerHTML = `<p class="empty-text">No custom domain overrides. Translation is active across all supported sites.</p>`;
    return;
  }
  container.innerHTML = entries.map(
    ([domain, cfg]) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px;">
        <span style="font-weight: 600; font-size: 13px;">${domain}</span>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="color: ${cfg.enabled ? "#10b981" : "#ef4444"}; font-size: 12px; font-weight: 500;">${cfg.enabled ? "Enabled" : "Disabled"}</span>
          <button type="button" class="btn-remove-domain" data-domain="${domain}" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px;">✕</button>
        </div>
      </div>
    `
  ).join("");
  container.querySelectorAll(".btn-remove-domain").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const domain = e.currentTarget.getAttribute("data-domain");
      if (domain && currentSettings.siteSettings[domain]) {
        delete currentSettings.siteSettings[domain];
        renderSiteRules(currentSettings.siteSettings);
      }
    });
  });
}
function bindEvents() {
  const fontSize = document.getElementById("font-size");
  const fontSizeVal = document.getElementById("font-size-val");
  const opacity = document.getElementById("opacity");
  const opacityVal = document.getElementById("opacity-val");
  const btnSave = document.getElementById("btn-save");
  const saveStatus = document.getElementById("save-status");
  fontSize == null ? void 0 : fontSize.addEventListener("input", () => {
    if (fontSizeVal) fontSizeVal.textContent = fontSize.value;
  });
  opacity == null ? void 0 : opacity.addEventListener("input", () => {
    if (opacityVal) opacityVal.textContent = opacity.value;
  });
  btnSave == null ? void 0 : btnSave.addEventListener("click", async () => {
    if (!currentSettings) return;
    const primaryProvider = document.getElementById("primary-provider").value;
    const fallback1 = document.getElementById("fallback-1").value;
    const fallback2 = document.getElementById("fallback-2").value;
    const fallbackChain = [];
    if (fallback1 !== "none") fallbackChain.push(fallback1);
    if (fallback2 !== "none" && fallback2 !== fallback1) fallbackChain.push(fallback2);
    currentSettings.provider = primaryProvider;
    currentSettings.fallbackChain = fallbackChain;
    currentSettings.customApiUrl = document.getElementById("custom-api-url").value.trim();
    currentSettings.customApiKey = document.getElementById("custom-api-key").value.trim();
    currentSettings.customApiModel = document.getElementById("custom-api-model").value.trim();
    currentSettings.appearance.fontSize = Number(fontSize.value);
    currentSettings.appearance.opacity = Number(opacity.value) / 100;
    currentSettings.appearance.theme = document.getElementById("theme-select").value;
    currentSettings.appearance.showFloatingHUD = document.getElementById("show-hud").checked;
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SAVE_SETTINGS,
      settings: currentSettings
    });
    if (saveStatus) {
      saveStatus.textContent = "✓ Settings saved successfully!";
      setTimeout(() => {
        saveStatus.textContent = "";
      }, 3e3);
    }
  });
}
