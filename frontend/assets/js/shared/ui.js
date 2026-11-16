import { icon } from './icons.js';

/** ปุ่มรูปตาสำหรับแสดง/ซ่อนรหัสผ่าน: <button data-toggle-password="input-id"> */
export function setupPasswordToggles(root = document) {
  root.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    const input = document.getElementById(btn.dataset.togglePassword);
    if (!input) return;
    const render = () => {
      const hidden = input.type === 'password';
      btn.innerHTML = icon(hidden ? 'eyeOff' : 'eye');
      btn.setAttribute('aria-label', hidden ? 'แสดงรหัสผ่าน' : 'ซ่อนรหัสผ่าน');
    };
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      render();
    });
    render();
  });
}

/** ปุ่มเปิด modal: <button data-open-modal="dialog-id">; ปุ่มปิด: [data-close-modal] ภายใน dialog */
export function setupModals(root = document) {
  root.querySelectorAll('[data-open-modal]').forEach((el) => {
    el.addEventListener('click', () => openModal(el.dataset.openModal));
  });
  root.querySelectorAll('dialog.modal').forEach((dialog) => {
    dialog.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', () => dialog.close()));
    // คลิกพื้นหลังเพื่อปิด
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

export function openModal(id) {
  const dialog = document.getElementById(id);
  dialog?.showModal();
  return dialog;
}

/**
 * ตัวเลือกรูป (สูงสุด 5 รูป, JPG/PNG/WebP ≤ 5 MB)
 * <div class="uploader" data-input="id-ของ-input-file"> ... </div>
 * ปุ่ม/label ใดๆ ที่มี for="id-ของ-input-file" ใช้เพิ่มรูปได้ (เช่นไอคอนในช่องรายละเอียด)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export function setupUploader(root, maxFiles = 5) {
  const input = document.getElementById(root.dataset.input);
  const empty = root.querySelector('.uploader__empty');
  const viewer = root.querySelector('.uploader__viewer');
  const img = viewer.querySelector('img');
  const counter = viewer.querySelector('.uploader__count');
  const prev = root.querySelector('[data-uploader-prev]');
  const next = root.querySelector('[data-uploader-next]');
  const remove = viewer.querySelector('[data-uploader-remove]');
  const error = root.querySelector('.uploader__error');
  let files = [];
  let urls = [];
  let index = 0;

  const syncInput = () => {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
  };

  const render = () => {
    const has = files.length > 0;
    empty.hidden = has;
    viewer.hidden = !has;
    prev.hidden = next.hidden = files.length < 2;
    if (!has) return;
    index = Math.min(index, files.length - 1);
    img.src = urls[index];
    img.alt = files[index].name;
    counter.textContent = `${index + 1} / ${files.length}`;
  };

  input.addEventListener('change', () => {
    const picked = Array.from(input.files ?? []).filter((f) => !files.includes(f));
    const messages = [];
    for (const file of picked) {
      if (!ACCEPTED.includes(file.type)) messages.push(`${file.name}: ใช้ได้เฉพาะ JPG, PNG, WebP`);
      else if (file.size > MAX_FILE_SIZE) messages.push(`${file.name}: ไฟล์ใหญ่เกิน 5 MB`);
      else if (files.length >= maxFiles) messages.push(`เพิ่มรูปได้สูงสุด ${maxFiles} รูป`);
      else {
        files.push(file);
        urls.push(URL.createObjectURL(file));
      }
    }
    if (error) error.textContent = [...new Set(messages)].join(' · ');
    index = files.length - 1;
    syncInput();
    render();
  });

  prev.addEventListener('click', () => {
    index = (index - 1 + files.length) % files.length;
    render();
  });
  next.addEventListener('click', () => {
    index = (index + 1) % files.length;
    render();
  });
  remove.addEventListener('click', () => {
    URL.revokeObjectURL(urls[index]);
    files.splice(index, 1);
    urls.splice(index, 1);
    syncInput();
    render();
  });

  render();
  return {
    reset() {
      urls.forEach((u) => URL.revokeObjectURL(u));
      files = [];
      urls = [];
      index = 0;
      if (error) error.textContent = '';
      syncInput();
      render();
    },
    files: () => [...files],
  };
}

/** ตัวดูรูปแบบอ่านอย่างเดียว (ใช้ใน modal รายละเอียด) */
export function imageViewer(urls, alt) {
  if (!urls.length) return '';
  return `<div class="gallery" data-gallery='${JSON.stringify(urls).replaceAll("'", '&#39;')}' data-index="0">
		<img src="${urls[0]}" alt="${alt}" />
		${
      urls.length > 1
        ? `<button type="button" class="gallery__nav gallery__nav--prev" data-gallery-step="-1" aria-label="รูปก่อนหน้า">‹</button>
		<button type="button" class="gallery__nav gallery__nav--next" data-gallery-step="1" aria-label="รูปถัดไป">›</button>
		<span class="gallery__count">1 / ${urls.length}</span>`
        : ''
    }
	</div>`;
}

document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-gallery-step]');
  if (!btn) return;
  const gallery = btn.closest('.gallery');
  const urls = JSON.parse(gallery.dataset.gallery);
  const i = (Number(gallery.dataset.index) + Number(btn.dataset.galleryStep) + urls.length) % urls.length;
  gallery.dataset.index = String(i);
  gallery.querySelector('img').src = urls[i];
  gallery.querySelector('.gallery__count').textContent = `${i + 1} / ${urls.length}`;
});

export function setFieldError(form, name, message) {
  const el = form.querySelector(`[data-error-for="${name}"]`);
  if (el) el.textContent = message;
}

export function clearFieldErrors(form) {
  form.querySelectorAll('[data-error-for]').forEach((el) => (el.textContent = ''));
}
