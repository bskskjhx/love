import { Avatar } from '../components/Avatar'
import { ChevronRight, Hash, ListIcon, Lock, Pushpin, Search } from '../components/Icons'
import { NavBar, NavButton } from '../components/NavBar'
import { lastSearchPath } from '../lib/lastSearch'
import { shortDate } from '../lib/format'
import { goBack, navigate, paths } from '../lib/router'
import { useDocumentTitle } from '../lib/theme'
import { userName, withChat } from '../lib/text'
import { GENERAL } from '../lib/topics'
import type { ChatMeta, Topic, Users } from '../lib/types'

/** 话题图标：彩色圆形 + 首字，General 用 # */
function TopicIcon({ t }: { t: Topic }) {
  if (t.id === GENERAL)
    return (
      <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-fill2 text-label2">
        <Hash size={22} />
      </span>
    )
  return (
    <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-[22px] font-semibold text-white" style={{ background: t.color || '#6fb9f0' }}>
      {Array.from(t.title)[0]}
    </span>
  )
}

/** 论坛群的话题列表（同官方：进入开启话题的群先看到话题，也可以“以消息形式查看”） */
export function TopicsPage({ chatKey, meta, users: rawUsers }: { chatKey: string; meta: ChatMeta; users: Users }) {
  useDocumentTitle(meta.title)
  const users = withChat(rawUsers, meta)
  const topics = [...(meta.topics ?? [])]
    .filter((t) => !t.hidden || t.id === GENERAL)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.last?.date ?? 0) - (a.last?.date ?? 0))
  return (
    <div className="relative h-full bg-bg">
      <NavBar
        back={{ label: '群聊', onClick: () => goBack('/') }}
        title={meta.title}
        subtitle={`${topics.length} 个话题`}
        titleIcon={<Avatar id={meta.id} name={meta.title} src={meta.avatar} size={36} className="max-[359px]:hidden" />}
        onTitleClick={() => navigate(paths.info(chatKey))}
        right={
          <NavButton label="搜索" onClick={() => navigate(lastSearchPath(chatKey, meta.id))}>
            <Search />
          </NavButton>
        }
      />
      <div className="scroller absolute inset-0 pt-[calc(var(--safe-top)+var(--nav-h)+var(--player-h)+8px)] pb-[calc(var(--safe-bottom)+24px)]">
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <button
            type="button"
            data-press
            onClick={() => navigate(paths.all(chatKey))}
            className="flex w-full items-center gap-3 rounded-[20px] bg-fill px-3 py-2.5 text-left"
            style={{ '--press': 1.03 } as React.CSSProperties}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <ListIcon size={20} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[16px] font-semibold">所有消息</span>
              <span className="truncate text-[13px] text-label2">以消息形式查看，不按话题分开</span>
            </span>
            <ChevronRight className="shrink-0 text-label3" />
          </button>
        </div>
        <ul className="mx-auto max-w-3xl px-2">
          {topics.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                data-press
                onClick={() => navigate(paths.topic(chatKey, t.id))}
                className="press-row flex w-full items-center gap-3 rounded-[20px] py-2.5 pr-2 pl-2 text-left"
              >
                <TopicIcon t={t} />
                <span className="flex min-w-0 flex-1 flex-col self-stretch justify-center">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{t.title}</span>
                    {t.closed && <Lock size={13} className="shrink-0 text-label3" aria-label="已关闭" />}
                    {t.pinned && <Pushpin size={13} className="shrink-0 rotate-45 text-label3" aria-label="已置顶" />}
                    {t.last && <span className="shrink-0 text-[14px] text-label2 tabular-nums">{shortDate(t.last.date)}</span>}
                    <ChevronRight size={14} className="-mr-0.5 shrink-0 text-label3" />
                  </span>
                  <span className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[15px] leading-[1.25] text-label2">
                    {t.last ? (
                      <>
                        {t.last.from != null && <span className="text-label">{userName(users, t.last.from)}：</span>}
                        {t.last.text}
                      </>
                    ) : (
                      '还没有消息'
                    )}
                  </span>
                  {t.closed && <span className="text-[12px] text-label3">话题已关闭</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
