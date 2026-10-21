import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { ToolPage } from '../components/ToolPage';
import { apiFetch, type CreditReason, type RunRecord } from '../lib/api';
import { downloadBytes } from '../lib/download';
import { historyFileName, runsToCsv, runsToJson } from '../lib/history-export';
import { saveReplay } from '../lib/replay';
import { navigate } from '../lib/router';
import { formatBytes } from '../lib/share';
import { READY_TOOLS, toolTitle } from '../lib/tools';
import { useAccount } from '../state/account-context';

const STATUS_LABELS: Record<RunRecord['status'], string> = {
  running: 'กำลังทำ',
  succeeded: 'สำเร็จ',
  failed: 'ล้มเหลว',
  canceled: 'ยกเลิก',
  abandoned: 'ค้าง',
};

/** Only tools whose settings can be restored from stored params. */
const REPLAYABLE = new Set(['rotate', 'page-numbers', 'watermark']);

const REASON_LABELS: Record<CreditReason, string> = {
  anon_grant: 'เครดิตทดลอง',
  signup_bonus: 'โบนัสสมัครสมาชิก',
  run: 'ใช้กับงาน',
  refund: 'คืนเครดิต',
  redeem: 'ใช้โค้ด',
  admin: 'แอดมินเติมให้',
  merge: 'ยกจากโหมดทดลอง',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, value]) => value !== null && value !== '');
  if (entries.length === 0) return '—';
  const text = entries
    .slice(0, 4)
    .map(([key, value]) => {
      const rendered = Array.isArray(value) ? value.join(',') : String(value);
      return `${key}=${rendered.length > 24 ? `${rendered.slice(0, 24)}…` : rendered}`;
    })
    .join(' · ');
  return text;
}

export function ActivityPage() {
  const {
    status: accountStatus,
    user,
    credits,
    recentEntries,
    busy: accountBusy,
    refresh,
    redeem,
    deleteEverything,
  } = useAccount();

  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [code, setCode] = useState('');
  const [codeResult, setCodeResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<{ runs: RunRecord[] }>('/api/runs?limit=50');
      setRuns(response.runs);
      setError(null);
    } catch (loadError) {
      setRuns([]);
      setError(loadError instanceof Error ? loadError.message : 'โหลดประวัติไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tools = useMemo(
    () => [...new Set((runs ?? []).map((run) => run.tool))].sort(),
    [runs],
  );
  const visible = useMemo(
    () => (runs ?? []).filter((run) => filter === 'all' || run.tool === filter),
    [filter, runs],
  );

  const clearHistory = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/runs', { method: 'DELETE' });
      setRuns([]);
      setConfirmClear(false);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'ล้างประวัติไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const removeEverything = async () => {
    setBusy(true);
    try {
      await deleteEverything();
      setRuns([]);
      setConfirmDeleteAll(false);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'ลบข้อมูลไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const download = (format: 'csv' | 'json') => {
    // Export exactly what is on screen, so the tool filter applies too.
    const content = format === 'csv' ? runsToCsv(visible) : runsToJson(visible);
    downloadBytes(
      historyFileName(format),
      new TextEncoder().encode(content),
      format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8',
    );
  };

  const rerun = (run: RunRecord) => {
    const tool = READY_TOOLS.find((entry) => entry.slug === run.tool && entry.href);
    if (!tool?.href) return;
    saveReplay(run.tool, run.params);
    navigate(tool.href.replace('#', ''));
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.trim() === '') return;
    setCodeResult(null);
    try {
      const granted = await redeem(code.trim());
      setCode('');
      setCodeResult({ tone: 'ok', text: `เติม ${granted} เครดิตแล้ว` });
    } catch (redeemError) {
      setCodeResult({
        tone: 'error',
        text: redeemError instanceof Error ? redeemError.message : 'ใช้โค้ดไม่สำเร็จ',
      });
    }
  };

  return (
    <ToolPage
      title="ประวัติการใช้งาน"
      description="ทุกครั้งที่รันเครื่องมือจะถูกบันทึกใน PostgreSQL — ไม่มีเนื้อหาไฟล์ เก็บเฉพาะ metadata"
      actions={
        <>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              void load();
              // Balances can change outside this tab (admin top-up), so the
              // refresh button reloads them too.
              void refresh();
            }}
            disabled={busy}
          >
            โหลดใหม่
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => download('csv')}
            disabled={visible.length === 0}
            title="ดาวน์โหลดรายการที่แสดงอยู่เป็น CSV (เปิดใน Excel/Sheets ได้)"
          >
            ดาวน์โหลด CSV
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => download('json')}
            disabled={visible.length === 0}
            title="ดาวน์โหลดรายการที่แสดงอยู่เป็น JSON (ครบทุกฟิลด์)"
          >
            ดาวน์โหลด JSON
          </button>
        </>
      }
    >
      <div className="activity">
        <section className="panel activity-summary">
          <div className="activity-account">
            <div>
              <span className="field-label">บัญชี</span>
              <p className="activity-account-name">
                {user ? user.email : 'ไม่ระบุตัวตน (เครดิตผูกกับเบราว์เซอร์นี้)'}
              </p>
            </div>
            <p className="credit-balance-line">
              <strong>{credits.balance}</strong> เครดิต
            </p>
            {user ? (
              <a className="button-ghost" href="#/password">
                เปลี่ยนรหัสผ่าน
              </a>
            ) : (
              <div className="activity-auth">
                <a className="button-primary" href="#/signup">
                  สมัครสมาชิก
                </a>
                <a className="button-secondary" href="#/signin">
                  เข้าสู่ระบบ
                </a>
              </div>
            )}
          </div>

          <div className="activity-danger">
            {confirmClear ? (
              <>
                <span className="hint">ล้างประวัติทั้งหมดในพื้นที่นี้?</span>
                <button type="button" className="button-secondary" onClick={() => setConfirmClear(false)}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => void clearHistory()}
                  disabled={busy}
                >
                  ยืนยันล้างประวัติ
                </button>
              </>
            ) : (
              <button type="button" className="button-secondary" onClick={() => setConfirmClear(true)}>
                ล้างประวัติ
              </button>
            )}

            {confirmDeleteAll ? (
              <>
                <span className="hint">ลบ workspace, ประวัติ, พรีเซ็ต และลิงก์แชร์ทั้งหมด?</span>
                <button type="button" className="button-secondary" onClick={() => setConfirmDeleteAll(false)}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => void removeEverything()}
                  disabled={busy}
                >
                  ยืนยันลบทั้งหมด
                </button>
              </>
            ) : (
              <button type="button" className="button-ghost" onClick={() => setConfirmDeleteAll(true)}>
                ลบข้อมูลของฉัน
              </button>
            )}
          </div>
        </section>

        <section className="panel credit-panel">
          <header className="panel-head">
            <h2>เครดิต</h2>
            <span className="credit-balance">{credits.balance} เครดิต</span>
          </header>
          <p className="hint">
            ทุกครั้งที่รันเครื่องมือจะใช้ 1 เครดิต และงานที่ล้มเหลวหรือค้างเกิน 10 นาทีจะได้คืน
            {user ? '' : ` · โหมดทดลองได้ ${credits.allowance ?? credits.balance} เครดิตแบบครั้งเดียว`}
          </p>

          <form className="redeem-form" onSubmit={(event) => void submitCode(event)}>
            <label className="field">
              <span className="field-label">โค้ดเติมเครดิต</span>
              <input
                className="range-input"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                maxLength={40}
              />
            </label>
            <button
              type="submit"
              className="button-secondary"
              disabled={accountBusy || code.trim() === ''}
            >
              ใช้โค้ด
            </button>
          </form>
          {codeResult && (
            <p className={codeResult.tone === 'ok' ? 'credit-ok' : 'form-error'}>{codeResult.text}</p>
          )}

          <h3 className="credit-subhead">รายการเดินบัญชี</h3>
          {recentEntries.length === 0 ? (
            <p className="hint">ยังไม่มีรายการเดินบัญชี</p>
          ) : (
            <ul className="credit-list">
              {recentEntries.map((entry) => (
                <li key={entry.id} className="credit-row">
                  <span>{REASON_LABELS[entry.reason]}</span>
                  <span className="credit-delta" data-negative={entry.delta < 0 || undefined}>
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </span>
                  <span className="credit-time">{formatTime(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">ยังไม่มีระบบจ่ายเงิน — ขอโค้ดจากผู้ดูแล หรือให้แอดมินเติมผ่าน CLI</p>
        </section>

        {accountStatus === 'offline' && (
          <p className="form-error">เชื่อมต่อ API ไม่ได้ — ประวัติจะแสดงได้เมื่อเซิร์ฟเวอร์พร้อม</p>
        )}
        {error && <p className="form-error">{error}</p>}

        <section className="panel">
          <header className="panel-head">
            <h2>งานล่าสุด</h2>
            <div className="activity-filter">
              <label className="field-label" htmlFor="activity-filter">
                เครื่องมือ
              </label>
              <select
                id="activity-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">ทั้งหมด</option>
                {tools.map((tool) => (
                  <option key={tool} value={tool}>
                    {toolTitle(tool)}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <p className="hint">
            ดาวน์โหลดได้เฉพาะรายการที่แสดงอยู่ (กรองแล้ว {visible.length} รายการ) — ประวัติเก็บเฉพาะ
            metadata ไม่มีไฟล์ PDF จึงโหลดไฟล์ผลลัพธ์ย้อนหลังไม่ได้
          </p>

          {runs === null ? (
            <p className="hint">กำลังโหลด…</p>
          ) : visible.length === 0 ? (
            <p className="hint">
              ยังไม่มีประวัติ — ลองรันเครื่องมือสักครั้ง ระบบจะบันทึกไว้ที่นี่
            </p>
          ) : (
            <ul className="run-list">
              {visible.map((run) => (
                <li key={run.id} className="run-row" data-status={run.status}>
                  <div className="run-main">
                    <div className="run-title">
                      <strong>{toolTitle(run.tool)}</strong>
                      <span className={`status-chip`} data-status={run.status}>
                        {STATUS_LABELS[run.status]}
                      </span>
                    </div>
                    <p className="run-meta">
                      {run.inputName ?? 'ไม่ทราบชื่อไฟล์'}
                      {run.inputPages ? ` · ${run.inputPages} หน้า` : ''}
                      {run.outputBytes ? ` → ${formatBytes(run.outputBytes)}` : ''}
                    </p>
                    <p className="run-params">{describeParams(run.params)}</p>
                    {run.errorMessage && <p className="form-error">{run.errorMessage}</p>}
                  </div>

                  <div className="run-side">
                    <span>{formatTime(run.startedAt)}</span>
                    {run.durationMs !== null && (
                      <span>
                        {(run.durationMs / 1000).toFixed(run.durationMs < 10_000 ? 2 : 0)} วินาที
                      </span>
                    )}
                    {REPLAYABLE.has(run.tool) && (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => rerun(run)}
                        title="เปิดเครื่องมือพร้อมค่าเดิม"
                      >
                        รันอีกครั้ง
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ToolPage>
  );
}
