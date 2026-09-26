import type { Message } from '@/types';

const VERSION = String(Date.now());

export function vUrl(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${VERSION}`;
}

export function fmtTimeShort(d: number): string {
  const dt = new Date(d * 1000);
  const h = String(dt.getHours()).padStart(2, '0');
  const m = String(dt.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function fmtTimeFull(d: number): string {
  const dt = new Date(d * 1000);
  const h = String(dt.getHours()).padStart(2, '0');
  const m = String(dt.getMinutes()).padStart(2, '0');
  const s = String(dt.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function fmtDate(d: number): string {
  const dt = new Date(d * 1000);
  const now = new Date();
  const sameYear = dt.getFullYear() === now.getFullYear();
  if (sameYear) return `${dt.getMonth() + 1}月${dt.getDate()}日`;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

export function fmtDateFull(d: number): string {
  const dt = new Date(d * 1000);
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 ${fmtTimeShort(d)}`;
}

export function fmtDateFullSec(d: number): string {
  const dt = new Date(d * 1000);
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 ${fmtTimeFull(d)}`;
}

export function fmtListDate(d: number): string {
  const dt = new Date(d * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diffDays === 0) return fmtTimeShort(d);
  if (diffDays === 1) return '昨天';
  if (dt.getFullYear() === now.getFullYear()) return `${dt.getMonth() + 1}/${dt.getDate()}`;
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
}

export function fmtDur(sec: number): string {
  if (!sec || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (sec < 600) return `${m}:${String(s).padStart(2, '0')}`;
  const h = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return `${h}:${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtBytes(b: number): string {
  if (!b || b < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = b;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  if (val < 10 && i > 0) return `${val.toFixed(1)} ${units[i]}`;
  return `${Math.round(val)} ${units[i]}`;
}

export function isAnon(m: Message): boolean {
  return m.u === undefined && !m.n;
}

export function senderName(m: Message): string {
  if (m.n) return m.n;
  if (m.u !== undefined) return `用户${m.u}`;
  return '未知';
}

export function sameSender(a: Message, b: Message): boolean {
  if (a.u !== undefined && b.u !== undefined) return a.u === b.u;
  if (a.u === undefined && b.u === undefined) return (a.n || '') === (b.n || '');
  return false;
}

export function preview(m: Message): string {
  if (m.t) return truncate(m.t, 40);
  if (m.m) return `[${mediaLabel(m.m)}]`;
  return '';
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.substring(0, max) + '…';
}

export function mediaLabel(m: string): string {
  const map: Record<string, string> = {
    photo: '图片',
    sticker: '贴纸',
    video: '视频',
    voice: '语音',
    document: '文件',
  };
  return map[m] || m;
}

export function mediaExt(m: Message): string {
  if (m.m === 'photo' || m.m === 'sticker') return 'jpg';
  if (m.m === 'video') return 'mp4';
  if (m.m === 'voice') return 'ogg';
  if (m.m === 'document') {
    if (m.doc && m.doc.includes('.')) {
      return m.doc.split('.').pop() || 'bin';
    }
    return 'bin';
  }
  return 'bin';
}

const PALETTE_HUES = [0, 30, 60, 120, 160, 200, 220, 260, 290, 320];

export function colorSeed(id: string | number | undefined, name?: string): number {
  const s = id !== undefined ? String(id) : name || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  h = Math.abs(h);
  }
  return PALETTE_HUES[h % PALETTE_HUES.length];
}

export function avatarColor(seed: string | number | undefined, name?: string): string {
  const hue = colorSeed(seed, name);
  return `hsl(${hue}, 65%, 50%)`;
}

export function avatarGradient(seed: string | number | undefined, name?: string): string {
  const hue = colorSeed(seed, name);
  return `linear-gradient(135deg, hsl(${hue}, 70%, 55%), hsl(${(hue + 30) % 360}, 70%, 45%))`;
}

export function nameColor(seed: string | number | undefined, name?: string): string {
  const hue = colorSeed(seed, name);
  return `hsl(${hue}, 60%, 45%)`;
}

export function initialOf(name?: string): string {
  if (!name) return '#';
  return name.charAt(0).toUpperCase();
}

export function parseHash(): { username?: string; msgId?: number } {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (!h) return {};
  const parts = h.split('/');
  const username = parts[0] || undefined;
  const msgId = parts[1] ? parseInt(parts[1], 10) : undefined;
  return { username, msgId };
}

export function setHash(username?: string, msgId?: number) {
  let h = '#/';
  if (username) {
    h += username;
    if (msgId) h += `/${msgId}`;
  }
  if (window.location.hash !== h) {
    window.location.hash = h;
  }
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return fallbackCopy(text);
}

function fallbackCopy(text: string): Promise<void> {
  return new Promise((resolve) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore
    }
    document.body.removeChild(ta);
    resolve();
  });
}

export function vibrate(ms: number) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // ignore
  }
}

export function dayKey(d: number): string {
  const dt = new Date(d * 1000);
  return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
}

export function sameDay(a: number, b: number): boolean {
  return dayKey(a) === dayKey(b);
}

export function withinSeconds(a: number, b: number, sec: number): boolean {
  return Math.abs(a - b) <= sec;
}

export function buildMediaUrl(username: string, msgId: number, ext: string): string {
  return `./data/${username}/media/${msgId}.${ext}`;
}

export function buildAvatarUrl(username: string, ts: number, isChat?: boolean): string {
  if (isChat) return `./data/${username}/avatars/chat.jpg?t=${ts}`;
  return `./data/${username}/avatars/${username}.jpg?t=${ts}`;
}

export function buildUserAvatarUrl(username: string, uid: string | number, ts: number): string {
  return `./data/${username}/avatars/${uid}.jpg?t=${ts}`;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
