try {
  if (localStorage.getItem('korna_theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
} catch {}
