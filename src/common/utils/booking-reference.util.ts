import { Types } from 'mongoose';

const FORMATTED_REF = /^[A-Z]{2,4}-\d{6,8}$/i;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

export function formatBookingReference(
  id: string | Types.ObjectId | undefined | null,
  prefix = 'BK',
): string {
  if (!id) return '—';

  const raw = String(id).trim();
  if (!raw) return '—';
  if (FORMATTED_REF.test(raw)) return raw.toUpperCase();

  const code =
    raw.length === 24 && OBJECT_ID.test(raw)
      ? raw.slice(-8).toUpperCase()
      : raw.length > 8
        ? raw.slice(-8).toUpperCase()
        : raw.toUpperCase();

  return `${prefix}-${code}`;
}
