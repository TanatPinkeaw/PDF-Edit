import { apiFetch, type ShareRecord } from './api';

const CHUNK = 0x8000;

/** Chunked conversion: spreading multi-MB arrays overflows the stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

export async function createShare(output: {
  name: string;
  bytes: Uint8Array;
  mime: string;
}): Promise<ShareRecord> {
  const response = await apiFetch<{
    token: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    expiresAt: string;
    url: string;
  }>('/api/shares', {
    method: 'POST',
    body: {
      fileName: output.name,
      mimeType: output.mime,
      dataBase64: toBase64(output.bytes),
    },
  });

  return {
    token: response.token,
    fileName: response.fileName,
    mimeType: response.mimeType,
    byteSize: response.byteSize,
    sha256: response.sha256,
    createdAt: new Date().toISOString(),
    expiresAt: response.expiresAt,
    downloadCount: 0,
    expired: false,
  };
}

export function shareUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/s/${token}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
