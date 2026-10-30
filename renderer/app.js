import { ReactorHUD } from './reactor.js';
import { Graph3D } from './graph3d.js';
import { parseWake, clean } from './wake.mjs';

const $ = (id) => document.getElementById(id);

// Initialize 3D Knowledge Graph & Arc Reactor HUD
const graph = new Graph3D($('graphContainer'));
const reactor = new ReactorHUD($('orb'));
const SR = 16000;

// ---------- state ----------
let state = 'loading'; // loading | idle | listening | thinking | speaking
let sttReady = false, holding = false, armedUntil = 0, turnOver = true, useFish = true;

const STATUS_LABELS = {
  loading: 'Initializing...',
  idle: 'At your service',
  listening: 'Listening to command',
  thinking: 'Processing...',
  speaking: 'Speaking',
};

const REACTOR_TAGS = {
  loading: 'BOOTING',
  idle: 'ONLINE',
  listening: 'LISTENING',
  thinking: 'THINKING',
  speaking: 'TRANSMITTING',
};

const setState = (s) => {
  state = s;
  reactor.setState(s);
  graph.setState(s);

  $('status').textContent = STATUS_LABELS[s] || s;
  const badge = $('reactorBadge');
  if (badge) {
    badge.textContent = REACTOR_TAGS[s] || s.toUpperCase();
    badge.className = `header-tag ${s === 'speaking' || s === 'listening' ? 'pulse' : ''}`;
  }

  const talkBtn = $('talkBtn');
  const talkText = $('talkBtnText');
  if (talkBtn && talkText) {
    if (s === 'listening') {
      talkBtn.classList.add('holding');
      talkText.textContent = 'LISTENING...';
    } else {
      talkBtn.classList.remove('holding');
      talkText.textContent = 'HOLD TO TALK';
    }
  }
};

const busy = () => state === 'thinking' || state === 'speaking';

// ---------- transcript ----------
let jLine = null;
function log(cls, who, text) {
  const p = document.createElement('p');
  p.className = cls;
  p.innerHTML = `<b>${who}</b>`;
  p.append(text);
  $('log').append(p);
  $('log').scrollTop = 1e9;
  return p;
}

// ---------- clock ----------
setInterval(() => {
  const d = new Date();
  $('clock').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  $('date').textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}, 1000);

// ---------- 3D Graph UI Controls ----------
document.querySelectorAll('.cluster-item').forEach((item) => {
  item.addEventListener('click', () => {
    const clusterIdx = parseInt(item.dataset.cluster, 10);
    graph.focusCluster(clusterIdx);
  });
});

const orbitSlider = $('orbitSlider');
if (orbitSlider) {
  orbitSlider.addEventListener('input', (e) => {
    graph.orbitSpeed = parseFloat(e.target.value);
  });
}

const resetViewBtn = $('resetViewBtn');
if (resetViewBtn) {
  resetViewBtn.addEventListener('click', () => {
    graph.targetRotation = { x: 0.2, y: 0 };
    graph.targetDistance = 480;
  });
}

// ---------- Drawer & Modal controls ----------
const logDrawer = $('logDrawer');
$('toggleLogBtn').addEventListener('click', () => {
  logDrawer.hidden = !logDrawer.hidden;
});
$('closeLogBtn').addEventListener('click', () => {
  logDrawer.hidden = true;
});

// ---------- speech-to-text (worker) ----------
const worker = new Worker('stt-worker.js', { type: 'module' });
const waiting = new Map();
let nextId = 1;

worker.onmessage = ({ data }) => {
  if (data.type === 'progress') {
    $('model').textContent = `Downloading ${Math.round(data.value)}%`;
  } else if (data.type === 'ready') {
    sttReady = true;
    $('model').textContent = 'Whisper Active';
    if (state === 'loading') setState('idle');
  } else if (data.type === 'text') {
    if (data.error) log('e', '!', 'Speech model: ' + data.error);
    waiting.get(data.id)?.(clean(data.text));
    waiting.delete(data.id);
  }
};

worker.onerror = (e) => {
  $('model').textContent = 'Failed to load';
  log('e', '!', 'Speech model failed: ' + e.message);
};

const transcribe = (audio) => new Promise((res) => {
  const id = nextId++;
  waiting.set(id, res);
  worker.postMessage({ id, audio }, [audio.buffer]);
});

const concat = (chunks) => {
  const o = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let i = 0;
  for (const c of chunks) {
    o.set(c, i);
    i += c.length;
  }
  return o;
};

// ---------- turn handling ----------
function command(text) {
  if (!text) { setState('idle'); return; }
  setState('thinking');
  window.jarvis.ask(text);
}

async function handleSegment(audio, { forced }) {
  const text = await transcribe(audio);
  if (forced) return command(text);
  if (state === 'listening') setState('idle');
  if (!text || busy()) return;
  const wake = parseWake(text);
  if (wake) {
    if (wake.length > 1) return command(wake);
    armedUntil = Date.now() + 8000;
    setState('listening');
    setTimeout(() => {
      if (state === 'listening' && !holding && Date.now() >= armedUntil) setState('idle');
    }, 8100);
  } else if (Date.now() < armedUntil) {
    armedUntil = 0;
    command(text);
  }
}

// ---------- microphone, hold-to-talk and hands-free detection ----------
const mic = { chunks: [], pre: [], inSpeech: false, silent: 0, speechFrames: 0, noise: 0.005, hold: [] };
let micAnalyser;

async function startMic() {
  const ctx = new AudioContext({ sampleRate: SR });
  await ctx.audioWorklet.addModule('pcm-worklet.js');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const src = ctx.createMediaStreamSource(stream);
  micAnalyser = ctx.createAnalyser();
  micAnalyser.fftSize = 512;
  src.connect(micAnalyser);
  const node = new AudioWorkletNode(ctx, 'pcm');
  const mute = ctx.createGain();
  mute.gain.value = 0;
  src.connect(node);
  node.connect(mute).connect(ctx.destination);
  node.port.onmessage = ({ data }) => onFrame(data);
}

function onFrame(f) {
  if (holding) { mic.hold.push(f); return; }
  if (!sttReady || !$('wakeToggle').checked || busy()) {
    mic.inSpeech = false;
    mic.chunks = [];
    return;
  }
  let s = 0;
  for (let i = 0; i < f.length; i++) s += f[i] * f[i];
  const rms = Math.sqrt(s / f.length);
  const loud = rms > Math.max(0.015, mic.noise * 3);
  if (!mic.inSpeech) {
    mic.noise += (rms - mic.noise) * 0.05;
    mic.pre.push(f);
    if (mic.pre.length > 3) mic.pre.shift();
    if (loud) {
      mic.inSpeech = true;
      mic.chunks = [...mic.pre];
      mic.silent = 0;
      mic.speechFrames = 1;
    }
    return;
  }
  mic.chunks.push(f);
  if (loud) { mic.silent = 0; mic.speechFrames++; } else mic.silent++;
  if (mic.silent >= 8 || mic.chunks.length > 150) {
    const keep = mic.speechFrames >= 4 ? concat(mic.chunks) : null;
    mic.inSpeech = false;
    mic.chunks = [];
    mic.pre = [];
    if (keep) handleSegment(keep, { forced: false });
  }
}

function pttDown() {
  if (holding || !sttReady) return;
  holding = true;
  mic.hold = [];
  stopAudio();
  window.jarvis.cancel();
  setState('listening');
}

function pttUp() {
  if (!holding) return;
  holding = false;
  const audio = concat(mic.hold);
  mic.hold = [];
  if (audio.length < SR * 0.3) { setState('idle'); return; }
  setState('thinking');
  handleSegment(audio, { forced: true });
}

window.jarvis.on('ptt', (dir) => (dir === 'down' ? pttDown() : pttUp()));
$('orb').addEventListener('mousedown', pttDown);
$('talkBtn').addEventListener('mousedown', pttDown);
window.addEventListener('mouseup', pttUp);

// ---------- Jarvis's voice ----------
const play = new AudioContext();
const playAnalyser = play.createAnalyser();
playAnalyser.fftSize = 512;
playAnalyser.connect(play.destination);
let decodeChain = Promise.resolve(), nextAt = 0, active = 0, synthActive = 0;
const sources = new Set();

function queueAudio(bytes) {
  decodeChain = decodeChain.then(async () => {
    if (turnOver) return;
    const buf = await play.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const src = play.createBufferSource();
    src.buffer = buf;
    src.connect(playAnalyser);
    nextAt = Math.max(nextAt, play.currentTime + 0.03);
    src.start(nextAt);
    nextAt += buf.duration;
    active++;
    sources.add(src);
    setState('speaking');
    src.onended = () => { sources.delete(src); active--; maybeIdle(); };
  }).catch((e) => log('e', '!', 'Audio: ' + e.message));
}

function speakFallback(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  u.rate = 1.05;
  const v = speechSynthesis.getVoices().find((x) => x.lang === 'en-GB');
  if (v) u.voice = v;
  synthActive++;
  setState('speaking');
  u.onend = u.onerror = () => { synthActive--; maybeIdle(); };
  speechSynthesis.speak(u);
}

function maybeIdle() {
  if (turnOver && active === 0 && synthActive === 0 && state === 'speaking') {
    setState('idle');
  }
}

function stopAudio() {
  for (const s of sources) { s.onended = null; try { s.stop(); } catch {} }
  sources.clear();
  active = 0;
  synthActive = 0;
  nextAt = 0;
  speechSynthesis.cancel();
  turnOver = true;
}

window.jarvis.on('turn-start', ({ fish }) => {
  turnOver = false;
  useFish = fish;
  jLine = null;
  if (play.state === 'suspended') play.resume();
  const vsEl = $('voiceSynthDisplay');
  if (vsEl) vsEl.textContent = fish ? 'Fish Audio' : 'System TTS';
});

window.jarvis.on('heard', (t) => {
  log('u', 'SIR', t);
  $('caption').textContent = `"${t}"`;
});

window.jarvis.on('sentence', (s) => {
  if (!jLine) jLine = log('j', 'JARVIS', '');
  jLine.append(s + ' ');
  $('log').scrollTop = 1e9;
  $('caption').textContent = s;
  if (!useFish) speakFallback(s);
});

window.jarvis.on('audio', queueAudio);
window.jarvis.on('stop-audio', stopAudio);
window.jarvis.on('error', (m) => log('e', '!', m));
window.jarvis.on('turn-end', () => {
  turnOver = true;
  decodeChain.then(maybeIdle);
  if (state === 'thinking') setState('idle');
});

window.jarvis.on('latency', (ms) => {
  const el = $('latencyDisplay');
  if (el) el.textContent = ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
});

// ---------- Arc Reactor and Graph audio reactivity ----------
const rmsOf = (an) => {
  const d = new Uint8Array(an.fftSize);
  an.getByteTimeDomainData(d);
  let s = 0;
  for (const v of d) s += ((v - 128) / 128) ** 2;
  return Math.sqrt(s / d.length);
};

setInterval(() => {
  let lvl = 0;
  if (state === 'speaking') {
    lvl = active ? rmsOf(playAnalyser) * 3 : 0.25 + 0.2 * Math.sin(performance.now() / 90);
  } else if (state === 'listening' && micAnalyser) {
    lvl = rmsOf(micAnalyser) * 5;
  } else if (state === 'thinking') {
    lvl = 0.15;
  }
  const clamped = Math.min(1, lvl);
  reactor.setLevel(clamped);
  graph.setLevel(clamped);
}, 33);

// ---------- Settings ----------
const FIELDS = ['geminiKey', 'geminiModel', 'fishKey', 'fishVoice', 'fishModel', 'googleClientId', 'googleClientSecret', 'spotifyClientId'];

async function openSettings() {
  const s = await window.jarvis.getSettings();
  for (const f of FIELDS) $(f).value = s[f] || '';
  $('autostart').checked = s.autostart;
  $('googleState').textContent = s.google ? '✓ connected' : 'not connected';
  $('spotifyState').textContent = s.spotify ? '✓ connected' : 'not connected';
  $('claudeNote').textContent = s.brainOk ? '' : 'Please enter your free Google Gemini API key below to enable Jarvis.';
  $('msg').textContent = '';
  // Update engine display pill dynamically
  const engEl = $('engineDisplay');
  if (engEl && s.geminiModel) {
    engEl.textContent = (s.geminiModel || 'gemini-2.5-flash').toUpperCase().replace(/-/g, ' ');
  }
  $('settings').hidden = false;
}

async function save() {
  const s = { autostart: $('autostart').checked };
  for (const f of FIELDS) s[f] = $(f).value.trim();
  await window.jarvis.saveSettings(s);
}

$('openSettings').onclick = openSettings;
$('closeSettings').onclick = () => ($('settings').hidden = true);
$('closeSettingsX').onclick = () => ($('settings').hidden = true);
$('saveSettings').onclick = async () => {
  await save();
  $('msg').textContent = 'Saved successfully.';
};

document.querySelectorAll('[data-connect]').forEach((b) => (b.onclick = async () => {
  await save();
  $('msg').textContent = 'Finish signing in in your browser…';
  const err = await window.jarvis.connect(b.dataset.connect);
  $('msg').textContent = err || 'Connected.';
  if (!err) $(b.dataset.connect + 'State').textContent = '✓ connected';
}));

// ---------- Start Systems ----------
$('wakeToggle').checked = localStorage.getItem('wake') !== 'off';
$('wakeToggle').onchange = () => localStorage.setItem('wake', $('wakeToggle').checked ? 'on' : 'off');
setState('loading');
startMic().catch((e) => log('e', '!', 'Microphone: ' + e.message));
window.jarvis.getSettings().then((s) => {
  if (!s.geminiKey) openSettings();
});
