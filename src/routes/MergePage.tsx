import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
} from 'react';

import { CreditNotice } from '../components/CreditNotice';
import { DropOverlay } from '../components/DropOverlay';
import { GrabIcon } from '../components/GrabIcon';
import { OutputNameField } from '../components/OutputNameField';
import { ToolPage } from '../components/ToolPage';
import { useFileDrop } from '../hooks/useFileDrop';
import { useOutputName } from '../hooks/useOutputName';
import { useToolRun } from '../hooks/useToolRun';
import { mergedFileName } from '../lib/download';
import { isPdfFile } from '../lib/dropped-files';
import { probePdf } from '../lib/pdf-ops';
import { moveBlock } from '../lib/reorder';
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

type SelectMode = 'single' | 'add' | 'range';

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Shared selection rules: plain click, Ctrl/Cmd toggle, Shift range. */
function selectItems(
  current: readonly string[],
  ids: readonly string[],
  id: string,
  mode: SelectMode,
  anchor: string | null,
): string[] {
  if (mode === 'range') {
    const from = anchor === null ? -1 : ids.indexOf(anchor);
    const to = ids.indexOf(id);
    if (from === -1 || to === -1) return [id];
    const [start, end] = from <= to ? [from, to] : [to, from];
    return ids.slice(start, end + 1);
  }

  if (mode === 'add') {
    return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  }

  return current.length === 1 && current[0] === id ? [] : [id];
}

type RowProps = {
  item: MergeItem;
  index: number;
  total: number;
  busy: boolean;
  selected: boolean;
  onSelect: (event: MouseEvent<HTMLLIElement>, id: string) => void;
  onCheck: (id: string, checked: boolean) => void;
  onPassword: (id: string, password: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
};

function MergeRow({
  item,
  index,
  total,
  busy,
  selected,
  onSelect,
  onCheck,
  onPassword,
  onRemove,
  onMove,
}: RowProps) {
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
      data-selected={selected || undefined}
      onClick={(event) => onSelect(event, item.id)}
    >
      <label className="merge-check" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onCheck(item.id, event.target.checked)}
          disabled={busy}
          aria-label={`เลือก ${item.name}`}
        />
      </label>

      <button
        type="button"
        className="merge-drag"
        {...attributes}
        {...listeners}
        aria-label={`ลากเพื่อย้ายไฟล์ ${item.name}`}
        title="ลากเพื่อจัดลำดับ (ถ้าเลือกหลายไฟล์ จะย้ายทั้งกลุ่ม)"
        disabled={busy}
      >
        <GrabIcon />
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
  const { run, creditMessage, clearCreditMessage } = useToolRun();
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<string | null>(null);
  const dragIdsRef = useRef<string[]>([]);
  const [items, setItems] = useState<MergeItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragCount, setDragCount] = useState(0);
  const [merged, setMerged] = useState<MergedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const outputName = useOutputName(
    mergedFileName(items[0]?.name ?? 'document.pdf'),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const addFiles = async (files: File[]) => {
    setError(null);
    if (files.length === 0) {
      setError('อ่านไฟล์จากสิ่งที่วางไม่ได้ — เบราว์เซอร์อาจไม่รองรับโฟลเดอร์ หรือไม่มีไฟล์ PDF');
      return;
    }

    const accepted = files.filter(isPdfFile);
    if (accepted.length === 0) {
      setError('ไม่พบไฟล์ PDF ในสิ่งที่วาง');
      return;
    }
    if (accepted.length !== files.length) {
      setError(`ข้ามไฟล์ที่ไม่ใช่ PDF ${files.length - accepted.length} ไฟล์`);
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

  const drop = useFileDrop({
    onFiles: (files) => void addFiles(files),
    enabled: !session.busy,
  });

  useEffect(() => {
    if (drop.dragging) setError(null);
  }, [drop.dragging]);

  // Removing a file also drops it from the selection.
  useEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    setSelectedIds((current) => current.filter((id) => ids.has(id)));
  }, [items]);

  // A different name means the previous result no longer matches the field.
  useEffect(() => {
    setMerged(null);
  }, [outputName.resolved]);

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) void addFiles(files);
  };

  const selectRow = (event: MouseEvent<HTMLLIElement>, id: string) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, label, a')) return;
    const mode: SelectMode = event.shiftKey
      ? 'range'
      : event.metaKey || event.ctrlKey
        ? 'add'
        : 'single';
    setSelectedIds((current) => selectItems(current, items.map((item) => item.id), id, mode, anchorRef.current));
    anchorRef.current = id;
  };

  const checkRow = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? (current.includes(id) ? current : [...current, id]) : current.filter((item) => item !== id),
    );
    anchorRef.current = id;
  };

  const selectAll = () => {
    setSelectedIds(items.map((item) => item.id));
    anchorRef.current = items[0]?.id ?? null;
  };

  const clearSelection = () => {
    setSelectedIds([]);
    anchorRef.current = null;
  };

  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setMerged(null);
  };

  const removeSelected = () => {
    const selected = new Set(selectedIds);
    if (selected.size === 0) return;
    setItems((current) => current.filter((item) => !selected.has(item.id)));
    setNotice(`เอา ${selected.size} ไฟล์ออกแล้ว`);
    setSelectedIds([]);
    anchorRef.current = null;
    setMerged(null);
  };

  const move = (id: string, delta: number) => {
    if (delta !== 0 && selectedIds.length > 1 && selectedIds.includes(id)) {
      moveSelected(delta);
      return;
    }
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

  const moveSelected = (delta: number) => {
    if (selectedIds.length === 0) return;
    const selected = new Set(selectedIds);
    const indexes = items.flatMap((item, index) => (selected.has(item.id) ? [index] : []));
    const boundary = delta < 0 ? indexes[0] : indexes[indexes.length - 1];
    if (boundary === undefined) return;
    const target = boundary + delta;
    if (target < 0 || target >= items.length) return;
    const targetItem = items[target];
    const activeItem = items[boundary];
    if (!targetItem || !activeItem || selected.has(targetItem.id)) return;

    const next = moveBlock(items, activeItem.id, targetItem.id, selectedIds);
    if (next.every((item, index) => item === items[index])) return;
    setItems(next);
    setMerged(null);
    setNotice(`ย้าย ${selectedIds.length} ไฟล์ไปตำแหน่ง ${target + 1}`);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    const group = selectedIds.includes(id) ? selectedIds : [id];
    dragIdsRef.current = group;
    setDragCount(group.length);
    setActiveId(id);
    if (!selectedIds.includes(id)) setSelectedIds([id]);
    setMerged(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeID = String(active.id);
    const overID = String(over.id);
    const group = dragIdsRef.current.includes(activeID) ? dragIdsRef.current : [activeID];
    const next = moveBlock(items, activeID, overID, group);
    if (next.every((item, index) => item === items[index])) return;
    setItems(next);
    setMerged(null);
    setNotice(`ย้าย ${group.length} ไฟล์`);
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
  const selectedIndexes = items.flatMap((item, index) =>
    selectedIds.includes(item.id) ? [index] : [],
  );
  const canMoveUp = selectedIndexes.length > 0 && (selectedIndexes[0] ?? 0) > 0;
  const canMoveDown =
    selectedIndexes.length > 0 &&
    (selectedIndexes[selectedIndexes.length - 1] ?? items.length - 1) < items.length - 1;

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
        const name = outputName.resolved;
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
      description="รวมหลายไฟล์ตามลำดับที่ต้องการ — เลือกหลายไฟล์แล้วลากย้ายพร้อมกันได้ ไฟล์ทั้งหมดประมวลผลในเบราว์เซอร์"
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
            <div className="merge-empty" data-dragging={drop.dragging || undefined}>
              <p>ลากไฟล์หรือโฟลเดอร์ PDF มาวาง หรือเลือกจากเครื่อง</p>
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
              <div className="merge-toolbar" role="group" aria-label="เลือกและจัดลำดับไฟล์">
                <span className="merge-toolbar-count">
                  {selectedIds.length > 0 ? `เลือก ${selectedIds.length} ไฟล์` : 'ยังไม่ได้เลือกไฟล์'}
                </span>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={selectAll}
                  disabled={session.busy}
                >
                  เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={clearSelection}
                  disabled={session.busy || selectedIds.length === 0}
                >
                  ล้างที่เลือก
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => moveSelected(-1)}
                  disabled={session.busy || !canMoveUp}
                >
                  ↑ ย้ายขึ้น
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => moveSelected(1)}
                  disabled={session.busy || !canMoveDown}
                >
                  ↓ ย้ายลง
                </button>
                <button
                  type="button"
                  className="button-danger"
                  onClick={removeSelected}
                  disabled={session.busy || selectedIds.length === 0}
                >
                  เอาที่เลือกออก
                </button>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveId(null)}
              >
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
                        selected={selectedIds.includes(item.id)}
                        onSelect={selectRow}
                        onCheck={checkRow}
                        onPassword={setPassword}
                        onRemove={(id) =>
                          selectedIds.length > 1 && selectedIds.includes(id)
                            ? removeSelected()
                            : remove(id)
                        }
                        onMove={move}
                      />
                    ))}
                  </ul>
                </SortableContext>

                <DragOverlay>
                  {activeId && dragCount > 0 ? (
                    <div className="merge-drag-overlay">
                      ย้าย {dragCount} ไฟล์
                    </div>
                  ) : null}
                </DragOverlay>
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

          <p className="visually-hidden" aria-live="polite">
            {notice}
          </p>
        </section>

        <aside className="merge-side">
          <CreditNotice message={creditMessage} onDismiss={clearCreditMessage} />

          <section className="panel">
            <header className="panel-head">
              <h2>ผลลัพธ์</h2>
              <span className="panel-note">ตามลำดับด้านซ้าย</span>
            </header>

            {items.length > 0 && <OutputNameField name={outputName} disabled={session.busy} />}

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

      <DropOverlay drop={drop} label="วางไฟล์หรือโฟลเดอร์ PDF เพื่อเพิ่มเข้ารายการ" />
    </ToolPage>
  );
}
