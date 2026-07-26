const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function rememberFocus() {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export function focusFirst(container: HTMLElement) {
  const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  (first || container).focus({ preventScroll: true });
}

export function trapFocus(event: KeyboardEvent, container: HTMLElement) {
  if (event.key !== 'Tab') return;
  const elements = [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => element.getClientRects().length > 0
  );
  if (elements.length === 0) {
    event.preventDefault();
    container.focus({ preventScroll: true });
    return;
  }

  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

export function restoreFocus(element: HTMLElement | null) {
  if (element?.isConnected) element.focus({ preventScroll: true });
}
