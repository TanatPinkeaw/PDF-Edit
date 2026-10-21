import { describe, expect, it } from 'vitest';

import type { RunRecord } from '../src/lib/api';
import { historyFileName, runsToCsv, runsToJson } from '../src/lib/history-export';

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tool: 'rotate',
    status: 'succeeded',
    inputName: 'รายงาน.pdf',
    inputPages: 3,
    inputBytes: 120_000,
    outputName: 'รายงาน-rotated.pdf',
    outputBytes: 121_000,
    params: { angle: 90, pages: [1, 2] },
    errorCode: null,
    errorMessage: null,
    durationMs: 850,
    startedAt: '2026-10-21T12:00:00.000Z',
    finishedAt: '2026-10-21T12:00:01.000Z',
    ...overrides,
  };
}

describe('runsToCsv', () => {
  it('starts with a BOM so Excel reads Thai correctly', () => {
    expect(runsToCsv([]).startsWith('\uFEFF')).toBe(true);
  });

  it('writes a stable header and one line per run', () => {
    const csv = runsToCsv([run(), run({ id: 'x', tool: 'merge', status: 'failed' })]);
    const [header, ...lines] = csv.slice(1).trimEnd().split('\r\n');

    expect(header).toBe(
      'started_at,finished_at,tool,status,file,pages,input_bytes,output_name,output_bytes,duration_ms,error_code,error_message,params,run_id',
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('rotate');
    expect(lines[1]).toContain('merge');
  });

  it('exports params as JSON and keeps Thai text unescaped', () => {
    const [, line] = runsToCsv([run()]).slice(1).trimEnd().split('\r\n');
    expect(line).toContain('รายงาน.pdf');
    expect(line).toContain('"{""angle"":90,""pages"":[1,2]}"');
  });

  it('quotes cells with commas, quotes and newlines', () => {
    const csv = runsToCsv([
      run({ inputName: 'a,b "c".pdf', errorMessage: 'บรรทัดแรก\nบรรทัดสอง' }),
    ]);
    expect(csv).toContain('"a,b ""c"".pdf"');
    expect(csv).toContain('"บรรทัดแรก\nบรรทัดสอง"');
  });

  it('neutralises cells Excel would treat as a formula', () => {
    const csv = runsToCsv([run({ inputName: '=HYPERLINK("http://evil")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('renders empty values as empty cells rather than "null"', () => {
    const csv = runsToCsv([
      run({ durationMs: null, outputName: null, errorMessage: null }),
    ]);
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });
});

describe('runsToJson', () => {
  it('round-trips every field and records the count', () => {
    const runs = [run(), run({ id: 'second', tool: 'watermark' })];
    const parsed = JSON.parse(runsToJson(runs, new Date('2026-10-21T12:00:00.000Z'))) as {
      exportedAt: string;
      count: number;
      runs: RunRecord[];
    };

    expect(parsed.exportedAt).toBe('2026-10-21T12:00:00.000Z');
    expect(parsed.count).toBe(2);
    expect(parsed.runs).toEqual(runs);
  });
});

describe('historyFileName', () => {
  it('stamps the local time so files sort chronologically', () => {
    const at = new Date(2026, 9, 21, 19, 4);
    expect(historyFileName('csv', at)).toBe('pdf-studio-history-20261021-1904.csv');
    expect(historyFileName('json', at)).toBe('pdf-studio-history-20261021-1904.json');
  });
});
