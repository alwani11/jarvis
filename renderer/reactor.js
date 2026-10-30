// Iron Man Arc Reactor & Audio Waveform HUD
const COLORS = {
  loading: { primary: '#5a82c4', glow: 'rgba(90,130,196,0.5)', status: 'LOADING' },
  idle: { primary: '#38bdf8', glow: 'rgba(56,189,248,0.55)', status: 'ONLINE // IDLE' },
  listening: { primary: '#00f0ff', glow: 'rgba(0,240,255,0.85)', status: 'LISTENING...' },
  thinking: { primary: '#a855f7', glow: 'rgba(168,85,247,0.8)', status: 'PROCESSING...' },
  speaking: { primary: '#22c55e', glow: 'rgba(34,197,94,0.85)', status: 'SPEAKING' },
};

export class ReactorHUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'idle';
    this.level = 0;
    this.smoothLevel = 0;
    this.t = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setLevel(lvl) {
    this.level = lvl;
  }

  setState(st) {
    this.state = st;
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const { ctx, w, h } = this;
    if (!w || !h) return;

    this.t += this.state === 'thinking' ? 0.045 : 0.018;
    this.smoothLevel += (this.level - this.smoothLevel) * 0.22;

    const col = COLORS[this.state] || COLORS.idle;
    const cx = w / 2;
    const cy = h / 2;
    const baseR = Math.min(w, h) * 0.38;
    const audioScale = this.smoothLevel * 0.45;

    ctx.clearRect(0, 0, w, h);

    // Subtle central glow
    const radial = ctx.createRadialGradient(cx, cy, 5, cx, cy, baseR * 1.6);
    radial.addColorStop(0, col.glow);
    radial.addColorStop(0.5, 'rgba(10,25,50,0.15)');
    radial.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, w, h);

    // 1. Outermost segmented technical ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.t * 0.25);
    ctx.strokeStyle = col.primary;
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.65;
    ctx.setLineDash([baseR * 0.2, baseR * 0.08, baseR * 0.04, baseR * 0.08]);
    ctx.beginPath();
    ctx.arc(0, 0, baseR * 1.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 2. Outer Audio Reactive Waveform Bars (Radar Teeth)
    const numBars = 64;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = col.primary;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    for (let i = 0; i < numBars; i++) {
      const angle = (i / numBars) * Math.PI * 2 + this.t * 0.15;
      const wave = Math.sin(i * 1.8 + this.t * 5) * Math.cos(i * 0.8 - this.t * 3);
      const barLen = (baseR * 0.06) + (baseR * (0.05 + audioScale) * Math.abs(wave));
      const rInner = baseR * 0.98;
      const rOuter = rInner + barLen;

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      ctx.globalAlpha = 0.35 + (Math.abs(wave) * 0.6) + (this.smoothLevel * 0.4);
      ctx.beginPath();
      ctx.moveTo(cos * rInner, sin * rInner);
      ctx.lineTo(cos * rOuter, sin * rOuter);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Middle counter-rotating precision ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.t * 0.4);
    ctx.strokeStyle = col.primary;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([12, 6, 4, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, baseR * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal radar tick marks
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (baseR * 0.80), Math.sin(a) * (baseR * 0.80));
      ctx.lineTo(Math.cos(a) * (baseR * 0.90), Math.sin(a) * (baseR * 0.90));
      ctx.stroke();
    }
    ctx.restore();

    // 4. Inner Arc Reactor Core Rings
    ctx.save();
    ctx.translate(cx, cy);
    const breathe = Math.sin(this.t * 2.5) * 0.035;
    const coreR = baseR * (0.62 + breathe + audioScale * 0.3);

    // Glowing core ring
    ctx.strokeStyle = col.primary;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = col.primary;
    ctx.shadowBlur = 14 + (this.smoothLevel * 25);
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.stroke();

    // Center Reactor Glass Reticle
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 0.45, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair ticks
    const retR = coreR * 0.45;
    ctx.beginPath();
    ctx.moveTo(-retR - 8, 0); ctx.lineTo(-retR + 4, 0);
    ctx.moveTo(retR - 4, 0); ctx.lineTo(retR + 8, 0);
    ctx.moveTo(0, -retR - 8); ctx.lineTo(0, -retR + 4);
    ctx.moveTo(0, retR - 4); ctx.lineTo(0, retR + 8);
    ctx.stroke();

    // Central J.A.R.V.I.S. Text
    ctx.fillStyle = col.primary;
    ctx.font = 'bold 13px "Courier New", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.95;
    ctx.shadowColor = col.primary;
    ctx.shadowBlur = 8;
    ctx.fillText('J.A.R.V.I.S.', 0, 0);

    ctx.restore();
  }
}
