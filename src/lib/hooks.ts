import { useEffect, useRef } from 'react'
import { useInView as useIntersectionObserver } from 'react-intersection-observer'
import { usePageActive } from './pageActive'

export function useInView<T extends Element>(margin = '100px'): [(el: T | null) => void, boolean] {
  const { ref, inView } = useIntersectionObserver({ rootMargin: margin })
  const active = usePageActive()
  return [ref as (el: T | null) => void, inView && active]
}

export function useCloseWhenInactive(open: boolean, onClose: () => void) {
  const active = usePageActive()
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (open && !active) close.current()
  }, [open, active])
}

