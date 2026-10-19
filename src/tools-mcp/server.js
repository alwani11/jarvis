// Jarvis's hands: a tiny MCP tool server that Claude calls. Only the tools below exist,
// so Jarvis physically cannot send or delete email, or change your calendar.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { api } = require('../tokens');

const server = new McpServer({ name: 'jarvis', version: '1.0.0' });
const ok = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v) }] });
const tool = (name, desc, shape, fn) =>
  server.tool(name, desc, shape, async (a) => {
    try { return ok(await fn(a)); } catch (e) { return { isError: true, content: [{ type: 'text', text: String(e.message || e) }] }; }
  });

// ---------- Gmail (read + draft only) ----------
const G = 'https://gmail.googleapis.com/gmail/v1/users/me';
const header = (m, n) => (m.payload.headers.find((h) => h.name.toLowerCase() === n) || {}).value || '';
const decode = (s) => Buffer.from(s || '', 'base64url').toString('utf8');
function bodyText(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data);
  for (const p of part.parts || []) { const t = bodyText(p); if (t) return t; }
  return part.body?.data ? decode(part.body.data).replace(/<[^>]+>/g, ' ') : '';
}

tool('search_mail', 'Search the user\'s Gmail (Gmail search syntax, e.g. "is:unread" or "from:bob"). Returns up to 5 messages with id, sender, subject, snippet.',
  { query: z.string().default('is:unread in:inbox'), max: z.number().int().min(1).max(10).default(5) },
  async ({ query, max }) => {
    const l = await api('google', `${G}/messages?${new URLSearchParams({ q: query, maxResults: String(max) })}`);
    return Promise.all((l.messages || []).map(async ({ id }) => {
      const m = await api('google', `${G}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      return { id, from: header(m, 'from'), subject: header(m, 'subject'), date: header(m, 'date'), snippet: m.snippet };
    }));
  });

tool('read_mail', 'Read the full text of one Gmail message by id.', { id: z.string() }, async ({ id }) => {
  const m = await api('google', `${G}/messages/${id}?format=full`);
  return { from: header(m, 'from'), subject: header(m, 'subject'), body: bodyText(m.payload).slice(0, 4000) };
});

tool('create_draft', 'Create an email DRAFT in Gmail (never sent). The user reviews and sends it themselves.',
  { to: z.string(), subject: z.string(), body: z.string() }, async ({ to, subject, body }) => {
    const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).toString('base64url');
    await api('google', `${G}/drafts`, { method: 'POST', body: JSON.stringify({ message: { raw } }) });
    return 'Draft saved in Gmail. It has not been sent.';
  });

// ---------- Google Calendar (read only) ----------
tool('list_events', 'List upcoming Google Calendar events between two ISO date-times (defaults: now to 7 days).',
  { from: z.string().optional(), to: z.string().optional() }, async ({ from, to }) => {
    const q = new URLSearchParams({
      timeMin: from || new Date().toISOString(), timeMax: to || new Date(Date.now() + 7 * 864e5).toISOString(),
      singleEvents: 'true', orderBy: 'startTime', maxResults: '15',
    });
    const r = await api('google', `https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`);
    return (r.items || []).map((e) => ({ title: e.summary, start: e.start.dateTime || e.start.date, end: e.end.dateTime || e.end.date, where: e.location }));
  });

// ---------- Spotify ----------
const S = 'https://api.spotify.com/v1/me/player';
const put = (p, qs = '', body) => api('spotify', `${S}${p}${qs}`, { method: 'PUT', body: body && JSON.stringify(body) });

tool('spotify_play', 'Play music. With a query, search Spotify and play the best match (type: track, artist, album or playlist). With no query, resume playback.',
  { query: z.string().optional(), type: z.enum(['track', 'artist', 'album', 'playlist']).default('track') }, async ({ query, type }) => {
    if (!query) { await put('/play'); return 'Resumed.'; }
    const r = await api('spotify', `https://api.spotify.com/v1/search?${new URLSearchParams({ q: query, type, limit: '1' })}`);
    const hit = r[type + 's'].items[0];
    if (!hit) return `Nothing found for ${query}.`;
    await put('/play', '', type === 'track' ? { uris: [hit.uri] } : { context_uri: hit.uri });
    return `Playing ${hit.name}.`;
  });
tool('spotify_pause', 'Pause Spotify.', {}, async () => { await put('/pause'); return 'Paused.'; });
tool('spotify_next', 'Skip to the next track.', {}, async () => { await api('spotify', `${S}/next`, { method: 'POST' }); return 'Skipped.'; });
tool('spotify_previous', 'Go back to the previous track.', {}, async () => { await api('spotify', `${S}/previous`, { method: 'POST' }); return 'Went back.'; });
tool('spotify_volume', 'Set Spotify volume 0-100.', { percent: z.number().int().min(0).max(100) }, async ({ percent }) => { await put('/volume', `?volume_percent=${percent}`); return `Volume ${percent}%.`; });
tool('spotify_now_playing', 'What is playing on Spotify right now.', {}, async () => {
  const r = await api('spotify', `${S}/currently-playing`);
  return r.item ? `${r.item.name} by ${r.item.artists.map((a) => a.name).join(', ')}${r.is_playing ? '' : ' (paused)'}` : 'Nothing is playing.';
});

server.connect(new StdioServerTransport());
