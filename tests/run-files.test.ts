import { describe, expect, it } from 'vitest';

import { RUN_FILE_TTL_DAYS, isRunFileExpired } from '../src/lib/run-files';

const DAY = 24 * 60 * 60 * 1000;

describe('run file retention', () => {
  it('keeps a file saved today', () => {
    const now = Date.now();
    expect(isRunFileExpired(now, now)).toBe(false);
    expect(isRunFileExpired(now - 5 * DAY, now)).toBe(false);
  });

  it('expires a file after the retention window', () => {
    const now = Date.now();
    expect(isRunFileExpired(now - (RUN_FILE_TTL_DAYS + 1) * DAY, now)).toBe(true);
    expect(isRunFileExpired(now - 400 * DAY, now)).toBe(true);
  });

  it('keeps a file exactly at the boundary', () => {
    const now = Date.now();
    expect(isRunFileExpired(now - RUN_FILE_TTL_DAYS * DAY, now)).toBe(false);
  });
});
