import assert from 'assert';
import { hashString, createCacheKey } from '../src/utils/hash.ts';
import { isTranslatableString, isIgnoredElement } from '../src/utils/dom.ts';
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
console.log('  ✔ Passed: Correctly filters noise, URLs, code, and numbers\n');

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

console.log('🎉 All Unit Tests Passed Successfully!\n');
