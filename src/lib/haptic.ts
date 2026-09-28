let label: HTMLLabelElement | null = null

export function haptic() {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(8)
    return
  }
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
