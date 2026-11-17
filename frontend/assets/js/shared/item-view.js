// ส่วนแสดงรายละเอียดโพสต์ที่หน้า Feed และ Profile ใช้ร่วมกัน
import { icon } from './icons.js';
import { escapeHtml, formatDate, itemStatusLabel } from './format.js';
import { imageViewer } from './ui.js';

/** รูปโปรไฟล์ของผู้ใช้ (avatar_url) หรือไอคอนคนถ้ายังไม่มีรูป */
export function avatarHtml(person, className = 'avatar') {
  const url = person?.avatar_url;
  return url
    ? `<span class="${className}"><img src="${escapeHtml(url)}" alt="" loading="lazy" /></span>`
    : `<span class="${className}">${icon('user')}</span>`;
}

/** หมวดหมู่ / ประเภท / สถานะ / วันที่โพสต์ */
export function itemFacts(item) {
  const rows = [
    ['Category', item.category.name],
    ['Type', item.type === 'swap' ? 'Swap' : 'Free'],
    ['Status', itemStatusLabel(item)],
    ['Posted', formatDate(item.created_at)],
  ];
  return `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>`;
}

/** รายละเอียด / ตำหนิ / สิ่งที่อยากได้แลก */
export function itemText(item) {
  let html = `<p class="details-label">Description</p><p class="details-text">${escapeHtml(item.description || '-')}</p>`;
  if (item.defects) html += `<p class="details-label">Defects</p><p class="details-text">${escapeHtml(item.defects)}</p>`;
  if (item.type === 'swap' && item.swap_details) {
    const want = [item.swap_details.desired_category?.name, item.swap_details.desired_description]
      .filter(Boolean)
      .join(' · ');
    html += `<p class="details-label">Looking for</p><p class="details-text">${escapeHtml(want || '-')}</p>`;
  }
  return html;
}

/** รูปทุกรูปของโพสต์ (เลื่อนดูได้) หรือกรอบว่างถ้าไม่มีรูป */
export function gallery(urls, alt) {
  return urls.length
    ? imageViewer(urls.map(escapeHtml), escapeHtml(alt))
    : `<div class="gallery gallery--empty">${icon('image')}</div>`;
}
