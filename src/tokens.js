// OAuth tokens for Google and Spotify: refresh when needed, and a small authed fetch helper.
const store = require('./store');

const PROVIDERS = {
  google: { url: 'https://oauth2.googleapis.com/token', extra: (c) => ({ client_id: c.googleClientId, client_secret: c.googleClientSecret }) },
  spotify: { url: 'https://accounts.spotify.com/api/token', extra: (c) => ({ client_id: c.spotifyClientId }) },
};

async function accessToken(p) {
  const all = store.read('tokens.json');
  const tk = all[p];
  if (!tk) throw new Error(`${p} is not connected yet. Tell the user to connect it in Jarvis Settings.`);
  if (tk.expires_at > Date.now() + 60000) return tk.access_token;
  const r = await fetch(PROVIDERS[p].url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tk.refresh_token, ...PROVIDERS[p].extra(store.config()) }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${p} login expired. Tell the user to reconnect it in Jarvis Settings.`);
  all[p] = { ...tk, ...j, refresh_token: j.refresh_token || tk.refresh_token, expires_at: Date.now() + j.expires_in * 1000 };
  store.write('tokens.json', all);
  return all[p].access_token;
}

async function api(p, url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { authorization: 'Bearer ' + (await accessToken(p)), 'content-type': 'application/json', ...opt.headers } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${p} API ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : {};
}

module.exports = { accessToken, api };
