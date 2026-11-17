// Shared Theme Switcher (Light / Dark)
const STORAGE_KEY = 'korna_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

const savedTheme = localStorage.getItem(STORAGE_KEY) || 'light';
applyTheme(savedTheme);

function mountToggleButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-toggle-fab';
  btn.setAttribute('aria-label', 'Toggle dark mode');

  const updateLabel = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? '☀️ Light' : '🌙 Dark';
  };

  updateLabel();
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    updateLabel();
  });

  document.body.appendChild(btn);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountToggleButton);
} else {
  mountToggleButton();
}
