import { useEffect, useState } from 'react'

type Hljs = typeof import('highlight.js/lib/common').default

let loading: Promise<Hljs> | undefined
const load = () => (loading ??= import('highlight.js/lib/common').then((m) => m.default))

export function highlightWith(hljs: Hljs, code: string, lang?: string): string {
  const name = lang?.trim().toLowerCase()
  if (name && hljs.getLanguage(name)) return hljs.highlight(code, { language: name, ignoreIllegals: true }).value
  return hljs.highlightAuto(code).value
}

export function useHighlight(code: string, lang?: string): string | undefined {
  const [html, setHtml] = useState<string>()
  useEffect(() => {
    let alive = true
    setHtml(undefined)
    void load().then((hljs) => alive && setHtml(highlightWith(hljs, code, lang)))
    return () => {
      alive = false
    }
  }, [code, lang])
  return html
}
