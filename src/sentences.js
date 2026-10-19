// Cuts a growing stream of text into speakable sentences so Jarvis can start talking before Claude has finished.
// Returns { sentences, rest }. shortcut: abbreviations like "Mr." can split early, which just sounds like a pause.
function split(buffer, flush = false) {
  const sentences = [];
  const re = /[^.!?\n]+(?:[.!?]+["')\]]*|\n)\s+/g; // a sentence ends at . ! ? or newline followed by whitespace
  let last = 0, m;
  while ((m = re.exec(buffer))) { const s = m[0].trim(); if (s) sentences.push(s); last = re.lastIndex; }
  let rest = buffer.slice(last);
  if (flush && rest.trim()) { sentences.push(rest.trim()); rest = ''; }
  return { sentences, rest };
}
module.exports = { split };
