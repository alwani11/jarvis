// Jarvis's voice: Fish Audio text-to-speech. Returns an mp3 as a Buffer.
async function tts(text, cfg) {
  const r = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.fishKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text, reference_id: cfg.fishVoice, format: 'mp3', latency: 'balanced', model: cfg.fishModel || 's2.1-pro-free' }),
  });
  if (!r.ok) throw new Error(`Fish Audio ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return Buffer.from(await r.arrayBuffer());
}
module.exports = { tts };
