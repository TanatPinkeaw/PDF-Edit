/** Google Identity Services: load the script and obtain an ID token. */

type CredentialResponse = { credential?: string };

type GoogleIdConfig = {
  client_id: string;
  callback: (response: CredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
};

type GoogleAccountsId = {
  initialize: (config: GoogleIdConfig) => void;
  prompt: () => void;
  disableAutoSelect?: () => void;
};

type GoogleApi = { accounts?: { id?: GoogleAccountsId } };

declare global {
  interface Window {
    google?: GoogleApi;
  }
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | null = null;

export function googleIdentity(): GoogleAccountsId | null {
  return window.google?.accounts?.id ?? null;
}

export function loadGoogleIdentity(): Promise<void> {
  if (googleIdentity()) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    const script = existing ?? document.createElement('script');
    const timer = window.setTimeout(() => reject(new Error('โหลด Google Identity ไม่สำเร็จ (หมดเวลา)')), 15_000);

    const done = () => {
      window.clearTimeout(timer);
      if (googleIdentity()) resolve();
      else reject(new Error('โหลด Google Identity ไม่สำเร็จ'));
    };

    script.addEventListener('load', done, { once: true });
    script.addEventListener(
      'error',
      () => {
        window.clearTimeout(timer);
        reject(new Error('โหลด Google Identity ไม่สำเร็จ — ตรวจการเชื่อมต่อ'));
      },
      { once: true },
    );

    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });

  return loading;
}

/** Opens the Google prompt and resolves with the ID token credential. */
export async function requestGoogleCredential(clientId: string, timeoutMs = 120_000): Promise<string> {
  await loadGoogleIdentity();
  const id = googleIdentity();
  if (!id) throw new Error('Google Identity ยังไม่พร้อมใช้งาน');

  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('ยังไม่ได้เลือกบัญชี Google — ลองอีกครั้ง'));
    }, timeoutMs);

    id.initialize({
      client_id: clientId,
      callback: (response) => {
        window.clearTimeout(timer);
        if (response.credential) resolve(response.credential);
        else reject(new Error('Google ไม่ได้ส่ง credential กลับมา'));
      },
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
    });
    id.prompt();
  });
}
