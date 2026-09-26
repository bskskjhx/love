import type { Message } from '@/types';
import { mediaLabel } from '@/utils';

interface HighlightRange {
  start: number;
  end: number;
  type: 'url' | 'command' | 'search';
}

const URL_RE = /(https?:\/\/[^\s<]+)/gi;
const CMD_RE = /(^|\s)(\/[a-zA-Z0-9_]+(?:@\w+)?)/g;

export function renderText(
  text: string,
  searchTerms?: string[]
): { segments: { text: string; type?: string }[] } {
  const ranges: HighlightRange[] = [];

  let m: RegExpExecArray | null;
  const urlRe = new RegExp(URL_RE);
  while ((m = urlRe.exec(text)) !== null) {
    ranges.push({ start: m.index, end: m.index + m[0].length, type: 'url' });
  }

  const cmdRe = new RegExp(CMD_RE);
  while ((m = cmdRe.exec(text)) !== null) {
    const offset = m[1] ? m[1].length : 0;
    const start = m.index + offset;
    const end = start + m[2].length;
    if (!overlaps(ranges, start, end)) {
      ranges.push({ start, end, type: 'command' });
    }
  }

  if (searchTerms && searchTerms.length > 0) {
    const lower = text.toLowerCase();
    for (const term of searchTerms) {
      if (!term) continue;
      const lt = term.toLowerCase();
      let idx = 0;
      while ((idx = lower.indexOf(lt, idx)) !== -1) {
        const end = idx + lt.length;
        if (!overlaps(ranges, idx, end)) {
          ranges.push({ start: idx, end, type: 'search' });
        }
        idx = end;
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  mergeRanges(ranges);

  const segments: { text: string; type?: string }[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) {
      segments.push({ text: text.substring(pos, r.start) });
    }
    segments.push({ text: text.substring(r.start, r.end), type: r.type });
    pos = r.end;
  }
  if (pos < text.length) {
    segments.push({ text: text.substring(pos) });
  }
  if (segments.length === 0) segments.push({ text });
  return { segments };
}

function overlaps(ranges: HighlightRange[], start: number, end: number): boolean {
  return ranges.some((r) => start < r.end && end > r.start);
}

function mergeRanges(ranges: HighlightRange[]) {
  for (let i = 0; i < ranges.length - 1; i++) {
    const a = ranges[i];
    const b = ranges[i + 1];
    if (a.end >= b.start) {
      a.end = Math.max(a.end, b.end);
      a.type = a.type === 'search' || b.type === 'search' ? 'search' : a.type;
      ranges.splice(i + 1, 1);
      i--;
    }
  }
}

export function renderPreviewSegments(
  msg: Message,
  searchTerms?: string[]
): { text: string; type?: string }[] {
  if (msg.t) {
    return renderText(msg.t, searchTerms).segments;
  }
  if (msg.m) {
    return [{ text: `[${mediaLabel(msg.m)}]`, type: 'media' }];
  }
  return [];
}
