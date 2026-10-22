import { useAccount } from '../state/account-context';

/**
 * Header identity chip. The credit balance used to live here; while the wallet
 * is shelved this only answers "who am I signed in as?".
 */
export function AccountBadge() {
  const { status, user } = useAccount();

  if (status === 'offline') {
    return (
      <span className="quota-badge" data-tone="muted" title="เชื่อมต่อ API ไม่ได้ — ใช้งานต่อได้แต่ไม่บันทึกประวัติ">
        ออฟไลน์ · ไม่บันทึกประวัติ
      </span>
    );
  }

  if (!user) return null;

  const label = user.name ?? user.email;

  return (
    <a className="account-badge" href="#/activity" title={`${user.email} · ดูประวัติการใช้งาน`}>
      {user.pictureUrl ? (
        <img className="account-badge-photo" src={user.pictureUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="account-badge-photo" aria-hidden="true">
          {label.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="account-badge-name">{label}</span>
    </a>
  );
}
