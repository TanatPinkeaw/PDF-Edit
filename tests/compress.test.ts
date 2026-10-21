import { describe, expect, it } from 'vitest';

import { COMPRESS_PRESETS, describeSaving } from '../src/lib/pdf/compress';

describe('COMPRESS_PRESETS', () => {
  it('trades quality for size in a sensible order', () => {
    expect(COMPRESS_PRESETS.screen.scale).toBeLessThan(COMPRESS_PRESETS.balanced.scale);
    expect(COMPRESS_PRESETS.balanced.scale).toBeLessThan(COMPRESS_PRESETS.print.scale);
    expect(COMPRESS_PRESETS.screen.jpegQuality).toBeLessThan(COMPRESS_PRESETS.print.jpegQuality);
  });

  it('stays inside valid JPEG quality bounds', () => {
    for (const preset of Object.values(COMPRESS_PRESETS)) {
      expect(preset.jpegQuality).toBeGreaterThan(0);
      expect(preset.jpegQuality).toBeLessThanOrEqual(1);
    }
  });
});

describe('describeSaving', () => {
  it('reports a reduction', () => {
    expect(describeSaving(1_000_000, 250_000)).toBe('เล็กลง 75%');
  });

  it('reports growth honestly', () => {
    expect(describeSaving(100_000, 150_000)).toBe('ใหญ่ขึ้น 50%');
  });

  it('handles an empty original', () => {
    expect(describeSaving(0, 10)).toBe('—');
  });
});
