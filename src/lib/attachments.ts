import { del, get, set } from 'idb-keyval';

/**
 * Attachment bytes live in IndexedDB under their own keys (not in the main app state),
 * so typing in a note never re-serialises megabytes of images.
 */
const urlCache = new Map<string, string>();
const key = (id: string) => `mp-att:${id}`;

export async function saveAttachmentBlob(id: string, blob: Blob): Promise<string> {
  await set(key(id), blob);
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export async function attachmentUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = (await get(key(id))) as Blob | undefined;
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export async function attachmentBlob(id: string): Promise<Blob | undefined> {
  return (await get(key(id))) as Blob | undefined;
}

export async function deleteAttachmentBlob(id: string) {
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
  await del(key(id));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
