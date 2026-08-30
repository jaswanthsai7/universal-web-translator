var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const MESSAGE_TYPES = {
  TRANSLATE_BATCH: "TRANSLATE_BATCH",
  GET_SETTINGS: "GET_SETTINGS",
  SAVE_SETTINGS: "SAVE_SETTINGS",
  CLEAR_CACHE: "CLEAR_CACHE",
  GET_CACHE_STATS: "GET_CACHE_STATS",
  SETTINGS_CHANGED: "SETTINGS_CHANGED"
};
const PREFIX = "[UniversalTranslator]";
const logger = {
  debug: (...args) => {
    if (typeof window !== "undefined" && window.__WEBTRANS_DEBUG__) {
      console.debug(PREFIX, ...args);
    }
  },
  info: (...args) => {
    console.info(PREFIX, ...args);
  },
  warn: (...args) => {
    console.warn(PREFIX, ...args);
  },
  error: (...args) => {
    console.error(PREFIX, ...args);
  }
};
class BaseProvider {
  async fetchWithTimeout(url, options, timeoutMs = 8e3) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return res;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  /**
   * Helper to execute tasks with limited concurrency
   */
  async mapConcurrent(items, concurrency, fn) {
    const results = new Array(items.length);
    let index = 0;
    const worker = async () => {
      while (index < items.length) {
        const currentIndex = index++;
        try {
          results[currentIndex] = await fn(items[currentIndex], currentIndex);
        } catch (err) {
          logger.error(`Error processing item ${currentIndex}:`, err);
          throw err;
        }
      }
    };
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker()
    );
    await Promise.all(workers);
    return results;
  }
}
class GoogleWebProvider extends BaseProvider {
  constructor() {
    super(...arguments);
    __publicField(this, "id", "google");
    __publicField(this, "name", "Google Web (Free)");
    __publicField(this, "supportsAutoDetect", true);
  }
  async translate(texts, sourceLanguage, targetLanguage) {
    if (texts.length === 0) return [];
    const sl = sourceLanguage === "auto" ? "auto" : sourceLanguage;
    const tl = targetLanguage;
    if (texts.length === 1) {
      const single = await this.translateSingle(texts[0], sl, tl);
      return [single];
    }
    try {
      const combinedText = texts.join("\n");
      if (combinedText.length < 2e3) {
        const translatedCombined = await this.translateViaClients5(combinedText, sl, tl);
        const split = translatedCombined.split("\n");
        if (split.length === texts.length) {
          return split.map((t) => t.trim());
        }
      }
    } catch (batchErr) {
      logger.warn("GoogleWebProvider batch newline translate failed, trying concurrent:", batchErr);
    }
    return this.mapConcurrent(texts, 4, async (text) => {
      return this.translateSingle(text, sl, tl);
    });
  }
  async translateSingle(text, sl, tl) {
    if (!text.trim()) return text;
    try {
      return await this.translateViaClients5(text, sl, tl);
    } catch (err) {
      logger.debug("clients5 endpoint failed, trying gtx fallback:", err);
    }
    return this.translateViaGtx(text, sl, tl);
  }
  async translateViaClients5(text, sl, tl) {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(
      sl
    )}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
    const res = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    }, 6e3);
    if (!res.ok) {
      throw new Error(`clients5 returned status ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === "string") {
      return data[0][0];
    }
    if (Array.isArray(data) && typeof data[0] === "string") {
      return data[0];
    }
    throw new Error("Unexpected response format from clients5 Google Translate API");
  }
  async translateViaGtx(text, sl, tl) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sl
    )}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    }, 6e3);
    if (!res.ok) {
      throw new Error(`gtx returned status ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error("Unexpected response format from gtx Google Translate API");
    }
    const translatedParts = data[0].map((part) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join("");
    return translatedParts || text;
  }
}
class LibreTranslateProvider extends BaseProvider {
  constructor(endpoint = "https://libretranslate.de", apiKey) {
    super();
    __publicField(this, "id", "libretranslate");
    __publicField(this, "name", "LibreTranslate (Open Source)");
    __publicField(this, "supportsAutoDetect", true);
    __publicField(this, "endpoint");
    __publicField(this, "apiKey");
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }
  setEndpoint(endpoint, apiKey) {
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }
  async translate(texts, sourceLanguage, targetLanguage) {
    if (texts.length === 0) return [];
    const sl = sourceLanguage === "auto" ? "auto" : sourceLanguage;
    const tl = targetLanguage;
    try {
      const url = `${this.endpoint}/translate`;
      const body = {
        q: texts,
        source: sl,
        target: tl,
        format: "text"
      };
      if (this.apiKey) {
        body.api_key = this.apiKey;
      }
      const res = await this.fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(body)
      }, 9e3);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.translatedText)) {
          return data.translatedText;
        } else if (typeof data.translatedText === "string" && texts.length === 1) {
          return [data.translatedText];
        }
      }
    } catch (batchErr) {
      logger.warn("LibreTranslate batch request failed, falling back to single:", batchErr);
    }
    return this.mapConcurrent(texts, 3, async (text) => {
      const body = {
        q: text,
        source: sl,
        target: tl,
        format: "text"
      };
      if (this.apiKey) {
        body.api_key = this.apiKey;
      }
      const res = await this.fetchWithTimeout(`${this.endpoint}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }, 7e3);
      if (!res.ok) {
        throw new Error(`LibreTranslate error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return typeof data.translatedText === "string" ? data.translatedText : text;
    });
  }
}
class MyMemoryProvider extends BaseProvider {
  constructor() {
    super(...arguments);
    __publicField(this, "id", "mymemory");
    __publicField(this, "name", "MyMemory (Free Public)");
    __publicField(this, "supportsAutoDetect", false);
  }
  async translate(texts, sourceLanguage, targetLanguage) {
    if (texts.length === 0) return [];
    const sl = sourceLanguage === "auto" ? "zh" : sourceLanguage;
    const tl = targetLanguage;
    return this.mapConcurrent(texts, 3, async (text) => {
      var _a;
      if (!text.trim()) return text;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        text
      )}&langpair=${encodeURIComponent(sl)}|${encodeURIComponent(tl)}`;
      const res = await this.fetchWithTimeout(url, {
        method: "GET",
        headers: { "Accept": "application/json" }
      }, 7e3);
      if (!res.ok) {
        throw new Error(`MyMemory error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.responseStatus !== 200 && data.responseStatus !== "200") {
        throw new Error(`MyMemory returned error: ${data.responseDetails || data.responseStatus}`);
      }
      return ((_a = data.responseData) == null ? void 0 : _a.translatedText) || text;
    });
  }
}
class CustomAPIProvider extends BaseProvider {
  constructor(endpoint = "https://api.openai.com/v1/chat/completions", apiKey = "", model = "gpt-4o-mini") {
    super();
    __publicField(this, "id", "custom");
    __publicField(this, "name", "Custom AI / OpenAI / Ollama API");
    __publicField(this, "supportsAutoDetect", true);
    __publicField(this, "endpoint");
    __publicField(this, "apiKey");
    __publicField(this, "model");
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model || "gpt-4o-mini";
  }
  updateConfig(endpoint, apiKey, model) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
  }
  async translate(texts, sourceLanguage, targetLanguage) {
    var _a, _b, _c, _d;
    if (texts.length === 0) return [];
    if (!this.endpoint) {
      throw new Error("Custom API endpoint is not configured");
    }
    const sl = sourceLanguage === "auto" ? "the source language" : sourceLanguage;
    const tl = targetLanguage;
    const systemPrompt = `You are a high-speed, accurate translator for dynamic websites and web UIs. Translate the following JSON array of strings from ${sl} to ${tl}.
RULES:
1. Preserve UI shortcuts, formatting, and variables.
2. Return ONLY a valid JSON array of strings matching the exact length and order of the input array.
3. Do NOT wrap in markdown code blocks like \`\`\`json. Output raw JSON array only.`;
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    const payload = {
      model: this.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(texts) }
      ],
      temperature: 0.2
    };
    const res = await this.fetchWithTimeout(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }, 15e3);
    if (!res.ok) {
      throw new Error(`Custom API returned ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    const rawContent = ((_d = (_c = (_b = (_a = data.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) == null ? void 0 : _d.trim()) || "";
    try {
      const cleanJson = rawContent.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length === texts.length) {
        return parsed.map((item) => String(item));
      }
    } catch (parseErr) {
      logger.warn("Failed to parse JSON response from Custom AI API:", rawContent);
    }
    return texts;
  }
}
class ProviderManager {
  constructor() {
    __publicField(this, "providers", /* @__PURE__ */ new Map());
    __publicField(this, "activeProviderId", "google");
    __publicField(this, "fallbackChain", ["google", "mymemory", "libretranslate"]);
    this.registerProvider(new GoogleWebProvider());
    this.registerProvider(new LibreTranslateProvider());
    this.registerProvider(new MyMemoryProvider());
    this.registerProvider(new CustomAPIProvider());
  }
  registerProvider(provider) {
    this.providers.set(provider.id, provider);
  }
  getProvider(id) {
    return this.providers.get(id);
  }
  updateFromSettings(settings) {
    if (settings.provider) {
      this.activeProviderId = settings.provider;
    }
    if (settings.fallbackChain) {
      this.fallbackChain = settings.fallbackChain;
    }
    const customProv = this.providers.get("custom");
    if (customProv && (settings.customApiUrl || settings.customApiKey || settings.customApiModel)) {
      customProv.updateConfig(
        settings.customApiUrl || "",
        settings.customApiKey || "",
        settings.customApiModel || "gpt-4o-mini"
      );
    }
  }
  /**
   * Translates an array of texts with automatic fallback to secondary providers
   */
  async translateWithFallback(texts, sourceLanguage, targetLanguage, preferredProvider) {
    if (texts.length === 0) {
      return { translations: [], providerUsed: this.activeProviderId };
    }
    const primaryId = preferredProvider || this.activeProviderId;
    const chain = [
      primaryId,
      ...this.fallbackChain.filter((id) => id !== primaryId)
    ];
    let lastError = null;
    for (const providerId of chain) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;
      try {
        logger.info(`Attempting translation with provider: ${provider.name} (${texts.length} texts)`);
        const translations = await provider.translate(texts, sourceLanguage, targetLanguage);
        if (translations && translations.length === texts.length) {
          return { translations, providerUsed: providerId };
        }
      } catch (err) {
        lastError = err;
        logger.warn(`Provider ${providerId} failed:`, err.message || err);
      }
    }
    logger.error("All translation providers failed in fallback chain. Preserving original texts.", lastError);
    return { translations: [...texts], providerUsed: primaryId };
  }
}
function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function createCacheKey(sourceText, sourceLang, targetLang, provider) {
  const cleanText = sourceText.trim();
  return `${provider}:${sourceLang}:${targetLang}:${hashString(cleanText)}`;
}
class TranslationCache {
  constructor() {
    __publicField(this, "memoryCache", /* @__PURE__ */ new Map());
    __publicField(this, "hitCount", 0);
    __publicField(this, "missCount", 0);
    __publicField(this, "MAX_MEMORY_ITEMS", 15e3);
    __publicField(this, "MAX_STORAGE_ITEMS", 3e4);
    __publicField(this, "TTL_MS", 7 * 24 * 60 * 60 * 1e3);
    // 7 days
    __publicField(this, "pendingStorageWrites", /* @__PURE__ */ new Map());
    __publicField(this, "storageWriteTimer", null);
    this.initFromStorage();
  }
  async initFromStorage() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      try {
        const data = await chrome.storage.local.get(["webtrans_cache"]);
        if (data.webtrans_cache && typeof data.webtrans_cache === "object") {
          const now = Date.now();
          for (const [k, v] of Object.entries(data.webtrans_cache)) {
            const item = v;
            if (item && item.t && now - (item.ts || 0) < this.TTL_MS) {
              this.memoryCache.set(k, item.t);
            }
          }
          logger.info(`Loaded ${this.memoryCache.size} translation cache entries from persistent storage`);
        }
      } catch (err) {
        logger.warn("Failed to load cache from chrome.storage.local:", err);
      }
    }
  }
  get(sourceText, sourceLang, targetLang, provider) {
    const key = createCacheKey(sourceText, sourceLang, targetLang, provider);
    const hit = this.memoryCache.get(key);
    if (hit !== void 0) {
      this.hitCount++;
      return hit;
    }
    this.missCount++;
    return void 0;
  }
  /**
   * Batch lookup for multiple texts
   * Returns array of results: string if hit, undefined if cache miss
   */
  getMany(texts, sourceLang, targetLang, provider) {
    return texts.map((text) => this.get(text, sourceLang, targetLang, provider));
  }
  set(sourceText, sourceLang, targetLang, provider, translatedText) {
    const key = createCacheKey(sourceText, sourceLang, targetLang, provider);
    if (this.memoryCache.size >= this.MAX_MEMORY_ITEMS) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, translatedText);
    this.pendingStorageWrites.set(key, {
      t: translatedText,
      ts: Date.now()
    });
    this.scheduleStorageFlush();
  }
  setMany(texts, translations, sourceLang, targetLang, provider) {
    for (let i = 0; i < texts.length; i++) {
      if (translations[i]) {
        this.set(texts[i], sourceLang, targetLang, provider, translations[i]);
      }
    }
  }
  scheduleStorageFlush() {
    if (this.storageWriteTimer) return;
    this.storageWriteTimer = setTimeout(() => {
      this.flushToStorage();
      this.storageWriteTimer = null;
    }, 2e3);
  }
  async flushToStorage() {
    var _a;
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    if (this.pendingStorageWrites.size === 0) return;
    try {
      const existing = ((_a = await chrome.storage.local.get(["webtrans_cache"])) == null ? void 0 : _a.webtrans_cache) || {};
      for (const [k, v] of this.pendingStorageWrites.entries()) {
        existing[k] = v;
      }
      this.pendingStorageWrites.clear();
      const keys = Object.keys(existing);
      if (keys.length > this.MAX_STORAGE_ITEMS) {
        keys.sort((a, b) => existing[a].ts - existing[b].ts);
        const toRemove = keys.slice(0, keys.length - this.MAX_STORAGE_ITEMS);
        for (const rk of toRemove) {
          delete existing[rk];
        }
      }
      await chrome.storage.local.set({ webtrans_cache: existing });
      logger.debug(`Flushed translation cache to storage. Total items: ${Object.keys(existing).length}`);
    } catch (err) {
      logger.warn("Failed to flush translation cache to chrome.storage.local:", err);
    }
  }
  async clear() {
    this.memoryCache.clear();
    this.pendingStorageWrites.clear();
    this.hitCount = 0;
    this.missCount = 0;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      try {
        await chrome.storage.local.remove(["webtrans_cache"]);
      } catch (err) {
        logger.warn("Failed to clear storage cache:", err);
      }
    }
    logger.info("Translation cache completely cleared");
  }
  getStats() {
    return {
      inMemoryCount: this.memoryCache.size,
      persistentCount: this.memoryCache.size,
      hitCount: this.hitCount,
      missCount: this.missCount
    };
  }
}
const DEFAULT_SETTINGS = {
  enabled: true,
  sourceLang: "auto",
  targetLang: "en",
  provider: "google",
  fallbackChain: ["google", "libretranslate", "mymemory"],
  mode: "translated-only",
  translateDynamic: true,
  translatePopups: true,
  translateTooltips: true,
  translatePlaceholders: true,
  customApiUrl: "https://api.openai.com/v1/chat/completions",
  customApiKey: "",
  customApiModel: "gpt-4o-mini",
  siteSettings: {},
  appearance: {
    fontSize: 13,
    opacity: 0.95,
    theme: "glass-dark",
    showFloatingHUD: false,
    showOriginalOnHover: true,
    concurrency: 3
  }
};
class BackgroundService {
  constructor() {
    __publicField(this, "providerManager");
    __publicField(this, "cache");
    __publicField(this, "settings", { ...DEFAULT_SETTINGS });
    this.providerManager = new ProviderManager();
    this.cache = new TranslationCache();
    this.initSettings();
    this.setupMessageListeners();
  }
  async initSettings() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get(["webtrans_settings"]);
        if (stored.webtrans_settings) {
          this.settings = { ...DEFAULT_SETTINGS, ...stored.webtrans_settings };
          this.providerManager.updateFromSettings(this.settings);
        }
      }
    } catch (err) {
      logger.warn("Failed to load settings from storage:", err);
    }
  }
  setupMessageListeners() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      this.handleMessage(message).then((response) => sendResponse(response)).catch((err) => {
        logger.error("Message handler error:", err);
        sendResponse({ success: false, error: err.message || String(err) });
      });
      return true;
    });
  }
  async handleMessage(message) {
    if (!message || !message.type) return { success: false, error: "Invalid message" };
    switch (message.type) {
      case MESSAGE_TYPES.TRANSLATE_BATCH:
        return this.handleTranslateBatch(message);
      case MESSAGE_TYPES.GET_SETTINGS:
        return { success: true, settings: this.settings };
      case MESSAGE_TYPES.SAVE_SETTINGS:
        if (message.settings) {
          this.settings = { ...this.settings, ...message.settings };
          this.providerManager.updateFromSettings(this.settings);
          if (chrome.storage && chrome.storage.local) {
            await chrome.storage.local.set({ webtrans_settings: this.settings });
          }
          this.broadcastSettingsUpdate();
          return { success: true, settings: this.settings };
        }
        return { success: false, error: "No settings provided" };
      case MESSAGE_TYPES.CLEAR_CACHE:
        await this.cache.clear();
        return { success: true };
      case MESSAGE_TYPES.GET_CACHE_STATS:
        return { success: true, stats: this.cache.getStats() };
      default:
        return { success: false, error: `Unknown message type: ${message.type}` };
    }
  }
  async handleTranslateBatch(req) {
    const { texts, sourceLang, targetLang, providerOverride } = req;
    if (!texts || texts.length === 0) {
      return { success: true, translations: [] };
    }
    const providerId = providerOverride || this.settings.provider;
    const finalTranslations = new Array(texts.length);
    const missIndices = [];
    const missTexts = [];
    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(texts[i], sourceLang, targetLang, providerId);
      if (cached !== void 0) {
        finalTranslations[i] = cached;
      } else {
        missIndices.push(i);
        missTexts.push(texts[i]);
      }
    }
    if (missTexts.length === 0) {
      return {
        success: true,
        translations: finalTranslations,
        providerUsed: `${providerId} (Cached)`
      };
    }
    const uniqueMissMap = /* @__PURE__ */ new Map();
    for (let j = 0; j < missTexts.length; j++) {
      const txt = missTexts[j];
      const list = uniqueMissMap.get(txt) || [];
      list.push(j);
      uniqueMissMap.set(txt, list);
    }
    const uniqueTextsToTranslate = Array.from(uniqueMissMap.keys());
    try {
      const { translations: freshTranslations, providerUsed } = await this.providerManager.translateWithFallback(
        uniqueTextsToTranslate,
        sourceLang,
        targetLang,
        providerId
      );
      for (let k = 0; k < uniqueTextsToTranslate.length; k++) {
        const orig = uniqueTextsToTranslate[k];
        const trans = freshTranslations[k] || orig;
        this.cache.set(orig, sourceLang, targetLang, providerUsed, trans);
        const occurrences = uniqueMissMap.get(orig) || [];
        for (const occ of occurrences) {
          const originalBatchIndex = missIndices[occ];
          finalTranslations[originalBatchIndex] = trans;
        }
      }
      return {
        success: true,
        translations: finalTranslations,
        providerUsed
      };
    } catch (err) {
      logger.error("Failed to translate batch:", err);
      for (const idx of missIndices) {
        finalTranslations[idx] = texts[idx];
      }
      return {
        success: false,
        translations: finalTranslations,
        error: err.message || "Translation failed"
      };
    }
  }
  broadcastSettingsUpdate() {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: MESSAGE_TYPES.SETTINGS_CHANGED,
              settings: this.settings
            }).catch(() => {
            });
          }
        }
      });
    }
  }
}
new BackgroundService();
