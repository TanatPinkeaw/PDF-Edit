import { ExportPanel } from '../components/ExportPanel';
import { ImageExportPanel } from '../components/ImageExportPanel';
import { CreditNotice } from '../components/CreditNotice';
import { SplitPanel } from '../components/SplitPanel';
import { ToolPage } from '../components/ToolPage';
import { Workbench } from '../components/Workbench';
import { useOutputName } from '../hooks/useOutputName';
import { ToolCanceled, useToolRun } from '../hooks/useToolRun';
import { editedFileName } from '../lib/download';
import { selectedPageNumbers } from '../lib/session';
import type { PageRange } from '../lib/page-ranges';
import { useWorkspace } from '../state/workspace-context';

export function OrganizePage() {
  const { session } = useWorkspace();
  const { track, creditMessage, clearCreditMessage } = useToolRun();
  const { doc, state, busy, imageProgress } = session;
  const selectedCount = selectedPageNumbers(state).length;
  const outputName = useOutputName(editedFileName(doc?.fileName ?? 'document.pdf'));

  const input = doc
    ? { name: doc.fileName, pages: doc.entries.length, bytes: session.bytes?.byteLength ?? 0 }
    : undefined;

  const handleDownload = () => {
    void track(
      'organize',
      { action: 'download', pages: doc?.entries.length ?? 0 },
      async () => {
        const output = await session.downloadEdited(outputName.resolved);
        if (!output) throw new ToolCanceled();
        return output;
      },
      input,
    );
  };

  const handleExtractSelection = () => {
    void track(
      'organize',
      { action: 'extract-selection', selected: selectedCount },
      async () => {
        const output = await session.downloadSelection(outputName.resolved);
        if (!output) throw new ToolCanceled();
        return output;
      },
      input,
    );
  };

  const handleSplit = (ranges: PageRange[]) => {
    void track(
      'organize',
      { action: 'split', ranges },
      async () => {
        const output = await session.splitRanges(ranges, outputName.resolved);
        if (!output) throw new ToolCanceled();
        return output;
      },
      input,
    );
  };

  const handleImages: Parameters<typeof ImageExportPanel>[0]['onExport'] = (
    format,
    scale,
    scope,
  ) => {
    void track(
      'organize',
      { action: 'export-images', format, scale, scope },
      async () => {
        const output = await session.exportImages(format, scale, scope, outputName.resolved);
        if (!output) throw new ToolCanceled();
        return output;
      },
      input,
    );
  };

  return (
    <ToolPage
      title="Organize PDF"
      description="ลบ จัดลำดับ และแยกหน้า — เลือกหน้าได้หลายแบบด้วย Shift/Ctrl แล้วลากเพื่อจัดลำดับ"
    >
      <Workbench
        aside={
          <>
            <ExportPanel
              total={doc?.entries.length ?? 0}
              busy={busy}
              outputName={outputName}
              onDownload={handleDownload}
            />

            <CreditNotice message={creditMessage} onDismiss={clearCreditMessage} />

            <SplitPanel
              total={doc?.entries.length ?? 0}
              selectedCount={selectedCount}
              busy={busy}
              onSplit={handleSplit}
              onExtractSelection={handleExtractSelection}
            />

            <ImageExportPanel
              total={doc?.entries.length ?? 0}
              selectedCount={selectedCount}
              busy={busy}
              progress={imageProgress}
              onExport={handleImages}
            />

            <p className="side-note">
              ข้อจำกัด: bookmark หรือลิงก์ที่ชี้ไปหน้าที่ถูกลบอาจเสีย และลายเซ็นดิจิทัลจะถูกยกเลิก
              เมื่อบันทึกไฟล์ใหม่
            </p>
          </>
        }
      />
    </ToolPage>
  );
}
