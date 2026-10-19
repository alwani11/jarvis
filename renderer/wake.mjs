// Cleans Whisper output and spots "Hey Jarvis".
// parseWake returns null (no wake word), '' (just the name), or the command that followed it.
export const clean = (t) => t.replace(/[\[(][^\])]*[\])]/g, ' ').replace(/\s+/g, ' ').trim(); // drops [BLANK_AUDIO], (music) etc.

export function parseWake(text) {
  const m = text.match(/\b(?:(?:hey|hi|okay|ok)[\s,]+)?(?:jarvis|jarvas|jarvus|jervis|jarvice)\b[\s,.!?:;-]*/i);
  return m ? text.slice(m.index + m[0].length).trim() : null;
}
