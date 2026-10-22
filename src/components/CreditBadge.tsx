import { useAccount } from '../state/account-context';

/**
 * Credit-mode header badge. The wallet is shelved by default, so this renders
 * nothing and `AccountBadge` shows who is signed in instead.
 */
export function CreditBadge() {
  const { status, credits, creditsEnabled, user } = useAccount();

  if (!creditsEnabled || !credits) return null;

  if (status === 'offline') {
    return (
      <span className="quota-badge" data-tone="muted" title="เชื่อมต่อ API ไม่ได้ — ใช้งานต่อได้แต่ไม่บันทึกประวัติ">
        ออฟไลน์ · ไม่บันทึกประวัติ
      </span>
    );
  }

  if (credits.balance === 0) {
    // A browser that signed out keeps its spent workspace, so its way forward
    // is the account it belongs to; members top up from the history page.
    return (
      <span
        className="quota-badge"
        data-tone="warn"
        title={credits.member ? 'เติมเครดิตได้ที่หน้าประวัติ' : 'เข้าสู่ระบบ หรือสมัครสมาชิกเพื่อรับเครดิต'}
      >
        เครดิตหมด ·{' '}
        {credits.member ? <a href="#/activity">เติมเครดิต</a> : <a href="#/signin">เข้าสู่ระบบ</a>}
      </span>
    );
  }

  if (user) {
    return (
      <span className="quota-badge" data-tone="ok" title={user.email}>
        {credits.balance} เครดิต · {user.name ?? user.email}
      </span>
    );
  }

  return (
    <span
      className="quota-badge"
      title={`ผู้ใช้ทดลองได้ ${credits.allowance ?? credits.balance} เครดิต · สมัครสมาชิกเพื่อรับเพิ่ม`}
    >
      เหลือ {credits.balance}/{credits.allowance ?? credits.balance} เครดิต
    </span>
  );
}
