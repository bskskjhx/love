import { Checkbox } from 'radix-ui'
import type { ReactNode } from 'react'
import { CheckCircle, Circle, Copy, Share } from '../components/Icons'

export function SelectRow({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div
      onClickCapture={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onToggle()
      }}
      className={`relative cursor-pointer transition-colors duration-200 ${on ? 'bg-accent/12' : ''}`}
    >
      <Checkbox.Root checked={on} onCheckedChange={onToggle} aria-label="选择这条消息" className="group absolute bottom-2 left-2.5 z-10 rounded-full text-accent">
        <Circle size={24} className="text-label3 group-data-[state=checked]:hidden" />
        <Checkbox.Indicator>
          <CheckCircle size={24} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <div className="pointer-events-none pl-[34px]">{children}</div>
    </div>
  )
}

export function SelectBars({ count: n, onCancel, onAll, onCopy, onShare }: { count: number; onCancel: () => void; onAll: () => void; onCopy: () => void; onShare: () => void }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 pt-[var(--safe-top)]">
        <div className="pointer-events-auto mx-auto flex h-[var(--nav-h)] max-w-3xl items-center gap-2 px-3">
          <button type="button" data-press onClick={onCancel} className="glass h-11 rounded-full px-4 text-[16px] font-medium text-accent">
            取消
          </button>
          <div className="glass flex h-11 flex-1 items-center justify-center rounded-full text-[16px] font-semibold">已选择 {n} 条</div>
          <button type="button" data-press onClick={onAll} className="glass h-11 rounded-full px-4 text-[16px] font-medium text-accent">
            全选
          </button>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--safe-bottom)+16px)] z-40 mx-auto flex max-w-md animate-pop justify-center gap-3 px-3">
        <button type="button" data-press disabled={!n} onClick={onCopy} className="glass pointer-events-auto flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[16px] font-medium text-accent disabled:text-label3">
          <Copy size={20} />
          复制
        </button>
        <button type="button" data-press disabled={!n} onClick={onShare} className="glass pointer-events-auto flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[16px] font-medium text-accent disabled:text-label3">
          <Share size={20} />
          分享
        </button>
      </div>
    </>
  )
}
