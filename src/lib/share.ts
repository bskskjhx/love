import { copyText, toast } from '../components/Toast'
import { dataUrl } from './api'

/** 在新标签页打开外部链接（Telegram 等），不把本页暴露给对方 */
export function openExternal(url: string | undefined) {
  window.open(url, '_blank', 'noopener')
}

/** 系统分享面板（手机上同官方“分享”）；不支持时退回复制 */
export async function shareText(text: string, url?: string, title?: string) {
  // 旧浏览器没有 navigator.share（类型上总是存在，运行时要判断）
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

/** 保存图片：iOS/安卓用分享面板里的“存储图像”，电脑直接下载 */
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
