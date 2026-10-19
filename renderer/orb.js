// The glowing blue orb. setState() picks the mood, setLevel() (0..1) makes it react to a voice.
const COLORS = {
  loading: [90, 130, 190], idle: [40, 160, 255], listening: [110, 235, 255], thinking: [130, 150, 255], speaking: [60, 190, 255],
};

export class Orb {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.state = 'loading'; this.level = 0; this.smooth = 0; this.t = 0; this.col = [...COLORS.loading];
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    requestAnimationFrame(() => this.frame());
  }
  setState(s) { this.state = s; }
  setLevel(v) { this.level = v; }
  resize() {
    const r = this.c.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
    this.w = r.width; this.h = r.height;
    this.c.width = this.w * d; this.c.height = this.h * d;
    this.g.setTransform(d, 0, 0, d, 0, 0);
  }
  frame() {
    const { g, w, h } = this;
    this.t += this.state === 'thinking' ? 0.035 : 0.012;
    this.smooth += (this.level - this.smooth) * 0.25;
    const target = COLORS[this.state];
    this.col = this.col.map((v, i) => v + (target[i] - v) * 0.08);
    const [r, gr, b] = this.col.map(Math.round), rgb = (a) => `rgba(${r},${gr},${b},${a})`;
    const cx = w / 2, cy = h / 2, base = Math.min(w, h) * 0.2;
    const idle = this.state === 'idle' || this.state === 'loading';
    const breathe = Math.sin(this.t * (idle ? 2 : 4)) * (idle ? 0.025 : 0.04);
    const R = base * (1 + breathe + this.smooth * 0.55);

    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';

    // outer glow
    let grad = g.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 3.4);
    grad.addColorStop(0, rgb(0.35 + this.smooth * 0.4)); grad.addColorStop(1, rgb(0));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);

    // rotating rings
    g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const rr = R * (1.5 + i * 0.35), a = this.t * (i % 2 ? -1 : 1) * (1 + i * 0.4);
      g.strokeStyle = rgb(0.5 - i * 0.12); g.setLineDash([R * 0.5, R * (0.25 + i * 0.2), R * 0.1, R * 0.2]);
      g.beginPath(); g.arc(cx, cy, rr, a, a + Math.PI * 2); g.stroke();
    }
    g.setLineDash([]);

    // voice bars around the core
    const N = 72;
    g.strokeStyle = rgb(0.9); g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + this.t * 0.3;
      const wob = 0.5 + 0.5 * Math.sin(i * 1.7 + this.t * 6) * Math.sin(i * 0.6 - this.t * 3);
      const len = R * 0.08 + R * (0.05 + this.smooth * 0.9) * wob;
      const r0 = R * 1.18;
      g.beginPath();
      g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      g.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
      g.stroke();
    }

    // core sphere
    grad = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.25, rgb(0.95)); grad.addColorStop(1, rgb(0.15));
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = rgb(0.9); g.lineWidth = 2; g.stroke();

    requestAnimationFrame(() => this.frame());
  }
}
