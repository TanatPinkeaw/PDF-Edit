import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';

import { QuotaNotice } from '../components/QuotaNotice';
import { ToolPage } from '../components/ToolPage';
import { useFileDrop } from '../hooks/useFileDrop';
import { useToolRun } from '../hooks/useToolRun';
import { mergedFileName } from '../lib/download';
import { probePdf } from '../lib/pdf-ops';
import { mergePdfs } from '../lib/pdf/merge';
import { formatBytes } from '../lib/share';
import { navigate } from '../lib/router';
import { useWorkspace } from '../state/workspace-context';

type MergeItem = {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  encrypted: boolean;
  password: string;
  error: string | null;
};

type MergedResult = {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
};

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type RowProps = {
  item: MergeItem;
  index: number;
  total: number;
  busy: boolean;
  onPassword: (id: string, password: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
};

function MergeRow({ item, index, total, busy, onPassword, onRemove, onMove }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: busy,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="merge-row"
      data-dragging={isDragging || undefined}
    >
      <button
        type="button"
        className="merge-drag"
        {...attributes}
        {...listeners}
        aria-label={`ลากเพื่อย้ายไฟล์ ${item.name}`}
        title="ลากเพื่อจัดลำดับ"
        disabled={busy}
      >
        ⠿
      </button>

      <span className="merge-order">{index + 1}</span>

      <div className="merge-info">
        <strong title={item.name}>{item.name}</strong>
        <span>
          {formatBytes(item.bytes.byteLength)}
          {item.pageCount !== null ? ` · ${item.pageCount} หน้า` : ' · ต้องใส่รหัสผ่าน'}
        </span>
        {item.encrypted && (
          <label className="merge-password">
            <span className="visually-hidden">รหัสผ่านของ {item.name}</span>
            <input
              type="password"
              value={item.password}
              onChange={(event) => onPassword(item.id, event.target.value)}
              placeholder="รหัสผ่านของไฟล์นี้"
              autoComplete="off"
              disabled={busy}
            />
          </label>
        )}
        {item.error && <span className="form-error">{item.error}</span>}
      </div>

      <div className="merge-actions">
        <button
          type="button"
          onClick={() => onMove(item.id, -1)}
          disabled={busy || index === 0}
          aria-label={`เลื่อน ${item.name} ขึ้น`}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(item.id, 1)}
          disabled={busy || index === total - 1}
          aria-label={`เลื่อน ${item.name} ลง`}
        >
          ↓
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => onRemove(item.id)}
          disabled={busy}
          aria-label={`เอา ${item.name} ออก`}
        >
          ×
        </button>
      </div>
    </li>
  );
}

export function MergePage() {
  const { session } = useWorkspace();
  const { run, quotaMessage, clearQuotaMessage } = useToolRun();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MergeItem[]>([]);
  const [merged, setMerged] = useState<MergedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const addFiles = async (files: File[]) => {
    setError(null);
    const accepted = files.filter(
      (file) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf',
    );
    if (accepted.length !== files.length) {
      setError('ข้ามไฟล์ที่ไม่ใช่ PDF');
    }

    const added: MergeItem[] = [];
    for (const file of accepted) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        const probe = await probePdf(bytes);
        added.push({
          id: newId(),
          name: file.name,
          bytes,
          pageCount: probe.isEncrypted ? null : probe.getPageCount(),
          encrypted: probe.isEncrypted,
          password: '',
          error: probe.isEncrypted ? 'ไฟล์นี้มีรหัสผ่าน — ใส่รหัสก่อนรวม' : null,
        });
      } catch (readError) {
        added.push({
          id: newId(),
          name: file.name,
          bytes,
          pageCount: null,
          encrypted: false,
          password: '',
          error: readError instanceof Error ? readError.message : 'อ่านไฟล์ไม่สำเร็จ',
        });
      }
    }

    if (added.length > 0) {
      setItems((current) => [...current, ...added]);
      setMerged(null);
    }
  };

  const dragging = useFileDrop({ onFiles: (files) => void addFiles(files) });

  useEffect(() => {
    if (dragging) setError(null);
  }, [dragging]);

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) void addFiles(files);
  };

  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setMerged(null);
  };

  const move = (id: string, delta: number) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (!moved) return current;
      next.splice(target, 0, moved);
      return next;
    });
    setMerged(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === String(active.id));
    const to = items.findIndex((item) => item.id === String(over.id));
    if (from === -1 || to === -1) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setItems(next);
    setMerged(null);
  };

  const setPassword = (id: string, password: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              password,
              error:
                password === '' && item.encrypted
                  ? 'ไฟล์นี้มีรหัสผ่าน — ใส่รหัสก่อนรวม'
                  : null,
            }
          : item,
      ),
    );
    setMerged(null);
  };

  const totalPages = items.reduce((sum, item) => sum + (item.pageCount ?? 0), 0);
  const canMerge = items.length >= 2 && !session.busy;

  const merge = async () => {
    if (!canMerge) {
      setError('ต้องมีอย่างน้อย 2 ไฟล์');
      return;
    }
    setError(null);

    const output = await run(
      'merge',
      { files: items.map((item) => item.name), order: items.map((item) => item.id) },
      async () => {
        const result = await mergePdfs(
          items.map((item) => ({
            name: item.name,
            bytes: item.bytes,
            password: item.password === '' ? undefined : item.password,
          })),
        );
        const name = mergedFileName(items[0]?.name ?? 'document.pdf');
        setMerged({ name, bytes: result.bytes, pageCount: result.pageCount });
        return { name, bytes: result.bytes };
      },
      {
        name: items[0]?.name,
        pages: totalPages,
        bytes: items.reduce((sum, item) => sum + item.bytes.byteLength, 0),
      },
    );

    if (!output) setError('รวมไฟล์ไม่สำเร็จ — ตรวจรหัสผ่านของไฟล์ที่ใส่ไว้');
  };

  const openInEditor = () => {
    if (!merged) return;
    void session.loadBytes(merged.name, merged.bytes).then(() => navigate('/organize'));
  };

  return (
    <ToolPage
      title="Merge PDF"
      description="รวมหลายไฟล์ตามลำดับที่ต้องการ ไฟล์ทั้งหมดประมวลผลในเบราว์เซอร์ — ไม่มีการอัปโหลด"
    >
      <div className="merge-layout">
        <section className="panel merge-panel" aria-labelledby="merge-title">
          <header className="panel-head">
            <h2 id="merge-title">ไฟล์ที่จะรวม</h2>
            <span className="panel-note">
              {items.length} ไฟล์ · {totalPages} หน้า
            </span>
          </header>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,.pdf"
            className="visually-hidden"
            onChange={handleInput}
            aria-label="เลือกไฟล์ PDF เพื่อรวม"
            tabIndex={-1}
          />

          {items.length === 0 ? (
            <div className="merge-empty" data-dragging={dragging || undefined}>
              <p>ลากไฟล์ PDF หลายไฟล์มาวาง หรือเลือกจากเครื่อง</p>
              <button
                type="button"
                className="button-primary"
                onClick={() => inputRef.current?.click()}
                disabled={session.busy}
              >
                เลือกไฟล์ PDF
              </button>
            </div>
          ) : (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="merge-list">
                    {items.map((item, index) => (
                      <MergeRow
                        key={item.id}
                        item={item}
                        index={index}
                        total={items.length}
                        busy={session.busy}
                        onPassword={setPassword}
                        onRemove={remove}
                        onMove={move}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>

              <div className="merge-buttons">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => inputRef.current?.click()}
                  disabled={session.busy}
                >
                  เพิ่มไฟล์
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => void merge()}
                  disabled={!canMerge}
                >
                  {session.busy ? 'กำลังรวม…' : `รวม ${items.length} ไฟล์`}
                </button>
              </div>
            </>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>

        <aside className="merge-side">
          <QuotaNotice message={quotaMessage} onDismiss={clearQuotaMessage} />

          <section className="panel">
            <header className="panel-head">
              <h2>ผลลัพธ์</h2>
              <span className="panel-note">ตามลำดับด้านซ้าย</span>
            </header>
            {merged ? (
              <>
                <p className="export-meta">
                  <code>{merged.name}</code>
                  <br />
                  {merged.pageCount} หน้า · {formatBytes(merged.bytes.byteLength)}
                </p>
                <button
                  type="button"
                  className="button-secondary button-large"
                  onClick={openInEditor}
                  disabled={session.busy}
                >
                  เปิดในตัวแก้ไข
                </button>
              </>
            ) : (
              <p className="hint">
                รวมแล้วจะดาวน์โหลดอัตโนมัติ และเปิดต่อในหน้าจัดการหน้าได้ทันที
              </p>
            )}
            <p className="hint">
              ไฟล์ที่มีรหัสผ่านต้องใส่รหัสในแถวของไฟล์นั้นก่อนกดรวม — ไฟล์ผลลัพธ์จะไม่มีรหัสผ่าน
            </p>
          </section>
        </aside>
      </div>
    </ToolPage>
  );
}
