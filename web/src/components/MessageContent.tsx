import { useState } from 'react';
import { Download, MapPin, User as UserIcon } from 'lucide-react';
import type { Message } from '@/types';
import {
  fmtDur, fmtBytes, mediaLabel, mediaExt, buildMediaUrl,
} from '@/utils';
import { renderText } from '@/components/textRender';
import { VoicePlayer } from '@/components/VoicePlayer';
import { AlbumGrid } from '@/components/AlbumGrid';
import type { AlbumItem, LightboxItem } from '@/types';

interface MessageContentProps {
  msg: Message;
  username: string;
  searchTerms?: string[];
  onOpenLightbox: (items: LightboxItem[], index: number) => void;
  onJumpTo: (msgId: number) => void;
  messagesById: Map<number, Message>;
}

/** Aspect ratio for reserving media space before the bytes arrive. */
function mediaAspect(msg: Message): string | undefined {
  return msg.mw && msg.mh ? `${msg.mw} / ${msg.mh}` : undefined;
}

export function MessageContent({ msg, username, searchTerms, onOpenLightbox, onJumpTo, messagesById }: MessageContentProps) {
  return (
    <div className="min-w-0 space-y-1">
      {msg.f && <ForwardMark text={msg.f} />}
      {msg.r && <ReplyRef msgId={msg.r} messagesById={messagesById} onJump={onJumpTo} />}
      <TextContent text={msg.t} searchTerms={searchTerms} />
      <MediaContent msg={msg} username={username} onOpenLightbox={onOpenLightbox} />
      {msg.pl && <PollView poll={msg.pl} />}
      {msg.geo && <GeoView geo={msg.geo} />}
      {msg.ct && <ContactView contact={msg.ct} />}
      {msg.wp && msg.t && <WebPreviewView wp={msg.wp} />}
      {msg.rx && msg.rx.length > 0 && <ReactionsView reactions={msg.rx} />}
    </div>
  );
}

function ForwardMark({ text }: { text: string }) {
  return <p className="break-words text-xs text-muted-foreground">转发自 {text}</p>;
}

function ReplyRef({ msgId, messagesById, onJump }: { msgId: number; messagesById: Map<number, Message>; onJump: (id: number) => void }) {
  const ref = messagesById.get(msgId);
  const previewText = ref ? (ref.t ? truncate(ref.t, 40) : ref.m ? `[${mediaLabel(ref.m)}]` : '') : '';
  return (
    <button
      type="button"
      onClick={() => onJump(msgId)}
      aria-label={`跳转到被回复的消息 #${msgId}`}
      className="block w-full min-w-0 rounded-r border-l-2 border-primary bg-accent px-2 py-1 text-left text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-primary">#{msgId}</span>
      {previewText && <span className="ml-1 break-words">{previewText}</span>}
    </button>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.substring(0, max) + '…';
}

function TextContent({ text, searchTerms }: { text?: string; searchTerms?: string[] }) {
  if (!text) return null;
  const { segments } = renderText(text, searchTerms);
  return (
    <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed">
      {segments.map((seg, i) => {
        if (seg.type === 'url') {
          return (
            <a key={i} href={seg.text} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">
              {seg.text}
            </a>
          );
        }
        if (seg.type === 'command') {
          return <span key={i} className="rounded bg-accent px-0.5 text-primary">{seg.text}</span>;
        }
        if (seg.type === 'search') {
          return <mark key={i} className="rounded bg-yellow-200 px-0.5">{seg.text}</mark>;
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </p>
  );
}

function MediaContent({ msg, username, onOpenLightbox }: { msg: Message; username: string; onOpenLightbox: (items: LightboxItem[], index: number) => void }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!msg.m) return null;

  const ext = mediaExt(msg);
  const mediaUrl = buildMediaUrl(username, msg.i, ext);
  const aspect = mediaAspect(msg);

  if (msg.m === 'photo' || msg.m === 'sticker') {
    if (imgFailed) return <span className="text-xs text-muted-foreground">[{mediaLabel(msg.m)}]</span>;
    return (
      <button
        type="button"
        onClick={() => onOpenLightbox([{ type: 'image', src: mediaUrl, msgId: msg.i }], 0)}
        aria-label="查看图片"
        className="block max-w-full overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={mediaUrl}
          alt=""
          className="max-h-60 max-w-full rounded-lg object-cover"
          style={aspect ? { aspectRatio: aspect } : undefined}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      </button>
    );
  }

  if (msg.m === 'video') {
    if (imgFailed) {
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>[{mediaLabel(msg.m)}]</span>
          {username && (
            <a
              href={`https://t.me/${username}/${msg.i}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-xs text-primary underline"
            >
              在 Telegram 中查看
            </a>
          )}
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onOpenLightbox([{ type: 'video', src: mediaUrl, poster: mediaUrl.replace('.mp4', '.jpg'), dur: msg.dur, msgId: msg.i }], 0)}
        aria-label="播放视频"
        className="relative block max-w-full overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={mediaUrl.replace('.mp4', '.jpg')}
          alt=""
          className="max-h-60 max-w-full rounded-lg object-cover"
          style={aspect ? { aspectRatio: aspect } : undefined}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white">▶</div>
        </div>
        {msg.dur && (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{fmtDur(msg.dur)}</span>
        )}
      </button>
    );
  }

  if (msg.m === 'voice') {
    // Marked so the message long-press never competes with the player controls.
    return (
      <div data-no-menu>
        <VoicePlayer src={mediaUrl} dur={msg.dur} />
      </div>
    );
  }

  if (msg.m === 'document') {
    return (
      <a
        href={mediaUrl}
        download={msg.doc || `file_${msg.i}.${ext}`}
        className="flex min-w-0 items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Download size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="flex min-w-0 flex-col">
          <span className="break-all text-foreground">{msg.doc || `file_${msg.i}`}</span>
          {msg.sz && <span className="text-xs text-muted-foreground">{fmtBytes(msg.sz)}</span>}
        </div>
      </a>
    );
  }

  return <span className="text-xs text-muted-foreground">[{mediaLabel(msg.m)}]</span>;
}

export function AlbumContent({
  items,
  onOpenLightbox,
}: {
  items: AlbumItem[];
  onOpenLightbox: (items: LightboxItem[], index: number) => void;
}) {
  const lightboxItems: LightboxItem[] = items.map((item) =>
    item.kind === 'video'
      ? { type: 'video', src: item.mediaSrc, poster: item.thumbSrc, dur: item.dur, msgId: item.id }
      : { type: 'image', src: item.mediaSrc, msgId: item.id }
  );
  return <AlbumGrid items={items} onOpen={(idx) => onOpenLightbox(lightboxItems, idx)} />;
}

function PollView({ poll }: { poll: NonNullable<Message['pl']> }) {
  const total = poll.o.reduce((s, o) => s + o.v, 0);
  return (
    <div className="min-w-0 rounded-lg border border-border p-2">
      <p className="mb-1.5 break-words text-sm font-medium">{poll.q}</p>
      <div className="space-y-1">
        {poll.o.map((opt, i) => {
          const pct = total > 0 ? Math.round((opt.v / total) * 100) : 0;
          return (
            <div key={i} className="min-w-0">
              <div className="flex justify-between gap-2 text-xs">
                <span className="min-w-0 break-words">{opt.t}</span>
                <span className="shrink-0 text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {poll.mc ? '多选' : '单选'}{poll.c ? ' · 投票已结束' : ''}
      </p>
    </div>
  );
}

function GeoView({ geo }: { geo: NonNullable<Message['geo']> }) {
  return (
    <a
      href={`https://www.google.com/maps?q=${geo.lat},${geo.lon}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-0 items-center gap-1.5 text-sm text-primary"
    >
      <MapPin size={16} className="shrink-0" aria-hidden="true" />
      <span className="break-all">{geo.lat.toFixed(4)}, {geo.lon.toFixed(4)}</span>
    </a>
  );
}

function ContactView({ contact }: { contact: NonNullable<Message['ct']> }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <UserIcon size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="break-words text-foreground">{contact.n}</p>
        <p className="break-all text-xs text-muted-foreground">{contact.p}</p>
      </div>
    </div>
  );
}

function WebPreviewView({ wp }: { wp: NonNullable<Message['wp']> }) {
  let domain = wp.url;
  try { domain = new URL(wp.url).hostname; } catch { /* keep */ }
  return (
    <a
      href={wp.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block min-w-0 rounded-lg border border-border p-2 text-xs transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="break-words font-medium text-foreground">{wp.title || domain}</p>
      {wp.desc && <p className="mt-0.5 line-clamp-3 break-words text-muted-foreground">{wp.desc}</p>}
      <p className="mt-0.5 break-all text-muted-foreground">{domain}</p>
    </a>
  );
}

function ReactionsView({ reactions }: { reactions: NonNullable<Message['rx']> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {reactions.map((r, i) => (
        <span key={i} className="flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs">
          {r.e} <span className="text-muted-foreground">{r.c}</span>
        </span>
      ))}
    </div>
  );
}
