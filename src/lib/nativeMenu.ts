/**
 * 全局禁用浏览器原生菜单：电脑右键、安卓长按链接/图片时的系统菜单都不出现，
 * 需要菜单的地方（如消息）由应用自己的菜单处理。
 * 输入框除外，保留粘贴等编辑操作。
 */
export function blockNativeMenu() {
  window.addEventListener(
    'contextmenu',
    (e) => {
      const t = e.target as Element | null
      if (t?.closest?.('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
    },
    { capture: true },
  )
  // 拖拽图片/链接在手机上会触发系统预览
  window.addEventListener('dragstart', (e) => {
    const t = e.target as Element | null
    if (t instanceof HTMLImageElement || t instanceof HTMLAnchorElement) e.preventDefault()
  })
}
