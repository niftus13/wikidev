export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email) ? email : null;
}

export function normalizeHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const handle = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{2,29}$/.test(handle) ? handle : null;
}
