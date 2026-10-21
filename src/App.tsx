import { useEffect, type ReactNode } from 'react';

import { PasswordDialog } from './components/PasswordDialog';
import { CreditBadge } from './components/CreditBadge';
import { ShareStrip } from './components/ShareStrip';
import { SignInButton } from './components/SignInButton';
import { VerifyEmailBar } from './components/VerifyEmailBar';
import { useRoute } from './lib/router';
import { READY_TOOLS } from './lib/tools';
import { ActivityPage } from './routes/ActivityPage';
import { AuthPage } from './routes/AuthPage';
import { ChangePasswordPage } from './routes/ChangePasswordPage';
import { CompressPage } from './routes/CompressPage';
import { ConvertPage } from './routes/ConvertPage';
import { CropPage } from './routes/CropPage';
import { DiagnosticsPage } from './routes/DiagnosticsPage';
import { ForgotPasswordPage } from './routes/ForgotPasswordPage';
import { HomePage } from './routes/HomePage';
import { JpgToPdfPage } from './routes/JpgToPdfPage';
import { LockPage } from './routes/LockPage';
import { MergePage } from './routes/MergePage';
import { OrganizePage } from './routes/OrganizePage';
import { PageNumbersPage } from './routes/PageNumbersPage';
import { RotatePage } from './routes/RotatePage';
import { SharePage } from './routes/SharePage';
import { SignPage } from './routes/SignPage';
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
    case 'jpg-to-pdf':
      page = <JpgToPdfPage />;
      break;
    case 'sign':
      page = <SignPage />;
      break;
    case 'crop':
      page = <CropPage />;
      break;
    case 'compress':
      page = <CompressPage />;
      break;
    case 'word-to-pdf':
      page = <ConvertPage kind="word-to-pdf" />;
      break;
    case 'pdf-to-word':
      page = <ConvertPage kind="pdf-to-word" />;
      break;
    case 'activity':
      page = <ActivityPage />;
      break;
    case 'diagnostics':
      page = <DiagnosticsPage />;
      break;
    case 'signin':
      page = <AuthPage mode="signin" />;
      break;
    case 'password':
      page = <ChangePasswordPage />;
      break;
    case 'forgot':
      page = <ForgotPasswordPage />;
      break;
    case 'signup':
      page = <AuthPage mode="signup" />;
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
          <img
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}brand/logo.webp`}
            alt=""
            width={46}
            height={46}
            decoding="async"
          />
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
          <CreditBadge />
          <SignInButton />
        </div>
      </header>

      <VerifyEmailBar />

      {page}

      <footer className="app-footer">
        <span>ไฟล์ประมวลผลในเครื่องคุณ · เซิร์ฟเวอร์เก็บเฉพาะ metadata ของงาน</span>
        <span className="footer-links">
          <a href="#/diagnostics">ตรวจระบบ</a>
          <a href="#/activity">จัดการข้อมูลของฉัน</a>
        </span>
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
