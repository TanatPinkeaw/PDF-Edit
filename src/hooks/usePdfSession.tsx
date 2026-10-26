/**
 * Owns the opened file, the page-order state and the export operations.
 * Everything runs locally: no PDF bytes are sent anywhere.
 */

import { useCallback, useMemo, useReducer, useState, type Dispatch } from 'react';

import {
  downloadBytes,
  editedFileName,
  imageFileName,
  imagesZipFileName,
  mimeForName,
  rangeFileName,
  sanitizeFileName,
  selectionFileName,
  splitZipFileName,
  zipFiles,
} from '../lib/download';
import {
  IMAGE_EXTENSION,
  IMAGE_MIME,
  renderPageImages,
  type ImageFormat,
  type ImageScale,
} from '../lib/page-images';
import type { PageRange } from '../lib/page-ranges';
import { PdfError, buildPdf, buildPdfs, inspectPdf, probePdf } from '../lib/pdf-ops';
import { unlockPdf } from '../lib/pdf/security';
import {
  currentDoc,
  initialSession,
  selectedEntries,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from '../lib/session';
import type { DocState } from '../lib/session';

export type Status = {
  tone: 'error' | 'info';
  text: string;
} | null;

export type ImageProgress = {
  done: number;
  total: number;
} | null;

export type ImageScope = 'all' | 'selected';

/** The most recent exported file, offered for sharing. */
export type LastOutput = {
  name: string;
  bytes: Uint8Array;
  mime: string;
};

export type PendingPassword = {
  fileName: string;
  bytes: Uint8Array;
  error: string | null;
};

const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/sample-12p.pdf`;
const SAMPLE_NAME = 'sample-12p.pdf';

function describeError(error: unknown): string {
  if (error instanceof PdfError) return error.message;
  if (error instanceof Error && error.message) return `เกิดข้อผิดพลาด: ${error.message}`;
  return 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
}

/** A user-supplied output name, always ending in .pdf. */
function asPdfName(name: string): string {
  const cleaned = sanitizeFileName(name);
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

export type PdfSession = {
  bytes: Uint8Array | null;
  state: SessionState;
  doc: DocState | null;
  busy: boolean;
  status: Status;
  imageProgress: ImageProgress;
  lastOutput: LastOutput | null;
  pendingPassword: PendingPassword | null;
  notify: (tone: 'error' | 'info', text: string) => void;
  clearStatus: () => void;
  dispatch: Dispatch<SessionAction>;
  withBusy: <T>(task: () => Promise<T>) => Promise<T>;
  openFile: (file: File) => Promise<void>;
  loadSample: () => Promise<void>;
  loadBytes: (fileName: string, bytes: Uint8Array) => Promise<void>;
  close: () => void;
  submitPassword: (password: string) => Promise<void>;
  cancelPassword: () => void;
  deleteSelected: () => void;
  move: (from: number, to: number) => void;
  nudge: (id: string, delta: number) => void;
  resetOrder: () => void;
  undo: () => void;
  redo: () => void;
  rememberOutput: (output: LastOutput) => void;
  /** Optional name is the full file name chosen by the user. */
  downloadEdited: (name?: string) => Promise<LastOutput | null>;
  downloadSelection: (name?: string) => Promise<LastOutput | null>;
  splitRanges: (ranges: PageRange[], name?: string) => Promise<LastOutput | null>;
  exportImages: (
    format: ImageFormat,
    scale: ImageScale,
    scope: ImageScope,
    name?: string,
  ) => Promise<LastOutput | null>;
};

export function usePdfSession(): PdfSession {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [busyCount, setBusyCount] = useState(0);
  const [status, setStatus] = useState<Status>(null);
  const [imageProgress, setImageProgress] = useState<ImageProgress>(null);
  const [lastOutput, setLastOutput] = useState<LastOutput | null>(null);
  const [pendingPassword, setPendingPassword] = useState<PendingPassword | null>(null);

  const doc = currentDoc(state);
  const busy = busyCount > 0;

  const notify = useCallback((tone: 'error' | 'info', text: string) => {
    setStatus({ tone, text });
  }, []);

  const withBusy = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    setBusyCount((count) => count + 1);
    try {
      return await task();
    } finally {
      setBusyCount((count) => Math.max(0, count - 1));
    }
  }, []);

  const rememberOutput = useCallback((output: LastOutput) => {
    setLastOutput(output);
  }, []);

  const deliver = useCallback(
    (name: string, data: Uint8Array, mime = mimeForName(name)): LastOutput => {
      downloadBytes(name, data, mime);
      const output = { name, bytes: data, mime };
      setLastOutput(output);
      return output;
    },
    [],
  );

  const openBytes = useCallback(
    async (fileName: string, data: Uint8Array) => {
      setStatus(null);
      await withBusy(async () => {
        try {
          const probe = await probePdf(data);
          if (probe.isEncrypted) {
            setPendingPassword({ fileName, bytes: data, error: null });
            return;
          }
          const pageCount = probe.getPageCount();
          if (pageCount < 1) {
            throw new PdfError('invalid', 'ไฟล์นี้ไม่มีหน้าให้แก้ไข');
          }
          setBytes(data);
          setLastOutput(null);
          dispatch({ type: 'loaded', fileName, pageCount });
          setStatus({ tone: 'info', text: `เปิด ${fileName} แล้ว — ${pageCount} หน้า` });
        } catch (error) {
          setStatus({ tone: 'error', text: describeError(error) });
        }
      });
    },
    [withBusy],
  );

  const openFile = useCallback(
    async (file: File) => {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
        setStatus({ tone: 'error', text: `รองรับเฉพาะไฟล์ .pdf (ได้รับ ${file.name})` });
        return;
      }
      const data = new Uint8Array(await file.arrayBuffer());
      await openBytes(file.name, data);
    },
    [openBytes],
  );

  const loadBytes = useCallback(
    async (fileName: string, data: Uint8Array) => {
      await openBytes(fileName, data);
    },
    [openBytes],
  );

  const loadSample = useCallback(async () => {
    await withBusy(async () => {
      try {
        const response = await fetch(SAMPLE_URL);
        if (!response.ok) {
          throw new Error(`โหลดไฟล์ตัวอย่างไม่สำเร็จ (HTTP ${response.status})`);
        }
        const data = new Uint8Array(await response.arrayBuffer());
        await openBytes(SAMPLE_NAME, data);
      } catch (error) {
        setStatus({ tone: 'error', text: describeError(error) });
      }
    });
  }, [openBytes, withBusy]);

  const submitPassword = useCallback(
    async (password: string) => {
      const pending = pendingPassword;
      if (!pending) return;
      await withBusy(async () => {
        try {
          const info = await inspectPdf(pending.bytes, password);
          const plain = await unlockPdf(pending.bytes, password);
          setBytes(plain);
          setLastOutput(null);
          dispatch({ type: 'loaded', fileName: pending.fileName, pageCount: info.pageCount });
          setPendingPassword(null);
          setStatus({
            tone: 'info',
            text: `ปลดล็อก ${pending.fileName} แล้ว — ${info.pageCount} หน้า (ไฟล์ที่แก้ไขจะไม่มีรหัสผ่าน)`,
          });
        } catch (error) {
          if (error instanceof PdfError && error.code === 'wrong-password') {
            setPendingPassword({ ...pending, error: error.message });
            return;
          }
          setPendingPassword(null);
          setStatus({ tone: 'error', text: describeError(error) });
        }
      });
    },
    [pendingPassword, withBusy],
  );

  const cancelPassword = useCallback(() => {
    setPendingPassword(null);
    setStatus({ tone: 'info', text: 'ยกเลิกการเปิดไฟล์ที่ใส่รหัสไว้' });
  }, []);

  const close = useCallback(() => {
    setBytes(null);
    setStatus(null);
    setLastOutput(null);
    setPendingPassword(null);
    dispatch({ type: 'closed' });
  }, []);

  const deleteSelected = useCallback(() => dispatch({ type: 'deleteSelected' }), []);
  const resetOrder = useCallback(() => dispatch({ type: 'resetOrder' }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const move = useCallback((from: number, to: number) => dispatch({ type: 'move', from, to }), []);
  const nudge = useCallback(
    (id: string, delta: number) => dispatch({ type: 'nudge', id, delta }),
    [],
  );

  const downloadEdited = useCallback(async (customName?: string): Promise<LastOutput | null> => {
    if (!bytes || !doc || busy) return null;
    return withBusy(async () => {
      setStatus(null);
      try {
        const indices = doc.entries.map((entry) => entry.srcIndex);
        const output = await buildPdf(bytes, indices);
        const name = customName ? asPdfName(customName) : editedFileName(doc.fileName);
        const result = deliver(name, output);
        setStatus({ tone: 'info', text: `ดาวน์โหลด ${name} แล้ว — ${indices.length} หน้า` });
        return result;
      } catch (error) {
        setStatus({ tone: 'error', text: describeError(error) });
        return null;
      }
    });
  }, [busy, bytes, deliver, doc, withBusy]);

  const downloadSelection = useCallback(async (customName?: string): Promise<LastOutput | null> => {
    if (!bytes || !doc || busy) return null;
    const entries = selectedEntries(state);
    if (entries.length === 0) {
      setStatus({ tone: 'error', text: 'ยังไม่ได้เลือกหน้า — ติ๊กหน้าก่อนดึงออกเป็นไฟล์' });
      return null;
    }
    return withBusy(async () => {
      setStatus(null);
      try {
        const output = await buildPdf(
          bytes,
          entries.map((entry) => entry.srcIndex),
        );
        const sourceName = customName ? asPdfName(customName) : doc.fileName;
        const name = selectionFileName(sourceName);
        const result = deliver(name, output);
        setStatus({ tone: 'info', text: `ดาวน์โหลด ${name} แล้ว — ${entries.length} หน้า` });
        return result;
      } catch (error) {
        setStatus({ tone: 'error', text: describeError(error) });
        return null;
      }
    });
  }, [busy, bytes, deliver, doc, state, withBusy]);

  const splitRanges = useCallback(
    async (ranges: PageRange[], customName?: string): Promise<LastOutput | null> => {
      if (!bytes || !doc || busy || ranges.length === 0) return null;
      const sourceName = customName ? asPdfName(customName) : doc.fileName;
      return withBusy(async () => {
        setStatus(null);
        try {
          const groups = ranges.map((range) => ({
            label: `${range.start}-${range.end}`,
            indices: doc.entries
              .slice(range.start - 1, range.end)
              .map((entry) => entry.srcIndex),
          }));
          const built = await buildPdfs(bytes, groups);
          const files = built.map((part, index) => {
            const range = ranges[index];
            return {
              name: rangeFileName(sourceName, range?.start ?? 1, range?.end ?? 1),
              bytes: part.bytes,
            };
          });

          if (files.length === 1 && files[0]) {
            const result = deliver(files[0].name, files[0].bytes);
            setStatus({ tone: 'info', text: `ดาวน์โหลด ${files[0].name} แล้ว` });
            return result;
          }

          const zipName = splitZipFileName(sourceName);
          const result = deliver(zipName, zipFiles(files), 'application/zip');
          setStatus({
            tone: 'info',
            text: `ดาวน์โหลด ${zipName} แล้ว — ${files.length} ไฟล์`,
          });
          return result;
        } catch (error) {
          setStatus({ tone: 'error', text: describeError(error) });
          return null;
        }
      });
    },
    [busy, bytes, deliver, doc, withBusy],
  );

  const exportImages = useCallback(
    async (
      format: ImageFormat,
      scale: ImageScale,
      scope: ImageScope,
      customName?: string,
    ): Promise<LastOutput | null> => {
      if (!bytes || !doc || busy) return null;
      const sourceName = customName ? asPdfName(customName) : doc.fileName;

      const selected = new Set(state.selection);
      const targets = doc.entries
        .map((entry, index) => ({
          srcIndex: entry.srcIndex,
          position: index + 1,
          isSelected: selected.has(entry.id),
        }))
        .filter((target) => scope === 'all' || target.isSelected);

      if (targets.length === 0) {
        setStatus({ tone: 'error', text: 'ยังไม่ได้เลือกหน้า — ติ๊กหน้าก่อนดาวน์โหลดเป็นภาพ' });
        return null;
      }

      return withBusy(async () => {
        setStatus(null);
        setImageProgress({ done: 0, total: targets.length });
        try {
          const rendered = await renderPageImages(
            bytes,
            targets.map((target) => target.srcIndex),
            {
              format,
              scale,
              onProgress: (done, total) => setImageProgress({ done, total }),
            },
          );

          const extension = IMAGE_EXTENSION[format];
          const files = rendered.map((image, index) => {
            const position = targets[index]?.position ?? index + 1;
            return {
              name: imageFileName(sourceName, position, extension),
              bytes: image.bytes,
            };
          });

          if (files.length === 1 && files[0]) {
            const result = deliver(files[0].name, files[0].bytes, IMAGE_MIME[format]);
            setStatus({ tone: 'info', text: `ดาวน์โหลด ${files[0].name} แล้ว` });
            return result;
          }

          const zipName = imagesZipFileName(sourceName);
          const result = deliver(zipName, zipFiles(files), 'application/zip');
          setStatus({
            tone: 'info',
            text: `ดาวน์โหลด ${zipName} แล้ว — ${files.length} ภาพ`,
          });
          return result;
        } catch (error) {
          setStatus({ tone: 'error', text: describeError(error) });
          return null;
        } finally {
          setImageProgress(null);
        }
      });
    },
    [busy, bytes, deliver, doc, state.selection, withBusy],
  );

  return useMemo(
    () => ({
      bytes,
      state,
      doc,
      busy,
      status,
      imageProgress,
      lastOutput,
      pendingPassword,
      notify,
      clearStatus: () => setStatus(null),
      dispatch,
      withBusy,
      openFile,
      loadSample,
      loadBytes,
      close,
      submitPassword,
      cancelPassword,
      deleteSelected,
      move,
      nudge,
      resetOrder,
      undo,
      redo,
      rememberOutput,
      downloadEdited,
      downloadSelection,
      splitRanges,
      exportImages,
    }),
    [
      bytes,
      state,
      doc,
      busy,
      status,
      imageProgress,
      lastOutput,
      pendingPassword,
      notify,
      withBusy,
      openFile,
      loadSample,
      loadBytes,
      close,
      submitPassword,
      cancelPassword,
      deleteSelected,
      move,
      nudge,
      resetOrder,
      undo,
      redo,
      rememberOutput,
      downloadEdited,
      downloadSelection,
      splitRanges,
      exportImages,
    ],
  );
}
