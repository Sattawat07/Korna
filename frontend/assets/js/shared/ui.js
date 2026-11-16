import { icon } from './icons.js';
import { checkSourceFile, fitForUpload, openCropper, POST_ASPECTS } from './cropper.js';

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
    // คลิกพื้นหลังเพื่อปิด (กดลากข้อความออกนอกกรอบไม่นับ)
    let downOnBackdrop = false;
    dialog.addEventListener('pointerdown', (event) => {
      downOnBackdrop = event.target === dialog;
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog && downOnBackdrop) dialog.close();
    });
  });
}

export function openModal(id) {
  const dialog = document.getElementById(id);
  if (dialog) showDialog(dialog);
  return dialog;
}

/**
 * เปิด dialog — ถ้า <dialog autofocus> ให้โฟกัสที่ตัว dialog เอง
 * (ไม่ขึ้นกรอบโฟกัสที่ปุ่มปิดตอนเปิดด้วยเมาส์ แต่กด Tab ต่อได้ทันที)
 */
export function showDialog(dialog) {
  if (dialog.open) return;
  dialog.showModal();
  if (dialog.hasAttribute('autofocus')) {
    dialog.tabIndex = -1;
    dialog.focus();
  }
}

/**
 * แสดงข้อความผิดพลาดใต้ช่องกรอก แล้วพาไปที่ช่องแรกที่ผิด
 * ใต้ช่องกรอกต้องมี <p class="field-error" data-error-for="ชื่อฟิลด์"></p>
 * @param {HTMLFormElement} form
 * @param {Record<string,string>} errors
 * @returns {boolean} true ถ้ามีข้อผิดพลาด
 */
export function showFieldErrors(form, errors) {
  clearFieldErrors(form);
  const names = Object.keys(errors);
  names.forEach((name) => {
    const el = form.querySelector(`[data-error-for="${name}"]`);
    if (el) el.textContent = errors[name];
    const control = form.elements.namedItem(name);
    if (control instanceof Element) {
      control.setAttribute('aria-invalid', 'true');
      control.closest('.soft-input')?.classList.add('is-invalid');
    }
  });
  const first = names.map((n) => form.elements.namedItem(n)).find((c) => c instanceof HTMLElement);
  first?.focus();
  first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return names.length > 0;
}

export function clearFieldErrors(form) {
  form.querySelectorAll('[data-error-for]').forEach((el) => (el.textContent = ''));
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
}

/** แก้ช่องที่ผิดแล้วซ่อนข้อความของช่องนั้นทันที */
export function clearErrorOnInput(form) {
  const clear = (event) => {
    const name = event.target.name;
    if (!name) return;
    const el = form.querySelector(`[data-error-for="${name}"]`);
    if (el) el.textContent = '';
    event.target.removeAttribute('aria-invalid');
    event.target.closest('.soft-input')?.classList.remove('is-invalid');
  };
  form.addEventListener('input', clear);
  form.addEventListener('change', clear);
}

/**
 * ตัวเลือกรูป (สูงสุด 5 รูป, JPG/PNG/WebP) พร้อมปุ่มปรับรูป (crop)
 *   <input type="file" id="x" hidden>
 *   <div class="uploader" data-input="x" data-hint="..."></div>
 * ปุ่มใดๆ ที่มี data-add-images="x" จะเปิดตัวเลือกไฟล์ของ uploader นี้
 * รูปที่ใหญ่เกิน 5 MB จะถูกย่อให้อัตโนมัติก่อนส่ง
 */
export function setupUploader(root, { max = 5, title = 'Adjust image' } = {}) {
  const input = document.getElementById(root.dataset.input);
  const hint = root.dataset.hint || `Up to ${max} images · JPG, PNG or WebP`;
  root.innerHTML = `
    <button type="button" class="uploader__empty" data-uploader-add>
      ${icon('imagePlus')}
      <strong>Add photos</strong>
      <span>${hint}</span>
    </button>
    <div class="uploader__viewer" hidden>
      <img alt="" />
      <div class="uploader__tools">
        <button type="button" class="float-btn float-btn--icon" data-uploader-zoom aria-label="ดูรูปขนาดใหญ่" title="View larger">${icon('expand')}</button>
        <button type="button" class="float-btn" data-uploader-crop>${icon('crop')}Adjust</button>
        <button type="button" class="float-btn float-btn--icon" data-uploader-remove aria-label="ลบรูปนี้" title="Remove">${icon('trash')}</button>
      </div>
      <span class="uploader__count"></span>
    </div>
    <ul class="uploader__thumbs" aria-label="รูปที่เลือก" hidden></ul>
    <p class="uploader__error" role="alert"></p>`;

  const empty = root.querySelector('.uploader__empty');
  const viewer = root.querySelector('.uploader__viewer');
  const img = viewer.querySelector('img');
  const counter = viewer.querySelector('.uploader__count');
  const thumbs = root.querySelector('.uploader__thumbs');
  const error = root.querySelector('.uploader__error');
  /** @type {{ file: File, original: File, url: string }[]} */
  let entries = [];
  let index = 0;
  let busy = false;

  const pick = () => {
    if (entries.length >= max) {
      error.textContent = `You can add up to ${max} images.`;
      return;
    }
    input.click();
  };

  const render = () => {
    const has = entries.length > 0;
    empty.hidden = has;
    viewer.hidden = !has;
    thumbs.hidden = !has;
    if (!has) {
      thumbs.innerHTML = '';
      return;
    }
    index = Math.min(index, entries.length - 1);
    img.src = entries[index].url;
    img.alt = `Image ${index + 1} of ${entries.length}`;
    counter.textContent = `${index + 1} / ${entries.length}`;
    thumbs.innerHTML =
      entries
        .map(
          (e, i) => `<li><button type="button" class="thumb-btn" data-uploader-index="${i}" aria-current="${i === index}"
            aria-label="ดูรูปที่ ${i + 1}"><img src="${e.url}" alt="" /></button></li>`,
        )
        .join('') +
      (entries.length < max
        ? `<li><button type="button" class="thumb-btn thumb-btn--add" data-uploader-add aria-label="เพิ่มรูป" title="Add photos">${icon('plus')}</button></li>`
        : '');
  };

  const addFiles = async (list) => {
    const messages = [];
    for (const file of list) {
      const problem = checkSourceFile(file);
      if (problem) {
        messages.push(problem);
        continue;
      }
      if (entries.length >= max) {
        messages.push(`You can add up to ${max} images.`);
        break;
      }
      try {
        const ready = await fitForUpload(file);
        entries.push({ file: ready, original: file, url: URL.createObjectURL(ready) });
      } catch {
        messages.push(`${file.name}: this image could not be opened.`);
      }
    }
    error.textContent = [...new Set(messages)].join(' · ');
    index = entries.length - 1;
    render();
  };

  input.addEventListener('change', async () => {
    const list = Array.from(input.files ?? []);
    input.value = ''; // เลือกไฟล์เดิมซ้ำได้
    if (list.length) await addFiles(list);
  });

  root.addEventListener('click', async (event) => {
    if (event.target === img) return openLightbox(entries.map((e) => e.url), index);
    const target = event.target.closest('button');
    if (!target || busy) return;
    if (target.matches('[data-uploader-zoom]')) openLightbox(entries.map((e) => e.url), index);
    else if (target.matches('[data-uploader-add]')) pick();
    else if (target.matches('[data-uploader-index]')) {
      index = Number(target.dataset.uploaderIndex);
      render();
      root.querySelector(`[data-uploader-index="${index}"]`)?.focus();
    } else if (target.matches('[data-uploader-remove]')) {
      URL.revokeObjectURL(entries[index].url);
      entries.splice(index, 1);
      error.textContent = '';
      render();
      (root.querySelector('[data-uploader-index]') ?? empty).focus();
    } else if (target.matches('[data-uploader-crop]')) {
      busy = true;
      const entry = entries[index];
      try {
        const cropped = await openCropper(entry.original, { aspects: POST_ASPECTS, title });
        if (cropped) {
          URL.revokeObjectURL(entry.url);
          entry.file = cropped;
          entry.url = URL.createObjectURL(cropped);
          render();
        }
      } catch (err) {
        error.textContent = err.message;
      } finally {
        busy = false;
        target.focus();
      }
    }
  });

  // ลากไฟล์มาวางได้
  root.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    root.classList.add('is-dragover');
  });
  root.addEventListener('dragleave', (event) => {
    if (!root.contains(event.relatedTarget)) root.classList.remove('is-dragover');
  });
  root.addEventListener('drop', (event) => {
    event.preventDefault();
    root.classList.remove('is-dragover');
    addFiles(Array.from(event.dataTransfer?.files ?? []));
  });

  document.querySelectorAll(`[data-add-images="${input.id}"]`).forEach((btn) => btn.addEventListener('click', pick));

  render();
  return {
    reset() {
      entries.forEach((e) => URL.revokeObjectURL(e.url));
      entries = [];
      index = 0;
      error.textContent = '';
      render();
    },
    files: () => entries.map((e) => e.file),
    isBusy: () => busy,
  };
}

/** ตัวดูรูปแบบอ่านอย่างเดียว (ใช้ใน modal รายละเอียด) — urls ต้อง escape มาแล้ว */
export function imageViewer(urls, alt) {
  if (!urls.length) return '';
  const many = urls.length > 1;
  return `<div class="gallery" data-gallery='${JSON.stringify(urls).replaceAll("'", '&#39;')}' data-index="0">
    <img src="${urls[0]}" alt="${alt}" />
    <button type="button" class="float-btn float-btn--icon gallery__open" data-gallery-zoom aria-label="ดูรูปขนาดใหญ่" title="View larger">${icon('expand')}</button>
    ${
      many
        ? `<button type="button" class="gallery__nav gallery__nav--prev" data-gallery-step="-1" aria-label="รูปก่อนหน้า">${icon('chevronRight')}</button>
    <button type="button" class="gallery__nav gallery__nav--next" data-gallery-step="1" aria-label="รูปถัดไป">${icon('chevronRight')}</button>
    <span class="gallery__count">1 / ${urls.length}</span>`
        : ''
    }
  </div>`;
}

function stepGallery(gallery, step) {
  const urls = JSON.parse(gallery.dataset.gallery);
  const i = (Number(gallery.dataset.index) + step + urls.length) % urls.length;
  gallery.dataset.index = String(i);
  const img = gallery.querySelector(':scope > img');
  img.classList.remove('is-broken');
  img.src = urls[i];
  const count = gallery.querySelector('.gallery__count');
  if (count) count.textContent = `${i + 1} / ${urls.length}`;
}

document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-gallery-step]');
  if (btn) return stepGallery(btn.closest('.gallery'), Number(btn.dataset.galleryStep));
  const gallery = event.target.closest('.gallery[data-gallery]');
  if (gallery && (event.target.closest('[data-gallery-zoom]') || event.target.matches('.gallery > img'))) {
    openLightbox(JSON.parse(gallery.dataset.gallery), Number(gallery.dataset.index));
  }
});

// ลูกศรซ้าย/ขวาเลื่อนรูปได้เมื่อโฟกัสอยู่ในตัวดูรูป
document.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const gallery = event.target.closest?.('.gallery[data-gallery]');
  if (!gallery || !gallery.querySelector('[data-gallery-step]')) return;
  event.preventDefault();
  stepGallery(gallery, event.key === 'ArrowLeft' ? -1 : 1);
});

// รูปโหลดไม่ขึ้น (ไฟล์หาย/ลิงก์เสีย) → ซ่อนรูปเสีย ให้เห็นพื้นหลังแทนไอคอนรูปแตก
document.addEventListener(
  'error',
  (event) => {
    const el = event.target;
    if (!(el instanceof HTMLImageElement)) return;
    if (el.closest('.avatar, .icon-btn')) {
      const holder = el.parentElement;
      el.remove();
      if (holder && !holder.querySelector('svg')) holder.insertAdjacentHTML('beforeend', icon('user'));
      return;
    }
    el.classList.add('is-broken');
  },
  true,
);

/** ข้อความแจ้งสั้นๆ มุมล่างซ้าย หายเองใน 5 วินาที (ปุ่มลิงก์ไม่บังคับ) */
let toastTimer;
export function toast(message, { href, label } = {}) {
  let box = document.getElementById('toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.className = 'toast';
    box.setAttribute('role', 'status');
    document.body.append(box);
  }
  box.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = message;
  box.append(text);
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label ?? 'Open';
    box.append(link);
  }
  box.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (box.hidden = true), 5000);
}

/** ดูรูปขนาดใหญ่เป็น popup บนหน้าเดิม (ลูกศรซ้าย/ขวาเลื่อนรูป, Esc ปิด) */
let lightbox = null;
export function openLightbox(urls, start = 0) {
  if (!urls.length) return;
  if (!lightbox) {
    lightbox = document.createElement('dialog');
    lightbox.className = 'lightbox';
    lightbox.setAttribute('aria-label', 'ดูรูปขนาดใหญ่');
    lightbox.innerHTML = `
      <div class="lightbox__stage"><img alt="" /></div>
      <button type="button" class="lightbox__btn lightbox__close" data-lb-close aria-label="ปิด">${icon('close')}</button>
      <button type="button" class="lightbox__btn lightbox__prev" data-lb-step="-1" aria-label="รูปก่อนหน้า">${icon('chevronRight')}</button>
      <button type="button" class="lightbox__btn lightbox__next" data-lb-step="1" aria-label="รูปถัดไป">${icon('chevronRight')}</button>
      <p class="lightbox__count"></p>`;
    document.body.append(lightbox);
    lightbox.addEventListener('click', (event) => {
      if (event.target.closest('[data-lb-close]') || event.target === lightbox || event.target.matches('.lightbox__stage')) {
        lightbox.close();
        return;
      }
      const step = event.target.closest('[data-lb-step]');
      if (step) lightbox.show_(Number(step.dataset.lbStep));
    });
    lightbox.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') lightbox.show_(-1);
      else if (event.key === 'ArrowRight') lightbox.show_(1);
      else return;
      event.preventDefault();
    });
  }
  let index = start;
  const many = urls.length > 1;
  lightbox.show_ = (step = 0) => {
    index = (index + step + urls.length) % urls.length;
    const image = lightbox.querySelector('img');
    image.classList.remove('is-broken');
    image.src = urls[index];
    image.alt = `Image ${index + 1} of ${urls.length}`;
    lightbox.querySelector('.lightbox__count').textContent = many ? `${index + 1} / ${urls.length}` : '';
  };
  lightbox.querySelectorAll('[data-lb-step]').forEach((b) => (b.hidden = !many));
  lightbox.show_(0);
  lightbox.showModal();
  lightbox.tabIndex = -1;
  lightbox.focus(); // Tab ต่อไปที่ปุ่มปิดได้ ไม่ขึ้นกรอบโฟกัสตอนเปิดด้วยเมาส์
}
