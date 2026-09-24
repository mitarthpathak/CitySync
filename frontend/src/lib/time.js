/** "3m ago", "2h ago", "5d ago"; falls back to "" for an unparseable timestamp. */
export function formatAgo(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Locale absolute timestamp, e.g. "24 Sep 2026, 15:45". Empty string if unparseable. */
export function formatAbsolute(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
