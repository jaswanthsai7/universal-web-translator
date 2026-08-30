import { BILIBILI_EN_DICT } from '../dictionary/bilibili_en';

/**
 * High-speed local translation lookup (0ms latency, synchronous).
 * Translates navigation, buttons, controls, timestamps, and common terms
 * without needing any remote API request.
 */
export function getLocalTranslation(text: string, targetLang = 'en'): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (targetLang === 'en') {
    // 1. Direct match in Bilibili English dictionary
    const directMatch = BILIBILI_EN_DICT[trimmed];
    if (directMatch) return directMatch;

    // Case-insensitive match
    const lowerMatch = BILIBILI_EN_DICT[trimmed.toLowerCase()];
    if (lowerMatch) return lowerMatch;

    // 2. Relative time localization (e.g., 3小时前, 刚刚, 昨天 12:30)
    const timeMatch = localizeRelativeTime(trimmed);
    if (timeMatch) return timeMatch;

    // 3. View counts & metrics localization (e.g., 12.5万次播放, 1053条弹幕)
    const statsMatch = localizeStats(trimmed);
    if (statsMatch) return statsMatch;

    // 4. Common player prefixes (e.g., 倍速: 1.0x -> Speed: 1.0x)
    const prefixMatch = localizePlayerPrefix(trimmed);
    if (prefixMatch) return prefixMatch;

    // 5. Dynamic phrases (e.g., 视频素材 9999+, 统计截至: ...)
    const phraseMatch = localizeDynamicPhrases(trimmed);
    if (phraseMatch) return phraseMatch;
  }

  return null;
}

function localizeDynamicPhrases(str: string): string | null {
  // e.g. 视频素材 9999+ / 贴纸素材 9999+
  let m = str.match(/^(视频素材|贴纸素材)\s*([\d+]+)$/);
  if (m) {
    const label = m[1] === '视频素材' ? 'Video Materials' : 'Sticker Materials';
    return `${label} ${m[2]}`;
  }

  // e.g. 统计截至：2026-08-29 (每日12点更新)
  m = str.match(/^统计截至[:：]?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*[（(](.*)[）)]$/);
  if (m) {
    const note = m[2].replace(/每日(\d+)点更新/, 'Updated daily at $1:00');
    return `Stats as of: ${m[1]} (${note})`;
  }

  return null;
}

function localizePlayerPrefix(str: string): string | null {
  let m = str.match(/^倍速[:：]\s*(.*)$/);
  if (m) return `Speed: ${m[1]}`;

  m = str.match(/^清晰度[:：]\s*(.*)$/);
  if (m) return `Resolution: ${m[1]}`;

  return null;
}

/**
 * Localizes Chinese relative timestamps into natural English
 */
function localizeRelativeTime(str: string): string | null {
  if (str === '刚刚') return 'Just now';
  if (str === '昨天') return 'Yesterday';
  if (str === '前天') return '2 days ago';

  let m = str.match(/^(\d+)\s*秒前$/);
  if (m) return `${m[1]}s ago`;

  m = str.match(/^(\d+)\s*分钟前$/);
  if (m) return `${m[1]}m ago`;

  m = str.match(/^(\d+)\s*小时前$/);
  if (m) return `${m[1]}h ago`;

  m = str.match(/^(\d+)\s*天前$/);
  if (m) return `${m[1]}d ago`;

  m = str.match(/^昨天\s*(\d{1,2}:\d{2})$/);
  if (m) return `Yesterday ${m[1]}`;

  m = str.match(/^前天\s*(\d{1,2}:\d{2})$/);
  if (m) return `2 days ago ${m[1]}`;

  return null;
}

/**
 * Localizes Chinese view count metrics and numbers
 * e.g. "12.5万次播放" -> "125K views"
 *      "1053条弹幕"   -> "1,053 danmaku"
 */
function localizeStats(str: string): string | null {
  // e.g. 12.5万次播放 or 12.5万 播放
  let m = str.match(/^([\d.]+)\s*万\s*(?:次)?\s*(?:播放|观看)$/);
  if (m) {
    const num = parseFloat(m[1]) * 10;
    return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}K views`;
  }

  // e.g. 1.2亿次播放
  m = str.match(/^([\d.]+)\s*亿\s*(?:次)?\s*(?:播放|观看)$/);
  if (m) {
    const num = parseFloat(m[1]) * 100;
    return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}M views`;
  }

  // e.g. 1053条弹幕
  m = str.match(/^(\d+)\s*条?\s*弹幕$/);
  if (m) {
    const count = parseInt(m[1], 10);
    return `${count.toLocaleString()} danmaku`;
  }

  // e.g. 12.5万弹幕
  m = str.match(/^([\d.]+)\s*万\s*条?\s*弹幕$/);
  if (m) {
    const num = parseFloat(m[1]) * 10;
    return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}K danmaku`;
  }

  // Plain "12.5万"
  m = str.match(/^([\d.]+)\s*万$/);
  if (m) {
    const num = parseFloat(m[1]) * 10;
    return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}K`;
  }

  return null;
}
