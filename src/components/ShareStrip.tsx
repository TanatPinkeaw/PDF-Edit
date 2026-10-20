import { useEffect, useState } from 'react';

import { formatBytes, createShare, shareUrl } from '../lib/share';
import { useAccount } from '../state/account-context';
import { useWorkspace } from '../state/workspace-context';

type State =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'ready'; token: string; expiresAt: string }
  | { kind: 'error'; message: string };

/** Offers a share link for the most recent export, on demand only. */
export function ShareStrip() {
  const { session } = useWorkspace();
  const { status } = useAccount();
  const output = session.lastOutput;
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setState({ kind: 'idle' });
    setHidden(false);
    setCopied(false);
  }, [output]);

  if (!output || hidden) return null;

  const link = state.kind === 'ready' ? shareUrl(state.token) : '';

  const create = async () => {
    setState({ kind: 'creating' });
    try {
      const share = await createShare(output);
      setState({ kind: 'ready', token: share.token, expiresAt: share.expiresAt });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'สร้างลิงก์ไม่สำเร็จ',
      });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="share-strip" role="region" aria-label="แชร์ผลลัพธ์">
      <div className="share-strip-info">
        <strong>{output.name}</strong>
        <span>{formatBytes(output.bytes.byteLength)} · ไฟล์ยังอยู่ในเครื่องคุณ</span>
      </div>

      {state.kind === 'ready' ? (
        <div className="share-strip-link">
          <input readOnly value={link} aria-label="ลิงก์แชร์" onFocus={(event) => event.target.select()} />
          <button type="button" className="button-secondary" onClick={() => void copy()}>
            {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </button>
          <a className="button-ghost" href={`#/s/${state.token}`} target="_blank" rel="noreferrer">
            เปิด
          </a>
          <span className="panel-note">
            หมดอายุ {new Date(state.expiresAt).toLocaleDateString('th-TH')}
          </span>
        </div>
      ) : (
        <div className="share-strip-actions">
          {state.kind === 'error' && <span className="form-error">{state.message}</span>}
          {status === 'offline' && <span className="panel-note">ต้องเชื่อมต่อ API ก่อน</span>}
          <button
            type="button"
            className="button-secondary"
            onClick={() => void create()}
            disabled={state.kind === 'creating' || status === 'offline'}
          >
            {state.kind === 'creating' ? 'กำลังอัปโหลด…' : 'สร้างลิงก์แชร์'}
          </button>
          <button
            type="button"
            className="share-close"
            aria-label="ซ่อนแถบแชร์"
            onClick={() => setHidden(true)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
