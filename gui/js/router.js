/**
 * router.js — SPA Client-Side Router (Strategy Pattern)
 *
 * Manages view transitions. Each view is a separate concern (SRP).
 * Router delegates rendering to registered view handlers (Open/Closed Principle).
 */
import { Store } from './store.js';

export class Router {
  static _instance = null;
  static getInstance() {
    if (!Router._instance) Router._instance = new Router();
    return Router._instance;
  }

  constructor() {
    this._store = Store.getInstance();
    /** @type {Map<string, Function>} */
    this._views = new Map();
  }

  /**
   * Register a view handler (OCP — extend without modifying router)
   * @param {string} viewId
   * @param {Function} onEnter
   */
  register(viewId, onEnter) {
    this._views.set(viewId, onEnter);
  }

  /**
   * Navigate to a view
   * @param {string} viewId
   */
  navigate(viewId) {
    const allViews = document.querySelectorAll('.view');
    const allLinks = document.querySelectorAll('.nav-link');
    const target = document.querySelector(`[data-view="${viewId}"].view`);

    if (!target) return;

    allViews.forEach(v => v.classList.remove('active'));
    allLinks.forEach(l => l.classList.toggle('active', l.dataset.view === viewId));
    target.classList.add('active');

    this._store.commit({ currentView: viewId }, 'navigation');
    this._views.get(viewId)?.(this._store.getState());

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Wire all navigation triggers
   */
  bindLinks() {
    document.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', e => {
        const view = el.dataset.view;
        if (document.querySelector(`[data-view="${view}"].view`)) {
          e.preventDefault();
          this.navigate(view);
        }
      });
    });
  }
}
