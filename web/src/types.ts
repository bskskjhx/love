export interface ChatSummary {
  username: string;
  title?: string;
  count: number;
  last_date: number;
  lp: string;
}

export interface ChunkInfo {
  file: string;
  first_id: number;
  last_id: number;
  first_date: number;
  last_date: number;
}

export interface ChatMeta {
  chunks: ChunkInfo[];
  first_date: number;
  last_date: number;
  pinned_id?: number;
}

export interface PollOption {
  t: string;
  v: number;
}

export interface Poll {
  q: string;
  o: PollOption[];
  c?: boolean;
  mc?: boolean;
}

export interface Geo {
  lat: number;
  lon: number;
}

export interface Contact {
  n: string;
  p: string;
}

export interface WebPreview {
  url: string;
  title?: string;
  desc?: string;
}

export interface Reaction {
  e: string;
  c: number;
}

export interface Message {
  i: number;
  d: number;
  t?: string;
  u?: number | string;
  n?: string;
  r?: number;
  f?: string;
  m?: string;
  e?: boolean;
  g?: string;
  mw?: number;
  mh?: number;
  dur?: number;
  doc?: string;
  sz?: number;
  pl?: Poll;
  geo?: Geo;
  ct?: Contact;
  wp?: WebPreview;
  rx?: Reaction[];
}

export interface UserProfile {
  /** Display name, as the sender picker and message rows show it. */
  n?: string;
  un?: string;
  b?: string;
  bot?: boolean;
  pr?: boolean;
  vf?: boolean;
  dl?: boolean;
  x?: boolean;
  ts?: number;
}

export type UsersMap = Record<string, UserProfile>;

export interface AvatarIndex {
  chat?: { ok: number; ts: number };
  ok?: Record<string, number>;
}

export interface AlbumItem {
  id: number;
  kind: 'photo' | 'video' | 'sticker' | string;
  thumbSrc: string;
  mediaSrc: string;
  dur?: number;
}

export interface LightboxItem {
  type: 'image' | 'video';
  src: string;
  poster?: string;
  dur?: number;
  msgId?: number;
}
