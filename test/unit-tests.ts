import assert from 'assert';
import { hashString, createCacheKey } from '../src/utils/hash.ts';
import { isTranslatableString, isIgnoredElement, isEditableOrActiveInput } from '../src/utils/dom.ts';
import { JSDOM } from 'jsdom';
import { TranslationCache } from '../src/cache/TranslationCache.ts';
import { ProviderManager } from '../src/providers/ProviderManager.ts';
import { BaseProvider } from '../src/providers/BaseProvider.ts';
import { ProviderType } from '../src/types/index.ts';

console.log('🧪 Starting Universal Webpage Translator Unit Tests...\n');

// 1. Hash and Cache Key Test
console.log('▶ Test 1: Hash & Cache Key Generation');
const hash1 = hashString('哔哩哔哩 (゜-゜)つロ 干杯~-bilibili');
const hash2 = hashString('哔哩哔哩 (゜-゜)つロ 干杯~-bilibili');
const hash3 = hashString('播放速度');
assert.strictEqual(hash1, hash2, 'Hash must be deterministic');
assert.notStrictEqual(hash1, hash3, 'Different strings must produce different hashes');

const key1 = createCacheKey('播放速度', 'zh', 'en', 'google');
const key2 = createCacheKey('  播放速度  ', 'zh', 'en', 'google');
assert.strictEqual(key1, key2, 'Whitespace trimming should produce identical cache keys');
console.log('  ✔ Passed: Hash & Cache Keys are deterministic and normalized\n');

// 2. Translatable String Filtering
console.log('▶ Test 2: Text Extraction Filtering (Non-translatable detection)');
assert.strictEqual(isTranslatableString('1080P'), false, 'Should ignore pure resolution numbers');
assert.strictEqual(isTranslatableString('12:45:00'), false, 'Should ignore timestamps');
assert.strictEqual(isTranslatableString('https://www.bilibili.com/video/BV1xx'), false, 'Should ignore URLs');
assert.strictEqual(isTranslatableString('>>> === <<<'), false, 'Should ignore pure symbols');
assert.strictEqual(isTranslatableString('4K 60FPS'), false, 'Should ignore specs/numbers');

assert.strictEqual(isTranslatableString('点赞'), true, 'Should accept Chinese text');
assert.strictEqual(isTranslatableString('倍速播放'), true, 'Should accept Chinese text');
assert.strictEqual(isTranslatableString('チャンネル登録'), true, 'Should accept Japanese text');
assert.strictEqual(isTranslatableString('Subscribe to channel'), true, 'Should accept English text');

// Target language-aware filtering
assert.strictEqual(isTranslatableString('Ready when you are', 'en', 'auto'), false, 'Should ignore English when target is English');
assert.strictEqual(isTranslatableString('fbfd', 'en', 'auto'), false, 'Should ignore English typing when target is English');
assert.strictEqual(isTranslatableString('点赞', 'en', 'auto'), true, 'Should accept Chinese when target is English');
assert.strictEqual(isTranslatableString('超燃动漫剪辑', 'en', 'zh'), true, 'Should accept Chinese when source is zh');
console.log('  ✔ Passed: Correctly filters noise, URLs, code, numbers, and target-identical English text\n');

// 3. Two-Tier Cache Operations
console.log('▶ Test 3: Two-Tier Cache Operations');
const cache = new TranslationCache();
cache.set('倍速', 'zh', 'en', 'google', 'Speed');
cache.set('关注', 'zh', 'en', 'google', 'Follow');

const hit1 = cache.get('倍速', 'zh', 'en', 'google');
const hit2 = cache.get('关注', 'zh', 'en', 'google');
const miss1 = cache.get('未翻译内容', 'zh', 'en', 'google');

assert.strictEqual(hit1, 'Speed', 'Cache hit should return stored translation');
assert.strictEqual(hit2, 'Follow', 'Cache hit should return stored translation');
assert.strictEqual(miss1, undefined, 'Cache miss should return undefined');

const batchResults = cache.getMany(['倍速', '未翻译内容', '关注'], 'zh', 'en', 'google');
assert.deepStrictEqual(batchResults, ['Speed', undefined, 'Follow'], 'getMany should return array with hits and misses');

const stats = cache.getStats();
assert.strictEqual(stats.hitCount, 4);
assert.strictEqual(stats.missCount, 2);
console.log('  ✔ Passed: Cache operations and hit/miss metrics are accurate\n');

// 4. Provider Fallback Chain Testing
console.log('▶ Test 4: Provider Manager and Fallback Chain');
class MockFailingProvider extends BaseProvider {
  readonly id: ProviderType = 'google';
  readonly name = 'Mock Failing Provider';
  readonly supportsAutoDetect = true;
  async translate(): Promise<string[]> {
    throw new Error('Rate limit exceeded (HTTP 429)');
  }
}

class MockHealthyProvider extends BaseProvider {
  readonly id: ProviderType = 'libretranslate';
  readonly name = 'Mock Healthy Provider';
  readonly supportsAutoDetect = true;
  async translate(texts: string[]): Promise<string[]> {
    return texts.map(t => `[Translated: ${t}]`);
  }
}

const manager = new ProviderManager();
manager.registerProvider(new MockFailingProvider());
manager.registerProvider(new MockHealthyProvider());
manager.updateFromSettings({
  provider: 'google',
  fallbackChain: ['google', 'libretranslate'],
});

const fallbackResult = await manager.translateWithFallback(
  ['弹幕设置', '清晰度'],
  'zh',
  'en',
  'google'
);

assert.strictEqual(fallbackResult.providerUsed, 'libretranslate', 'Should fall back to LibreTranslate when primary fails');
assert.deepStrictEqual(
  fallbackResult.translations,
  ['[Translated: 弹幕设置]', '[Translated: 清晰度]'],
  'Fallback provider should successfully translate texts'
);
console.log('  ✔ Passed: Automatic fallback chain rescues failed primary requests\n');

// 5. Editable & Chat Box Input Isolation Test
console.log('▶ Test 5: Chat Box & Editable Element Protection');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const testDoc = dom.window.document;
(global as any).document = testDoc;
(global as any).Node = dom.window.Node;

// Rich text chat box (Gemini / ProseMirror / Quill style)
const richTextarea = testDoc.createElement('rich-textarea');
const qlEditor = testDoc.createElement('div');
qlEditor.className = 'ql-editor';
qlEditor.setAttribute('contenteditable', 'true');
const p = testDoc.createElement('p');
const textInChat = testDoc.createTextNode('Hello Gemini, do not translate me');
p.appendChild(textInChat);
qlEditor.appendChild(p);
richTextarea.appendChild(qlEditor);
testDoc.body.appendChild(richTextarea);

assert.strictEqual(isEditableOrActiveInput(richTextarea), true, 'rich-textarea must be identified as editable');
assert.strictEqual(isEditableOrActiveInput(qlEditor), true, 'ql-editor must be identified as editable');
assert.strictEqual(isEditableOrActiveInput(p), true, 'paragraph inside contenteditable must be identified as editable');
assert.strictEqual(isEditableOrActiveInput(textInChat), true, 'text node inside contenteditable must be identified as editable');
assert.strictEqual(isIgnoredElement(textInChat), true, 'text node inside contenteditable must be ignored');

// Native inputs
const input = testDoc.createElement('input');
input.placeholder = 'Search';
assert.strictEqual(isIgnoredElement(input), true, 'input must be ignored for text node translation');
assert.strictEqual(isIgnoredElement(input, { allowInputForAttributes: true }), false, 'unfocused input must allow placeholder attributes');

const textarea = testDoc.createElement('textarea');
assert.strictEqual(isIgnoredElement(textarea), true, 'textarea must be ignored for text node translation');

// Regular non-editable content (Bilibili card)
const regularCard = testDoc.createElement('div');
regularCard.className = 'video-card';
const regularTitle = testDoc.createElement('h3');
const regularText = testDoc.createTextNode('普通视频标题');
regularTitle.appendChild(regularText);
regularCard.appendChild(regularTitle);
testDoc.body.appendChild(regularCard);

assert.strictEqual(isEditableOrActiveInput(regularTitle), false, 'normal video title must not be marked as editable');
assert.strictEqual(isIgnoredElement(regularText), false, 'normal video title text must not be ignored');
console.log('  ✔ Passed: Chat boxes, contenteditable, and inputs are 100% protected\n');

console.log('🎉 All Unit Tests Passed Successfully!\n');
