import { useAccount } from '../state/account-context';

export function QuotaBadge() {
  const { status, quota, user } = useAccount();

  if (status === 'offline') {
    return (
      <span className="quota-badge" data-tone="muted" title="เชื่อมต่อ API ไม่ได้ — ใช้งานต่อได้แต่ไม่บันทึกประวัติ">
        ออฟไลน์ · ไม่บันทึกประวัติ
      </span>
    );
  }

  if (user) {
    return (
      <span className="quota-badge" data-tone="ok" title={user.email}>
        ไม่จำกัด · {user.name ?? user.email}
      </span>
    );
  }

  if (quota.remaining === 0) {
    return (
      <span className="quota-badge" data-tone="warn" title={quota.resetAt ? `รีเซ็ต ${new Date(quota.resetAt).toLocaleString('th-TH')}` : undefined}>
        ใช้ครบ {quota.limit ?? 3} ครั้งแล้ว
      </span>
    );
  }

  return (
    <span className="quota-badge" title="Anonymous: 3 ครั้งต่อ 24 ชั่วโมง">
      เหลือ {quota.remaining ?? 0}/{quota.limit ?? 3} ครั้ง
    </span>
  );
}
