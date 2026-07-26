const centerRoot = document.getElementById('toc-center');
const panel = document.getElementById('toc-panel');

if (centerRoot || panel) {
  // Links exist in both the center dropdown and the xl panel; keep them in sync.
  const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
  const title = document.getElementById('toc-center-title');
  const dropdown = document.getElementById('toc-center-dropdown');
  const toggle = document.getElementById('toc-center-toggle');
  const panelScroller = panel?.querySelector<HTMLElement>('[data-toc-panel-scroll]') ?? null;

  const headingId = (link: HTMLAnchorElement) => decodeURIComponent(link.hash.slice(1));
  const headings = [
    ...new Set(links.map((link) => document.getElementById(headingId(link))).filter(Boolean) as HTMLElement[])
  ];

  // Clicking a TOC link pins its section as active: bottom-of-page sections can
  // never cross the activation line, so without the pin the highlight would
  // snap back to an earlier heading. A real user scroll releases the pin.
  let pinnedId: string | null = null;

  function keepPanelLinkVisible(link: HTMLElement) {
    if (!panelScroller || panelScroller.scrollHeight <= panelScroller.clientHeight) return;
    const top = link.offsetTop;
    const bottom = top + link.offsetHeight;
    const viewTop = panelScroller.scrollTop;
    const viewBottom = viewTop + panelScroller.clientHeight;
    // Minimal nudge instead of centering, so the list doesn't jump around.
    if (top < viewTop + 8) panelScroller.scrollTop = top - 8;
    else if (bottom > viewBottom - 8) panelScroller.scrollTop = bottom - panelScroller.clientHeight + 8;
  }

  function setActive(id: string, fromPin = false) {
    if (pinnedId && !fromPin && id !== pinnedId) return;
    links.forEach((link) => {
      const active = headingId(link) === id;
      link.classList.toggle('toc-active', active);
      if (!active) return;
      if (title && link.textContent) title.textContent = link.textContent;
      if (panel?.contains(link)) keepPanelLinkVisible(link);
    });
  }

  function clearActive() {
    if (pinnedId) return;
    links.forEach((link) => link.classList.remove('toc-active'));
  }

  // Mirrors the observer band (rootMargin '-20% 0px -65% 0px'): the current
  // section is the last heading at or above the bottom of that band.
  function activeIdFromScroll() {
    // At the very bottom the remaining headings can never reach the activation
    // line; the last section is what the reader is looking at.
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      return headings.at(-1)?.id ?? null;
    }
    // The current section is the last heading that scrolled past the sticky
    // stack. Must sit below the anchor scroll-margins (6rem / 8.5rem) so a
    // just-jumped-to heading counts as current.
    const activationLine = 176;
    let current: string | null = null;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= activationLine) current = heading.id;
      else break;
    }
    return current;
  }

  function syncFromScroll() {
    const id = activeIdFromScroll();
    if (id) setActive(id);
    else clearActive();
  }

  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        syncFromScroll();
      });
    },
    { passive: true }
  );
  syncFromScroll();

  links.forEach((link) =>
    link.addEventListener('click', () => {
      pinnedId = headingId(link);
      setActive(pinnedId, true);
    })
  );
  const releasePin = () => {
    pinnedId = null;
  };
  window.addEventListener('wheel', releasePin, { passive: true });
  window.addEventListener('touchstart', releasePin, { passive: true });
  window.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) releasePin();
  });

  // Center mode: hover opens on pointer devices; click remains for touch and keyboard use.
  if (centerRoot && toggle && dropdown) {
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const isOpen = () => dropdown.classList.contains('is-open');
    const close = () => {
      dropdown.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      dropdown.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
    };

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      isOpen() ? close() : open();
    });
    if (canHover) {
      centerRoot.addEventListener('mouseenter', open);
      centerRoot.addEventListener('mouseleave', close);
    }
    links.forEach((link) => link.addEventListener('click', close));
    document.addEventListener('click', (event) => {
      if (isOpen() && !centerRoot.contains(event.target as Node)) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) close();
    });
  }
}
