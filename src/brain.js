// Jarvis's brain: supports Google Gemini, Groq, and Anthropic Claude — switch in Settings.
const store = require('./store');

const PERSONA = `You are JARVIS, the user's personal voice assistant: a dry, witty, impeccably polite British butler.
Your replies are spoken aloud, so: plain spoken English only, no markdown, no asterisks, no bullet points, no lists, no emoji, no URLs.
Keep answers short: one or two sentences (three at most when reading out detailed items). Call the user "sir".
Be quick. Do not narrate your actions; just give the direct answer.
Never mention being an AI model, Claude, Groq, or Google; you are Jarvis.
When the user asks about email, calendar, or music, use your available tools.`;

// ─── helpers ────────────────────────────────────────────────────────────────

function stripMarkdown(t) {
  return t.replace(/[*#_`~]/g, '');
}

async function streamSSE(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const json = trimmed.slice(6).trim();
        if (json && json !== '[DONE]') onChunk(json);
      }
    }
  }
}

async function safeFetch(url, opts) {
  let res = await fetch(url, opts);
  // One retry on 429 (rate limit)
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await fetch(url, opts);
  }
  return res;
}

function throwIfBad(res) {
  if (!res.ok) return res.json().catch(() => ({})).then((j) => {
    throw new Error(j.error?.message || j.error?.msg || `HTTP ${res.status} ${res.statusText}`);
  });
  return Promise.resolve();
}

// ─── Gemini provider ────────────────────────────────────────────────────────

async function askGemini(text, history, cfg, controller, onText) {
  const apiKey = cfg.geminiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is missing. Please add it in Settings.');

  let model = cfg.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (['gemini-2.0-flash', 'gemini-3.8-flash'].includes(model)) model = 'gemini-2.5-flash';

  const contents = [];
  for (const h of history) {
    if (h.u) contents.push({ role: 'user', parts: [{ text: h.u }] });
    if (h.a) contents.push({ role: 'model', parts: [{ text: h.a }] });
  }
  const now = new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long' });
  contents.push({ role: 'user', parts: [{ text: `Current date and time: ${now}.\nSir: ${text}` }] });

  const payload = {
    systemInstruction: { parts: [{ text: PERSONA }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  let response = await safeFetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: controller.signal,
  });

  // Retry without tools on 400
  if (response.status === 400) {
    const fp = JSON.parse(JSON.stringify(payload));
    delete fp.tools;
    const r2 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fp), signal: controller.signal });
    if (r2.ok) response = r2;
  }

  await throwIfBad(response);

  let full = '';
  await streamSSE(response, (json) => {
    try {
      const t = JSON.parse(json).candidates?.[0]?.content?.parts?.[0]?.text;
      if (t) { const c = stripMarkdown(t); if (c) { full += c; onText(c); } }
    } catch {}
  });
  return full;
}

// ─── Groq provider (OpenAI-compatible) ──────────────────────────────────────

async function askGroq(text, history, cfg, controller, onText) {
  const apiKey = cfg.groqKey || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Groq API key is missing. Please add it in Settings.');

  const model = cfg.groqModel || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const messages = [{ role: 'system', content: PERSONA }];
  const now = new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long' });

  for (const h of history) {
    if (h.u) messages.push({ role: 'user', content: h.u });
    if (h.a) messages.push({ role: 'assistant', content: h.a });
  }
  messages.push({ role: 'user', content: `Current date and time: ${now}.\nSir: ${text}` });

  const response = await safeFetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7, max_tokens: 300 }),
    signal: controller.signal,
  });

  await throwIfBad(response);

  let full = '';
  await streamSSE(response, (json) => {
    try {
      const t = JSON.parse(json).choices?.[0]?.delta?.content;
      if (t) { const c = stripMarkdown(t); if (c) { full += c; onText(c); } }
    } catch {}
  });
  return full;
}

// ─── Claude (Anthropic) provider ────────────────────────────────────────────

async function askClaude(text, history, cfg, controller, onText) {
  const apiKey = cfg.claudeKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Claude API key is missing. Please add it in Settings.');

  const model = cfg.claudeModel || process.env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022';
  const messages = [];
  const now = new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long' });

  for (const h of history) {
    if (h.u) messages.push({ role: 'user', content: h.u });
    if (h.a) messages.push({ role: 'assistant', content: h.a });
  }
  messages.push({ role: 'user', content: `Current date and time: ${now}.\nSir: ${text}` });

  const response = await safeFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: PERSONA,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 300,
    }),
    signal: controller.signal,
  });

  await throwIfBad(response);

  let full = '';
  await streamSSE(response, (json) => {
    try {
      const parsed = JSON.parse(json);
      // Anthropic streams content_block_delta events
      const t = parsed.delta?.text ?? parsed.type === 'content_block_delta' ? parsed.delta?.text : null;
      if (t) { const c = stripMarkdown(t); if (c) { full += c; onText(c); } }
    } catch {}
  });
  return full;
}

// ─── Public API ─────────────────────────────────────────────────────────────

function isConfigured() {
  const cfg = store.config();
  const p = cfg.brainProvider || 'gemini';
  if (p === 'groq')   return !!(cfg.groqKey   || process.env.GROQ_API_KEY);
  if (p === 'claude') return !!(cfg.claudeKey  || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
  return !!(cfg.geminiKey || process.env.GEMINI_API_KEY);
}

// Returns { done: Promise<string>, kill() }. onText gets streamed text pieces.
function ask(text, history, onText) {
  const cfg = store.config();
  const provider = cfg.brainProvider || 'gemini';
  const controller = new AbortController();
  let killed = false;

  const done = (async () => {
    try {
      if (provider === 'groq')   return await askGroq(text, history, cfg, controller, onText);
      if (provider === 'claude') return await askClaude(text, history, cfg, controller, onText);
      return await askGemini(text, history, cfg, controller, onText);
    } catch (err) {
      if (killed) return '';
      throw err;
    }
  })();

  return {
    done,
    kill: () => { killed = true; try { controller.abort(); } catch {} },
  };
}

const claudeInstalled = () => Promise.resolve(isConfigured());

module.exports = { ask, isConfigured, claudeInstalled };
