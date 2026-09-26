import type { ChatSummary, ChatMeta, Message, UsersMap, AvatarIndex } from '@/types';
import { vUrl } from '@/utils';

const cache = new Map<string, Promise<unknown>>();
const dataBase = './data';

function cacheKey(url: string): string {
  return url;
}

async function fetchJson<T>(url: string, noStore?: boolean): Promise<T> {
  const opts: RequestInit = noStore ? { cache: 'no-store' } : {};
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

export async function loadChats(): Promise<ChatSummary[]> {
  const url = vUrl(`${dataBase}/chats.json`);
  const existing = cache.get(cacheKey(url));
  if (existing) return existing as Promise<ChatSummary[]>;
  const p = fetchJson<ChatSummary[]>(url);
  cache.set(cacheKey(url), p);
  return p;
}

export async function refreshChats(): Promise<ChatSummary[]> {
  const url = vUrl(`${dataBase}/chats.json`);
  const p = fetchJson<ChatSummary[]>(url, true);
  cache.set(cacheKey(url), p);
  return p;
}

export async function loadMeta(username: string): Promise<ChatMeta> {
  const url = vUrl(`${dataBase}/${username}/meta.json`);
  const existing = cache.get(cacheKey(url));
  if (existing) return existing as Promise<ChatMeta>;
  const p = fetchJson<ChatMeta>(url);
  cache.set(cacheKey(url), p);
  return p;
}

export async function refreshMeta(username: string): Promise<ChatMeta> {
  const url = vUrl(`${dataBase}/${username}/meta.json`);
  const p = fetchJson<ChatMeta>(url, true);
  cache.set(cacheKey(url), p);
  return p;
}

export async function loadChunk(username: string, file: string): Promise<Message[]> {
  const url = vUrl(`${dataBase}/${username}/chunks/${file}`);
  const existing = cache.get(cacheKey(url));
  if (existing) return existing as Promise<Message[]>;
  const p = fetchJson<Message[]>(url);
  cache.set(cacheKey(url), p);
  return p;
}

export async function refreshChunk(username: string, file: string): Promise<Message[]> {
  const url = vUrl(`${dataBase}/${username}/chunks/${file}`);
  const p = fetchJson<Message[]>(url, true);
  cache.set(cacheKey(url), p);
  return p;
}

export async function loadUsers(username: string): Promise<UsersMap> {
  const url = vUrl(`${dataBase}/${username}/users.json`);
  const existing = cache.get(cacheKey(url));
  if (existing) return existing as Promise<UsersMap>;
  const p = fetchJson<UsersMap>(url).catch(() => ({} as UsersMap));
  cache.set(cacheKey(url), p);
  return p;
}

export async function loadAvatarIndex(username: string): Promise<AvatarIndex> {
  const url = vUrl(`${dataBase}/${username}/avatars/index.json`);
  const existing = cache.get(cacheKey(url));
  if (existing) return existing as Promise<AvatarIndex>;
  const p = fetchJson<AvatarIndex>(url).catch(() => ({} as AvatarIndex));
  cache.set(cacheKey(url), p);
  return p;
}

export function clearChatCache(username: string): void {
  for (const key of cache.keys()) {
    if (key.includes(`/${username}/`)) {
      cache.delete(key);
    }
  }
}
