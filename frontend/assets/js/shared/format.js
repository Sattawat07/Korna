export function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** คำแสดงสถานะโพสต์ตาม docs/ui-api-plan.md */
export function itemStatusLabel(item) {
  const map = {
    available: 'Available',
    pending: 'Pending',
    completed: item.type === 'swap' ? 'Exchanged' : 'Completed',
    removed: 'Removed',
  };
  return map[item.status];
}

export function requestStatusLabel(status) {
  return { pending: 'Pending', accepted: 'Completed', rejected: 'Cancelled' }[status];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

/** "10 Nov 2026" ตามเวลาไทย */
export function formatDate(iso) {
  const [y, m, d] = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "Today · 10:30", "Yesterday · 10:30" หรือ "10 Nov 2026" */
export function formatRelative(iso) {
  const d = new Date(iso);
  const dayKey = (x) => x.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (dayKey(d) === dayKey(today)) return `Today · ${timeFmt.format(d)}`;
  if (dayKey(d) === dayKey(yesterday)) return `Yesterday · ${timeFmt.format(d)}`;
  return formatDate(iso);
}
