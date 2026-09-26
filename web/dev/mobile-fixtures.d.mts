/**
 * Type declarations for the mobile-fixture dev middleware.
 * Kept in sync with ./mobile-fixtures.mjs (see web/dev/mobile-fixtures.test.mjs).
 */

export interface FixtureResponse {
  status: number;
  contentType: string;
  body: string | Uint8Array;
}

export interface MobileFixture {
  chatUsername: 'mobile_demo';
  deepLink: '#/mobile_demo/101';
  /** Receives an already query-stripped pathname. Returns null when the path is not ours. */
  respond(pathname: string): FixtureResponse | null;
}

/**
 * @param nowMs Reference time in milliseconds. Defaults to `Date.now()`.
 */
export function createMobileFixture(nowMs?: number): MobileFixture;

export interface FixtureConstants {
  TOTAL_MESSAGES: number;
  CHUNK_SIZE: number;
  CHUNKS: number;
  CHUNK_FILES: string[];
  PINNED_ID: number;
  DEEP_LINK_ID: number;
  UNIQUE_KEYWORD: string;
  LONG_SENDER_NAME: string;
  UNIQUE_KEYWORD_ID: number;
  CROSS_CHUNK_REPLY_ID: number;
  CROSS_CHUNK_REPLY_TARGET: number;
  IN_CHUNK_REPLY_ID: number;
  VIDEO_FAILURE_ID: number;
  AVATAR_UIDS: string[];
  NO_AVATAR_UIDS: string[];
  CHAT_USERNAME: string;
  DEEP_LINK: string;
}

export const FIXTURE_CONSTANTS: FixtureConstants;
