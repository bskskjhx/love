// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { parseRoute, paths } from '../lib/router'

describe('router', () => {
  it('parseRoute', () => {
    expect(parseRoute('')).toEqual({ name: 'home' })
    expect(parseRoute('#/')).toEqual({ name: 'home' })
    expect(parseRoute('#/x')).toEqual({ name: 'notfound' })
    expect(parseRoute('#/c')).toEqual({ name: 'notfound' })
    expect(parseRoute('#/c/foo')).toEqual({ name: 'chat', chat: 'foo' })
    expect(parseRoute('#/c/a%20b/12')).toEqual({ name: 'chat', chat: 'a b', msg: 12 })
    expect(parseRoute('#/c/foo/0')).toEqual({ name: 'notfound' })
    expect(parseRoute('#/c/foo/1.5')).toEqual({ name: 'notfound' })
    expect(parseRoute('#/c/foo/info')).toEqual({ name: 'info', chat: 'foo' })
    expect(parseRoute('#/c/foo/stats')).toEqual({ name: 'stats', chat: 'foo', user: undefined })
    expect(parseRoute('#/c/foo/stats?u=-5')).toEqual({ name: 'stats', chat: 'foo', user: -5 })
    expect(parseRoute('#/c/foo/stats?u=')).toEqual({ name: 'stats', chat: 'foo', user: 0 })
    expect(parseRoute('#/c/foo/stats?u=x')).toEqual({ name: 'stats', chat: 'foo', user: undefined })
    expect(parseRoute('#/c/foo/all')).toEqual({ name: 'chat', chat: 'foo', all: true })
    expect(parseRoute('#/c/foo/media')).toEqual({ name: 'media', chat: 'foo', type: undefined, from: undefined })
    expect(parseRoute('#/c/foo/media?t=file&from=3')).toEqual({ name: 'media', chat: 'foo', type: 'file', from: 3 })
    expect(parseRoute('#/c/foo/t/4')).toEqual({ name: 'chat', chat: 'foo', topic: 4, msg: undefined })
    expect(parseRoute('#/c/foo/t/4/9')).toEqual({ name: 'chat', chat: 'foo', topic: 4, msg: 9 })
    expect(parseRoute('#/c/foo/t/0')).toEqual({ name: 'notfound' })
    expect(parseRoute('#/c/foo/search?q=a%20b&from=2&t=photo')).toEqual({ name: 'search', chat: 'foo', q: 'a b', from: 2, type: 'photo' })
    expect(parseRoute('#/c/foo/search')).toEqual({ name: 'search', chat: 'foo', q: '', from: undefined, type: undefined })
  })

  it('paths', () => {
    expect(paths.home()).toBe('/')
    expect(paths.chat('a b')).toBe('/c/a%20b')
    expect(paths.chat(-5, 3)).toBe('/c/-5/3')
    expect(paths.chat('x', 0)).toBe('/c/x')
    expect(paths.info('x')).toBe('/c/x/info')
    expect(paths.stats('x')).toBe('/c/x/stats')
    expect(paths.stats('x', 0)).toBe('/c/x/stats?u=0')
    expect(paths.all('x')).toBe('/c/x/all')
    expect(paths.topic('x', 2)).toBe('/c/x/t/2')
    expect(paths.topic('x', 2, 7)).toBe('/c/x/t/2/7')
    expect(paths.media('x')).toBe('/c/x/media')
    expect(paths.media('x', 'file', 0)).toBe('/c/x/media?t=file&from=0')
    expect(paths.media('x', undefined, 3)).toBe('/c/x/media?from=3')
    expect(paths.search('x')).toBe('/c/x/search')
    expect(paths.search('x', 'a b', 1, 'photo')).toBe('/c/x/search?q=a+b&from=1&t=photo')
    expect(paths.search('x', '', undefined, 'link')).toBe('/c/x/search?t=link')
  })

  it('paths 与 parseRoute 往返一致', () => {
    const p = paths.search('名字 #1', '你好 世界', -100, 'voice')
    expect(parseRoute('#' + p)).toEqual({ name: 'search', chat: '名字 #1', q: '你好 世界', from: -100, type: 'voice' })
  })
})
