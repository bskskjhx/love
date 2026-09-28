import { Avatar as RadixAvatar } from 'radix-ui'
import { memo } from 'react'
import { dataUrl } from '../lib/api'
import { PEER_COLORS, colorIndex, initials } from '../lib/text'

interface Props {
  id: number | string
  name: string
  src?: string
  size?: number
  className?: string
}

export const Avatar = memo(function Avatar({ id, name, src, size = 40, className = '' }: Props) {
  const [a, b] = PEER_COLORS[colorIndex(id)]
  return (
    <RadixAvatar.Root className={`relative inline-flex shrink-0 select-none overflow-hidden rounded-full bg-fill align-middle ${className}`} style={{ width: size, height: size }}>
      {src && <RadixAvatar.Image src={dataUrl(src)} alt="" decoding="async" draggable={false} className="h-full w-full object-cover" />}
      <RadixAvatar.Fallback
        delayMs={src ? 600 : 0}
        aria-hidden
        className="flex h-full w-full items-center justify-center font-semibold text-white"
        style={{ fontSize: size * 0.4, background: `linear-gradient(180deg, ${a}, ${b})` }}
      >
        {initials(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  )
})
