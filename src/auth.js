// "Connect" buttons: browser sign-in using a temporary local web page to catch the result (loopback OAuth with PKCE).
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');
const store = require('./store');

const b64 = (b) => b.toString('base64url');

const PROVIDERS = {
  google: {
    port: 8889,
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    // Gmail: read + create drafts only. Calendar: read only. Jarvis has no send/delete tool.
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.readonly',
    extraAuth: { access_type: 'offline', prompt: 'consent' },
    creds: (c) => ({ client_id: c.googleClientId, client_secret: c.googleClientSecret }),
  },
  spotify: {
    port: 8888,
    auth: 'https://accounts.spotify.com/authorize',
    token: 'https://accounts.spotify.com/api/token',
    scope: 'user-read-playback-state user-modify-playback-state user-read-currently-playing',
    extraAuth: {},
    creds: (c) => ({ client_id: c.spotifyClientId }),
  },
};

async function connect(name) {
  const p = PROVIDERS[name];
  const creds = p.creds(store.config());
  if (!creds.client_id) throw new Error(`Add the ${name} client ID in Settings first.`);
  const redirect = `http://127.0.0.1:${p.port}/callback`;
  const verifier = b64(crypto.randomBytes(48));
  const state = b64(crypto.randomBytes(12));

  const code = await new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, redirect);
      if (u.pathname !== '/callback') { res.end(); return; }
      res.setHeader('content-type', 'text/html');
      res.end('<body style="font-family:sans-serif;background:#050b18;color:#7fd3ff;text-align:center;padding-top:20vh"><h2>Jarvis is connected, sir.</h2>You can close this tab.</body>');
      srv.close();
      if (u.searchParams.get('state') !== state || !u.searchParams.get('code')) reject(new Error('Sign-in was cancelled or failed.'));
      else resolve(u.searchParams.get('code'));
    });
    srv.on('error', reject);
    srv.listen(p.port, '127.0.0.1', () => {
      const q = new URLSearchParams({
        client_id: creds.client_id, response_type: 'code', redirect_uri: redirect, scope: p.scope, state,
        code_challenge_method: 'S256', code_challenge: b64(crypto.createHash('sha256').update(verifier).digest()), ...p.extraAuth,
      });
      shell.openExternal(`${p.auth}?${q}`);
    });
    setTimeout(() => { srv.close(); reject(new Error('Sign-in timed out.')); }, 180000);
  });

  const r = await fetch(p.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier, ...creds }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || 'Token exchange failed.');
  const all = store.read('tokens.json');
  all[name] = { ...j, expires_at: Date.now() + j.expires_in * 1000 };
  store.write('tokens.json', all);
}

const connected = () => { const t = store.read('tokens.json'); return { google: !!t.google, spotify: !!t.spotify }; };

module.exports = { connect, connected };
