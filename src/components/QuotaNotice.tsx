import { useAccount } from '../state/account-context';

type Props = {
  message: string | null;
  onDismiss?: () => void;
};

export function QuotaNotice({ message, onDismiss }: Props) {
  const { signIn, busy, authConfigured, error } = useAccount();

  if (!message) return null;

  return (
    <div className="quota-notice" role="alert">
      <div>
        <strong>ใช้โควตาครบแล้ว</strong>
        <p>{message}</p>
        {!authConfigured && <p className="hint">{error ?? 'ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID'}</p>}
      </div>
      <div className="quota-notice-actions">
        {onDismiss && (
          <button type="button" className="button-ghost" onClick={onDismiss}>
            ปิด
          </button>
        )}
        <button
          type="button"
          className="button-primary"
          onClick={() => void signIn()}
          disabled={busy || !authConfigured}
        >
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'ใช้ไม่จำกัดด้วย Google'}
        </button>
      </div>
    </div>
  );
}
