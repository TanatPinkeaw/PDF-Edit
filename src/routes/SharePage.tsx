import { useEffect, useState } from 'react';

import { ToolPage } from '../components/ToolPage';
import { ApiError, apiFetch, type ShareRecord } from '../lib/api';
import { formatBytes } from '../lib/share';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; share: ShareRecord }
  | { kind: 'expired'; share: Partial<ShareRecord> }
  | { kind: 'error'; message: string };

export function SharePage({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    apiFetch<ShareRecord>(`/api/shares/${token}`).then(
      (share) => {
        if (cancelled) return;
        setState(
          share.expired ? { kind: 'expired', share } : { kind: 'ready', share },
        );
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 410) {
          const details = error.details as { error?: Partial<ShareRecord> };
          setState({ kind: 'expired', share: details.error ?? {} });
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: 'error', message: 'ไม่พบลิงก์นี้ หรือถูกลบไปแล้ว' });
          return;
        }
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'โหลดลิงก์ไม่สำเร็จ',
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <ToolPage
      title="ลิงก์แชร์ไฟล์"
      description="ไฟล์นี้ถูกอัปโหลดไว้ชั่วคราวโดยผู้สร้างลิงก์ — ดาวน์โหลดได้จนหมดอายุ"
    >
      <div className="share-page">
        {state.kind === 'loading' && (
          <section className="panel">
            <p className="hint">กำลังตรวจสอบลิงก์…</p>
          </section>
        )}

        {state.kind === 'error' && (
          <section className="panel">
            <h2 className="panel-title">เปิดลิงก์ไม่ได้</h2>
            <p className="form-error">{state.message}</p>
            <p className="hint">ลิงก์อาจหมดอายุ ถูกยกเลิก หรือพิมพ์ผิด</p>
            <a className="button-secondary" href="#/">
              กลับหน้าเครื่องมือ
            </a>
          </section>
        )}

        {state.kind === 'expired' && (
          <section className="panel">
            <h2 className="panel-title">ลิงก์หมดอายุแล้ว</h2>
            <p className="hint">
              {state.share.fileName ? `ไฟล์ “${state.share.fileName}” ` : 'ไฟล์นี้ '}
              ถูกเก็บไว้ชั่วคราวตามนโยบาย 7 วัน — ขอให้ผู้ส่งสร้างลิงก์ใหม่
            </p>
            <a className="button-secondary" href="#/">
              กลับหน้าเครื่องมือ
            </a>
          </section>
        )}

        {state.kind === 'ready' && (
          <section className="panel share-card">
            <span className="share-card-icon" aria-hidden="true">
              PDF
            </span>
            <div>
              <h2 className="panel-title">{state.share.fileName}</h2>
              <p className="run-meta">
                {formatBytes(state.share.byteSize)} · ดาวน์โหลดแล้ว {state.share.downloadCount} ครั้ง
              </p>
              <p className="hint">
                ลิงก์หมดอายุ {new Date(state.share.expiresAt).toLocaleString('th-TH')} · SHA-256{' '}
                <code>{state.share.sha256.slice(0, 16)}…</code>
              </p>

              <a
                className="button-primary button-large"
                href={`/api/shares/${state.share.token}/file`}
                download={state.share.fileName}
              >
                ดาวน์โหลดไฟล์
              </a>
              <p className="hint">
                ไฟล์ถูกส่งจากเซิร์ฟเวอร์โดยตรง ไม่ผ่านเครื่องมือในเบราว์เซอร์
              </p>
            </div>
          </section>
        )}
      </div>
    </ToolPage>
  );
}
