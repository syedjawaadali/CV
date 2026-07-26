/** Keyset (cursor) pagination on (created_at, id) descending. Stable and index-friendly. */

export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(createdAt: string | Date, id: string): string {
  const iso = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  return Buffer.from(JSON.stringify({ c: iso, i: id }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor?: string): Cursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.c === 'string' && typeof parsed?.i === 'string') {
      return { createdAt: parsed.c, id: parsed.i };
    }
    return null;
  } catch {
    return null;
  }
}
