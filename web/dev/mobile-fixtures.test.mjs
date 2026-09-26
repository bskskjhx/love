/**
 * Contract tests for the mobile-fixture dev data.
 *
 * Run with: npm --prefix web run test:fixtures
 * Uses the Node built-in test runner; no test framework is installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createMobileFixture, FIXTURE_CONSTANTS } from './mobile-fixtures.mjs';

// Fixed reference time: 2026-09-26T12:00:00Z.
const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);
const NOW_SEC = Math.floor(NOW / 1000);
const DAY = 86400;

const fixture = createMobileFixture(NOW);

function get(pathname) {
  const res = fixture.respond(pathname);
  assert.ok(res, `expected a fixture response for ${pathname}`);
  return res;
}

function getJson(pathname) {
  const res = get(pathname);
  assert.equal(res.status, 200, `${pathname} should be 200`);
  assert.match(res.contentType, /^application\/json/, `${pathname} content type`);
  assert.equal(typeof res.body, 'string', `${pathname} body should be a string`);
  return JSON.parse(res.body);
}

function allMessages() {
  const meta = getJson('/data/mobile_demo/meta.json');
  const messages = [];
  for (const chunk of meta.chunks) {
    messages.push(...getJson(`/data/mobile_demo/chunks/${chunk.file}`));
  }
  return { meta, messages };
}

function chunkIndexOf(meta, id) {
  return meta.chunks.findIndex((c) => c.first_id <= id && c.last_id >= id);
}

/** Mirrors mediaExt() in src/utils.ts so the test checks the real URL shape. */
function mediaExt(msg) {
  if (msg.m === 'photo' || msg.m === 'sticker') return 'jpg';
  if (msg.m === 'video') return 'mp4';
  if (msg.m === 'voice') return 'ogg';
  if (msg.m === 'document') {
    return msg.doc && msg.doc.includes('.') ? msg.doc.split('.').pop() : 'bin';
  }
  return 'bin';
}

// ---------------------------------------------------------------------------

test('exports match the documented contract', () => {
  assert.equal(typeof createMobileFixture, 'function');
  assert.equal(createMobileFixture.length, 0, 'nowMs must be optional');

  const instance = createMobileFixture(NOW);
  assert.deepEqual(Object.keys(instance).sort(), ['chatUsername', 'deepLink', 'respond']);
  assert.equal(instance.chatUsername, 'mobile_demo');
  assert.equal(instance.deepLink, '#/mobile_demo/101');
  assert.equal(typeof instance.respond, 'function');
});

test('the declaration file declares the same public surface', () => {
  const dts = readFileSync(
    fileURLToPath(new URL('./mobile-fixtures.d.mts', import.meta.url)),
    'utf8',
  );
  for (const name of [
    'FixtureResponse',
    'MobileFixture',
    'createMobileFixture',
    'FixtureConstants',
    'FIXTURE_CONSTANTS',
  ]) {
    assert.match(dts, new RegExp(`\\b${name}\\b`), `${name} missing from mobile-fixtures.d.mts`);
  }
});

test('ships six chats with the required summary fields', () => {
  const chats = getJson('/data/chats.json');
  assert.equal(chats.length, 6, 'ChatList only reveals its search bar at 6+ chats');

  const usernames = chats.map((c) => c.username);
  assert.equal(new Set(usernames).size, usernames.length, 'usernames must be unique');
  assert.ok(usernames.includes('mobile_demo'));

  for (const chat of chats) {
    assert.equal(typeof chat.username, 'string');
    assert.equal(typeof chat.title, 'string');
    assert.equal(typeof chat.count, 'number');
    assert.equal(typeof chat.last_date, 'number');
    assert.equal(typeof chat.lp, 'string');
  }
});

test('chat recency covers the 7-day and 30-day filters', () => {
  const chats = getJson('/data/chats.json');
  const withinDays = (days) => chats.filter((c) => c.last_date >= NOW_SEC - days * DAY).length;

  assert.equal(withinDays(7), 3);
  assert.equal(withinDays(30), 5);
  assert.equal(chats.length, 6);

  const byRecency = [...chats].sort((a, b) => b.last_date - a.last_date).map((c) => c.username);
  assert.deepEqual(byRecency, [
    'mobile_demo',
    'epsilon_dev',
    'beta_lab',
    'alpha_group',
    'gamma_news',
    'delta_art',
  ]);
});

test('dates stay relative to nowMs so the filters never go stale', () => {
  const laterMs = NOW + 20 * DAY * 1000;
  const laterSec = Math.floor(laterMs / 1000);
  const later = createMobileFixture(laterMs);
  const chats = JSON.parse(later.respond('/data/chats.json').body);
  const withinDays = (days) => chats.filter((c) => c.last_date >= laterSec - days * DAY).length;

  assert.equal(withinDays(7), 3);
  assert.equal(withinDays(30), 5);
});

test('mobile_demo has three ordered chunks covering 150 unique messages', () => {
  const { meta, messages } = allMessages();

  assert.equal(meta.chunks.length, FIXTURE_CONSTANTS.CHUNKS);
  assert.equal(meta.chunks.length, 3);
  assert.equal(messages.length, FIXTURE_CONSTANTS.TOTAL_MESSAGES);
  assert.equal(messages.length, 150);

  assert.deepEqual(
    meta.chunks.map((c) => [c.first_id, c.last_id]),
    [[1, 50], [51, 100], [101, 150]],
  );
  assert.deepEqual(meta.chunks.map((c) => c.file), FIXTURE_CONSTANTS.CHUNK_FILES);

  const ids = messages.map((m) => m.i);
  assert.equal(new Set(ids).size, ids.length, 'message ids must be unique');
  for (let n = 1; n < ids.length; n++) {
    assert.ok(ids[n] > ids[n - 1], `ids must ascend (${ids[n - 1]} -> ${ids[n]})`);
  }

  for (let n = 1; n < messages.length; n++) {
    assert.ok(messages[n].d >= messages[n - 1].d, 'dates must not go backwards');
  }

  for (const chunk of meta.chunks) {
    assert.ok(chunk.first_id <= chunk.last_id, 'chunk id range');
    assert.ok(chunk.first_date <= chunk.last_date, 'chunk date range');
  }

  assert.equal(meta.first_date, meta.chunks[0].first_date);
  assert.equal(meta.last_date, meta.chunks[meta.chunks.length - 1].last_date);
  assert.equal(meta.last_date, messages[messages.length - 1].d);
});

test('each declared chunk range matches its own file contents', () => {
  const meta = getJson('/data/mobile_demo/meta.json');
  for (const chunk of meta.chunks) {
    const messages = getJson(`/data/mobile_demo/chunks/${chunk.file}`);
    assert.equal(messages[0].i, chunk.first_id, `${chunk.file} first_id`);
    assert.equal(messages[messages.length - 1].i, chunk.last_id, `${chunk.file} last_id`);
    assert.equal(messages[0].d, chunk.first_date, `${chunk.file} first_date`);
    assert.equal(messages[messages.length - 1].d, chunk.last_date, `${chunk.file} last_date`);
  }
});

test('the deep link target #101 exists in the last chunk', () => {
  const { meta, messages } = allMessages();
  assert.equal(fixture.deepLink, '#/mobile_demo/101');

  const target = messages.find((m) => m.i === FIXTURE_CONSTANTS.DEEP_LINK_ID);
  assert.ok(target, 'message 101 must exist');
  assert.equal(chunkIndexOf(meta, FIXTURE_CONSTANTS.DEEP_LINK_ID), meta.chunks.length - 1);
});

test('pinned and reply targets resolve, including across chunks', () => {
  const { meta, messages } = allMessages();
  const byId = new Map(messages.map((m) => [m.i, m]));

  assert.equal(meta.pinned_id, FIXTURE_CONSTANTS.PINNED_ID);
  assert.ok(byId.has(meta.pinned_id), 'pinned target must exist');
  assert.notEqual(
    chunkIndexOf(meta, meta.pinned_id),
    meta.chunks.length - 1,
    'the pinned message should sit outside the initially loaded chunk',
  );

  const crossChunk = byId.get(FIXTURE_CONSTANTS.CROSS_CHUNK_REPLY_ID);
  assert.ok(crossChunk, 'cross-chunk replier must exist');
  assert.equal(crossChunk.r, FIXTURE_CONSTANTS.CROSS_CHUNK_REPLY_TARGET);
  assert.ok(byId.has(crossChunk.r), 'cross-chunk reply target must exist');
  assert.notEqual(
    chunkIndexOf(meta, crossChunk.i),
    chunkIndexOf(meta, crossChunk.r),
    'this reply is meant to cross a chunk boundary',
  );

  const inChunk = byId.get(FIXTURE_CONSTANTS.IN_CHUNK_REPLY_ID);
  assert.equal(inChunk.r, FIXTURE_CONSTANTS.CROSS_CHUNK_REPLY_TARGET);
  assert.equal(
    chunkIndexOf(meta, inChunk.i),
    chunkIndexOf(meta, inChunk.r),
    'this reply is meant to stay inside one chunk',
  );
});

test('the unique search keyword appears exactly once', () => {
  const { messages } = allMessages();
  const haystack = messages.map((m) => m.t || '').join('\n');
  const occurrences = haystack.split(FIXTURE_CONSTANTS.UNIQUE_KEYWORD).length - 1;
  assert.equal(occurrences, 1, `"${FIXTURE_CONSTANTS.UNIQUE_KEYWORD}" must be unique`);

  const hit = messages.find((m) => (m.t || '').includes(FIXTURE_CONSTANTS.UNIQUE_KEYWORD));
  assert.equal(hit.i, FIXTURE_CONSTANTS.UNIQUE_KEYWORD_ID);
});

test('long-content and rich-message edge samples are present', () => {
  const { messages } = allMessages();
  const byId = new Map(messages.map((m) => [m.i, m]));

  // Chinese paragraph with no spaces.
  assert.ok(byId.get(2).t.length > 80, 'long Chinese sample');
  // A single unbreakable ASCII token.
  assert.ok(byId.get(3).t.length > 100, 'long token sample');
  assert.ok(!/\s/.test(byId.get(3).t), 'the long token must have no break opportunity');
  // A long URL.
  assert.ok(byId.get(4).t.length > 100 && byId.get(4).t.startsWith('https://'));
  // A long filename on a document.
  assert.equal(byId.get(5).m, 'document');
  assert.ok(byId.get(5).doc.length > 30, 'long filename sample');

  // The over-long sender name must span a contiguous run of consecutive messages,
  // so MessageItem's grouping (isFirst/isLast) has something to collapse.
  const longSenderIds = messages
    .filter((m) => m.n === FIXTURE_CONSTANTS.LONG_SENDER_NAME)
    .map((m) => m.i);
  assert.ok(longSenderIds.length >= 4, 'long sender should appear in a usable run');

  let longestRun = 1;
  let run = 1;
  for (let n = 1; n < longSenderIds.length; n++) {
    run = longSenderIds[n] === longSenderIds[n - 1] + 1 ? run + 1 : 1;
    longestRun = Math.max(longestRun, run);
  }
  assert.ok(longestRun >= 4, `expected a run of 4+ consecutive messages, got ${longestRun}`);

  // Rich message kinds.
  assert.ok(byId.get(60).pl && byId.get(60).pl.o.length >= 2, 'poll');
  assert.ok(byId.get(61).ct, 'contact');
  assert.ok(byId.get(62).geo, 'location');
  assert.ok(byId.get(63).wp && byId.get(63).t, 'web preview');
  assert.ok(byId.get(64).rx.length >= 6, 'reactions');
  assert.ok(byId.get(6).m === 'photo' && byId.get(6).mw > 0, 'photo with dimensions');
  assert.equal(byId.get(10).m, 'voice');
  assert.equal(byId.get(11).m, 'sticker');
  assert.equal(byId.get(120).m, 'video', 'video failure sample');
  assert.ok(byId.get(17).e, 'edited sample');
  assert.ok(byId.get(18).f, 'forward sample');
  assert.ok(byId.get(42).t.includes('置顶'), 'pinned sample body');

  // An album group: two or more messages sharing `g`, all media.
  const groups = new Map();
  for (const m of messages) {
    if (m.g && m.m) groups.set(m.g, [...(groups.get(m.g) || []), m]);
  }
  const album = [...groups.values()].find((items) => items.length >= 2);
  assert.ok(album, 'an album group of 2+ media messages is required');
  assert.ok(album.every((m) => m.m === 'photo' || m.m === 'video' || m.m === 'sticker'));
});

test('avatar index exposes covered and uncovered users', () => {
  const index = getJson('/data/mobile_demo/avatars/index.json');
  assert.ok(index.chat?.ok, 'chat avatar should be present');
  assert.deepEqual(
    Object.keys(index.ok).sort(),
    [...FIXTURE_CONSTANTS.AVATAR_UIDS].sort(),
  );

  for (const uid of FIXTURE_CONSTANTS.AVATAR_UIDS) {
    const res = get(`/data/mobile_demo/avatars/${uid}.jpg?t=${index.ok[uid]}`);
    assert.equal(res.status, 200);
    assert.match(res.contentType, /^image\/svg\+xml/);
  }
  for (const uid of FIXTURE_CONSTANTS.NO_AVATAR_UIDS) {
    assert.equal(
      fixture.respond(`/data/mobile_demo/avatars/${uid}.jpg`).status,
      404,
      `uid ${uid} has no avatar on purpose`,
    );
  }

  const chatAvatar = get('/data/mobile_demo/avatars/chat.jpg');
  assert.equal(chatAvatar.status, 200);
  assert.match(chatAvatar.contentType, /^image\/svg\+xml/);
  assert.match(chatAvatar.body, /^<svg/);
});

test('every referenced media id resolves except the deliberate failures', () => {
  const { messages } = allMessages();

  for (const msg of messages) {
    if (!msg.m) continue;
    const res = fixture.respond(`/data/mobile_demo/media/${msg.i}.${mediaExt(msg)}`);
    assert.ok(res, `media for #${msg.i} should be routed, not passed through`);

    if (msg.i === FIXTURE_CONSTANTS.VIDEO_FAILURE_ID) {
      assert.equal(res.status, 404, 'the video sample is a fixed failure');
      assert.equal(
        fixture.respond(`/data/mobile_demo/media/${msg.i}.jpg`).status,
        404,
        'the video poster is a fixed failure too',
      );
      continue;
    }
    assert.equal(res.status, 200, `media for #${msg.i} (${msg.m}) should resolve`);
  }

  const photo = get('/data/mobile_demo/media/6.jpg');
  assert.match(photo.contentType, /^image\/svg\+xml/);
  assert.match(photo.body, /^<svg/);

  const voice = get('/data/mobile_demo/media/10.ogg');
  assert.equal(voice.contentType, 'audio/wav');
  assert.ok(voice.body instanceof Uint8Array, 'audio must be real bytes');
  const magic = (from, to) => String.fromCharCode(...voice.body.slice(from, to));
  assert.equal(magic(0, 4), 'RIFF');
  assert.equal(magic(8, 12), 'WAVE');

  const doc = get('/data/mobile_demo/media/140.txt');
  assert.match(doc.contentType, /^text\/plain/);
});

test('non-fixture paths are passed through with null', () => {
  for (const pathname of [
    '/',
    '/index.html',
    '/src/main.tsx',
    '/manifest.webmanifest',
    '/sw.js',
    '/version.json',
  ]) {
    assert.equal(fixture.respond(pathname), null, `${pathname} must not be handled`);
  }
});

test('missing fixture resources return 404 rather than the HTML fallback', () => {
  for (const pathname of [
    '/data/mobile_demo/chunks/nope.json',
    '/data/mobile_demo/meta.json.bak',
    '/data/unknown_chat/meta.json',
    '/data/chats.json/extra',
    '/data/',
  ]) {
    const res = fixture.respond(pathname);
    assert.ok(res, `${pathname} is inside /data/ and must be answered`);
    assert.equal(res.status, 404, `${pathname} should 404`);
    assert.ok(!/text\/html/.test(res.contentType), `${pathname} must not fall back to HTML`);
  }
});

test('query strings are ignored when routing', () => {
  const a = fixture.respond('/data/chats.json?v=1');
  const b = fixture.respond('/data/chats.json?v=999999');
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body, b.body);

  assert.equal(fixture.respond('/data/mobile_demo/avatars/chat.jpg?t=123').status, 200);
});

test('every chat in chats.json has a self-consistent archive', () => {
  const chats = getJson('/data/chats.json');

  for (const chat of chats) {
    const meta = getJson(`/data/${chat.username}/meta.json`);
    assert.ok(meta.chunks.length >= 1, `${chat.username} needs at least one chunk`);

    const messages = [];
    for (const chunk of meta.chunks) {
      messages.push(...getJson(`/data/${chat.username}/chunks/${chunk.file}`));
    }
    assert.equal(messages.length, chat.count, `${chat.username} count`);
    assert.equal(
      Math.max(...messages.map((m) => m.d)),
      chat.last_date,
      `${chat.username} last_date`,
    );
    assert.equal(Math.min(...messages.map((m) => m.d)), meta.first_date);
    assert.equal(Math.max(...messages.map((m) => m.d)), meta.last_date);

    const ids = messages.map((m) => m.i);
    assert.equal(new Set(ids).size, ids.length, `${chat.username} ids must be unique`);

    getJson(`/data/${chat.username}/users.json`);
    getJson(`/data/${chat.username}/avatars/index.json`);
  }
});

test('users.json carries the profile shapes the UI branches on', () => {
  const users = getJson('/data/mobile_demo/users.json');

  assert.ok(users['1'].vf, 'a verified user');
  assert.ok(users['2'].pr, 'a premium user');
  assert.ok(users['3'].bot, 'a bot');
  assert.ok(users['4'].x, 'a deleted account');
  assert.ok(users['5'].b.length > 200, 'an over-long bio sample');

  for (const [id, profile] of Object.entries(users)) {
    assert.equal(typeof id, 'string', 'users.json is keyed by string id');
    assert.equal(typeof profile, 'object');
  }
});
