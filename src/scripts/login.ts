import { rememberFocus, restoreFocus } from './modal-focus';

const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const dialog = document.querySelector<HTMLDialogElement>('#login-modal');
const githubButton = document.querySelector<HTMLButtonElement>('[data-login-github]');
let authPopup: Window | null = null;
let previousOverflow = '';
let previousFocus: HTMLElement | null = null;

function openLogin(trigger?: HTMLElement) {
  if (!dialog || dialog.open) return;
  previousFocus = trigger || rememberFocus();
  previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  dialog.showModal();
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof Element) {
    const trigger = target.closest<HTMLElement>('[data-login-open]');
    if (trigger) openLogin(trigger);
  }
});

dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

dialog?.addEventListener('close', () => {
  document.documentElement.style.overflow = previousOverflow;
  restoreFocus(previousFocus);
  previousFocus = null;
});

githubButton?.addEventListener('click', () => {
  const oauthHref = githubButton.dataset.oauthHref || `${base}oauth`;
  authPopup = window.open(
    oauthHref,
    'narrow-x-github-oauth',
    'popup=yes,width=760,height=900,resizable=yes,scrollbars=yes'
  );

  if (authPopup) authPopup.focus();
  else window.location.assign(githubButton.dataset.adminHref || `${base}admin/index.html`);
});

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin || event.source !== authPopup || typeof event.data !== 'string') return;

  if (event.data === 'authorizing:github') {
    authPopup?.postMessage(event.data, event.origin);
    return;
  }

  const prefix = 'authorization:github:success:';
  if (!event.data.startsWith(prefix)) return;

  try {
    const { token } = JSON.parse(event.data.slice(prefix.length));
    if (typeof token !== 'string' || !token) return;
    authPopup?.close();
    dialog?.close();
    const adminHref = githubButton?.dataset.adminHref || `${base}admin/index.html`;
    window.location.assign(`${adminHref}#/signin/${btoa(JSON.stringify({ token }))}`);
  } catch {
    // Ignore malformed messages from the popup.
  }
});
