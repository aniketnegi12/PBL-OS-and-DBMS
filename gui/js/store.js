/**
 * store.js — Observable State Store (Observer Pattern + Single Responsibility)
 *
 * Centralized, reactive state container. All UI reads state from here.
 * Mutations flow through actions only (Command Pattern).
 */
export class Store {
  /** @type {Store|null} */
  static _instance = null;

  /** Singleton accessor (Singleton Pattern) */
  static getInstance() {
    if (!Store._instance) Store._instance = new Store();
    return Store._instance;
  }

  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();

    /** @type {AppState} */
    this._state = {
      containers: [],
      processes: [],
      logs: [],
      metrics: {
        running: 0,
        stopped: 0,
        failed: 0,
        total: 0,
        cpuHistory: [],
        memHistory: [],
        procHistory: [],
      },
      selectedProcess: null,
      currentView: 'dashboard',
      theme: localStorage.getItem('cos-theme') || 'dark',
      containerFilter: 'all',
      containerSearch: '',
      dbActiveTab: 'schema',
    };
  }

  /**
   * Read-only snapshot of state (Immutability principle)
   * @returns {Readonly<AppState>}
   */
  getState() {
    return Object.freeze({ ...this._state });
  }

  /**
   * Atomic state update + notification (Template Method Pattern)
   * @param {Partial<AppState>} partial
   * @param {string} [channel]
   */
  commit(partial, channel = '*') {
    this._state = { ...this._state, ...partial };
    this._notify(channel);
    if (channel !== '*') this._notify('*');
  }

  /**
   * Subscribe to state changes
   * @param {string} channel
   * @param {Function} handler
   * @returns {Function} unsubscribe
   */
  on(channel, handler) {
    if (!this._listeners.has(channel)) this._listeners.set(channel, new Set());
    this._listeners.get(channel).add(handler);
    return () => this._listeners.get(channel)?.delete(handler);
  }

  _notify(channel) {
    this._listeners.get(channel)?.forEach(fn => {
      try { fn(this.getState()); } catch (e) { console.error('[Store]', e); }
    });
  }
}
