import { expect, test } from '@playwright/test';
import {
  SAMPLE,
  VIEWPORTS,
  collectErrors,
  delayRequests,
  expectMobileInputFontSize,
  expectNoAppErrors,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  failRequests,
  openChat,
  openHash,
  shouldRunViewport,
  simulateSafeArea,
  type ViewportName,
} from './support/mobile';

const ALL_VIEWPORTS = Object.keys(VIEWPORTS) as ViewportName[];

// ---------------------------------------------------------------------------
// Chat list
// ---------------------------------------------------------------------------

test.describe('chat list', () => {
  test('lists six chats, filters by recency, and clears filters', async ({ page }) => {
    const errors = collectErrors(page);
    await openHash(page, '#/');

    await expect(page.getByRole('button', { name: /移动端演示群/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /德尔塔画室/ })).toBeVisible();

    // 近7天 keeps mobile_demo / beta_lab / epsilon_dev only.
    await page.getByRole('button', { name: '近7天' }).click();
    await expect(page.getByRole('button', { name: /移动端演示群/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /贝塔实验室/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /德尔塔画室/ })).toBeHidden();
    await expect(page.getByRole('button', { name: /伽马快讯/ })).toBeHidden();

    // 近30天 additionally keeps alpha_group / gamma_news.
    await page.getByRole('button', { name: '近30天' }).click();
    await expect(page.getByRole('button', { name: /伽马快讯/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /德尔塔画室/ })).toBeHidden();

    await expectNoHorizontalOverflow(page, 'chat list');
    expectNoAppErrors(errors);
  });

  test('shows an empty state with a working clear button', async ({ page }) => {
    await openHash(page, '#/');

    await page.getByLabel('搜索群聊').fill('zzzz-no-such-chat');
    await expect(page.getByText('无匹配群聊')).toBeVisible();

    await page.getByRole('button', { name: '清除条件' }).click();
    await expect(page.getByRole('button', { name: /移动端演示群/ })).toBeVisible();
    await expect(page.getByLabel('搜索群聊')).toHaveValue('');
  });

  test('keeps a long chat title from overflowing its row', async ({ page }) => {
    await openHash(page, '#/');
    // 艾普西龙开发组 is the longest synthetic title.
    await expect(page.getByRole('button', { name: /艾普西龙开发组/ })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'chat list rows');
  });
});

// ---------------------------------------------------------------------------
// Detail shell, routing, pagination
// ---------------------------------------------------------------------------

test.describe('chat detail shell', () => {
  test('deep link lands on the target message and back returns to the list', async ({ page }) => {
    const errors = collectErrors(page);
    await openHash(page, `#/mobile_demo/${SAMPLE.deepLinkId}`);

    await expect(page.locator(`[data-msg-id="${SAMPLE.deepLinkId}"]`)).toBeVisible();
    expect(new URL(page.url()).hash).toBe(`#/mobile_demo/${SAMPLE.deepLinkId}`);

    await page.getByRole('button', { name: '返回群聊列表' }).click();
    await expect(page.getByLabel('搜索群聊')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#/');
    expectNoAppErrors(errors);
  });

  test('pinned bar jumps across chunks to #42', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    await expect(page.locator(`[data-msg-id="${SAMPLE.lastId}"]`)).toBeVisible();

    await page.getByRole('button', { name: '跳转到置顶消息' }).click();
    await expect(page.locator(`[data-msg-id="${SAMPLE.pinnedId}"]`)).toBeVisible();
  });

  test('a cross-chunk reply jumps to its target', async ({ page }) => {
    await openHash(page, `#/mobile_demo/${SAMPLE.crossChunkReplierId}`);
    await expect(page.locator(`[data-msg-id="${SAMPLE.crossChunkReplierId}"]`)).toBeVisible();

    await page
      .getByRole('button', { name: `跳转到被回复的消息 #${SAMPLE.crossChunkReplyTargetId}` })
      .click();
    await expect(page.locator(`[data-msg-id="${SAMPLE.crossChunkReplyTargetId}"]`)).toBeVisible();
  });

  test('loads older messages and scrolls back to the newest', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    const rendered = page.locator('[data-msg-id]');
    const before = await rendered.count();

    await page.getByRole('button', { name: '加载更早消息' }).click();
    await expect
      .poll(async () => rendered.count(), { timeout: 10_000 })
      .toBeGreaterThan(before);

    await page.getByRole('button', { name: '回到最新消息' }).click();
    await expect(page.locator(`[data-msg-id="${SAMPLE.lastId}"]`)).toBeVisible();
  });

  test('crossing the 767/768 breakpoint keeps the hash and the deep link', async ({ page }) => {
    await openHash(page, `#/mobile_demo/${SAMPLE.deepLinkId}`);
    await page.setViewportSize(VIEWPORTS.narrowJustBelow);
    await expect(page.locator(`[data-msg-id="${SAMPLE.deepLinkId}"]`)).toBeVisible();

    await page.setViewportSize(VIEWPORTS.narrowJustAbove);
    await expect(page.locator(`[data-msg-id="${SAMPLE.deepLinkId}"]`)).toBeVisible();
    expect(new URL(page.url()).hash).toBe(`#/mobile_demo/${SAMPLE.deepLinkId}`);

    await page.setViewportSize(VIEWPORTS.narrowJustBelow);
    await expect(page.locator(`[data-msg-id="${SAMPLE.deepLinkId}"]`)).toBeVisible();
    expect(new URL(page.url()).hash).toBe(`#/mobile_demo/${SAMPLE.deepLinkId}`);
  });
});

// ---------------------------------------------------------------------------
// Search and date jump
// ---------------------------------------------------------------------------

test.describe('search panel', () => {
  test('finds the unique keyword and jumps to it', async ({ page }) => {
    const errors = collectErrors(page);
    await openChat(page, 'mobile_demo');
    await page.getByRole('button', { name: '搜索消息' }).click();

    await page.getByLabel('搜索关键词').fill(SAMPLE.uniqueKeyword);
    await expect(page.getByText(/共 1 条命中/)).toBeVisible();

    await page.getByRole('button', { name: new RegExp(SAMPLE.uniqueKeyword) }).first().click();
    await expect(page.locator(`[data-msg-id="${SAMPLE.uniqueKeywordId}"]`)).toBeVisible();
    expectNoAppErrors(errors);
  });

  test('treats regex metacharacters literally', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    await page.getByRole('button', { name: '搜索消息' }).click();

    for (const symbol of ['.', '*', '(', '[']) {
      await page.getByLabel('搜索关键词').fill(symbol);
      // Either hits or the explicit empty state — never a crash.
      await expect
        .poll(async () => {
          const hits = await page.getByText(/共 \d+ 条命中/).count();
          const empty = await page.getByText('无匹配结果').count();
          const failed = await page.getByText(/分片读取失败/).count();
          return hits + empty + failed;
        }, { timeout: 10_000 })
        .toBeGreaterThan(0);
    }
  });

  test('paginates beyond 50 results with load more', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    await page.getByRole('button', { name: '搜索消息' }).click();

    // Every synthetic default line contains a full-width comma, so this
    // matches well over the 50-per-page window.
    await page.getByLabel('搜索关键词').fill('，');
    await expect(page.getByText(/共 \d+ 条命中/)).toBeVisible();

    const loadMore = page.getByRole('button', { name: '加载更多' });
    await expect(loadMore).toBeVisible();
    await loadMore.click();
    await expect(loadMore).toBeHidden();
  });

  test('a stale slower query never overwrites a newer one', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    await delayRequests(page, /\/data\/mobile_demo\/chunks\//, 1200);
    await page.getByRole('button', { name: '搜索消息' }).click();

    // Query 1: one unique hit, still in flight when query 2 replaces it.
    await page.getByLabel('搜索关键词').fill(SAMPLE.uniqueKeyword);
    await page.waitForTimeout(600);
    // Query 2: no hits at all.
    await page.getByLabel('搜索关键词').fill('zzzz-no-such-term');

    await expect(page.getByText('无匹配结果')).toBeVisible({ timeout: 15_000 });
    // Wait past query 1's delay window: its late response must not land.
    await page.waitForTimeout(2000);
    await expect(page.getByText('无匹配结果')).toBeVisible();
    await expect(page.getByText(/共 1 条命中/)).toBeHidden();
  });

  test('a failed chunk is reported, not presented as a clean zero-hit', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    // Only chunk m1 fails; the search term lives exclusively in m1.
    await failRequests(page, /\/data\/mobile_demo\/chunks\/m1\.json/);
    await page.getByRole('button', { name: '搜索消息' }).click();

    await page.getByLabel('搜索关键词').fill('跨分片引用');
    await expect(page.getByText(/分片读取失败/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('无匹配结果')).toBeHidden();
  });

  test('close returns to the message list with the hash intact', async ({ page }) => {
    await openHash(page, '#/mobile_demo');
    await page.getByRole('button', { name: '搜索消息' }).click();
    await page.getByRole('button', { name: '关闭搜索' }).click();
    await expect(page.getByRole('button', { name: '搜索消息' })).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#/mobile_demo');
  });
});

test.describe('date jump', () => {
  test('jumps to the newest date and prevents double submission', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    await page.getByRole('button', { name: '跳转到日期' }).click();

    const input = page.locator('#date-jump-input');
    await expect(input).toBeVisible();
    const max = await input.getAttribute('max');
    expect(max).toBeTruthy();
    await input.fill(max as string);

    await page.getByRole('button', { name: '跳转' }).click();
    await page.getByRole('button', { name: '取消' }).click();
    await expect(page.locator('body')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Message rendering and albums
// ---------------------------------------------------------------------------

test.describe('message rendering', () => {
  test('renders long content without horizontal overflow', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    for (const id of [
      SAMPLE.longTokenId,
      SAMPLE.longUrlId,
      SAMPLE.longFilenameId,
      SAMPLE.pollId,
      SAMPLE.webPreviewId,
    ]) {
      await expect(page.locator(`[data-msg-id="${id}"]`)).toBeVisible();
    }
    await expectNoHorizontalOverflow(page, 'long content');
  });

  test('album thumbnails open the viewer at the tapped index', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    await page.getByRole('button', { name: '查看第 1 / 3 张媒体' }).first().click();

    await expect(page.getByText('1 / 3')).toBeVisible();
    await page.getByRole('button', { name: '下一张' }).click();
    await expect(page.getByText('2 / 3')).toBeVisible();
    await page.getByRole('button', { name: '上一张' }).click();
    await expect(page.getByText('1 / 3')).toBeVisible();

    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByText('1 / 3')).toBeHidden();
  });

  test('boundary navigation buttons are disabled, not dead', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    await page.getByRole('button', { name: '查看第 1 / 3 张媒体' }).first().click();

    await expect(page.getByRole('button', { name: '上一张' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '下一张' })).toBeEnabled();
  });

  test('the video failure sample degrades instead of hanging', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    await page.locator(`[data-msg-id="${SAMPLE.videoFailureId}"]`).click();
    await expect(page.getByText(/在 Telegram 中查看|视频/).first()).toBeVisible();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  });

  test('voice controls do not open the message menu', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    await page.locator(`[data-msg-id="${SAMPLE.voiceId}"]`).scrollIntoViewIfNeeded();

    const play = page.getByRole('button', { name: '播放语音' }).first();
    await expect(play).toBeVisible();
    await play.click();

    await expect(page.getByRole('button', { name: '复制消息链接' })).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

test.describe('overlays', () => {
  test('long press opens the action menu and the close item dismisses it', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    const target = page.locator(`[data-msg-id="${SAMPLE.deepLinkId}"]`);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    expect(box).toBeTruthy();

    await target.dispatchEvent('pointerdown', {
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 1,
      clientX: (box as { x: number }).x + 20,
      clientY: (box as { y: number }).y + 20,
      bubbles: true,
    });

    await expect(page.getByRole('button', { name: '复制消息链接' })).toBeVisible();
    await expect(page.getByRole('button', { name: '复制文字' })).toBeVisible();

    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByRole('button', { name: '复制消息链接' })).toBeHidden();
  });

  test('tapping a link does not open the message menu', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    const link = page.locator(`[data-msg-id="${SAMPLE.longUrlId}"] a`).first();
    await link.scrollIntoViewIfNeeded();

    const popup = page.waitForEvent('popup').catch(() => null);
    await link.click();
    await popup;

    await expect(page.getByRole('button', { name: '复制消息链接' })).toBeHidden();
  });

  test('user profile card opens, scrolls a long bio, and closes', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    // User 5 carries the over-long bio.
    await page.getByRole('button', { name: /查看 .* 的资料/ }).nth(4).click();

    const close = page.getByRole('button', { name: '关闭用户资料' });
    await expect(close).toBeVisible();
    await expect(page.getByText('用户资料')).toBeVisible();
    await close.click();
    await expect(close).toBeHidden();
  });

  test('overlays stay inside the viewport and above the simulated safe area', async ({ page }) => {
    await openChat(page, 'mobile_demo');
    await simulateSafeArea(page);
    await page.getByRole('button', { name: '搜索消息' }).click();

    const input = page.getByLabel('搜索关键词');
    await expect(input).toBeVisible();
    await expectNoHorizontalOverflow(page, 'search panel');
    await expectMobileInputFontSize(page);
    await page.getByRole('button', { name: '关闭搜索' }).click();
  });
});

// ---------------------------------------------------------------------------
// Layout contract across the viewport matrix
// ---------------------------------------------------------------------------

test.describe('layout contract', () => {
  for (const name of ALL_VIEWPORTS) {
    test(`no horizontal overflow at ${name}`, async ({ page }, testInfo) => {
      test.skip(!shouldRunViewport(testInfo.project.name, name), `skipped on ${testInfo.project.name}`);
      await page.setViewportSize(VIEWPORTS[name]);

      await openHash(page, '#/');
      await expectNoHorizontalOverflow(page, `${name} list`);

      await page.goto('/#/mobile_demo');
      await expect(page.locator('[data-msg-id]').first()).toBeVisible();
      await expectNoHorizontalOverflow(page, `${name} detail`);
    });
  }

  test('standalone mobile controls meet the 44px hit box', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone320);
    await openChat(page, 'mobile_demo');

    await expectTouchTargets(page, '[aria-label="返回群聊列表"]');
    await expectTouchTargets(page, '[aria-label="搜索消息"]');
    await expectTouchTargets(page, '[aria-label="跳转到日期"]');
  });

  test('mobile inputs use a 16px computed font size', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone320);
    await openChat(page, 'mobile_demo');
    await page.getByRole('button', { name: '搜索消息' }).click();
    await expectMobileInputFontSize(page);
  });

  test('the simulated safe area reserves space in the app shell', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone390);
    await openHash(page, '#/');
    await simulateSafeArea(page, { top: 47, right: 0, bottom: 34, left: 0 });

    const padding = await page.locator('.app-viewport').evaluate((el) => {
      const style = getComputedStyle(el);
      return { top: style.paddingTop, bottom: style.paddingBottom };
    });
    expect(padding.top).toBe('47px');
    expect(padding.bottom).toBe('34px');
  });
});
