import { useRef, type ReactNode } from 'react'
import { VisuallyHidden } from 'radix-ui'
import { Drawer } from 'vaul'
import { Close } from './Icons'
import { GlassButton } from './NavBar'
import { useCloseWhenInactive } from '../lib/hooks'
import { blurActiveInput } from '../lib/viewport'

interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: ReactNode
  /** 右上角按钮，默认是圆形关闭按钮 */
  right?: ReactNode
}

/**
 * iOS 27 风格的悬浮玻璃面板（vaul Drawer，基于 Radix Dialog）：按住面板任意处下拉关闭（按速度与距离判断、
 * 内容滚动到顶后才开始拖动）、进出场动画、焦点锁定与归还、Esc 关闭、背景不可滚动都由 vaul / Radix 负责。
 */
export function Sheet({ open, onClose, children, title, right }: SheetProps) {
  useCloseWhenInactive(open, onClose)
  // 关闭动画期间父组件可能已清空内容（如 ProfileSheet 的 id 变成 null），沿用打开时最后一次的内容
  const kept = useRef({ children, title, right })
  if (open) kept.current = { children, title, right }
  const view = kept.current
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/25 dark:bg-black/45" />
        <Drawer.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="glass-sheet fixed inset-x-2 bottom-[max(8px,var(--safe-bottom),calc(var(--kb)+8px))] z-50 mx-auto flex max-h-[calc(100dvh-var(--kb)-var(--safe-top)-24px)] max-w-md flex-col overflow-hidden rounded-[var(--r-sheet)] outline-none"
        >
          <Drawer.Handle className="mt-1.5! h-[5px]! w-9! shrink-0 rounded-full! bg-label3! opacity-100!" />
          <div className="relative flex h-14 shrink-0 items-center justify-center px-14">
            {view.title ? (
              <Drawer.Title className="truncate text-[17px] font-semibold">{view.title}</Drawer.Title>
            ) : (
              <VisuallyHidden.Root asChild>
                <Drawer.Title>面板</Drawer.Title>
              </VisuallyHidden.Root>
            )}
            <div className="absolute top-1.5 right-3 flex items-center">
              {view.right ?? (
                <Drawer.Close asChild>
                  <GlassButton label="关闭" icon={<Close size={18} />} className="h-10 w-10" />
                </Drawer.Close>
              )}
            </div>
          </div>
          <div onTouchMove={blurActiveInput} className="scroller min-h-0 flex-1">
            {view.children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
