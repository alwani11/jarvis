// Jarvis's brain: runs the Claude Code CLI (using your own Claude login) and streams the answer back.
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const PERSONA = `You are JARVIS, the user's personal voice assistant: a dry, witty, impeccably polite British butler.
Your replies are spoken aloud, so: plain spoken English only, no markdown, no lists, no emoji, no URLs.
Keep answers short: one or two sentences (three at most when reading out emails or calendar items). Call the user "sir".
Be quick. Do not narrate your tool use or announce that you are searching; just do it and give the answer.
Use web search for anything current or that you are unsure of. Use the Gmail, Calendar and Spotify tools when asked.
You can only READ email and CREATE DRAFTS; you cannot send or delete email, and you can only READ the calendar. If asked to send or delete, politely say you may not, and offer a draft instead.
Never mention being Claude or an AI model from Anthropic; you are Jarvis.`;

const q = (s) => `"${s}"`;

function mcpConfig() {
  const server = path.join(__dirname, 'tools-mcp', 'server.js').replace('app.asar', 'app.asar.unpacked');
  const file = path.join(store.dir(), 'mcp.json');
  fs.writeFileSync(file, JSON.stringify({
    mcpServers: { jarvis: { command: process.execPath, args: [server], env: { ELECTRON_RUN_AS_NODE: '1', JARVIS_DATA: store.dir() } } },
  }));
  return file;
}

function buildPrompt(text, history) {
  const now = new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long' });
  const past = history.map((h) => `Sir: ${h.u}\nJarvis: ${h.a}`).join('\n');
  return `${PERSONA}\n\nCurrent date and time: ${now}.\n\n${past ? `Recent conversation:\n${past}\n\n` : ''}Sir: ${text}\nJarvis:`;
}

// Returns { done: Promise<string>, kill() }. onText gets streamed text pieces.
function ask(text, history, onText) {
  const cmd = [
    'claude -p --output-format stream-json --verbose --include-partial-messages --model haiku',
    '--strict-mcp-config', '--mcp-config', q(mcpConfig()),
    '--tools "WebSearch,WebFetch"', '--allowedTools "WebSearch,WebFetch,mcp__jarvis"', '--disable-slash-commands',
  ].join(' ');
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // make sure the Claude login is used, not a stray API key
  const child = spawn(cmd, { shell: true, cwd: store.dir(), env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(buildPrompt(text, history));

  let full = '', err = '', buf = '';
  const done = new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let j; try { j = JSON.parse(line); } catch { continue; }
        const ev = j.type === 'stream_event' ? j.event : null;
        if (ev?.type === 'content_block_start' && ev.content_block?.type === 'text' && full) { full += ' '; onText(' '); }
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { full += ev.delta.text; onText(ev.delta.text); }
      }
    });
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => (full.trim() || code === 0 ? resolve(full) : reject(new Error(err.trim().slice(-300) || `claude exited with code ${code}`))));
  });
  return { done, kill: () => exec(`taskkill /pid ${child.pid} /T /F`, () => {}) };
}

const claudeInstalled = () => new Promise((r) => exec('claude --version', (e) => r(!e)));

module.exports = { ask, claudeInstalled };
