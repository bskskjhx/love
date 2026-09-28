import { AccessibleIcon, Toolbar } from 'radix-ui'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ChevronLeft } from './Icons'

interface Props {
  title?: ReactNode
  subtitle?: ReactNode
  titleIcon?: ReactNode
  capsule?: boolean
  titleVisible?: boolean
  back?: { label?: string; onClick: () => void }
  left?: ReactNode
  right?: ReactNode
  onTitleClick?: () => void
  bottom?: ReactNode
  transparentUntilScroll?: boolean
  scrolled?: boolean
}

export function NavBar({ title, subtitle, titleIcon, capsule, titleVisible = true, back, left, right, onTitleClick, bottom, transparentUntilScroll, scrolled }: Props) {
  const solid = !transparentUntilScroll || scrolled
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-[var(--safe-top)]">
      <div
        aria-hidden
        className={`edge-top absolute inset-x-0 top-0 h-[calc(var(--safe-top)+var(--nav-h)+20px)] transition-opacity duration-300 ${solid ? 'opacity-100' : 'opacity-0'}`}
      />
      <div className="relative flex h-[var(--nav-h)] items-center gap-2 px-3">
        <div className={`z-10 flex items-center gap-2 ${titleIcon ? 'shrink-0' : 'min-w-0 flex-1'}`}>
          {back && <GlassButton label={back.label ? `返回${back.label}` : '返回'} onClick={back.onClick} icon={<ChevronLeft size={22} />} />}
          {left}
        </div>
        <div
          className={`flex justify-center transition-opacity duration-200 ${titleIcon ? 'min-w-0 flex-1' : 'absolute inset-x-[100px]'} ${titleVisible ? 'opacity-100' : 'opacity-0'}`}
        >
          <button
            type="button"
            disabled={!onTitleClick}
            onClick={onTitleClick}
            data-press className={`flex max-w-full min-w-0 items-center gap-2 leading-tight disabled:cursor-default ${titleVisible ? 'pointer-events-auto' : ''} ${titleIcon ? 'glass glass-press h-11 rounded-full py-1 pr-3.5 pl-1 max-[359px]:pl-3.5' : capsule ? 'glass h-11 rounded-full px-5' : ''}`}
          >
            {titleIcon}
            <span className={`flex min-w-0 flex-col ${titleIcon ? 'items-start' : 'items-center'}`}>
              <span className="max-w-full truncate text-[16px] font-semibold">{title}</span>
              {subtitle && <span className="max-w-full truncate text-[12px] text-label2">{subtitle}</span>}
            </span>
          </button>
        </div>
        <div className={`z-10 flex items-center justify-end ${titleIcon ? 'shrink-0' : 'flex-1'}`}>
          {right && (
            <Toolbar.Root aria-label="页面操作" className="glass pointer-events-auto flex h-11 items-center rounded-full px-0.5">
              {right}
            </Toolbar.Root>
          )}
        </div>
      </div>
      {bottom && <div className="pointer-events-auto relative">{bottom}</div>}
    </header>
  )
}

export function NavButton({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
  return (
    <Toolbar.Button onClick={onClick} title={label} data-press className="glass-press flex h-11 w-10 items-center justify-center rounded-full text-label">
      <AccessibleIcon.Root label={label}>{children}</AccessibleIcon.Root>
    </Toolbar.Button>
  )
}

export const GlassButton = forwardRef<HTMLButtonElement, { icon: ReactNode; label: string; className?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>>(
  function GlassButton({ icon, label, className = '', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        data-press
        title={label}
        {...rest}
        className={`glass glass-press pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-label ${className}`}
      >
        <AccessibleIcon.Root label={label}>{icon}</AccessibleIcon.Root>
      </button>
    )
  },
)
