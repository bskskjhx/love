import { AccessibleIcon, VisuallyHidden } from 'radix-ui'
import { forwardRef, useId } from 'react'
import { Search, XCircle } from './Icons'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  onSubmit?: () => void
  glass?: boolean
}

export const SearchField = forwardRef<HTMLInputElement, Props>(function SearchField({ value, onChange, placeholder = '搜索', autoFocus, onSubmit, glass }, ref) {
  const id = useId()
  return (
    <form
      role="search"
      data-press
      style={{ '--press': 1.03 } as React.CSSProperties}
      className={`relative flex h-11 flex-1 items-center rounded-full text-label2 ${glass ? 'glass' : 'bg-fill'}`}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
        ;(document.activeElement as HTMLElement | null)?.blur()
      }}
    >
      <VisuallyHidden.Root asChild>
        <label htmlFor={id}>{placeholder}</label>
      </VisuallyHidden.Root>
      <Search size={18} className="pointer-events-none absolute left-3.5" />
      <input
        ref={ref}
        id={id}
        type="search"
        enterKeyHint="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full appearance-none bg-transparent pr-10 pl-10 text-[17px] text-label outline-none placeholder:text-label2 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} data-press className="hit absolute right-3 text-label3" style={{ '--press': 1.25 } as React.CSSProperties}>
          <AccessibleIcon.Root label="清除">
            <XCircle />
          </AccessibleIcon.Root>
        </button>
      )}
    </form>
  )
})
