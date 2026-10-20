/**
 * Password protection (AES-256) and unlocking.
 *
 * The permission flags are advisory: viewers are free to ignore them, so the
 * UI describes them as a request rather than a guarantee. The password itself
 * is the real protection.
 */

import { PDFDocument, type SecurityOptions } from '@cantoo/pdf-lib';

import { PdfError, loadPdf, probePdf } from '../pdf-ops';

export type PdfPermissions = NonNullable<SecurityOptions['permissions']>;

export const FULL_PERMISSIONS: Required<PdfPermissions> = {
  printing: 'highResolution',
  modifying: true,
  copying: true,
  annotating: true,
  fillingForms: true,
  contentAccessibility: true,
  documentAssembly: true,
};

export const MIN_PASSWORD_LENGTH = 4;

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Browser/Node Web Crypto; used for the owner password when none is typed. */
export function randomPassword(length = 20): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export type ProtectOptions = {
  userPassword: string;
  /** Defaults to a random owner password so the user cannot be locked out. */
  ownerPassword?: string;
  permissions?: PdfPermissions;
};

export async function protectPdf(bytes: Uint8Array, options: ProtectOptions): Promise<Uint8Array> {
  const userPassword = options.userPassword;
  if (userPassword === '' || userPassword.length < MIN_PASSWORD_LENGTH) {
    throw new PdfError('invalid', `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
  }

  const doc = await loadPdf(bytes);
  doc.encrypt({
    userPassword,
    ownerPassword: options.ownerPassword?.trim() || randomPassword(),
    permissions: { ...FULL_PERMISSIONS, ...(options.permissions ?? {}) },
    algorithm: 'AES-256',
  });
  return doc.save();
}

export async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  const probe = await probePdf(bytes);
  return probe.isEncrypted;
}

/**
 * Removes encryption; requires the correct user password.
 *
 * pdf-lib keeps writing the /Encrypt dictionary when a decrypted document is
 * re-saved, so the pages are rebuilt into a fresh document instead. Page
 * content, resources and annotations survive; document-level extras such as
 * outlines, forms and attachments do not.
 */
export async function unlockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const probe = await probePdf(bytes);
  if (!probe.isEncrypted) {
    throw new PdfError('not-encrypted', 'ไฟล์นี้ไม่ได้ใส่รหัสผ่านไว้ — ไม่ต้องปลดล็อก');
  }

  const source = await loadPdf(bytes, password);
  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, source.getPageIndices());
  for (const page of copied) output.addPage(page);

  for (const [getter, setter] of [
    [() => source.getTitle(), (value: string) => output.setTitle(value)],
    [() => source.getAuthor(), (value: string) => output.setAuthor(value)],
    [() => source.getSubject(), (value: string) => output.setSubject(value)],
    [() => source.getKeywords(), (value: string) => output.setKeywords(value.split(/\s+/))],
  ] as const) {
    const value = getter();
    if (value) setter(value);
  }

  return output.save();
}
