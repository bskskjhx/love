import { copyText, toast } from '../components/Toast'
import { dataUrl } from './api'

export function openExternal(url: string | undefined) {
  window.open(url, '_blank', 'noopener')
}

export async function shareText(text: string, url?: string, title?: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  await copyText(url ? `${text}\n${url}`.trim() : text, url ? '链接已复制' : '已复制')
}

export async function saveImage(file: string, name = 'image') {
  const url = dataUrl(file)
  try {
    const blob = await (await fetch(url)).blob()
    const ext = file.split('.').pop() || 'jpg'
    const f = new File([blob], `${name}.${ext}`, { type: blob.type || 'image/jpeg' })
    if (matchMedia('(hover: none)').matches && navigator.canShare?.({ files: [f] })) {
      await navigator.share({ files: [f] })
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    toast('已开始下载')
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast('保存失败')
  }
}
