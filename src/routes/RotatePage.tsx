import { useEffect, useMemo, useState } from 'react';

import { PresetPicker } from '../components/PresetPicker';
import { CreditNotice } from '../components/CreditNotice';
import { ToolPage } from '../components/ToolPage';
import { Workbench } from '../components/Workbench';
import { useCurrentDocument } from '../hooks/useCurrentDocument';
import { useToolRun } from '../hooks/useToolRun';
import { rotatedFileName } from '../lib/download';
import { PdfError } from '../lib/pdf-ops';
import { isRotationAngle, rotateDocument, type RotationAngle } from '../lib/pdf/rotate';
import { takeReplay } from '../lib/replay';
import { selectedPageNumbers } from '../lib/session';
import { useWorkspace } from '../state/workspace-context';

const ANGLES: Array<{ value: RotationAngle; label: string }> = [
  { value: 90, label: '90°' },
  { value: 180, label: '180°' },
  { value: 270, label: '270°' },
];

type Scope = 'all' | 'selected';

export function RotatePage() {
  const { session } = useWorkspace();
  const { run, creditMessage, clearCreditMessage } = useToolRun();
  const current = useCurrentDocument();
  const [angle, setAngle] = useState<RotationAngle>(90);
  const [scope, setScope] = useState<Scope>('all');

  const doc = session.doc;
  const selectedIds = useMemo(() => new Set(session.state.selection), [session.state.selection]);
  const selected = selectedPageNumbers(session.state);

  const rotations = useMemo(() => {
    const map = new Map<number, number>();
    if (!doc) return map;
    for (const entry of doc.entries) {
      if (scope === 'all' || selectedIds.has(entry.id)) map.set(entry.srcIndex, angle);
    }
    return map;
  }, [angle, doc, scope, selectedIds]);

  const pagesToRotate = scope === 'all' ? 'all' : selected;
  const canRun = Boolean(doc && current) && (scope === 'all' || selected.length > 0);

  const applyRotation = async () => {
    if (!doc || !current) return;
    if (!canRun) {
      session.notify('error', 'ยังไม่ได้เลือกหน้า — เลือกอย่างน้อย 1 หน้า');
      return;
    }

    await run(
      'rotate',
      { angle, scope, pages: pagesToRotate },
      async () => {
        if (!isRotationAngle(angle)) throw new PdfError('invalid', 'มุมหมุนไม่ถูกต้อง');
        const bytes = await rotateDocument(current, { angle, pages: pagesToRotate });
        return { name: rotatedFileName(doc.fileName), bytes };
      },
      { name: doc.fileName, pages: doc.entries.length, bytes: session.bytes?.byteLength ?? 0 },
    );
  };

  const applyPreset = (params: Record<string, unknown>) => {
    if (typeof params.angle === 'number' && isRotationAngle(params.angle)) setAngle(params.angle);
    if (params.scope === 'all' || params.scope === 'selected') setScope(params.scope);
  };

  useEffect(() => {
    const replay = takeReplay<Record<string, unknown>>('rotate');
    if (replay) applyPreset(replay);
    // Replay is consumed once per navigation from the history page.
  }, []);

  return (
    <ToolPage
      title="Rotate PDF"
      description="หมุนหน้าเอกสาร เลือกได้ทั้งไฟล์หรือเฉพาะหน้าที่ติ๊กไว้ — ตัวอย่างในการ์ดจะหมุนตามทันที"
    >
      <Workbench
        allowDelete={false}
        rotations={rotations}
        aside={
          <>
            <section className="panel" aria-labelledby="rotate-title">
              <header className="panel-head">
                <h2 id="rotate-title">มุมที่ต้องการ</h2>
                <span className="panel-note">บวกกับมุมเดิมของหน้า</span>
              </header>

              <div className="control-row">
                <span className="field-label" id="rotate-angle-label">
                  หมุน
                </span>
                <div className="segmented" role="group" aria-labelledby="rotate-angle-label">
                  {ANGLES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="segment"
                      aria-pressed={angle === option.value}
                      onClick={() => setAngle(option.value)}
                      disabled={session.busy}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-row">
                <span className="field-label" id="rotate-scope-label">
                  ใช้กับ
                </span>
                <div className="segmented" role="group" aria-labelledby="rotate-scope-label">
                  <button
                    type="button"
                    className="segment"
                    aria-pressed={scope === 'all'}
                    onClick={() => setScope('all')}
                    disabled={session.busy}
                  >
                    ทุกหน้า
                  </button>
                  <button
                    type="button"
                    className="segment"
                    aria-pressed={scope === 'selected'}
                    onClick={() => setScope('selected')}
                    disabled={session.busy}
                  >
                    ที่เลือก ({selected.length})
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="button-primary button-large"
                onClick={() => void applyRotation()}
                disabled={!canRun || session.busy}
              >
                {session.busy
                  ? 'กำลังหมุน…'
                  : scope === 'all'
                    ? `หมุนทั้ง ${doc?.entries.length ?? 0} หน้า แล้วดาวน์โหลด`
                    : `หมุน ${selected.length} หน้า แล้วดาวน์โหลด`}
              </button>

              <p className="hint">
                ไฟล์ผลลัพธ์ชื่อ <code>{doc ? rotatedFileName(doc.fileName) : 'document-rotated.pdf'}</code>
              </p>
            </section>

            <CreditNotice message={creditMessage} onDismiss={clearCreditMessage} />

            <PresetPicker
              tool="rotate"
              params={{ angle, scope }}
              onApply={applyPreset}
              disabled={session.busy}
            />
          </>
        }
      />
    </ToolPage>
  );
}
