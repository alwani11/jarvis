const assert = require('assert');
const { split } = require('../src/sentences');

let r = split('Good morning, sir. It is rather early. And');
assert.deepStrictEqual(r.sentences, ['Good morning, sir.', 'It is rather early.']);
assert.strictEqual(r.rest, 'And');
assert.deepStrictEqual(split('And so on', true).sentences, ['And so on']);
assert.deepStrictEqual(split('Nothing finished yet').sentences, []);

(async () => {
  const { parseWake, clean } = await import('../renderer/wake.mjs');
  assert.strictEqual(parseWake('Hey Jarvis, what time is it?'), 'what time is it?');
  assert.strictEqual(parseWake('Jarvis.'), '');
  assert.strictEqual(parseWake('play some music'), null);
  assert.strictEqual(clean('[BLANK_AUDIO] hello (music)'), 'hello');
  console.log('all tests passed');
})();
