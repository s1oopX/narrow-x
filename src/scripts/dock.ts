const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

function hasSameOriginReferrer() {
  if (!document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;

  if (target.closest('[data-history-back]')) {
    const button = target.closest<HTMLElement>('[data-history-back]');
    // history.length > 1 也可能指向外部来源页，只有同源 referrer 才回退历史，
    // 否则退回站内 fallback，避免“返回”把读者带出站点。
    if (hasSameOriginReferrer() && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = button?.dataset.fallback || base;
    }
  }

  if (target.closest('[data-back-top]')) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  const reset = target.closest<HTMLElement>('[data-layout-width-reset]');
  if (reset) {
    const input = reset.closest<HTMLElement>('[data-dock-root]')?.querySelector<HTMLInputElement>('[data-layout-width]');
    if (!input) return;
    applyContentWidth(Number(input.dataset.defaultWidth));
    try {
      localStorage.removeItem('content-width');
    } catch {
      // 本地存储不可用时仍保留当前会话内的宽度调整。
    }
  }
});

const contentWidthInputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-layout-width]'));

function applyContentWidth(value: number) {
  const referenceInput = contentWidthInputs[0];
  if (!referenceInput || !Number.isFinite(value)) return;
  const minimum = Number(referenceInput.min);
  const maximum = Number(referenceInput.max);
  const clamped = Math.min(maximum, Math.max(minimum, value));
  const width = `${clamped}rem`;
  const defaultWidth = Number(referenceInput.dataset.defaultWidth);

  contentWidthInputs.forEach((input) => {
    const dock = input.closest<HTMLElement>('[data-dock-root]');
    input.value = String(clamped);
    const output = dock?.querySelector<HTMLOutputElement>('[data-layout-width-output]');
    const reset = dock?.querySelector<HTMLButtonElement>('[data-layout-width-reset]');
    if (output) output.value = width;
    if (reset) reset.disabled = clamped === defaultWidth;
  });
  document.documentElement.style.setProperty('--layout-content-width', width);
}

function freezeHeaderShell(input: HTMLInputElement) {
  const shell = input.closest('header')?.firstElementChild;
  if (!(shell instanceof HTMLElement)) return;

  const currentWidth = getComputedStyle(document.documentElement)
    .getPropertyValue('--layout-content-width')
    .trim();
  if (!currentWidth) return;

  shell.style.setProperty('--layout-content-width', currentWidth);
  const release = () => {
    shell.style.removeProperty('--layout-content-width');
    window.removeEventListener('pointerup', release);
    window.removeEventListener('pointercancel', release);
    window.removeEventListener('blur', release);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
}

if (contentWidthInputs.length > 0) {
  const storedWidth = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--layout-content-width'));
  applyContentWidth(storedWidth);
  contentWidthInputs.forEach((input) => {
    input.addEventListener('pointerdown', () => freezeHeaderShell(input));
    input.addEventListener('input', () => applyContentWidth(Number(input.value)));
    input.addEventListener('change', () => {
      const value = Number(input.value);
      const defaultWidth = Number(input.dataset.defaultWidth);
      try {
        if (value === defaultWidth) localStorage.removeItem('content-width');
        else localStorage.setItem('content-width', `${value}rem`);
      } catch {
        // 本地存储不可用时仍保留当前会话内的宽度调整。
      }
    });
  });
}
