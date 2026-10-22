import { useAccount } from '../state/account-context';

export function SignInButton() {
  const { user, busy, signOut } = useAccount();

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
    <a className="button-secondary sign-in" href="#/signin" title="เข้าสู่ระบบเพื่อใช้เครื่องมือ (ฟรีไม่จำกัด)">
      เข้าสู่ระบบ
    </a>
  );
}
