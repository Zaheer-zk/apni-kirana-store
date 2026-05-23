/** Small formatting helpers shared across store-web pages. */

/** Format rupees with a `₹` prefix and no decimal places. */
export function rupees(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return '—';
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/** "2m ago", "5h ago", "3d ago" — relative human time. */
export function timeAgo(date: string | Date): string {
  const ts = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Short order id — last 8 hex characters, uppercase. */
export function shortOrderId(id: string): string {
  return `#${id.slice(-8).toUpperCase()}`;
}
