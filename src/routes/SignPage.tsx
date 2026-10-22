import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { SignatureStage, type StageSignature } from '../components/SignatureStage';
import { ToolPage } from '../components/ToolPage';
import { downloadBytes, signedFileName } from '../lib/download';
import { inspectPdf } from '../lib/pdf-ops';
import { stampSignatures } from '../lib/pdf/sign';

type Status = { tone: 'info' | 'error'; text: string } | null;

type PdfState = { name: string; bytes: Uint8Array; pages: number };

type SignatureImage = {
  id: string;
  name: string;
  bytes: Uint8Array;
  url: string;
  /** Intrinsic size, used for the aspect ratio on the page. */
  width: number;
  height: number;
};

/** One signature placed on the page, applied to an inclusive 1-based range. */
type Placement = {
  id: string;
  signatureId: string;
  from: number;
  to: number;
  /** Centre of the image, 0–1 from the left edge. */
  x: number;
  /** Centre of the image, 0–1 from the top edge. */
  y: number;
  widthRatio: number;
};

const DEFAULT_WIDTH_RATIO = 0.28;

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ';
}

function measure(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('อ่านรูปลายเซ็นไม่ได้'));
    image.src = url;
  });
}

async function loadSignature(file: File): Promise<SignatureImage> {
  if (file.type && file.type !== 'image/png') {
    throw new Error(`“${file.name}” ไม่ใช่ PNG — ลายเซ็นต้องเป็น PNG พื้นหลังโปร่งใส`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const url = URL.createObjectURL(file);
  try {
    const size = await measure(url);
    if (size.width === 0 || size.height === 0) throw new Error('ขนาดรูปไม่ถูกต้อง');
    return { id: newId('sig'), name: file.name || 'ลายเซ็นที่วาง', bytes, url, ...size };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function makePlacement(
  signatureId: string,
  pageNumber: number,
  at?: { x: number; y: number } | null,
): Placement {
  const halfWidth = DEFAULT_WIDTH_RATIO / 2;
  return {
    id: newId('place'),
    signatureId,
    from: pageNumber,
    to: pageNumber,
    x: Math.min(Math.max(at?.x ?? 0.5, halfWidth), 1 - halfWidth),
    y: Math.min(Math.max(at?.y ?? 0.8, 0.1), 0.9),
    widthRatio: DEFAULT_WIDTH_RATIO,
  };
}

export function SignPage() {
  const [pdf, setPdf] = useState<PdfState | null>(null);
  const [signatures, setSignatures] = useState<SignatureImage[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const pdfInput = useRef<HTMLInputElement>(null);
  const signatureInput = useRef<HTMLInputElement>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const signaturesRef = useRef<SignatureImage[]>([]);

  useEffect(() => {
    signaturesRef.current = signatures;
  }, [signatures]);

  // Object URLs live as long as the signature; release them when the page goes.
  useEffect(
    () => () => {
      for (const signature of signaturesRef.current) URL.revokeObjectURL(signature.url);
    },
    [],
  );

  const handlePdf = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setStatus(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const inspection = await inspectPdf(bytes);
      if (inspection.encrypted) {
        throw new Error('ไฟล์นี้มีรหัสผ่าน — ปลดล็อกก่อนแล้วค่อยเซ็น');
      }
      setPdf({ name: file.name, bytes, pages: inspection.pageCount });
      setPlacements([]);
      setSelectedPlacementId(null);
      setPage(1);
    } catch (error) {
      setPdf(null);
      setPlacements([]);
      setSelectedPlacementId(null);
      setStatus({ tone: 'error', text: describe(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  const addSignatures = useCallback(
    async (files: readonly File[], at?: { x: number; y: number } | null) => {
      if (files.length === 0) return;
      const added: SignatureImage[] = [];
      for (const file of files) {
        try {
          added.push(await loadSignature(file));
        } catch (error) {
          setStatus({ tone: 'error', text: describe(error) });
        }
      }
      if (added.length === 0) return;

      setSignatures((previous) => [...previous, ...added]);
      const first = added[0];
      if (!first) return;
      setSelectedSignatureId(first.id);
      setStatus(null);

      // Pasting over the page drops the signature exactly where the pointer is.
      if (at && pdf) {
        const placement = makePlacement(first.id, page, at);
        setPlacements((previous) => [...previous, placement]);
        setSelectedPlacementId(placement.id);
      }
    },
    [pdf, page],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (files.length === 0) return;
      event.preventDefault();
      void addSignatures(files, hover.current);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addSignatures]);

  const handleSignatureFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void addSignatures(files);
  };

  const placeSignature = (at?: { x: number; y: number } | null) => {
    if (!pdf || !selectedSignatureId) return;
    const placement = makePlacement(selectedSignatureId, page, at);
    setPlacements((previous) => [...previous, placement]);
    setSelectedPlacementId(placement.id);
  };

  const updatePlacement = (id: string, patch: Partial<Placement>) => {
    setPlacements((previous) =>
      previous.map((placement) => (placement.id === id ? { ...placement, ...patch } : placement)),
    );
  };

  const removePlacement = (id: string) => {
    setPlacements((previous) => previous.filter((placement) => placement.id !== id));
    if (selectedPlacementId === id) setSelectedPlacementId(null);
  };

  const removeSignature = (id: string) => {
    const target = signatures.find((signature) => signature.id === id);
    if (target) URL.revokeObjectURL(target.url);
    setSignatures((previous) => previous.filter((signature) => signature.id !== id));
    setPlacements((previous) => previous.filter((placement) => placement.signatureId !== id));
    if (selectedSignatureId === id) setSelectedSignatureId(null);
  };

  const changeRange = (id: string, field: 'from' | 'to', value: number) => {
    if (!pdf) return;
    const next = clampInt(value, 1, pdf.pages);
    setPlacements((previous) =>
      previous.map((placement) => {
        if (placement.id !== id) return placement;
        if (field === 'from') {
          return next > placement.to
            ? { ...placement, from: next, to: next }
            : { ...placement, from: next };
        }
        return next < placement.from
          ? { ...placement, from: next, to: next }
          : { ...placement, to: next };
      }),
    );
  };

  const goToPage = (value: number) => {
    if (!pdf) return;
    setPage(clampInt(value, 1, pdf.pages));
  };

  const activePlacement = placements.find((placement) => placement.id === selectedPlacementId) ?? null;
  const activeSignature = activePlacement
    ? signatures.find((signature) => signature.id === activePlacement.signatureId) ?? null
    : null;
  const activeIndex = activePlacement
    ? placements.findIndex((placement) => placement.id === activePlacement.id) + 1
    : 0;

  const stageSignatures = useMemo<StageSignature[]>(() => {
    return placements.flatMap((placement) => {
      const from = Math.min(placement.from, placement.to);
      const to = Math.max(placement.from, placement.to);
      if (page < from || page > to) return [];
      const signature = signatures.find((item) => item.id === placement.signatureId);
      if (!signature) return [];
      return [
        {
          id: placement.id,
          url: signature.url,
          x: placement.x,
          y: placement.y,
          widthRatio: placement.widthRatio,
          aspect: signature.width / signature.height,
        },
      ];
    });
  }, [placements, signatures, page]);

  const apply = async () => {
    if (!pdf || placements.length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      const stamps = placements.flatMap((placement) => {
        const signature = signatures.find((item) => item.id === placement.signatureId);
        if (!signature) return [];
        return [
          {
            png: signature.bytes,
            x: placement.x,
            y: placement.y,
            widthRatio: placement.widthRatio,
            fromPage: Math.min(placement.from, placement.to),
            toPage: Math.max(placement.from, placement.to),
          },
        ];
      });
      if (stamps.length === 0) throw new Error('ยังไม่มีลายเซ็นที่จะวาง');

      const bytes = await stampSignatures(pdf.bytes, stamps);
      const name = signedFileName(pdf.name);
      downloadBytes(name, bytes);
      setStatus({
        tone: 'info',
        text: `ดาวน์โหลด ${name} แล้ว · วาง ${stamps.length} ลายเซ็น`,
      });
    } catch (error) {
      setStatus({ tone: 'error', text: describe(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage
      title="Sign PDF"
      description="วางลายเซ็น PNG ได้หลายอัน — อัปโหลดหรือวางจากคลิปบอร์ด แล้วลากจัดตำแหน่งบนหน้าและเลือกช่วงหน้าได้ ไฟล์ไม่ออกจากเครื่อง"
    >
      <div className="simple-tool">
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          onChange={(event) => void handlePdf(event)}
          aria-label="เลือกไฟล์ PDF"
          tabIndex={-1}
        />
        <input
          ref={signatureInput}
          type="file"
          accept="image/png"
          multiple
          className="visually-hidden"
          onChange={handleSignatureFiles}
          aria-label="เลือกลายเซ็น PNG"
          tabIndex={-1}
        />

        {!pdf ? (
          <section className="panel sign-intro">
            <h2>1 · เลือกไฟล์ PDF</h2>
            <p className="hint">
              เปิดไฟล์ที่ต้องการเซ็นก่อน แล้วค่อยอัปโหลดหรือวางลายเซ็นจากคลิปบอร์ด (Ctrl+V)
            </p>
            <button
              type="button"
              className="button-primary button-large"
              onClick={() => pdfInput.current?.click()}
              disabled={busy}
            >
              {busy ? 'กำลังเปิดไฟล์…' : 'เลือกไฟล์ PDF'}
            </button>
          </section>
        ) : (
          <div className="sign-studio">
            <section className="panel sign-stage-panel">
              <header className="panel-head">
                <h2>
                  หน้า {page} / {pdf.pages}
                </h2>
                <div className="sign-page-nav">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    aria-label="หน้าก่อนหน้า"
                  >
                    ←
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={pdf.pages}
                    value={page}
                    onChange={(event) => goToPage(Number(event.target.value))}
                    aria-label="เลขหน้า"
                  />
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= pdf.pages}
                    aria-label="หน้าถัดไป"
                  >
                    →
                  </button>
                </div>
              </header>

              <SignatureStage
                bytes={pdf.bytes}
                pageNumber={page}
                signatures={stageSignatures}
                selectedId={selectedPlacementId}
                canPlace={Boolean(selectedSignatureId)}
                onSelect={setSelectedPlacementId}
                onMove={(id, x, y) => updatePlacement(id, { x, y })}
                onPlaceAt={(x, y) => placeSignature({ x, y })}
                onHover={(point) => {
                  hover.current = point;
                }}
              />
            </section>

            <aside className="sign-side">
              <section className="panel">
                <header className="panel-head">
                  <h2>ไฟล์ PDF</h2>
                  <span className="panel-note">{pdf.pages} หน้า</span>
                </header>
                <p className="export-meta">{pdf.name}</p>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => pdfInput.current?.click()}
                  disabled={busy}
                >
                  เปลี่ยนไฟล์
                </button>
              </section>

              <section className="panel">
                <header className="panel-head">
                  <h2>ลายเซ็น</h2>
                  <span className="panel-note">
                    {signatures.length > 0 ? `${signatures.length} รูป` : 'ยังไม่มี'}
                  </span>
                </header>

                {signatures.length > 0 ? (
                  <ul className="sign-tray">
                    {signatures.map((signature) => (
                      <li key={signature.id}>
                        <button
                          type="button"
                          className="sign-tray-item"
                          aria-pressed={selectedSignatureId === signature.id}
                          onClick={() => setSelectedSignatureId(signature.id)}
                          title={signature.name}
                        >
                          <img src={signature.url} alt={signature.name} />
                        </button>
                        <button
                          type="button"
                          className="sign-tray-remove"
                          onClick={() => removeSignature(signature.id)}
                          aria-label={`ลบ ${signature.name}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">อัปโหลดรูป PNG หรือกด Ctrl+V เพื่อวางจากคลิปบอร์ด</p>
                )}

                <div className="sign-tray-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => signatureInput.current?.click()}
                  >
                    เพิ่มลายเซ็น
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => placeSignature()}
                    disabled={!selectedSignatureId}
                  >
                    วางบนหน้านี้
                  </button>
                </div>
                <p className="hint">
                  วางรูปจากคลิปบอร์ดได้เลย — ถ้าตัวชี้อยู่บนหน้า จะวางลงตรงจุดนั้นทันที
                </p>
              </section>

              <section className="panel">
                <header className="panel-head">
                  <h2>{activePlacement ? `ลายเซ็นที่ ${activeIndex}` : 'ตำแหน่งและช่วงหน้า'}</h2>
                  {activePlacement && (
                    <button
                      type="button"
                      className="sign-remove"
                      onClick={() => removePlacement(activePlacement.id)}
                    >
                      ลบ
                    </button>
                  )}
                </header>

                {activePlacement ? (
                  <>
                    <label className="field">
                      <span className="field-label">
                        ขนาด · {Math.round(activePlacement.widthRatio * 100)}% ของความกว้างหน้า
                      </span>
                      <input
                        type="range"
                        min={6}
                        max={60}
                        step={2}
                        value={Math.round(activePlacement.widthRatio * 100)}
                        onChange={(event) =>
                          updatePlacement(activePlacement.id, {
                            widthRatio: Number(event.target.value) / 100,
                          })
                        }
                      />
                    </label>

                    <div className="sign-range">
                      <label className="field">
                        <span className="field-label">ตั้งแต่หน้า</span>
                        <input
                          type="number"
                          min={1}
                          max={pdf.pages}
                          value={activePlacement.from}
                          onChange={(event) =>
                            changeRange(activePlacement.id, 'from', Number(event.target.value))
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">ถึงหน้า</span>
                        <input
                          type="number"
                          min={1}
                          max={pdf.pages}
                          value={activePlacement.to}
                          onChange={(event) =>
                            changeRange(activePlacement.id, 'to', Number(event.target.value))
                          }
                        />
                      </label>
                    </div>
                    <p className="hint">
                      วางบนหน้า {Math.min(activePlacement.from, activePlacement.to)}–
                      {Math.max(activePlacement.from, activePlacement.to)}
                      {activeSignature ? ` · ${activeSignature.name}` : ''}
                    </p>
                  </>
                ) : (
                  <p className="hint">
                    คลิกเลือกลายเซ็นบนหน้า หรือกด “วางบนหน้านี้” แล้วลากจัดตำแหน่ง
                  </p>
                )}
              </section>

              <button
                type="button"
                className="button-primary button-large"
                onClick={() => void apply()}
                disabled={busy || placements.length === 0}
              >
                {busy
                  ? 'กำลังเซ็น…'
                  : placements.length > 0
                    ? `เซ็น ${placements.length} ลายเซ็นและดาวน์โหลด`
                    : 'เซ็นและดาวน์โหลด'}
              </button>
            </aside>
          </div>
        )}

        {status && (
          <div className="status" role="status" data-tone={status.tone}>
            <span>{status.text}</span>
          </div>
        )}
      </div>
    </ToolPage>
  );
}
