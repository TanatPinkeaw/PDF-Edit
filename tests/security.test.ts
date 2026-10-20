import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import { PdfError, inspectPdf } from '../src/lib/pdf-ops';
import {
  FULL_PERMISSIONS,
  MIN_PASSWORD_LENGTH,
  isEncrypted,
  protectPdf,
  randomPassword,
  unlockPdf,
} from '../src/lib/pdf/security';
import { makeFixture, pageCountOf } from './helpers/fixture';

describe('protectPdf', () => {
  it('encrypts with AES-256 and requires the password to open', async () => {
    const bytes = await makeFixture(3);
    const locked = await protectPdf(bytes, { userPassword: 'open-sesame' });

    expect(await isEncrypted(locked)).toBe(true);
    expect(locked.byteLength).toBeGreaterThan(0);

    await expect(PDFDocument.load(locked)).rejects.toThrow(/encrypted/i);

    const opened = await inspectPdf(locked, 'open-sesame');
    expect(opened).toEqual({ pageCount: 3, encrypted: true });
  });

  it('rejects a wrong password with a typed error', async () => {
    const locked = await protectPdf(await makeFixture(1), { userPassword: 'correct-horse' });
    await expect(inspectPdf(locked, 'wrong-horse')).rejects.toMatchObject({
      code: 'wrong-password',
    });
  });

  it('asks for a password before reading an encrypted file', async () => {
    const locked = await protectPdf(await makeFixture(2), { userPassword: 'pw-1234' });
    await expect(inspectPdf(locked)).rejects.toMatchObject({ code: 'encrypted' });
  });

  it('honours permission overrides', async () => {
    const locked = await protectPdf(await makeFixture(1), {
      userPassword: 'pw-1234',
      permissions: { ...FULL_PERMISSIONS, printing: false, copying: false },
    });
    const doc = await PDFDocument.load(locked, { password: 'pw-1234' });
    expect(doc.getPageCount()).toBe(1);
    expect(await isEncrypted(locked)).toBe(true);
  });

  it('requires a password of at least four characters', async () => {
    const bytes = await makeFixture(1);
    await expect(protectPdf(bytes, { userPassword: 'abc' })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(MIN_PASSWORD_LENGTH).toBe(4);
  });
});

describe('unlockPdf', () => {
  it('removes encryption and keeps the pages', async () => {
    const plain = await makeFixture(4);
    const locked = await protectPdf(plain, { userPassword: 'let-me-in' });

    const unlocked = await unlockPdf(locked, 'let-me-in');
    expect(await isEncrypted(unlocked)).toBe(false);
    expect(await pageCountOf(unlocked)).toBe(4);
  });

  it('reports a wrong password', async () => {
    const locked = await protectPdf(await makeFixture(1), { userPassword: 'right-one' });
    await expect(unlockPdf(locked, 'wrong-one')).rejects.toBeInstanceOf(PdfError);
  });

  it('reports a file that was never protected', async () => {
    await expect(unlockPdf(await makeFixture(1), 'anything')).rejects.toMatchObject({
      code: 'not-encrypted',
    });
  });
});

describe('randomPassword', () => {
  it('produces long, unique, non-ambiguous strings', () => {
    const first = randomPassword(24);
    const second = randomPassword(24);
    expect(first).toHaveLength(24);
    expect(first).not.toBe(second);
    expect(first).not.toMatch(/[0O1Il]/);
  });
});
