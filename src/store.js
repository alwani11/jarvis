// Tiny JSON store shared by the app and the tools process (plain Node, no Electron).
// shortcut: secrets live as plain JSON in the user's own app-data folder (OS file permissions only); upgrade to Windows Credential Manager if you share the PC.
const fs = require('fs');
const path = require('path');

let dir = process.env.JARVIS_DATA || '';

exports.setDir = (d) => { dir = d; fs.mkdirSync(d, { recursive: true }); };
exports.dir = () => dir;
exports.read = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch { return {}; }
};
exports.write = (name, obj) => fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 2));

// Settings saved in the app, with .env as a developer fallback.
exports.config = () => {
  const c = exports.read('config.json');
  return {
    // ── Brain provider selection ──────────────────────────────────────────
    brainProvider: c.brainProvider || process.env.BRAIN_PROVIDER || 'gemini', // 'gemini' | 'groq' | 'claude'

    // ── Gemini ────────────────────────────────────────────────────────────
    geminiKey: c.geminiKey || process.env.GEMINI_API_KEY || '',
    geminiModel: (c.geminiModel && !['gemini-2.0-flash', 'gemini-3.8-flash'].includes(c.geminiModel))
      ? c.geminiModel
      : (process.env.GEMINI_MODEL || 'gemini-2.5-flash'),

    // ── Groq ──────────────────────────────────────────────────────────────
    groqKey: c.groqKey || process.env.GROQ_API_KEY || '',
    groqModel: c.groqModel || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

    // ── Claude (Anthropic) ────────────────────────────────────────────────
    claudeKey: c.claudeKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    claudeModel: c.claudeModel || process.env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022',

    // ── Voice (Fish Audio) ────────────────────────────────────────────────
    fishKey: c.fishKey || process.env.FISH_API_KEY || '',
    fishVoice: c.fishVoice || process.env.FISH_VOICE_ID || '',
    fishModel: c.fishModel || 's2.1-pro-free',

    // ── Google OAuth ──────────────────────────────────────────────────────
    googleClientId: c.googleClientId || '',
    googleClientSecret: c.googleClientSecret || '',

    // ── Spotify OAuth ─────────────────────────────────────────────────────
    spotifyClientId: c.spotifyClientId || '',
  };
};
