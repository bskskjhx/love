import { QueryClient } from '@tanstack/react-query'

/**
 * 存档是静态文件，同一路径的内容在一次会话里不会变：永不过期、永不回收（保活的页面随时要用），
 * 失败不缓存，下次请求重新获取。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, gcTime: Infinity, retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: false },
  },
})
