import { lazy } from 'react'

const loaders = {
  search: () => import('./pages/Search'),
  media: () => import('./pages/SharedMedia'),
  info: () => import('./pages/Info'),
  lightbox: () => import('./chat/Lightbox'),
}

export const SearchPage = lazy(() => loaders.search().then((m) => ({ default: m.SearchPage })))
export const SharedMediaPage = lazy(() => loaders.media().then((m) => ({ default: m.SharedMediaPage })))
export const InfoPage = lazy(() => loaders.info().then((m) => ({ default: m.InfoPage })))
export const StatsPage = lazy(() => import('./pages/Stats').then((m) => ({ default: m.StatsPage })))
export const Lightbox = lazy(() => loaders.lightbox().then((m) => ({ default: m.Lightbox })))

export function prefetchLazy() {
  for (const load of Object.values(loaders)) void load().catch(() => {})
}
