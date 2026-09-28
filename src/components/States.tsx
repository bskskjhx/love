import type { ReactNode } from 'react'

export function Spinner({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`animate-spin text-label2 ${className}`} aria-label="加载中">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function CenterState({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-[50dvh] flex-col items-center justify-center gap-3 p-8 text-center text-label2">{children}</div>
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <CenterState>
      <div className="text-[17px] text-label">加载失败</div>
      <div className="text-[13px]">{error.message}</div>
      {retry && (
        <button onClick={retry} data-press className="mt-2 rounded-full bg-fill px-5 py-2 text-[15px] font-medium text-accent">
          重试
        </button>
      )}
    </CenterState>
  )
}

export function LoadState({ error, retry }: { error: Error | null; retry?: () => void }) {
  if (error) return <ErrorState error={error} retry={retry} />
  return (
    <CenterState>
      <Spinner />
    </CenterState>
  )
}
