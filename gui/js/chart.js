/**
 * chart.js — Sparkline Chart Renderer (Factory Pattern + SRP)
 *
 * Lightweight canvas-based sparkline renderer with animated drawing.
 * Each SparklineChart instance owns exactly one canvas (SRP).
 */
export class SparklineChart {
  /**
   * @param {string} canvasId
   * @param {Object} opts
   */
  constructor(canvasId, opts = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.color  = opts.color  || 'hsl(215 100% 65%)';
    this.fill   = opts.fill   || 'hsl(215 100% 65% / 0.15)';
    this.label  = opts.label  || '';
    this._data  = [];
    this._maxPoints = opts.maxPoints || 40;
    this._animReq   = null;
    this._targetData = null;
    this._animPct    = 1;
    this._prevData   = [];

    // HiDPI handling
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = (rect.width  || 300) * dpr;
    this.canvas.height = (rect.height || 80) * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = rect.width  || 300;
    this.H = rect.height || 80;
  }

  /** Push a new data point and re-render */
  push(value) {
    this._prevData  = [...this._data];
    this._data.push(+value);
    if (this._data.length > this._maxPoints) this._data.shift();
    this._animPct = 0;
    this._animate();
  }

  /** Replace all data */
  setData(arr) {
    this._data = arr.slice(-this._maxPoints);
    this._animPct = 1;
    this._draw(this._data);
  }

  _animate() {
    cancelAnimationFrame(this._animReq);
    const start = performance.now();
    const dur   = 280;
    const step = (now) => {
      this._animPct = Math.min(1, (now - start) / dur);
      const ease = 1 - Math.pow(1 - this._animPct, 3);
      const interp = this._data.map((v, i) => {
        const prev = this._prevData[i] ?? v;
        return prev + (v - prev) * ease;
      });
      this._draw(interp);
      if (this._animPct < 1) this._animReq = requestAnimationFrame(step);
    };
    this._animReq = requestAnimationFrame(step);
  }

  _draw(data) {
    if (!this.ctx || data.length < 2) return;
    const { ctx, W, H } = this;
    const pad = 4;
    const min = Math.min(...data);
    const max = Math.max(...data) || 1;
    const range = max - min || 1;

    const x = (i) => pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = (v) => H - pad - ((v - min) / range) * (H - pad * 2);

    ctx.clearRect(0, 0, W, H);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, this.fill);
    grad.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.moveTo(x(0), y(data[0]));
    for (let i = 1; i < data.length; i++) {
      const cx = (x(i - 1) + x(i)) / 2;
      ctx.bezierCurveTo(cx, y(data[i - 1]), cx, y(data[i]), x(i), y(data[i]));
    }
    ctx.lineTo(x(data.length - 1), H);
    ctx.lineTo(x(0), H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(x(0), y(data[0]));
    for (let i = 1; i < data.length; i++) {
      const cx = (x(i - 1) + x(i)) / 2;
      ctx.bezierCurveTo(cx, y(data[i - 1]), cx, y(data[i]), x(i), y(data[i]));
    }
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();

    // Last point dot
    const lx = x(data.length - 1);
    const ly = y(data[data.length - 1]);
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

/**
 * ChartFactory — Factory Pattern for creating pre-configured charts
 */
export class ChartFactory {
  static create(canvasId, type) {
    const configs = {
      cpu:  { color: 'hsl(215 100% 65%)',   fill: 'hsl(215 100% 65% / 0.15)' },
      mem:  { color: 'hsl(145 70% 50%)',    fill: 'hsl(145 70% 50% / 0.15)' },
      proc: { color: 'hsl(280 80% 70%)',    fill: 'hsl(280 80% 70% / 0.15)' },
    };
    return new SparklineChart(canvasId, configs[type] || configs.cpu);
  }
}
