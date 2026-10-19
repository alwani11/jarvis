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
    fishKey: c.fishKey || process.env.FISH_API_KEY || '',
    fishVoice: c.fishVoice || process.env.FISH_VOICE_ID || '',
    fishModel: c.fishModel || 's2.1-pro-free',
    googleClientId: c.googleClientId || '',
    googleClientSecret: c.googleClientSecret || '',
    spotifyClientId: c.spotifyClientId || '',
  };
};
