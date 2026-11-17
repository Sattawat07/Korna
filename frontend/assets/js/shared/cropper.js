// ตัวปรับรูปก่อนอัปโหลด: เลือกสัดส่วน ลากเพื่อเลือกส่วนที่จะแสดง ซูมเข้าออก
// ใช้กับรูปโพสต์ รูปของที่เสนอแลก และรูปโปรไฟล์
// คีย์บอร์ด: ลูกศร = เลื่อนรูป (Shift = เลื่อนเร็ว), + / - = ซูม, 0 = เริ่มใหม่
import { icon } from './icons.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // ขีดจำกัดของ API
const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // รูปต้นฉบับใหญ่ได้ถึงนี้ เพราะเราย่อให้ก่อนส่ง
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const POST_ASPECTS = [
  { label: 'Original', value: 0 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
];

/** ตรวจไฟล์ต้นฉบับ — คืนข้อความผิดพลาด หรือ '' ถ้าใช้ได้ */
export function checkSourceFile(file) {
  if (!IMAGE_TYPES.includes(file.type)) return `${file.name}: use a JPG, PNG or WebP image.`;
  if (file.size > MAX_SOURCE_BYTES) return `${file.name}: the image is too large (max 25 MB).`;
  return '';
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image could not be opened.'));
    img.src = src;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** วาดส่วนที่เลือกลง canvas แล้วบีบให้ไม่เกิน 5 MB */
async function exportRegion(img, region, file, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(region.w, region.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.w * scale));
  canvas.height = Math.max(1, Math.round(region.h * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height);

  let type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  let blob = await canvasToBlob(canvas, type, 0.9);
  // PNG ใหญ่เกิน → ใช้ JPEG แทน แล้วค่อยลดคุณภาพจนกว่าจะไม่เกินขนาดที่ API รับ
  if (blob && blob.size > MAX_UPLOAD_BYTES && type === 'image/png') {
    type = 'image/jpeg';
    blob = await canvasToBlob(canvas, type, 0.9);
  }
  for (const q of [0.8, 0.7, 0.6]) {
    if (!blob || blob.size <= MAX_UPLOAD_BYTES) break;
    blob = await canvasToBlob(canvas, type, q);
  }
  if (!blob) throw new Error('This image could not be processed.');
  const ext = type === 'image/png' ? 'png' : 'jpg';
  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${base}.${ext}`, { type, lastModified: Date.now() });
}

/** รูปใหญ่เกิน 5 MB → ย่อทั้งรูป (ไม่ตัด) ให้ส่งได้ */
export async function fitForUpload(file) {
  if (file.size <= MAX_UPLOAD_BYTES) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return await exportRegion(img, { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }, file, 2400);
  } finally {
    URL.revokeObjectURL(url);
  }
}

let dialog = null;

function buildDialog() {
  dialog = document.createElement('dialog');
  dialog.className = 'modal cropper';
  dialog.setAttribute('aria-labelledby', 'cropper-title');
  dialog.innerHTML = `
    <div class="modal__header">
      <div>
        <h2 class="modal__title" id="cropper-title">Adjust image</h2>
      </div>
      <button class="modal__close" type="button" data-crop-cancel aria-label="ปิด">${icon('close')}</button>
    </div>
    <div class="cropper__stage" tabindex="0" role="application"
      aria-label="พื้นที่ปรับรูป: ลากหรือใช้ลูกศรเพื่อเลื่อน, ปุ่ม + และ - เพื่อซูม">
      <img alt="" draggable="false" />
      <div class="cropper__frame"></div>
    </div>
    <div class="cropper__controls">
      <div class="cropper__aspects" role="group" aria-label="สัดส่วนรูป"></div>
      <label class="cropper__zoom">
        <span>Zoom</span>
        <input type="range" min="1" max="4" step="0.01" value="1" aria-label="ซูม" />
      </label>
    </div>
    <p class="cropper__hint">Drag the image or use the arrow keys to choose what shows. Use the slider or + / − to zoom.</p>
    <div class="modal__footer">
      <div class="cropper__actions">
        <button class="btn btn--outline spacer" type="button" data-crop-reset>Reset</button>
        <button class="btn btn--outline" type="button" data-crop-cancel>Cancel</button>
        <button class="btn btn--primary" type="button" data-crop-apply>Apply</button>
      </div>
    </div>`;
  document.body.append(dialog);
}

/**
 * เปิดตัวปรับรูป
 * @param {File} file
 * @param {{ aspects?: {label:string,value:number}[], aspect?: number, circle?: boolean, maxSide?: number, title?: string }} options
 *   value 0 = สัดส่วนเดิมของรูป
 * @returns {Promise<File|null>} ไฟล์ที่ปรับแล้ว หรือ null ถ้ากดยกเลิก
 */
export async function openCropper(file, options = {}) {
  if (!dialog) buildDialog();
  const { aspects = [], circle = false, maxSide = 1600, title = 'Adjust image' } = options;
  const url = URL.createObjectURL(file);
  let img;
  try {
    img = await loadImage(url);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }

  const stage = dialog.querySelector('.cropper__stage');
  const view = stage.querySelector('img');
  const frame = dialog.querySelector('.cropper__frame');
  const zoomInput = dialog.querySelector('.cropper__zoom input');
  const aspectBox = dialog.querySelector('.cropper__aspects');
  dialog.querySelector('#cropper-title').textContent = title;
  frame.classList.toggle('is-circle', circle);
  view.src = url;

  const natural = { w: img.naturalWidth, h: img.naturalHeight };
  let aspect = options.aspect ?? aspects[0]?.value ?? 1;
  let box = { x: 0, y: 0, w: 0, h: 0 }; // กรอบตัดในพิกัดของ stage
  let minScale = 1;
  let scale = 1;
  let pos = { x: 0, y: 0 }; // มุมซ้ายบนของรูปในพิกัด stage

  aspectBox.hidden = aspects.length < 2;
  aspectBox.innerHTML = aspects
    .map((a, i) => `<button type="button" class="seg-btn" data-aspect-index="${i}">${a.label}</button>`)
    .join('');

  const ratio = () => aspect || natural.w / natural.h;

  const clamp = () => {
    const w = natural.w * scale;
    const h = natural.h * scale;
    pos.x = Math.min(box.x, Math.max(box.x + box.w - w, pos.x));
    pos.y = Math.min(box.y, Math.max(box.y + box.h - h, pos.y));
  };

  const paint = () => {
    clamp();
    view.style.width = `${natural.w}px`;
    view.style.height = `${natural.h}px`;
    view.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${scale})`;
    Object.assign(frame.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
    zoomInput.value = String(scale / minScale);
    aspectBox.querySelectorAll('[data-aspect-index]').forEach((b) => {
      b.setAttribute('aria-pressed', String(aspects[Number(b.dataset.aspectIndex)].value === aspect));
    });
  };

  /** จัดกรอบใหม่ตามสัดส่วน แล้วให้รูปเต็มกรอบพอดี (ตรงกลาง) */
  const layout = () => {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const pad = 24;
    const r = ratio();
    let w = sw - pad * 2;
    let h = w / r;
    if (h > sh - pad * 2) {
      h = sh - pad * 2;
      w = h * r;
    }
    box = { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
    minScale = Math.max(w / natural.w, h / natural.h);
    scale = minScale;
    pos = { x: box.x + (w - natural.w * scale) / 2, y: box.y + (h - natural.h * scale) / 2 };
    paint();
  };

  /** ซูมโดยให้จุด (cx, cy) ของ stage อยู่ที่เดิม */
  const zoomTo = (nextScale, cx = box.x + box.w / 2, cy = box.y + box.h / 2) => {
    const s = Math.min(minScale * 4, Math.max(minScale, nextScale));
    pos.x = cx - ((cx - pos.x) * s) / scale;
    pos.y = cy - ((cy - pos.y) * s) / scale;
    scale = s;
    paint();
  };

  // ---------- การควบคุม ----------
  const controller = new AbortController();
  const { signal } = controller;
  let drag = null;

  stage.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
      stage.focus({ preventScroll: true });
    },
    { signal },
  );
  stage.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      pos.x = drag.px + (e.clientX - drag.x);
      pos.y = drag.py + (e.clientY - drag.y);
      paint();
    },
    { signal },
  );
  const endDrag = () => {
    drag = null;
    stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', endDrag, { signal });
  stage.addEventListener('pointercancel', endDrag, { signal });
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomTo(scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
    },
    { signal, passive: false },
  );
  stage.addEventListener(
    'keydown',
    (e) => {
      const step = e.shiftKey ? 40 : 10;
      const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (moves[e.key]) {
        pos.x += moves[e.key][0];
        pos.y += moves[e.key][1];
        paint();
      } else if (e.key === '+' || e.key === '=') zoomTo(scale * 1.1);
      else if (e.key === '-' || e.key === '_') zoomTo(scale / 1.1);
      else if (e.key === '0') layout();
      else return;
      e.preventDefault();
    },
    { signal },
  );
  zoomInput.addEventListener('input', () => zoomTo(minScale * Number(zoomInput.value)), { signal });
  aspectBox.addEventListener(
    'click',
    (e) => {
      const btn = e.target.closest('[data-aspect-index]');
      if (!btn) return;
      aspect = aspects[Number(btn.dataset.aspectIndex)].value;
      layout();
    },
    { signal },
  );
  dialog.querySelector('[data-crop-reset]').addEventListener('click', layout, { signal });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      controller.abort();
      URL.revokeObjectURL(url);
      if (dialog.open) dialog.close();
      resolve(result);
    };

    dialog.querySelectorAll('[data-crop-cancel]').forEach((b) => b.addEventListener('click', () => finish(null), { signal }));
    dialog.addEventListener('close', () => finish(null), { signal });
    dialog.addEventListener(
      'click',
      (e) => {
        if (e.target === dialog) finish(null);
      },
      { signal },
    );
    const applyBtn = dialog.querySelector('[data-crop-apply]');
    applyBtn.disabled = false;
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener(
      'click',
      async () => {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Saving...';
        // แปลงกรอบบนจอกลับเป็นพิกัดพิกเซลของรูปจริง
        const region = {
          x: Math.max(0, (box.x - pos.x) / scale),
          y: Math.max(0, (box.y - pos.y) / scale),
          w: Math.min(natural.w, box.w / scale),
          h: Math.min(natural.h, box.h / scale),
        };
        try {
          finish(await exportRegion(img, region, file, maxSide));
        } catch {
          applyBtn.disabled = false;
          applyBtn.textContent = 'Apply';
        }
      },
      { signal },
    );

    dialog.showModal();
    // ต้องรอให้ dialog แสดงก่อนจึงจะรู้ขนาด stage
    requestAnimationFrame(() => {
      layout();
      stage.focus({ preventScroll: true });
    });
  });
}
