const root = document.documentElement;
function currentColorMode() {
  return root.classList.contains('dark') ? 'dark' : 'light';
}

function syncDisplayState() {
  const activeTheme = root.dataset.theme || 'default';
  document.querySelectorAll<HTMLElement>('[data-theme-value]').forEach((button) => {
    const active = button.dataset.themeValue === activeTheme;
    button.setAttribute('aria-pressed', String(active));
    button.querySelector<HTMLElement>('[data-theme-indicator]')?.classList.toggle('hidden', !active);
  });
  document.querySelectorAll<HTMLElement>('[data-color-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(root.classList.contains('dark')));
  });
}

function notifyColorModeChange() {
  document.dispatchEvent(
    new CustomEvent('narrow-x:color-mode-change', {
      detail: { mode: currentColorMode() }
    })
  );
}

function persistPreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep the current session synchronized when storage is unavailable.
  }
}

function restorePreferences() {
  const previousMode = currentColorMode();

  try {
    const theme = localStorage.getItem('theme');
    const mode = localStorage.getItem('color-mode');
    if (theme) root.dataset.theme = theme;
    if (mode === 'light' || mode === 'dark') root.classList.toggle('dark', mode === 'dark');
  } catch {
    return;
  }

  syncDisplayState();
  // Only notify when restoring actually changed the mode (e.g. a bfcache
  // snapshot taken before the preference changed); a plain page load would
  // otherwise trigger a redundant re-render in listeners such as Mermaid.
  if (currentColorMode() !== previousMode) notifyColorModeChange();
}

function setExpanded(button: HTMLElement | null, expanded: boolean) {
  button?.setAttribute('aria-expanded', String(expanded));
}

function setPanel(panel: HTMLElement | null, button: HTMLElement | null, open: boolean) {
  panel?.classList.toggle('hidden', !open);
  setExpanded(button, open);
}

function closeDockMenus(except?: HTMLElement) {
  document.querySelectorAll<HTMLElement>('[data-dock-root]').forEach((dock) => {
    if (dock === except) return;
    setPanel(dock.querySelector('[data-display-panel]'), dock.querySelector('[data-display-menu]'), false);
    setPanel(dock.querySelector('[data-lang-panel]'), dock.querySelector('[data-lang-menu]'), false);
  });
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;

  const displayButton = target.closest<HTMLElement>('[data-display-menu]');
  const langButton = target.closest<HTMLElement>('[data-lang-menu]');
  const mobileButton = target.closest('[data-mobile-menu]');
  const dock = target.closest<HTMLElement>('[data-dock-root]');
  const displayPanel = dock?.querySelector<HTMLElement>('[data-display-panel]') ?? null;
  const langPanel = dock?.querySelector<HTMLElement>('[data-lang-panel]') ?? null;
  const displayMenu = dock?.querySelector<HTMLElement>('[data-display-menu]') ?? null;
  const langMenu = dock?.querySelector<HTMLElement>('[data-lang-menu]') ?? null;
  const mobilePanel = document.querySelector<HTMLElement>('[data-mobile-panel]');
  const mobileMenu = document.querySelector<HTMLElement>('[data-mobile-menu]');

  if (displayButton) {
    const willOpen = displayPanel?.classList.contains('hidden') ?? false;
    closeDockMenus(dock ?? undefined);
    setPanel(displayPanel, displayButton, willOpen);
    setPanel(langPanel, langMenu, false);
    setPanel(mobilePanel, mobileMenu, false);
    return;
  }

  if (target.closest('[data-display-close]')) {
    setPanel(displayPanel, displayMenu, false);
    return;
  }

  if (langButton) {
    const willOpen = langPanel?.classList.contains('hidden') ?? false;
    closeDockMenus(dock ?? undefined);
    setPanel(langPanel, langButton, willOpen);
    setPanel(displayPanel, displayMenu, false);
    setPanel(mobilePanel, mobileMenu, false);
    return;
  }

  if (mobileButton) {
    const willOpen = mobilePanel?.classList.contains('hidden') ?? false;
    setPanel(mobilePanel, mobileMenu, willOpen);
    closeDockMenus();
    return;
  }

  const themeValue = target.closest<HTMLElement>('[data-theme-value]');
  if (themeValue?.dataset.themeValue) {
    root.dataset.theme = themeValue.dataset.themeValue;
    persistPreference('theme', themeValue.dataset.themeValue);
    syncDisplayState();
    return;
  }

  if (target.closest('[data-color-mode]')) {
    root.classList.toggle('dark');
    persistPreference('color-mode', root.classList.contains('dark') ? 'dark' : 'light');
      syncDisplayState();
    notifyColorModeChange();
    return;
  }

  if (!dock) closeDockMenus();
  if (!target.closest('[data-mobile-panel]')) setPanel(mobilePanel, mobileMenu, false);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeDockMenus();
  setPanel(document.querySelector('[data-mobile-panel]'), document.querySelector('[data-mobile-menu]'), false);
});

syncDisplayState();
window.addEventListener('pageshow', restorePreferences);
