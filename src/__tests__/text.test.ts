import { describe, expect, it } from 'vitest'
import { activeMembers, colorIndex, initials, mediaLabel, memberTitle, previewOf, senderTitle, serviceText, userName, userTitle, withChat } from '../lib/text'
import type { Message, Service, Users } from '../lib/types'

const users: Users = {
  '1': { name: 'Alice', count: 3, title: '群主' },
  '2': { name: 'Bob', count: 10, role: 'admin', title: 'Mod' },
  '3': { name: 'Carol' },
  '-100': { name: 'Group', title: 'Anon' },
}
const msg = (p: Partial<Message>): Message => ({ id: 1, date: 0, ...p })

describe('text', () => {
  it('userName', () => {
    expect(userName(users, null)).toBe('')
    expect(userName(users, undefined)).toBe('')
    expect(userName(users, 1)).toBe('Alice')
    expect(userName(users, 99)).toBe('未知用户')
    expect(userName(undefined, 1)).toBe('未知用户')
  })

  it('withChat 补齐群组自身并保留原对象', () => {
    const out = withChat(users, { id: -100, title: 'T', avatar: 'a.jpg' })
    expect(out['-100']).toEqual({ name: 'Group', title: 'Anon', avatar: 'a.jpg', chat: true })
    expect(withChat({}, { id: -5, title: 'T' })['-5']).toEqual({ name: 'T', avatar: undefined, chat: true })
    expect(users['-100'].chat).toBeUndefined()
  })

  it('userTitle / senderTitle / memberTitle', () => {
    expect(userTitle(users['1'])).toEqual({ text: '群主', owner: true })
    expect(userTitle(users['2'])).toEqual({ text: 'Mod', owner: false })
    expect(userTitle(users['3'])).toBeUndefined()
    expect(userTitle(undefined)).toBeUndefined()
    expect(senderTitle(msg({ from: -100 }), users, -100)).toEqual({ text: 'Anon', owner: true })
    expect(senderTitle(msg({ from: -100, sig: 'S' }), users, -100)).toEqual({ text: 'S', owner: true })
    expect(senderTitle(msg({ from: -7 }), {}, -7)).toEqual({ text: '匿名管理员', owner: true })
    expect(senderTitle(msg({}), users, -100)).toBeUndefined()
    expect(memberTitle(users['3'], true)).toEqual({ text: '匿名管理员', owner: true })
  })

  it('mediaLabel', () => {
    expect(mediaLabel(msg({}))).toBe('')
    expect(mediaLabel(msg({ media: { type: 'webpage' } }))).toBe('')
    expect(mediaLabel(msg({ media: { type: 'photo' } }))).toBe('图片')
    expect(mediaLabel(msg({ media: { type: 'sticker', emoji: '😀' } }))).toBe('😀 贴纸')
    expect(mediaLabel(msg({ media: { type: 'sticker' } }))).toBe('贴纸')
    expect(mediaLabel(msg({ media: { type: 'poll', poll: { q: 'Q', opts: [] } } }))).toBe('📊 Q')
    expect(mediaLabel(msg({ media: { type: 'file', name: 'a.pdf' } }))).toBe('📎 a.pdf')
    expect(mediaLabel(msg({ media: { type: 'file' } }))).toBe('文件')
    expect(mediaLabel(msg({ media: { type: 'audio', performer: 'P', title: 'T' } }))).toBe('🎵 P - T')
    expect(mediaLabel(msg({ media: { type: 'audio' } }))).toBe('🎵 音频')
  })

  it('serviceText 覆盖全部类型', () => {
    const cases: [Service, string][] = [
      [{ type: 'join' }, 'A 加入了群组'],
      [{ type: 'add', users: [1, 2] }, 'A 邀请了 Alice、Bob'],
      [{ type: 'leave' }, 'A 离开了群组'],
      [{ type: 'kick', users: [3] }, 'A 移除了 Carol'],
      [{ type: 'title', title: 'X' }, 'A 将群名称修改为「X」'],
      [{ type: 'photo' }, 'A 更新了群头像'],
      [{ type: 'photo_del' }, 'A 删除了群头像'],
      [{ type: 'pin' }, 'A 置顶了一条消息'],
      [{ type: 'create', title: 'G' }, 'A 创建了群组「G」'],
      [{ type: 'migrate' }, '群组已升级为超级群组'],
      [{ type: 'call' }, 'A 发起了语音聊天'],
      [{ type: 'call', dur: 150 }, '语音聊天已结束（3 分钟）'],
      [{ type: 'call_scheduled' }, 'A 预约了语音聊天'],
      [{ type: 'call_invite', users: [1] }, 'A 邀请 Alice 加入语音聊天'],
      [{ type: 'ttl', period: 86400 * 7 }, 'A 开启了消息自动删除（7 天）'],
      [{ type: 'ttl' }, 'A 关闭了消息自动删除'],
      [{ type: 'topic_create', title: 'T' }, 'A 创建了话题「T」'],
      [{ type: 'topic_edit', title: 'T' }, 'A 修改了话题「T」'],
      [{ type: 'topic_edit' }, 'A 修改了话题'],
      [{ type: 'clear' }, '聊天记录已清空'],
      [{ type: 'screenshot' }, 'A 截取了屏幕'],
      [{ type: 'custom', text: 'hi' }, 'hi'],
      [{ type: 'custom' }, ''],
      [{ type: 'other', name: 'Foo' }, 'A [Foo]'],
      [{ type: 'other' }, 'A [系统消息]'],
    ]
    for (const [svc, out] of cases) expect(serviceText(svc, 'A', users)).toBe(out)
    expect(serviceText({ type: 'pin' }, 'A', users, 'hello')).toBe('A 置顶了「hello」')
  })

  it('previewOf', () => {
    expect(previewOf(msg({ text: ' a \n b ' }))).toBe('a b')
    expect(previewOf(msg({ text: 'x', media: { type: 'photo' } }))).toBe('图片，x')
    expect(previewOf(msg({ media: { type: 'webpage', url: 'u' } }))).toBe('u')
    expect(previewOf(msg({ media: { type: 'webpage' } }))).toBe('')
    expect(previewOf(msg({ from: 1, svc: { type: 'pin' }, reply: { id: 2, text: 'p' } }), users)).toBe('Alice 置顶了「p」')
  })

  it('colorIndex / initials', () => {
    expect(colorIndex(10)).toBe(3)
    expect(colorIndex(-10)).toBe(3)
    expect(colorIndex('ab')).toBe((97 + 98) % 7)
    expect(initials('  ')).toBe('?')
    expect(initials('张三')).toBe('张')
    expect(initials('john smith')).toBe('JS')
    expect(initials('john')).toBe('J')
    expect(initials('😀 x')).toBe('😀X')
  })

  it('activeMembers 按发言数排序，include 保留 0 发言者', () => {
    expect(activeMembers(users).map(([id]) => id)).toEqual(['2', '1'])
    expect(activeMembers(users, 3).map(([id]) => id)).toEqual(['2', '1', '3'])
  })
})
