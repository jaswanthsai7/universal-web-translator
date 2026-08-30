# 📺 BiliBili English (Manifest V3)

> **Fast, Native In-Place Translation Extension for Bilibili and Modern SPAs (React & Vue 3)**

**BiliBili English** is a modern, high-performance browser extension that translates Bilibili directly in place without breaking page layout, video playback, Vue/React reactivity, or user interactions.

---

## ✨ Key Highlights & Features

### 1. ⚡ Native In-Place DOM Translation (`node.nodeValue`)
* **Zero Floating Coordinate Drift**: Unlike older overlay-based translators where translated text floats in detached boxes and drifts into the air during scrolling, BiliBili English modifies text directly inside existing DOM Text Nodes.
* **100% React & Vue 3 Safe**: Preserves exact DOM node references and whitespace boundaries. Virtual DOM reconciliation never crashes (`removeChild` / `insertBefore` errors are completely eliminated).
* **Full Interactivity Preserved**: Native buttons, video scrubbing controls, player menus, hover states, and input fields remain fully functional.

### 2. 🚀 Instant 0ms Local Dictionary (980+ Terms)
* **Zero-Latency UI Localization**: Includes an embedded dictionary of 980+ curated Bilibili-specific terms. Interface categories (`专栏` ➔ **Posts**, `活动` ➔ **Events**, `社区中心` ➔ **Community**, `直播` ➔ **Live**, `课堂` ➔ **Classes**, `新歌热榜` ➔ **Charts**) translate in **0 milliseconds** synchronously before the first paint.
* **Smart Metrics & Time Formatters**:
  * View counts: `12.5万次播放` ➔ **125K views**
  * Danmaku counts: `1053条弹幕` ➔ **1,053 danmaku**
  * Relative timestamps: `3小时前` ➔ **3h ago**, `刚刚` ➔ **Just now**
  * Material counters: `视频素材 9999+` ➔ **Video Materials 9999+**

### 3. 🛡️ Hydration-Resistant Mutation Engine
* **Survives Client-Side Framework Hydration**: When Bilibili's Vue 3 hydration script loads asynchronously and attempts to reset text nodes back to original Chinese, the dynamic `MutationObserver` detects the change and re-applies the translation in 0ms.
* **Infinite-Scroll & Live Comments**: Translates new video cards, comment replies, and dynamic popovers as you scroll down the page.

### 4. 🔍 Dynamic Search Bar Recommendations
* **Real-time Placeholder Synchronization**: Watches Bilibili's search input for dynamic recommendation rotations (e.g. `蜘蛛侠之崭新之日` ➔ *Spider-Man: Brand New Day*) and synchronizes translated text across `.placeholder`, `setAttribute('placeholder')`, and `title`.

### 5. 🤖 Multi-Engine Support with Automatic Fallback Chain
* **Supported Providers**:
  * **Google Web (Free / Instant)**: High-speed, public client RPC.
  * **LibreTranslate**: Open-source, self-hostable translation.
  * **MyMemory**: Public crowd-sourced translation API.
  * **Custom AI / Local LLM**: Compatible with any OpenAI-style endpoint (Ollama, OpenAI, Groq, DeepSeek, LocalAI).
* **Automatic Fallback Chain**: If the primary provider encounters a rate limit or timeout, the next fallback engine takes over seamlessly.

### 6. 🎨 System-Adaptive Design & Clean UI
* **Auto Light / Dark Theme**: Automatically matches your operating system or browser theme, with a 1-click manual theme toggle (`🌓` / `☀️` / `🌙`).
* **Sleek Custom Dropdowns**: Floating popover cards with smooth transitions and checkmarks (`✓`) replace clunky native OS select menus.
* **Snug, Proportionate Layout**: Form-fitted interface with default-expanded advanced controls and a dedicated centered Settings page (`options.html`).
* **3 Translation Modes**:
  * **✨ Translated-Only**: Clean native English replacement.
  * **📝 Bilingual**: Original Chinese + adjacent English badge.
  * **🔍 Hover**: Reveals original Chinese text on mouse hover.

---

## 🔒 Privacy Policy & Data Handling

Your privacy is a fundamental core principle of **BiliBili English**.

### 1. Zero Tracking & Zero Telemetry
* We **do NOT** collect, store, track, or transmit your browsing history, visited URLs, search queries, video watch habits, personal information, or device fingerprints.
* The extension contains **no analytics SDKs** (no Google Analytics, no Mixpanel, no telemetry beacons).

### 2. Strictly Local Execution
* All dictionary matches, relative time formatters, DOM parsing, and UI state management run **100% locally on your device**.
* Translation caches are stored exclusively in your browser's private local storage (`chrome.storage.local`) and never leave your computer.

### 3. API Key & Credential Safety
* If you configure a custom AI or LLM endpoint (such as OpenAI, Groq, or DeepSeek), your API key is encrypted and stored strictly within your browser's sandboxed extension storage.
* Your API keys are **never** shared, proxy-routed, or transmitted to any middleman server. All AI requests go directly from your browser to your specified endpoint.

### 4. Third-Party Translation Providers
* When translating dynamic video titles or user comments that are not in the local dictionary, text strings are sent directly to your chosen translation engine (e.g. Google Web, LibreTranslate, or your custom AI provider) solely to generate the translated text.
* No personal account credentials, cookies, or Bilibili session tokens are ever attached to translation requests.

### 5. Minimal Permissions
* `storage`: Required to save user preferences (selected language, theme, engine) and local translation cache.
* `tabs`: Required only to identify the active hostname for site-specific enable/disable toggling.

---

## 📦 Installation & Setup

### Prerequisites
* [Node.js](https://nodejs.org/) (version 18 or higher)
* [npm](https://www.npmjs.com/)

### Build from Source
```bash
# Clone or navigate to the extension repository
cd scratch/universal-web-translator

# Install dependencies
npm install

# Build production bundle
npm run build
```

### Load Extension in Chrome / Edge / Brave
1. Open your browser and go to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the project directory (`universal-web-translator`).
5. Pin **BiliBili English** to your toolbar and visit [bilibili.com](https://www.bilibili.com)!

---

## 🧪 Testing & Verification

Run the automated test suite and end-to-end DOM simulation tests:

```bash
npm test
```

* Tests cover DOM in-place replacement, text extraction, Vue 3 mutation simulation, dynamic playback speed menus, and local dictionary accuracy.

---

## 📄 License

MIT License. Designed with visual excellence and performance in mind.
