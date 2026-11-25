(() => {
  const storageKey = 'croc-insight:theme';
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');

  function apply(theme) {
    root.dataset.theme = theme;
    themeColor.content = theme === 'light' ? '#f5f7f5' : '#101512';
  }

  let current = 'dark';
  try {
    if (localStorage.getItem(storageKey) === 'light') current = 'light';
  } catch {
    // The theme still works for the current page when storage is disabled.
  }
  apply(current);

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    function updateButton() {
      button.textContent = current === 'light' ? 'Тёмная тема' : 'Светлая тема';
    }
    updateButton();
    button.addEventListener('click', () => {
      current = current === 'light' ? 'dark' : 'light';
      apply(current);
      updateButton();
      try {
        localStorage.setItem(storageKey, current);
      } catch {
        // Keep the active choice until the page is reloaded.
      }
    });
  }, { once: true });
})();
