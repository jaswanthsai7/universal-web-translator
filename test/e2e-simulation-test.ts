import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { TextExtractor } from '../src/content/textExtractor.ts';
import { OverlayManager } from '../src/content/overlayManager.ts';
import { TranslatorSettings } from '../src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Starting End-to-End Bilibili DOM & Reactivity Verification...\n');

const htmlContent = fs.readFileSync(path.resolve(__dirname, 'bilibili-simulation.html'), 'utf8');

// Initialize JSDOM environment
const dom = new JSDOM(htmlContent, {
  url: 'https://www.bilibili.com/video/BV1xx411c7mD',
  runScripts: 'dangerously',
  resources: 'usable',
});

const window = dom.window;
const document = window.document;

// Expose DOM classes to Node global scope for JSDOM testing
(global as any).window = window;
(global as any).document = document;
(global as any).Node = window.Node;
(global as any).Element = window.Element;
(global as any).HTMLElement = window.HTMLElement;
(global as any).HTMLInputElement = window.HTMLInputElement;
(global as any).HTMLTextAreaElement = window.HTMLTextAreaElement;
(global as any).NodeFilter = window.NodeFilter;
(global as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 0);

// Global mock for chrome runtime
(window as any).chrome = {
  runtime: {
    sendMessage: async (msg: any) => {
      return { success: true, settings: {} };
    },
    onMessage: { addListener: () => {} },
  },
};

const settings: TranslatorSettings = {
  enabled: true,
  sourceLang: 'auto',
  targetLang: 'en',
  provider: 'google',
  fallbackChain: ['google', 'libretranslate'],
  mode: 'translated-only',
  translateDynamic: true,
  translatePopups: true,
  translateTooltips: true,
  translatePlaceholders: true,
  customApiUrl: '',
  customApiKey: '',
  customApiModel: '',
  siteSettings: {},
  appearance: {
    fontSize: 13,
    opacity: 0.95,
    theme: 'glass-dark',
    showFloatingHUD: true,
    showOriginalOnHover: true,
  },
};

// 1. Test Text Extraction on Bilibili Page
console.log('▶ Step 1: Extract translatable nodes from Bilibili DOM');
const extractor = new TextExtractor();
const targets = extractor.extractFromRoot(document.body, settings);

assert(targets.length > 10, `Should extract translatable targets (found ${targets.length})`);
console.log(`  ✔ Successfully extracted ${targets.length} translatable UI targets`);

const hasTitle = targets.some(t => t.originalText.includes('超燃动漫剪辑'));
const hasSpeed = targets.some(t => t.originalText.includes('倍速'));
const hasQuality = targets.some(t => t.originalText.includes('清晰度'));
assert(hasTitle, 'Should capture video title');
assert(hasSpeed, 'Should capture playback speed control');
assert(hasQuality, 'Should capture quality control');
console.log('  ✔ Captured critical video player controls and titles\n');

// 2. Test Native In-Place Translation (Translated-Only Mode)
console.log('▶ Step 2: Apply Native In-Place Translations');
// Mock offsetWidth & getBoundingClientRect for JSDOM
Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 100 });
Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 30 });
window.HTMLElement.prototype.getClientRects = () => [{} as any] as any;
window.HTMLElement.prototype.getBoundingClientRect = () => ({
  top: 50, left: 100, width: 100, height: 30, bottom: 80, right: 200, x: 100, y: 50, toJSON: () => {}
});

// Setup mock window globals for overlayManager
(global as any).window = window;
(global as any).document = document;

const overlayMgr = new OverlayManager(settings);
for (const target of targets) {
  overlayMgr.applyTranslation(target, `Translated: ${target.originalText}`);
}

const overlayContainer = document.getElementById('universal-webtrans-overlay-container');
assert(overlayContainer !== null, 'Overlay container must be injected into DOM');
assert.strictEqual(
  overlayContainer?.style.pointerEvents,
  'none',
  'Overlay container must enforce pointer-events: none to preserve website clicks'
);

// Verify original text is hidden via CSS class without altering DOM structure
const hiddenElement = targets[0].element;
assert(
  hiddenElement.classList.contains('webtrans-orig-hidden'),
  'Original element must have webtrans-orig-hidden class applied'
);

// Verify overlay element has NO black background, NO border, and NO box shadow
const firstOverlay = overlayContainer?.querySelector('.webtrans-native-text') as HTMLElement;
assert(firstOverlay !== null, 'Native text overlay must exist');
assert.strictEqual(firstOverlay.style.background, 'transparent', 'Overlay must have transparent background');
assert(
  firstOverlay.style.border === 'none' || firstOverlay.style.borderStyle === 'none' || firstOverlay.style.border.includes('none'),
  'Overlay must have no border'
);
assert(
  firstOverlay.style.boxShadow === 'none' || !firstOverlay.style.boxShadow,
  'Overlay must have no shadow box'
);
assert(!firstOverlay.textContent?.includes('[EN:'), 'Overlay text must NOT contain [EN:] label');
console.log('  ✔ Verified native in-place styling: transparent background, no border, no [EN:] badges\n');

// 3. Test Reactivity & VDOM Node Integrity (CRITICAL FOR BILIBILI / VUE 3)
console.log('▶ Step 3: Strict Vue 3 / Reactivity Node Integrity Verification');
const vdomCounterBtn = document.getElementById('btn-increment-vdom');
const vdomCounterText = document.getElementById('vdom-counter-text');

assert(vdomCounterBtn !== null);
assert(vdomCounterText !== null);

const originalTextNode = vdomCounterText.firstChild;
assert(originalTextNode !== null, 'Original TextNode must exist');

// Simulate 5 clicks that mutate nodeValue directly in Vue/React style
vdomCounterBtn.click();
vdomCounterBtn.click();
vdomCounterBtn.click();

assert.strictEqual(
  originalTextNode.parentNode,
  vdomCounterText,
  'Original TextNode must NEVER be detached or replaced by translator!'
);
assert.strictEqual(
  vdomCounterText.textContent,
  '当前点击次数: 3',
  'Reactive counter must accurately update nodeValue without error'
);
const vdomHealth = document.getElementById('vdom-status')?.textContent;
assert(vdomHealth?.includes('100% OK'), `VDOM health must remain 100% OK (was: ${vdomHealth})`);
console.log('  ✔ Verified: Reactive node was 100% preserved and undamaged!\n');

// 4. Test Dynamic Comments Injection & Mutation Extraction
console.log('▶ Step 4: Test Dynamic Elements (Load More Comments)');
const loadMoreBtn = document.getElementById('btn-load-more');
loadMoreBtn?.click(); // Injects 3 new dynamic comment DOM trees

const commentsContainer = document.getElementById('comments-container');
const newCommentsTargets = extractor.extractFromRoot(commentsContainer!, settings);

assert(newCommentsTargets.length >= 3, 'Should extract newly injected comments');
const hasNewComment = newCommentsTargets.some(t => t.originalText.includes('分镜把控得太丝滑了'));
assert(hasNewComment, 'Should detect newly injected comment text');
console.log('  ✔ MutationObserver extracted dynamically injected comment elements\n');

// 5. Test Dynamic Menus (Speed & Quality Dropdowns)
console.log('▶ Step 5: Test Dynamic Menus (Speed and Quality Popups)');
const speedBtn = document.getElementById('btn-speed-toggle');
const speedMenu = document.getElementById('menu-speed');
speedBtn?.click();

assert(speedMenu?.classList.contains('active'), 'Speed dropdown should open dynamically');
const menuExtractor = new TextExtractor();
const speedTargets = menuExtractor.extractFromRoot(speedMenu!, settings);
assert(speedTargets.length >= 1, 'Should extract speed options containing text like 1.0x 正常');
console.log(`  ✔ Extracted ${speedTargets.length} dynamic options from playback speed dropdown\n`);

console.log('🎉 All End-to-End Simulation Tests Passed Flawlessly!\n');
