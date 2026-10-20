import { useAccount } from '../state/account-context';

export function SignInButton() {
  const { user, authConfigured, busy, signIn, signOut, error } = useAccount();

  if (user) {
    return (
      <button
        type="button"
        className="button-ghost sign-in"
        onClick={() => void signOut()}
        disabled={busy}
        title={`ออกจากระบบ ${user.email}`}
      >
        ออกจากระบบ
      </button>
    );
  }

  return (
    <button
      type="button"
      className="button-secondary sign-in"
      onClick={() => void signIn()}
      disabled={busy || !authConfigured}
      title={
        authConfigured
          ? 'เข้าสู่ระบบด้วย Google เพื่อใช้งานไม่จำกัด'
          : (error ?? 'ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID ใน .env')
      }
    >
      {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย Google'}
    </button>
  );
}
