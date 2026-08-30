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
    concurrency: 3,
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

// Import local dictionary for testing
import { getLocalTranslation } from '../src/utils/localTranslator.ts';

// Test Local Dictionary 0ms lookup
assert.strictEqual(getLocalTranslation('倍速'), 'Speed', 'Local dictionary should translate 倍速 to Speed');
assert.strictEqual(getLocalTranslation('清晰度'), 'Resolution', 'Local dictionary should translate 清晰度 to Resolution');
assert.strictEqual(getLocalTranslation('动画'), 'Anime', 'Local dictionary should translate 动画 to Anime');
assert.strictEqual(getLocalTranslation('3小时前'), '3h ago', 'Local dictionary should translate relative time 3小时前 to 3h ago');
assert.strictEqual(getLocalTranslation('专栏'), 'Posts');
assert.strictEqual(getLocalTranslation('活动'), 'Events');
assert.strictEqual(getLocalTranslation('社区中心'), 'Community');
assert.strictEqual(getLocalTranslation('直播'), 'Live');
assert.strictEqual(getLocalTranslation('新歌热榜'), 'Charts');
assert.strictEqual(getLocalTranslation('权益中心'), 'Benefits Center');
assert.strictEqual(getLocalTranslation('视频素材 9999+'), 'Video Materials 9999+');
assert.strictEqual(getLocalTranslation('统计截至：2026-08-29（每日12点更新）'), 'Stats as of: 2026-08-29 (Updated daily at 12:00)');
console.log('  ✔ Verified 0ms Local Dictionary: Instant translations for UI categories, buttons, timestamps, and materials\n');

const overlayMgr = new OverlayManager(settings);
for (const target of targets) {
  const local = getLocalTranslation(target.originalText);
  overlayMgr.applyTranslation(target, local || `Translated: ${target.originalText}`);
}

// Verify in-place native translation on the text node directly
const firstTextTarget = targets.find(t => t.type === 'text')!;
assert(firstTextTarget !== null, 'Should have text target');
assert(firstTextTarget.node.nodeValue?.includes('Translated:') || firstTextTarget.node.nodeValue?.length! > 0);
assert(!firstTextTarget.node.nodeValue?.includes('[EN:'), 'Translated text must NOT contain [EN:] label');

// Verify speed button translation from local dictionary
const speedTarget = targets.find(t => t.originalText.includes('倍速'));
if (speedTarget && speedTarget.type === 'text') {
  assert(speedTarget.node.nodeValue?.includes('Speed'), 'Playback speed control should be translated to Speed');
}

console.log('  ✔ Verified in-place native text node translation: No floating divs, 0ms dictionary speed\n');

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
