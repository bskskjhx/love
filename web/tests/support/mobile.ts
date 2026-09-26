import { expect, type Page } from '@playwright/test';

/**
 * Shared helpers for the mobile regression suite.
 *
 * Scope is deliberately narrow: viewport switching, geometry assertions, error
 * collection, and request delay/failure injection. Everything the helpers
 * inject is layered on top of the real fixture responses — the fixture itself
 * is never modified, and no helper ever fakes a successful media decode.
 */

export const VIEWPORTS = {
  phone320: { width: 320, height: 568 },
  phone360: { width: 360, height: 800 },
  phone390: { width: 390, height: 844 },
  phone430: { width: 430, height: 932 },
  narrowJustBelow: { width: 767, height: 800 },
  narrowJustAbove: { width: 768, height: 800 },
  desktop: { width: 1280, height: 800 },
  phoneLandscape: { width: 667, height: 375 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/** Sizes the WebKit project runs; Chromium runs the full matrix. */
export const WEBKIT_VIEWPORTS: ViewportName[] = ['phone390', 'phoneLandscape', 'desktop'];

export function shouldRunViewport(projectName: string, name: ViewportName): boolean {
  return projectName !== 'webkit' || WEBKIT_VIEWPORTS.includes(name);
}

/** Records page errors and console errors raised during the test. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

export async function openHash(page: Page, hash = '#/') {
  await page.goto(`/${hash}`);
  await expect(page.locator('body')).toBeVisible();
}

export async function openChat(page: Page, username = 'mobile_demo') {
  await openHash(page, `#/${username}`);
  await expect(page.locator('[data-msg-id]').first()).toBeVisible();
}

/** The document must never scroll sideways. */
export async function expectNoHorizontalOverflow(page: Page, where = 'document') {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
  }));
  expect(metrics.scrollWidth, `${where}: documentElement`).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.bodyScrollWidth, `${where}: body`).toBeLessThanOrEqual(metrics.bodyClientWidth + 1);
}

/**
 * Asserts every visible control matching `selector` is at least 44x44 CSS px.
 * Only use this on standalone controls, never on inline body links.
 */
export async function expectTouchTargets(page: Page, selector: string) {
  const measured = await page.$$eval(selector, (nodes) =>
    nodes
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none';
        return {
          visible,
          label: el.getAttribute('aria-label') || (el.textContent || '').trim() || el.tagName,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((entry) => entry.visible)
  );

  expect(measured.length, `${selector} should match at least one visible control`).toBeGreaterThan(0);
  for (const entry of measured) {
    expect(entry.width, `${entry.label} width`).toBeGreaterThanOrEqual(44);
    expect(entry.height, `${entry.label} height`).toBeGreaterThanOrEqual(44);
  }
  return measured;
}

/** Editable mobile controls must have a computed font-size of at least 16px. */
export async function expectMobileInputFontSize(page: Page) {
  const measured = await page.$$eval('input, textarea, select', (nodes) =>
    nodes
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const visible =
          rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        return {
          visible,
          label: el.getAttribute('aria-label') || el.id || el.getAttribute('type') || el.tagName,
          size: parseFloat(style.fontSize),
        };
      })
      .filter((entry) => entry.visible)
  );

  expect(measured.length).toBeGreaterThan(0);
  for (const entry of measured) {
    expect(entry.size, `${entry.label} font-size`).toBeGreaterThanOrEqual(16);
  }
  return measured;
}

/**
 * Simulates the safe-area CSS variables so the layout logic can be checked.
 * This is NOT real notch / home-indicator verification.
 */
export async function simulateSafeArea(
  page: Page,
  insets = { top: 47, right: 0, bottom: 34, left: 0 }
) {
  await page.addStyleTag({
    content: `:root{` +
      `--app-safe-top:${insets.top}px;` +
      `--app-safe-right:${insets.right}px;` +
      `--app-safe-bottom:${insets.bottom}px;` +
      `--app-safe-left:${insets.left}px;}`,
  });
}

/**
 * Delays matching requests so a stale-response race can be reproduced
 * deterministically instead of being masked by sleeps.
 */
export async function delayRequests(
  page: Page,
  urlPattern: string | RegExp,
  delayMs: number,
  times = Number.POSITIVE_INFINITY
) {
  let seen = 0;
  await page.route(urlPattern, async (route) => {
    if (seen < times) {
      seen += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.continue();
  });
}

/** Fails matching fixture requests without touching the fixture implementation. */
export async function failRequests(page: Page, urlPattern: string | RegExp, status = 503) {
  await page.route(urlPattern, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: 'injected by tests/support/mobile.ts' }),
    })
  );
}

export function isMobileViewport(page: Page): boolean {
  const size = page.viewportSize();
  return !!size && size.width < 768;
}

/**
 * Asserts nothing the app itself raised. Static-asset 404s (the repo ships no
 * PWA icons) are filtered out because they are a known pre-existing gap, not a
 * regression introduced by the mobile work.
 */
export function expectNoAppErrors(errors: string[]) {
  const appErrors = errors.filter(
    (entry) =>
      !/Failed to load resource|net::ERR|404 \(Not Found\)|favicon|icons\/icon|manifest/i.test(entry)
  );
  expect(appErrors, `unexpected app errors:\n${appErrors.join('\n')}`).toEqual([]);
}

/** Message ids used across the suite; see web/MOBILE-TESTING.md. */
export const SAMPLE = {
  deepLinkId: 101,
  pinnedId: 42,
  crossChunkReplierId: 130,
  crossChunkReplyTargetId: 12,
  uniqueKeyword: '独角兽图腾',
  uniqueKeywordId: 88,
  longTokenId: 3,
  longUrlId: 4,
  longFilenameId: 5,
  albumFirstId: 7,
  voiceId: 10,
  pollId: 60,
  webPreviewId: 63,
  videoFailureId: 120,
  lastId: 150,
} as const;
