import copy from 'copy-to-clipboard'
import { Toast as RadixToast } from 'radix-ui'
import { useEffect, useState } from 'react'

let push: ((msg: string) => void) | undefined

export function toast(msg: string) {
  push?.(msg)
}

export function ToastHost() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([])
  useEffect(() => {
    push = (text) => setItems([{ id: Date.now(), text }])
    return () => {
      push = undefined
    }
  }, [])
  return (
    <RadixToast.Provider duration={1800} swipeDirection="up" label="通知">
      {items.map((t) => (
        <RadixToast.Root
          key={t.id}
          defaultOpen
          onOpenChange={(open) => !open && setItems((cur) => cur.filter((x) => x.id !== t.id))}
          className="glass rounded-full px-5 py-2.5 text-[15px] font-medium text-label data-[state=closed]:animate-toast-out data-[state=open]:animate-toast data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)]"
        >
          <RadixToast.Title>{t.text}</RadixToast.Title>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+64px)] z-[60] m-0 flex list-none flex-col items-center p-0 outline-none [&>li]:pointer-events-auto" />
    </RadixToast.Provider>
  )
}

export async function copyText(text: string, done = '已复制') {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    copy(text)
  }
  toast(done)
}
