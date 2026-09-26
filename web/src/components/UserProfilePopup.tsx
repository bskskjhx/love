import { useEffect, useState } from 'react';
import { ChevronLeft, Copy, Check, Bot, Crown, BadgeCheck, UserX, type LucideIcon } from 'lucide-react';
import type { UserProfile, UsersMap } from '@/types';
import { loadUsers } from '@/data';
import { Avatar } from '@/components/Avatar';
import { fmtDateFull } from '@/utils';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import { useRestoreFocus } from '@/hooks/useRestoreFocus';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';
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
  const [name, setName] = useState<string>('');
  const [copied, copy] = useCopyFeedback<boolean>(COPY_FEEDBACK_MS);
  const onCloseAutoFocus = useRestoreFocus();
  useBackButtonClose(true, onClose);

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

  const copyId = () => copy(true, String(userId));

  const deleted = profile?.x || profile?.dl;
  const noProfile = !profile || deleted;

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={onCloseAutoFocus}
        onDismiss={onClose}
        className="mx-auto flex w-full flex-col overflow-hidden rounded-t-ios-sheet p-0 sm:max-w-md sm:rounded-ios-sheet"
      >
        {/* Fixed header; the back button is this sheet's labelled close entry. */}
        <SheetHeader className="flex shrink-0 flex-row items-center gap-1 space-y-0 border-b border-separator p-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭用户资料"
            className="mobile-touch-target -ml-1 flex shrink-0 items-center justify-center rounded-full text-primary transition active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <SheetTitle className="min-w-0 truncate text-ios-headline">用户资料</SheetTitle>
        </SheetHeader>

        {/* The only scrolling region. Bottom safe inset applied once, here. */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
          style={{ paddingBottom: 'calc(1rem + var(--app-safe-bottom))' }}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-20 w-20 animate-pulse rounded-full bg-muted" />
              <p className="text-ios-subhead text-muted-foreground">加载中…</p>
              <p className="break-all text-ios-caption1 text-muted-foreground">ID: {userId}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3 pb-4">
                <Avatar src={avatarUrl} name={name} seed={userId} size={80} />
                <div className="min-w-0 text-center">
                  <p className="break-words text-ios-title3 font-semibold text-foreground">{name}</p>
                  {profile?.un && (
                    <p className="break-all text-ios-subhead text-muted-foreground">@{profile.un}</p>
                  )}
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {profile?.bot && <Badge icon={Bot} label="机器人" />}
                  {profile?.pr && <Badge icon={Crown} label="会员" />}
                  {profile?.vf && <Badge icon={BadgeCheck} label="认证" />}
                  {deleted && <Badge icon={UserX} label="已注销" tone="muted" />}
                </div>
              </div>

              {noProfile ? (
                <div className="py-4 text-center text-ios-subhead text-muted-foreground">
                  暂无详细资料，同步后可能出现
                </div>
              ) : (
                <div className="space-y-2 text-ios-body">
                  <div>
                    <button
                      type="button"
                      onClick={copyId}
                      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-ios-card bg-secondary px-4 py-3 transition-colors active:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="shrink-0 text-muted-foreground">用户ID</span>
                      <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                        <span className="break-all">{userId}</span>
                        {copied ? (
                          <Check size={14} className="shrink-0 text-system-green" aria-hidden="true" />
                        ) : (
                          <Copy size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                    </button>
                    {/* Copy confirmation embedded in the flow, directly under the
                        row it confirms. The row expands and collapses in place
                        instead of a floating overlay, so the card stays one
                        block. Copy stays mounted so the live region announces. */}
                    <div
                      role="status"
                      aria-live="polite"
                      className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                        copied ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                      }`}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <span className="mt-1.5 inline-flex items-center gap-1 px-1 text-ios-footnote font-medium text-system-green">
                          <Check size={12} aria-hidden="true" />
                          已复制用户ID
                        </span>
                      </div>
                    </div>
                  </div>
                  {profile?.b && (
                    <div className="rounded-ios-card bg-secondary px-4 py-3">
                      <p className="text-ios-footnote text-muted-foreground">简介</p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground">{profile.b}</p>
                    </div>
                  )}
                  {profile?.ts && (
                    <div className="flex justify-between gap-2 rounded-ios-card bg-secondary px-4 py-3">
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
      </SheetContent>
    </Sheet>
  );
}

function Badge({ icon: Icon, label, tone = 'accent' }: { icon: LucideIcon; label: string; tone?: 'accent' | 'muted' }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-ios-caption1 ${
        tone === 'accent' ? 'text-primary' : 'text-muted-foreground'
      }`}
    >
      <Icon size={12} aria-hidden="true" /> {label}
    </span>
  );
}
