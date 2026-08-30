/**
 * Fast 32-bit FNV-1a hash function for strings
 */
export function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit FNV prime 16777619
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Generate a consistent cache key
 */
export function createCacheKey(
  sourceText: string,
  sourceLang: string,
  targetLang: string,
  provider: string
): string {
  const cleanText = sourceText.trim();
  return `${provider}:${sourceLang}:${targetLang}:${hashString(cleanText)}`;
}
