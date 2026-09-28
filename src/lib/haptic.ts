let label: HTMLLabelElement | null = null

/** 轻触觉反馈：Android 走 vibrate；iOS 18+ Safari 借助 switch 复选框的系统触感 */
export function haptic() {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(8)
    return
  }
  // 常驻一个隐藏开关，避免每次反馈都增删节点引起样式重算
  if (!label) {
    label = document.createElement('label')
    label.ariaHidden = 'true'
    label.style.display = 'none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    label.appendChild(input)
    document.head.appendChild(label)
  }
  label.click()
}
