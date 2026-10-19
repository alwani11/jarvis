// Speech-to-text, entirely on this PC (Whisper tiny). The model (~40 MB) downloads once, then is cached.
import { pipeline, env } from '../node_modules/@huggingface/transformers/dist/transformers.min.js';

env.allowLocalModels = false;

let maxProgress = 0;
const ready = pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
  dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
  device: 'wasm',
  progress_callback: (p) => {
    if (p.status === 'progress' && p.progress > maxProgress) { maxProgress = p.progress; postMessage({ type: 'progress', value: p.progress }); }
  },
}).then((asr) => { postMessage({ type: 'ready' }); return asr; });

onmessage = async ({ data }) => {
  try {
    const asr = await ready;
    const out = await asr(data.audio);
    postMessage({ type: 'text', id: data.id, text: out.text.trim() });
  } catch (e) {
    postMessage({ type: 'text', id: data.id, text: '', error: String(e) });
  }
};
