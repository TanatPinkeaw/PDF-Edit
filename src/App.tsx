import { useEffect, type ReactNode } from 'react';

import { PasswordDialog } from './components/PasswordDialog';
import { QuotaBadge } from './components/QuotaBadge';
import { ShareStrip } from './components/ShareStrip';
import { SignInButton } from './components/SignInButton';
import { useRoute } from './lib/router';
import { READY_TOOLS } from './lib/tools';
import { ActivityPage } from './routes/ActivityPage';
import { HomePage } from './routes/HomePage';
import { LockPage } from './routes/LockPage';
import { MergePage } from './routes/MergePage';
import { OrganizePage } from './routes/OrganizePage';
import { PageNumbersPage } from './routes/PageNumbersPage';
import { RotatePage } from './routes/RotatePage';
import { SharePage } from './routes/SharePage';
import { WatermarkPage } from './routes/WatermarkPage';
import { AccountProvider } from './state/account-context';
import { WorkspaceProvider, useWorkspace } from './state/workspace-context';

function NotFoundPage() {
  return (
    <main className="empty">
      <div className="dropzone">
        <h2>ไม่พบหน้านี้</h2>
        <p className="dropzone-sub">ลิงก์อาจพิมพ์ผิด หรือเครื่องมือนี้ยังไม่เปิดใช้งาน</p>
        <a className="button-primary button-large" href="#/">
          กลับหน้าเครื่องมือ
        </a>
      </div>
    </main>
  );
}

function Shell() {
  const route = useRoute();
  const { session } = useWorkspace();
  const section = route.segments[0] ?? '';
  const shareToken = route.segments[1];

  useEffect(() => {
    const tool = READY_TOOLS.find((entry) => entry.href === `#/${section}`);
    document.title = tool ? `${tool.title} · PDF Studio` : 'PDF Studio';
  }, [section]);

  let page: ReactNode;
  switch (section) {
    case '':
      page = <HomePage />;
      break;
    case 'organize':
      page = <OrganizePage />;
      break;
    case 'merge':
      page = <MergePage />;
      break;
    case 'rotate':
      page = <RotatePage />;
      break;
    case 'page-numbers':
      page = <PageNumbersPage />;
      break;
    case 'watermark':
      page = <WatermarkPage />;
      break;
    case 'lock':
      page = <LockPage />;
      break;
    case 'activity':
      page = <ActivityPage />;
      break;
    case 's':
      page = shareToken ? <SharePage token={shareToken} /> : <NotFoundPage />;
      break;
    default:
      page = <NotFoundPage />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true">
            PDF
          </span>
          <div>
            <h1>PDF Studio</h1>
            <p className="brand-sub">เครื่องมือ PDF ทั้งหมดทำงานในเบราว์เซอร์</p>
          </div>
        </a>

        <nav className="app-nav" aria-label="เมนูหลัก">
          <a href="#/" data-active={section === '' || undefined}>
            เครื่องมือ
          </a>
          <a href="#/activity" data-active={section === 'activity' || undefined}>
            ประวัติ
          </a>
        </nav>

        <div className="header-actions">
          <QuotaBadge />
          <SignInButton />
        </div>
      </header>

      {page}

      <footer className="app-footer">
        <span>ไฟล์ประมวลผลในเครื่องคุณ · เซิร์ฟเวอร์เก็บเฉพาะ metadata ของงาน</span>
        <a href="#/activity">จัดการข้อมูลของฉัน</a>
      </footer>

      <ShareStrip />
      <PasswordDialog />

      {session.status && (
        <div className="status" role="status" data-tone={session.status.tone}>
          <span>{session.status.text}</span>
          <button type="button" onClick={session.clearStatus} aria-label="ปิดข้อความ">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AccountProvider>
      <WorkspaceProvider>
        <Shell />
      </WorkspaceProvider>
    </AccountProvider>
  );
}
