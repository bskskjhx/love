/**
 * Synthetic archive data for mobile UI development and tests.
 *
 * Consumed only by the Vite dev middleware mounted in `mobile-fixture` mode
 * (see web/vite.config.ts). It never touches `public/data`, never overwrites a
 * real archive, and is never imported by a production build.
 *
 * All content is invented. No real user, chat or file data appears here.
 */

const CHAT_USERNAME = 'mobile_demo';
const DEEP_LINK = '#/mobile_demo/101';

const DAY = 86400;
const HOUR = 3600;

const TOTAL_MESSAGES = 150;
const CHUNK_SIZE = 50;
const GROUP_SIZE = 6;
const GROUP_OFFSETS = [0, 90, 200, 260, 900, 1000];

const JSON_TYPE = 'application/json; charset=utf-8';
const SVG_TYPE = 'image/svg+xml; charset=utf-8';
const WAV_TYPE = 'audio/wav';
const TEXT_TYPE = 'text/plain; charset=utf-8';

// ---------------------------------------------------------------------------
// Synthetic copy
// ---------------------------------------------------------------------------

const DEFAULT_TEXTS = [
  '收到，我这边同步跟进一下。',
  '这个版本的回归结果已经整理好了，稍后发到群里。',
  '刚才那条消息的时间戳好像不太对，我再核对一次。',
  '明天上午十点开个小会，主要是过一遍验收清单。',
  '图片压缩之后体积小了很多，加载快了不少。',
  '麻烦把复现步骤补充到文档里，方便后面回溯。',
  '我把分片逻辑重新看了一遍，边界条件没问题。',
  '这次的改动范围确认过了，只涉及前端展示层。',
  '链接我已经收藏了，晚点细看。',
  '先按这个方案推进，有问题随时说。',
  '文档已经更新到最新版本，记得刷新页面。',
  '搜索结果的高亮还需要再调一下颜色对比度。',
];

const LONG_CHINESE =
  '这是一条刻意写得很长的中文消息，用来验证窄屏气泡里的自动换行表现。' +
  '中文没有空格，浏览器只能依靠逐字断行；如果容器缺少 min-width:0 或者断词规则，' +
  '整条消息就会把气泡甚至页面撑出横向滚动。因此这条消息应该完整可读，并且不产生横向溢出。';

// A single ~130 character token with no break opportunity.
const LONG_TOKEN =
  'Pneumonoultramicroscopicsilicovolcanoconiosis' +
  'Supercalifragilisticexpialidocious' +
  'Antidisestablishmentarianism' +
  'Floccinaucinihilipilification';

const LONG_URL =
  'https://example.com/a/very/long/path/segment/that/keeps/going/and/going' +
  '?with=query&and=more&params=here&token=abcdefghijklmnopqrstuvwxyz0123456789#and-a-fragment';

const LONG_FILENAME =
  '2026年第三季度移动端适配验收记录与回归测试用例汇总表（最终确认版·不要再改名）.xlsx';

const LONG_SENDER_NAME = '欧阳娜娜·阿尔忒弥斯·冯·霍恩海姆';

const LONG_BIO =
  '【超长简介】这是一段刻意写得很长的合成简介，用于验证资料卡在窄屏下的换行与滚动表现。' +
  '简介里没有任何真实用户信息，只是重复的占位文字，用来把卡片撑到需要滚动的高度。'.repeat(6);

const UNIQUE_KEYWORD = '独角兽图腾';

// ---------------------------------------------------------------------------
// Senders
// ---------------------------------------------------------------------------

const SENDER_ROTATION = [
  { u: 1, n: '林晓' },
  { u: 2, n: '陈子昂' },
  { u: 3, n: '王雪' },
  {}, // owner / fully anonymous: no id, no name
  { u: 4, n: '赵启明' },
  { n: '未登记访客' }, // has a name but no id
  { u: 5, n: LONG_SENDER_NAME },
];

/** Runs of 4 consecutive messages share a sender so grouping is visible. */
function senderFor(index) {
  return SENDER_ROTATION[Math.floor(index / 4) % SENDER_ROTATION.length];
}

// ---------------------------------------------------------------------------
// Message #1..#150 of mobile_demo
// ---------------------------------------------------------------------------

/**
 * Explicit sample messages. Every entry is a patch merged over the generated
 * baseline message, so untouched fields keep their generated values.
 */
const OVERRIDES = {
  1: { t: '欢迎来到 mobile_demo 演示群，本群全部内容都是本地开发的合成数据。' },
  2: { t: LONG_CHINESE },
  3: { t: LONG_TOKEN },
  4: { t: LONG_URL },
  5: { t: '验收记录的附表在这里，文件名比较长：', m: 'document', doc: LONG_FILENAME, sz: 5242880 },
  6: { m: 'photo', mw: 1280, mh: 720 },
  7: { m: 'photo', g: 'alb_demo', mw: 900, mh: 900 },
  8: { m: 'photo', g: 'alb_demo', mw: 900, mh: 900 },
  9: { m: 'photo', g: 'alb_demo', mw: 900, mh: 900 },
  10: { m: 'voice', dur: 12 },
  11: { m: 'sticker', mw: 320, mh: 320 },
  // Cross-chunk reply target: referenced by #130, which lives in chunk m3.
  12: { t: '这条消息位于第 1 个分片，会被第 130 条消息跨分片引用。' },
  17: { e: true, t: '这条消息发布之后经过一次编辑。' },
  18: { f: '某个名称很长的外部转发来源频道（合成）', t: '转发过来的内容。' },
  19: { rx: [{ e: '👍', c: 3 }, { e: '🎉', c: 1 }] },
  20: { t: '这条是分片内部的回复。', r: 12 },
  // Pinned message: jumping to it crosses from the initial chunk back to m1.
  42: { t: '置顶：本群为移动端适配演示数据，所有内容均为合成。' },
  60: {
    pl: {
      q: '下一个版本优先做哪一项？',
      o: [
        { t: '动态视口与安全区', v: 5 },
        { t: '搜索键盘避让', v: 3 },
        { t: '全屏媒体手势', v: 2 },
        { t: '语音播放触控', v: 1 },
      ],
      mc: false,
    },
  },
  61: { ct: { n: '合成联系人（示例）', p: '+86 000 0000 0000' } },
  62: { geo: { lat: 31.2304, lon: 121.4737 } },
  63: {
    t: '这是一条带网页预览链接的消息。',
    wp: {
      url: 'https://example.com/articles/mobile-viewport-guide',
      title: '一个很长的网页预览标题，用来测试小屏上的换行与截断表现',
      desc:
        '这是网页预览的描述文本，故意写得比较长，用于验证三行截断在窄屏下是否仍然稳定，' +
        '不会把消息气泡撑破。',
    },
  },
  64: {
    rx: [
      { e: '👍', c: 12 },
      { e: '❤️', c: 8 },
      { e: '😂', c: 5 },
      { e: '🎉', c: 3 },
      { e: '👀', c: 2 },
      { e: '🔥', c: 2 },
      { e: '🤔', c: 1 },
      { e: '🙏', c: 1 },
    ],
  },
  70: { m: 'photo', mw: 1600, mh: 900, t: '一张编号为 70 的示例图片。' },
  // The unique keyword appears exactly here.
  88: { t: `这里只出现一次的唯一命中关键词：${UNIQUE_KEYWORD}。` },
  101: { t: '深链接目标消息 #101：从 #/mobile_demo/101 打开应能直接定位到这里。' },
  // Video is a deliberate failure sample: 404 for both the video and its poster.
  120: { m: 'video', dur: 37, mw: 1280, mh: 720, t: '这条视频在 fixture 中固定返回 404，用于验证失败降级。' },
  130: { t: '这条消息在第 3 个分片，回复了第 1 个分片的第 12 条消息。', r: 12 },
  140: { m: 'document', doc: '短名字.txt', sz: 1024, t: '一个体积很小的文本附件。' },
  150: { t: '这是本群最后一条消息（#150）。' },
};

function buildMobileDemoMessages(nowSec) {
  const startSec = nowSec - 40 * DAY;
  const endSec = nowSec - 3 * HOUR;
  const groupCount = Math.ceil(TOTAL_MESSAGES / GROUP_SIZE);
  const spacing = (endSec - startSec - GROUP_OFFSETS[GROUP_OFFSETS.length - 1]) / (groupCount - 1);

  const messages = [];
  for (let n = 0; n < TOTAL_MESSAGES; n++) {
    const group = Math.floor(n / GROUP_SIZE);
    const offset = GROUP_OFFSETS[n % GROUP_SIZE];
    const d = Math.round(startSec + group * spacing + offset);
    const i = n + 1;
    const msg = { i, d, t: DEFAULT_TEXTS[(n * 5) % DEFAULT_TEXTS.length], ...senderFor(n) };
    messages.push({ ...msg, ...(OVERRIDES[i] || {}) });
  }
  return messages;
}

// ---------------------------------------------------------------------------
// Other chats
// ---------------------------------------------------------------------------

const OTHER_CHATS = [
  {
    username: 'alpha_group',
    title: '阿尔法技术组',
    count: 9,
    lastOffset: 12 * DAY,
    span: 20 * DAY,
    lp: '验收清单已经更新到第三版。',
    hasChatAvatar: true,
  },
  {
    username: 'beta_lab',
    title: '贝塔实验室',
    count: 7,
    lastOffset: 2 * DAY,
    span: 25 * DAY,
    lp: '这周的实验记录我整理好了。',
    hasChatAvatar: true,
  },
  {
    username: 'gamma_news',
    title: '伽马快讯',
    count: 11,
    lastOffset: 25 * DAY,
    span: 30 * DAY,
    lp: '下周的活动安排在这里。',
    hasChatAvatar: false,
  },
  {
    username: 'delta_art',
    title: '德尔塔画室',
    count: 5,
    lastOffset: 45 * DAY,
    span: 10 * DAY,
    lp: '配色方案我再出一版。',
    hasChatAvatar: false,
  },
  {
    username: 'epsilon_dev',
    title: '艾普西龙开发组',
    count: 8,
    lastOffset: 1 * DAY,
    span: 15 * DAY,
    lp: '构建产物已经放到隔离目录。',
    hasChatAvatar: false,
  },
];

function buildGenericMessages(count, lastSec, spanSec) {
  const firstSec = lastSec - spanSec;
  const step = count > 1 ? (lastSec - firstSec) / (count - 1) : 0;
  const messages = [];
  for (let n = 0; n < count; n++) {
    messages.push({
      i: n + 1,
      d: Math.round(firstSec + step * n),
      t: DEFAULT_TEXTS[(n * 7) % DEFAULT_TEXTS.length],
      ...SENDER_ROTATION[(n * 3) % SENDER_ROTATION.length],
    });
  }
  return messages;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function toChunks(messages, filePrefix) {
  const chunks = [];
  for (let start = 0; start < messages.length; start += CHUNK_SIZE) {
    const slice = messages.slice(start, start + CHUNK_SIZE);
    chunks.push({
      file: `${filePrefix}${chunks.length + 1}.json`,
      first_id: slice[0].i,
      last_id: slice[slice.length - 1].i,
      first_date: slice[0].d,
      last_date: slice[slice.length - 1].d,
      messages: slice,
    });
  }
  return chunks;
}

function toMeta(chunks, pinnedId) {
  return {
    chunks: chunks.map(({ file, first_id, last_id, first_date, last_date }) => ({
      file,
      first_id,
      last_id,
      first_date,
      last_date,
    })),
    first_date: chunks[0].first_date,
    last_date: chunks[chunks.length - 1].last_date,
    ...(pinnedId === undefined ? {} : { pinned_id: pinnedId }),
  };
}

// ---------------------------------------------------------------------------
// Synthetic media bytes
// ---------------------------------------------------------------------------

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      default: return '&quot;';
    }
  });
}

function buildSvg({ width, height, label, hue }) {
  const fontSize = Math.round(Math.min(width, height) * 0.18);
  const hue2 = (hue + 40) % 360;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 62% 58%)"/>` +
    `<stop offset="1" stop-color="hsl(${hue2} 62% 42%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
    `<text x="50%" y="50%" fill="#ffffff" font-family="sans-serif" font-size="${fontSize}" ` +
    `text-anchor="middle" dominant-baseline="middle">${escapeXml(label)}</text>` +
    `</svg>`
  );
}

/** A short 16-bit PCM mono WAV, generated in memory. */
function buildWav(seconds = 0.6, sampleRate = 8000) {
  const sampleCount = Math.floor(seconds * sampleRate);
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset, text) => {
    for (let n = 0; n < text.length; n++) view.setUint8(offset + n, text.charCodeAt(n));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let n = 0; n < sampleCount; n++) {
    const t = n / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.25 * Math.exp(-3 * t);
    view.setInt16(44 + n * 2, Math.round(sample * 32767), true);
  }
  return new Uint8Array(buffer);
}

// ---------------------------------------------------------------------------
// Media routing for mobile_demo
// ---------------------------------------------------------------------------

const PHOTO_MEDIA = new Set([6, 7, 8, 9, 11, 70]);
const DOC_MEDIA = new Set([5, 140]);
const VOICE_MEDIA = new Set([10]);
/** Deliberate failure samples: the video body and its poster both 404. */
const MISSING_MEDIA = new Set([120]);

const PHOTO_SIZE = {
  6: { width: 1280, height: 720 },
  7: { width: 900, height: 900 },
  8: { width: 900, height: 900 },
  9: { width: 900, height: 900 },
  11: { width: 320, height: 320 },
  70: { width: 1600, height: 900 },
};

const OK = 200;
const NOT_FOUND = 404;

function json(body) {
  return { status: OK, contentType: JSON_TYPE, body: JSON.stringify(body) };
}

function svg(body) {
  return { status: OK, contentType: SVG_TYPE, body };
}

function notFound(what) {
  return { status: NOT_FOUND, contentType: TEXT_TYPE, body: `fixture: not found: ${what}\n` };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {number} [nowMs] Reference time in milliseconds. All fixture dates are
 *   derived from it, so the 7-day/30-day filters never go stale.
 */
export function createMobileFixture(nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);

  // ---- mobile_demo --------------------------------------------------------
  const demoMessages = buildMobileDemoMessages(nowSec);
  const demoChunks = toChunks(demoMessages, 'm');
  const demoMeta = toMeta(demoChunks, 42);

  // ---- other chats --------------------------------------------------------
  const otherChats = OTHER_CHATS.map((chat) => {
    const lastSec = nowSec - chat.lastOffset;
    const messages = buildGenericMessages(chat.count, lastSec, chat.span);
    const chunks = toChunks(messages, 'c');
    return { ...chat, lastSec, chunks, meta: toMeta(chunks) };
  });

  const chats = [
    {
      username: CHAT_USERNAME,
      title: '移动端演示群',
      count: demoMessages.length,
      last_date: demoMeta.last_date,
      lp: '这是本群最后一条消息（#150）。',
    },
    ...otherChats.map((chat) => ({
      username: chat.username,
      title: chat.title,
      count: chat.count,
      last_date: chat.lastSec,
      lp: chat.lp,
    })),
  ];

  const users = {
    '1': {
      un: 'linxiao_demo',
      b: '合成用户简介：负责移动端适配的验收与回归。',
      vf: true,
      ts: nowSec - 5 * DAY,
    },
    '2': {
      un: 'chenziang_demo',
      b: '合成用户简介：负责分片加载与搜索。',
      pr: true,
      ts: nowSec - 9 * DAY,
    },
    '3': { un: 'wangxue_bot', bot: true, ts: nowSec - 20 * DAY },
    '4': { x: true, ts: nowSec - 30 * DAY },
    '5': { un: 'ouyang_demo', b: LONG_BIO, ts: nowSec - 2 * DAY },
  };

  const avatarIndex = {
    chat: { ok: 1, ts: nowSec - HOUR },
    ok: {
      '1': nowSec - 5 * DAY,
      '2': nowSec - 9 * DAY,
      '5': nowSec - 2 * DAY,
    },
  };

  // ---- path lookup tables -------------------------------------------------
  const metaByUser = new Map([[CHAT_USERNAME, demoMeta]]);
  const chunksByUser = new Map([[CHAT_USERNAME, demoChunks]]);
  const usersByUser = new Map([[CHAT_USERNAME, users]]);
  const avatarIndexByUser = new Map([[CHAT_USERNAME, avatarIndex]]);

  for (const chat of otherChats) {
    metaByUser.set(chat.username, chat.meta);
    chunksByUser.set(chat.username, chat.chunks);
    usersByUser.set(chat.username, { '1': { un: `${chat.username}_member`, ts: nowSec - DAY } });
    avatarIndexByUser.set(
      chat.username,
      chat.hasChatAvatar ? { chat: { ok: 1, ts: nowSec - DAY } } : {},
    );
  }

  const avatarBytes = (seed, label) =>
    buildSvg({ width: 200, height: 200, label, hue: seed % 360 });

  /** Resolve `{username}/media/{id}.{ext}`. */
  function respondMedia(username, file) {
    if (username !== CHAT_USERNAME) return notFound(`${username}/media/${file}`);
    const match = /^(\d+)\.([A-Za-z0-9]+)$/.exec(file);
    if (!match) return notFound(`${username}/media/${file}`);
    const id = Number(match[1]);

    if (MISSING_MEDIA.has(id)) return notFound(`${username}/media/${file}`);
    if (PHOTO_MEDIA.has(id)) {
      const size = PHOTO_SIZE[id] || { width: 800, height: 600 };
      return svg(buildSvg({ ...size, label: `媒体 #${id}`, hue: (id * 37) % 360 }));
    }
    if (VOICE_MEDIA.has(id)) {
      return { status: OK, contentType: WAV_TYPE, body: buildWav() };
    }
    if (DOC_MEDIA.has(id)) {
      return { status: OK, contentType: TEXT_TYPE, body: `fixture: 合成附件 #${id}\n` };
    }
    return notFound(`${username}/media/${file}`);
  }

  /** Resolve an already query-stripped pathname. */
  function respond(rawPathname) {
    let pathname = String(rawPathname || '').split('?')[0].split('#')[0];
    if (pathname.startsWith('./')) pathname = pathname.slice(1);
    if (!pathname.startsWith('/data/')) return null;

    const rest = pathname.slice('/data/'.length);
    const parts = rest.split('/').filter(Boolean);

    if (parts.length === 1 && parts[0] === 'chats.json') return json(chats);

    if (parts.length >= 2) {
      const [username, ...tail] = parts;

      if (tail.length === 1 && tail[0] === 'meta.json') {
        const meta = metaByUser.get(username);
        return meta ? json(meta) : notFound(pathname);
      }
      if (tail.length === 1 && tail[0] === 'users.json') {
        const map = usersByUser.get(username);
        return map ? json(map) : notFound(pathname);
      }
      if (tail.length === 2 && tail[0] === 'avatars' && tail[1] === 'index.json') {
        const index = avatarIndexByUser.get(username);
        return index ? json(index) : notFound(pathname);
      }
      if (tail.length === 2 && tail[0] === 'chunks') {
        const chunks = chunksByUser.get(username);
        const chunk = chunks && chunks.find((c) => c.file === tail[1]);
        return chunk ? json(chunk.messages) : notFound(pathname);
      }
      if (tail.length === 2 && tail[0] === 'media') {
        return respondMedia(username, tail[1]);
      }
      if (tail.length === 2 && tail[0] === 'avatars') {
        const index = avatarIndexByUser.get(username);
        if (!index) return notFound(pathname);
        if (tail[1] === 'chat.jpg') {
          if (!index.chat?.ok) return notFound(pathname);
          return svg(avatarBytes(index.chat.ts, '群'));
        }
        const match = /^(\d+)\.jpg$/.exec(tail[1]);
        if (!match) return notFound(pathname);
        const uid = match[1];
        if (!index.ok?.[uid]) return notFound(pathname);
        return svg(avatarBytes(index.ok[uid], uid));
      }
    }

    // Anything else under /data/ is a missing fixture resource, never HTML.
    return notFound(pathname);
  }

  return { chatUsername: CHAT_USERNAME, deepLink: DEEP_LINK, respond };
}

/** Exported for tests and for the sample-ID table in web/MOBILE-TESTING.md. */
export const FIXTURE_CONSTANTS = {
  TOTAL_MESSAGES,
  CHUNK_SIZE,
  CHUNKS: Math.ceil(TOTAL_MESSAGES / CHUNK_SIZE),
  CHUNK_FILES: Array.from(
    { length: Math.ceil(TOTAL_MESSAGES / CHUNK_SIZE) },
    (_, n) => `m${n + 1}.json`,
  ),
  PINNED_ID: 42,
  DEEP_LINK_ID: 101,
  UNIQUE_KEYWORD,
  LONG_SENDER_NAME,
  UNIQUE_KEYWORD_ID: 88,
  CROSS_CHUNK_REPLY_ID: 130,
  CROSS_CHUNK_REPLY_TARGET: 12,
  IN_CHUNK_REPLY_ID: 20,
  VIDEO_FAILURE_ID: 120,
  AVATAR_UIDS: ['1', '2', '5'],
  NO_AVATAR_UIDS: ['3', '4'],
  CHAT_USERNAME,
  DEEP_LINK,
};
