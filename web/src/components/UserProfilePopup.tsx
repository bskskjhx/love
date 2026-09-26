import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Check, Bot, Crown, BadgeCheck, UserX, type LucideIcon } from 'lucide-react';
import type { UserProfile, UsersMap } from '@/types';
import { loadUsers } from '@/data';
import { Avatar } from '@/components/Avatar';
import { fmtDateFull, copyToClipboard, vibrate } from '@/utils';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

interface UserProfilePopupProps {
  username: string;
  userId: string | number;
  onClose: () => void;
  avatarUrl?: string;
}

/** Long enough to read the toast, short enough not to trail the sheet's exit. */
const COPY_FEEDBACK_MS = 1800;

export function UserProfilePopup({ username, userId, onClose, avatarUrl }: UserProfilePopupProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState<string>('');
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Opened from a message bubble, so Radix has no Trigger to restore focus to.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      restoreFocusRef.current = active;
    }
  }, []);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    loadUsers(username).then((users: UsersMap) => {
      if (cancelled) return;
      const p = users[String(userId)];
      setProfile(p || null);
      setName(p?.un || `用户${userId}`);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [username, userId]);

  const copyId = () => {
    copyToClipboard(String(userId));
    vibrate(10);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  const deleted = profile?.x || profile?.dl;
  const noProfile = !profile || deleted;

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          const target = restoreFocusRef.current;
          if (target && document.contains(target)) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        className="mx-auto flex w-full flex-col overflow-hidden rounded-t-2xl p-0 sm:max-w-md sm:rounded-2xl"
      >
        {/* Fixed header; the back button is this sheet's labelled close entry. */}
        <SheetHeader className="flex shrink-0 flex-row items-center gap-2 space-y-0 border-b border-border p-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭用户资料"
            className="mobile-touch-target flex shrink-0 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <SheetTitle className="min-w-0 truncate text-sm font-medium">用户资料</SheetTitle>
        </SheetHeader>

        {/* The only scrolling region. Bottom safe inset applied once, here. */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
          style={{ paddingBottom: 'calc(1rem + var(--app-safe-bottom))' }}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-20 w-20 animate-pulse rounded-full bg-secondary" />
              <p className="text-sm text-muted-foreground">加载中…</p>
              <p className="break-all text-xs text-muted-foreground">ID: {userId}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3 pb-4">
                <Avatar src={avatarUrl} name={name} seed={userId} size={80} />
                <div className="min-w-0 text-center">
                  <p className="break-words text-lg font-medium">{name}</p>
                  {profile?.un && (
                    <p className="break-all text-sm text-muted-foreground">@{profile.un}</p>
                  )}
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {profile?.bot && <Badge icon={Bot} label="机器人" />}
                  {profile?.pr && <Badge icon={Crown} label="会员" />}
                  {profile?.vf && <Badge icon={BadgeCheck} label="认证" />}
                  {deleted && <Badge icon={UserX} label="已注销" />}
                </div>
              </div>

              {noProfile ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  暂无详细资料，同步后可能出现
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <button
                    type="button"
                    onClick={copyId}
                    className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="shrink-0 text-muted-foreground">用户ID</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                      <span className="break-all">{userId}</span>
                      {copied ? (
                        <Check size={14} className="shrink-0 text-green-500" aria-hidden="true" />
                      ) : (
                        <Copy size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                    </span>
                  </button>
                  {profile?.b && (
                    <div className="rounded-lg bg-secondary px-3 py-2">
                      <p className="text-muted-foreground">简介</p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground">{profile.b}</p>
                    </div>
                  )}
                  {profile?.ts && (
                    <div className="flex justify-between gap-2 rounded-lg bg-secondary px-3 py-2">
                      <span className="shrink-0 text-muted-foreground">资料更新</span>
                      <span className="min-w-0 break-words text-right text-foreground">
                        {fmtDateFull(profile.ts)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Copy confirmation. A floating pill pinned to the foot of the sheet
            reads at a glance and never reflows the card, unlike an inline line.
            Always mounted so assistive tech announces the change on update.
            The sheet is portalled outside the app shell, so it owns its inset. */}
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 flex justify-center px-4"
          style={{ bottom: 'calc(1rem + var(--app-safe-bottom))' }}
        >
          {copied && (
            <span className="flex items-center gap-1.5 rounded-full bg-foreground/90 px-3 py-1.5 text-xs font-medium text-background shadow-lg animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
              <Check size={14} aria-hidden="true" />
              已复制用户ID
            </span>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Badge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
      <Icon size={12} aria-hidden="true" /> {label}
    </span>
  );
}
