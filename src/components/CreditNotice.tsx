import { useAccount } from '../state/account-context';

type Props = {
  message: string | null;
  onDismiss?: () => void;
};

export function CreditNotice({ message, onDismiss }: Props) {
  const { user } = useAccount();

  if (!message) return null;

  return (
    <div className="quota-notice" role="alert">
      <div>
        <strong>เครดิตหมดแล้ว</strong>
        <p>{message}</p>
        <p className="hint">
          ทุกครั้งที่รันเครื่องมือใช้ 1 เครดิต และจะคืนให้เมื่องานล้มเหลว — เติมได้ด้วยโค้ดที่หน้าประวัติ
          {user ? '' : ' หรือสมัครสมาชิกเพื่อรับเครดิตเริ่มต้น'}
        </p>
      </div>
      <div className="quota-notice-actions">
        {onDismiss && (
          <button type="button" className="button-ghost" onClick={onDismiss}>
            ปิด
          </button>
        )}
        <a className="button-secondary" href="#/activity">
          เติมเครดิต
        </a>
        {!user && (
          <>
            <a className="button-secondary" href="#/signin">
              เข้าสู่ระบบ
            </a>
            <a className="button-primary" href="#/signup">
              สมัครสมาชิก
            </a>
          </>
        )}
      </div>
    </div>
  );
}
