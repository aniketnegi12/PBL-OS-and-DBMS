/**
 * toast.js — Notification Service (Facade Pattern)
 *
 * Simple unified API over complex DOM + timing logic.
 * Consumers call Toast.show() without caring about internals.
 */
export class Toast {
  static _container = null;

  static _getContainer() {
    if (!Toast._container) {
      Toast._container = document.getElementById('toast-container');
    }
    return Toast._container;
  }

  /**
   * @param {string} msg
   * @param {'success'|'error'|'info'|'warn'} [type='info']
   * @param {number} [duration=3500]
   */
  static show(msg, type = 'info', duration = 3500) {
    const icons = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <span class="toast__icon" aria-hidden="true">${icons[type]}</span>
      <span class="toast__msg">${escapeHtml(msg)}</span>
    `;

    Toast._getContainer().appendChild(el);

    setTimeout(() => {
      el.style.animation = 'toast-out 0.35s cubic-bezier(0.22,1,0.36,1) both';
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);

    el.addEventListener('click', () => el.remove());
  }

  static success(msg) { Toast.show(msg, 'success'); }
  static error(msg)   { Toast.show(msg, 'error', 5000); }
  static info(msg)    { Toast.show(msg, 'info'); }
  static warn(msg)    { Toast.show(msg, 'warn'); }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
