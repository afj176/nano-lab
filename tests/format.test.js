import { describe, it, expect } from 'vitest';
import { clamp, formatBytes, formatSeconds, formatClock, timeAgo } from '../src/ui/dom.js';

describe('formatters', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(1500)).toBe('2 KB');
    expect(formatBytes(182e6)).toBe('182 MB');
    expect(formatBytes(1.54e9)).toBe('1.54 GB');
  });

  it('formats durations', () => {
    expect(formatSeconds(null)).toBe('—');
    expect(formatSeconds(1.234)).toBe('1.23 s');
    expect(formatSeconds(59.5)).toBe('59.5 s');
    expect(formatSeconds(125)).toBe('2m 5s');
  });

  it('formats a playback clock', () => {
    expect(formatClock(0)).toBe('0:00.0');
    expect(formatClock(6.14)).toBe('0:06.1');
    expect(formatClock(75.5)).toBe('1:15.5');
    expect(formatClock(NaN)).toBe('0:00.0');
  });

  it('describes relative time', () => {
    const now = Date.now();
    expect(timeAgo(now - 5e3)).toBe('just now');
    expect(timeAgo(now - 5 * 60e3)).toBe('5 min ago');
    expect(timeAgo(now - 3 * 3600e3)).toBe('3 h ago');
    expect(timeAgo(now - 2 * 86400e3)).toBe('2 d ago');
  });
});
