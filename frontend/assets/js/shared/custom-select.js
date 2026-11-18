/**
 * Shared themed custom dropdown (<select> enhancer).
 * Keeps the underlying <select> in sync for forms, change events, and validation.
 */
export function enhanceSelect(selectEl) {
  if (!selectEl) return { sync: () => {} };
  if (selectEl.dataset.enhanced === '1' && selectEl._customSelectApi) {
    return selectEl._customSelectApi;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const labelText =
    selectEl.getAttribute('aria-label') ||
    selectEl.closest('label')?.querySelector('.sr-only')?.textContent?.trim();
  if (labelText) trigger.setAttribute('aria-label', labelText);

  const labelSpan = document.createElement('span');
  labelSpan.className = 'custom-select-label';
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('width', '14');
  chevron.setAttribute('height', '14');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('stroke', 'currentColor');
  chevron.setAttribute('stroke-width', '2.2');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.classList.add('custom-select-chevron');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', '6 9 12 15 18 9');
  chevron.appendChild(poly);
  trigger.append(labelSpan, chevron);

  const menu = document.createElement('ul');
  menu.className = 'custom-select-menu is-hidden';
  menu.setAttribute('role', 'listbox');

  const closeMenu = () => {
    wrapper.classList.remove('open');
    menu.classList.add('is-hidden');
    trigger.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    document.querySelectorAll('.custom-select.open').forEach((other) => {
      if (other !== wrapper) {
        other.classList.remove('open');
        other.querySelector('.custom-select-menu')?.classList.add('is-hidden');
        other.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });
    wrapper.classList.add('open');
    menu.classList.remove('is-hidden');
    trigger.setAttribute('aria-expanded', 'true');
  };

  const sync = () => {
    const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
    labelSpan.textContent = selectedOpt ? selectedOpt.textContent : '';
    trigger.disabled = Boolean(selectEl.disabled);
    menu.innerHTML = '';

    Array.from(selectEl.options).forEach((opt) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'custom-select-option';
      if (opt.value === selectEl.value) btn.classList.add('selected');
      btn.disabled = Boolean(opt.disabled);
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(opt.value === selectEl.value));
      btn.textContent = opt.textContent;
      btn.addEventListener('click', () => {
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
        closeMenu();
        trigger.focus();
      });
      li.appendChild(btn);
      menu.appendChild(li);
    });
  };

  trigger.addEventListener('click', () => {
    if (wrapper.classList.contains('open')) closeMenu();
    else openMenu();
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!wrapper.classList.contains('open')) openMenu();
      const opts = [...menu.querySelectorAll('.custom-select-option:not([disabled])')];
      const target = menu.querySelector('.custom-select-option.selected:not([disabled])') || opts[0];
      target?.focus();
    }
  });

  menu.addEventListener('keydown', (e) => {
    const opts = [...menu.querySelectorAll('.custom-select-option:not([disabled])')];
    const idx = opts.indexOf(document.activeElement);
    if (opts.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      opts[(idx + 1) % opts.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      opts[(idx - 1 + opts.length) % opts.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      opts[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      opts[opts.length - 1].focus();
    } else if (e.key === 'Tab') {
      closeMenu();
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wrapper.classList.contains('open')) {
      closeMenu();
      trigger.focus();
    }
  });

  selectEl.addEventListener('change', sync);
  selectEl.form?.addEventListener('reset', () => {
    window.setTimeout(sync, 0);
  });

  selectEl.dataset.enhanced = '1';
  selectEl.classList.add('is-hidden');
  selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
  wrapper.append(trigger, menu);
  sync();

  const api = { sync };
  selectEl._customSelectApi = api;
  return api;
}
