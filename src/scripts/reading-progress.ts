const progress = document.querySelector<HTMLElement>('[data-reading-progress]');

if (progress) {
  let frameRequested = false;

  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const value = max <= 0 ? 0 : (window.scrollY / max) * 100;
    const clamped = Math.min(100, Math.max(0, value));
    progress.style.setProperty('--reading-progress', `${clamped}%`);
  };

  const requestUpdate = () => {
    if (frameRequested) return;
    frameRequested = true;
    window.requestAnimationFrame(() => {
      frameRequested = false;
      updateProgress();
    });
  };

  updateProgress();
  document.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
}
