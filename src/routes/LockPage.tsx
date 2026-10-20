import { useRef, useState, type ChangeEvent } from 'react';

import { QuotaNotice } from '../components/QuotaNotice';
import { ToolPage } from '../components/ToolPage';
import { Workbench } from '../components/Workbench';
import { useCurrentDocument } from '../hooks/useCurrentDocument';
import { useToolRun } from '../hooks/useToolRun';
import { protectedFileName, unlockedFileName } from '../lib/download';
import { probePdf } from '../lib/pdf-ops';
import {
  FULL_PERMISSIONS,
  MIN_PASSWORD_LENGTH,
  protectPdf,
  unlockPdf,
  type PdfPermissions,
} from '../lib/pdf/security';
import { formatBytes } from '../lib/share';
import { navigate } from '../lib/router';
import { useWorkspace } from '../state/workspace-context';

type Tab = 'protect' | 'unlock';

type PermissionKey =
  | 'printing'
  | 'copying'
  | 'modifying'
  | 'annotating'
  | 'fillingForms'
  | 'contentAccessibility'
  | 'documentAssembly';

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  printing: 'อนุญาตให้พิมพ์',
  copying: 'อนุญาตให้คัดลอกข้อความ',
  modifying: 'อนุญาตให้แก้ไขเนื้อหา',
  annotating: 'อนุญาตให้เพิ่มหมายเหตุ',
  fillingForms: 'อนุญาตให้กรอกฟอร์ม',
  contentAccessibility: 'อนุญาตให้อ่านด้วยเครื่องช่วยการเข้าถึง',
  documentAssembly: 'อนุญาตให้ประกอบหน้าใหม่',
};

const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

type UnlockFile = {
  name: string;
  bytes: Uint8Array;
  encrypted: boolean;
  pageCount: number;
};

export function LockPage() {
  const { session } = useWorkspace();
  const { run, quotaMessage, clearQuotaMessage } = useToolRun();
  const current = useCurrentDocument();
  const [tab, setTab] = useState<Tab>('protect');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>({
    printing: true,
    copying: true,
    modifying: true,
    annotating: true,
    fillingForms: true,
    contentAccessibility: true,
    documentAssembly: true,
  });

  const unlockInputRef = useRef<HTMLInputElement>(null);
  const [unlockFile, setUnlockFile] = useState<UnlockFile | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocked, setUnlocked] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const doc = session.doc;
  const passwordProblem =
    password !== '' && password.length < MIN_PASSWORD_LENGTH
      ? `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
      : confirm !== '' && confirm !== password
        ? 'รหัสยืนยันไม่ตรงกัน'
        : null;
  const canProtect =
    Boolean(doc && current) && password.length >= MIN_PASSWORD_LENGTH && confirm === password;

  const protectedPermissions = (): PdfPermissions => {
    const base = { ...FULL_PERMISSIONS };
    for (const key of PERMISSION_KEYS) {
      if (key === 'printing') base.printing = permissions.printing ? 'highResolution' : false;
      else base[key] = permissions[key];
    }
    return base;
  };

  const protect = async () => {
    if (!doc || !current) return;
    if (!canProtect) {
      session.notify('error', passwordProblem ?? 'กรอกรหัสผ่านให้ครบก่อน');
      return;
    }

    await run(
      'protect',
      { permissions, ownerPassword: ownerPassword !== '' },
      async () => {
        const bytes = await protectPdf(current, {
          userPassword: password,
          ownerPassword: ownerPassword.trim() === '' ? undefined : ownerPassword,
          permissions: protectedPermissions(),
        });
        return { name: protectedFileName(doc.fileName), bytes };
      },
      { name: doc.fileName, pages: doc.entries.length, bytes: session.bytes?.byteLength ?? 0 },
    );
  };

  const pickUnlockFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUnlockError(null);
    setUnlocked(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const probe = await probePdf(bytes);
      setUnlockFile({
        name: file.name,
        bytes,
        encrypted: probe.isEncrypted,
        pageCount: probe.getPageCount(),
      });
      if (!probe.isEncrypted) {
        setUnlockError('ไฟล์นี้ไม่ได้ใส่รหัสผ่านไว้ — ไม่ต้องปลดล็อก');
      }
    } catch (error) {
      setUnlockFile(null);
      setUnlockError(error instanceof Error ? error.message : 'อ่านไฟล์ไม่สำเร็จ');
    }
  };

  const unlock = async () => {
    if (!unlockFile || !unlockFile.encrypted) return;
    const output = await run(
      'unlock',
      { file: unlockFile.name, pages: unlockFile.pageCount },
      async () => {
        const bytes = await unlockPdf(unlockFile.bytes, unlockPassword);
        return { name: unlockedFileName(unlockFile.name), bytes };
      },
      { name: unlockFile.name, pages: unlockFile.pageCount, bytes: unlockFile.bytes.byteLength },
    );
    if (output) {
      setUnlocked({ name: output.name, bytes: output.bytes });
      setUnlockError(null);
    }
  };

  const openUnlockedInEditor = () => {
    if (!unlocked) return;
    void session.loadBytes(unlocked.name, unlocked.bytes).then(() => navigate('/organize'));
  };

  return (
    <ToolPage
      title="Protect / Unlock PDF"
      description="ใส่รหัสผ่านแบบ AES-256 พร้อมกำหนดสิทธิ์ หรือปลดรหัสออกจากไฟล์ที่คุณมีสิทธิ์"
    >
      <div className="lock-tabs" role="tablist" aria-label="โหมด">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'protect'}
          onClick={() => setTab('protect')}
        >
          ใส่รหัสผ่าน
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'unlock'}
          onClick={() => setTab('unlock')}
        >
          ปลดล็อก
        </button>
      </div>

      {tab === 'protect' ? (
        <Workbench
          allowDelete={false}
          aside={
            <>
              <section className="panel" aria-labelledby="protect-title">
                <header className="panel-head">
                  <h2 id="protect-title">ใส่รหัสผ่าน</h2>
                  <span className="panel-note">AES-256</span>
                </header>

                <label className="field-label" htmlFor="protect-password">
                  รหัสผ่านสำหรับเปิดไฟล์
                </label>
                <input
                  id="protect-password"
                  type="password"
                  className="range-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={session.busy}
                  aria-invalid={passwordProblem !== null}
                />

                <label className="field-label" htmlFor="protect-confirm">
                  ยืนยันรหัสผ่าน
                </label>
                <input
                  id="protect-confirm"
                  type="password"
                  className="range-input"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  disabled={session.busy}
                  aria-invalid={passwordProblem !== null}
                />
                {passwordProblem && <p className="form-error">{passwordProblem}</p>}

                <label className="field-label" htmlFor="protect-owner">
                  Owner password (ไม่บังคับ)
                </label>
                <input
                  id="protect-owner"
                  type="password"
                  className="range-input"
                  value={ownerPassword}
                  onChange={(event) => setOwnerPassword(event.target.value)}
                  placeholder="ปล่อยว่างเพื่อสุ่มให้อัตโนมัติ"
                  autoComplete="new-password"
                  disabled={session.busy}
                />

                <hr className="divider" />
                <span className="field-label">สิทธิ์การใช้งาน</span>
                <ul className="permission-list">
                  {PERMISSION_KEYS.map((key) => (
                    <li key={key}>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={permissions[key]}
                          onChange={(event) =>
                            setPermissions((currentPermissions) => ({
                              ...currentPermissions,
                              [key]: event.target.checked,
                            }))
                          }
                          disabled={session.busy}
                        />
                        {PERMISSION_LABELS[key]}
                      </label>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="button-primary button-large"
                  onClick={() => void protect()}
                  disabled={!canProtect || session.busy}
                >
                  {session.busy ? 'กำลังเข้ารหัส…' : 'ใส่รหัสและดาวน์โหลด'}
                </button>

                <p className="hint">
                  สิทธิ์เป็นคำขอต่อโปรแกรมอ่าน ไม่ใช่การบังคับทางเทคนิค — รหัสผ่านคือส่วนที่ป้องกันจริง
                  ไฟล์ผลลัพธ์ชื่อ{' '}
                  <code>{doc ? protectedFileName(doc.fileName) : 'document-protected.pdf'}</code>
                </p>
              </section>

              <QuotaNotice message={quotaMessage} onDismiss={clearQuotaMessage} />
            </>
          }
        />
      ) : (
        <div className="lock-layout">
          <section className="panel" aria-labelledby="unlock-title">
            <header className="panel-head">
              <h2 id="unlock-title">ปลดล็อกไฟล์</h2>
              <span className="panel-note">ต้องรู้รหัสผ่านเดิม</span>
            </header>

            <input
              ref={unlockInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="visually-hidden"
              onChange={(event) => void pickUnlockFile(event)}
              aria-label="เลือกไฟล์ PDF ที่มีรหัสผ่าน"
              tabIndex={-1}
            />

            <div className="unlock-file">
              <button
                type="button"
                className="button-secondary"
                onClick={() => unlockInputRef.current?.click()}
                disabled={session.busy}
              >
                เลือกไฟล์ PDF
              </button>
              {unlockFile ? (
                <div className="unlock-meta">
                  <strong>{unlockFile.name}</strong>
                  <span>
                    {formatBytes(unlockFile.bytes.byteLength)} · {unlockFile.pageCount} หน้า ·{' '}
                    {unlockFile.encrypted ? 'เข้ารหัสไว้' : 'ไม่ได้เข้ารหัส'}
                  </span>
                </div>
              ) : (
                <span className="panel-note">ยังไม่ได้เลือกไฟล์</span>
              )}
            </div>

            <label className="field-label" htmlFor="unlock-password">
              รหัสผ่านของไฟล์
            </label>
            <input
              id="unlock-password"
              type="password"
              className="range-input"
              value={unlockPassword}
              onChange={(event) => setUnlockPassword(event.target.value)}
              disabled={session.busy || !unlockFile?.encrypted}
              autoComplete="off"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void unlock();
                }
              }}
            />

            <button
              type="button"
              className="button-primary button-large"
              onClick={() => void unlock()}
              disabled={!unlockFile?.encrypted || unlockPassword === '' || session.busy}
            >
              {session.busy ? 'กำลังปลดล็อก…' : 'ปลดล็อกและดาวน์โหลด'}
            </button>

            {unlockError && <p className="form-error">{unlockError}</p>}

            {unlocked && (
              <div className="unlock-result">
                <p className="export-meta">
                  ได้ไฟล์ <code>{unlocked.name}</code> แล้ว
                </p>
                <button type="button" className="button-secondary" onClick={openUnlockedInEditor}>
                  เปิดในตัวแก้ไข
                </button>
              </div>
            )}

            <p className="hint">
              การปลดล็อกจะสร้างไฟล์ใหม่ที่ไม่มีรหัสผ่าน — bookmark ฟอร์ม และไฟล์แนบระดับเอกสาร
              อาจไม่ถูกเก็บไว้ (เนื้อหาหน้ายังครบ)
            </p>
          </section>

          <aside className="lock-side">
            <QuotaNotice message={quotaMessage} onDismiss={clearQuotaMessage} />
            <section className="panel">
              <h2 className="panel-title">ทำไมต้องปลดล็อก?</h2>
              <p className="hint">
                ไฟล์ที่มีรหัสผ่านจะเปิดแก้ไขไม่ได้จนกว่าจะปลดล็อก — เมื่อปลดแล้วสามารถใช้ทุก
                เครื่องมือในหน้านี้ได้ตามปกติ และไฟล์ที่ดาวน์โหลดจะไม่มีรหัสผ่าน
              </p>
            </section>
          </aside>
        </div>
      )}
    </ToolPage>
  );
}
