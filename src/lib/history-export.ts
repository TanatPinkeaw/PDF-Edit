/**
 * The activity log is metadata only (no file bytes), so "downloading the
 * history" means turning the rows into a file the user can keep: CSV for
 * spreadsheets, JSON for scripts and backups.
 */

import type { RunRecord } from './api';

/** Fixed order — spreadsheets and scripts both depend on it staying stable. */
const COLUMNS: ReadonlyArray<readonly [string, (run: RunRecord) => unknown]> = [
  ['started_at', (run) => run.startedAt],
  ['finished_at', (run) => run.finishedAt],
  ['tool', (run) => run.tool],
  ['status', (run) => run.status],
  ['file', (run) => run.inputName],
  ['pages', (run) => run.inputPages],
  ['input_bytes', (run) => run.inputBytes],
  ['output_name', (run) => run.outputName],
  ['output_bytes', (run) => run.outputBytes],
  ['duration_ms', (run) => run.durationMs],
  ['error_code', (run) => run.errorCode],
  ['error_message', (run) => run.errorMessage],
  ['params', (run) => run.params],
  ['run_id', (run) => run.id],
];

/**
 * Excel treats cells that start with one of these as a formula, and file names
 * are user supplied, so they are neutralised before the cell is written.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);

  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const guarded = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * A UTF-8 BOM plus CRLF: without the BOM Excel on Windows reads Thai file
 * names and params as mojibake.
 */
export function runsToCsv(runs: readonly RunRecord[]): string {
  const header = COLUMNS.map(([name]) => name).join(',');
  const rows = runs.map((run) => COLUMNS.map(([, read]) => csvCell(read(run))).join(','));
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}

export function runsToJson(runs: readonly RunRecord[], exportedAt: Date = new Date()): string {
  return `${JSON.stringify(
    { exportedAt: exportedAt.toISOString(), count: runs.length, runs },
    null,
    2,
  )}\n`;
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** `pdf-studio-history-20261021-1904.csv` — sortable and local-time readable. */
export function historyFileName(extension: 'csv' | 'json', at: Date = new Date()): string {
  const stamp = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}-${two(
    at.getHours(),
  )}${two(at.getMinutes())}`;
  return `pdf-studio-history-${stamp}.${extension}`;
}
