import { useEffect, useRef } from 'react'
import { useInView as useIntersectionObserver } from 'react-intersection-observer'
import { usePageActive } from './pageActive'

/** 元素是否在视口附近（react-intersection-observer）；所在页面被保活隐藏时一律视为不可见，离屏的 GIF/视频/动画贴纸随之暂停 */
export function useInView<T extends Element>(margin = '100px'): [(el: T | null) => void, boolean] {
  const { ref, inView } = useIntersectionObserver({ rootMargin: margin })
  const active = usePageActive()
  return [ref as (el: T | null) => void, inView && active]
}

/**
 * 所在页面不再是当前页（被保活隐藏）时关闭浮层。
 * Radix 模态 Dialog 打开期间会给 body 加 pointer-events: none，隐藏页面里的浮层若一直开着，整个应用都点不动。
 */
export function useCloseWhenInactive(open: boolean, onClose: () => void) {
  const active = usePageActive()
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (open && !active) close.current()
  }, [open, active])
}

