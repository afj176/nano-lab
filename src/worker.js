// All model work happens here, off the main thread, so the interface stays responsive.
// Protocol (see runners.js for the page side):
//   in : { type: 'run', modelId, input, params, backend } | { type: 'stop' }
//   out: { type: 'stage', id } | { type: 'progress', fraction, text } | { type: 'token', text }
//        { type: 'done', result } | { type: 'error', message }
import { MODELS } from './models.js';

const TASKS = { text: 'text-generation', speech: 'text-to-speech', stt: 'automatic-speech-recognition' };
const STT_RATE = 16000;
const cache = { pipe: null, key: null, video: null, videoBackend: null };
let stopper = null;

const hooks = {
  stage: (id) => postMessage({ type: 'stage', id }),
  progress: (fraction, text) => postMessage({ type: 'progress', fraction, text }),
  token: (text) => postMessage({ type: 'token', text }),
};
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

// drishya-web.js builds canvases through `document`. Lend it an OffscreenCanvas-backed stand-in only for
// the duration of those calls, so library environment checks elsewhere still see a worker.
async function withCanvasDocument(fn) {
  const had = 'document' in self;
  if (!had) self.document = { createElement: () => new OffscreenCanvas(1, 1) };
  try {
    return await fn();
  } finally {
    if (!had) delete self.document;
  }
}

async function releasePipe() {
  if (cache.pipe?.dispose) await cache.pipe.dispose();
  cache.pipe = null;
  cache.key = null;
}

async function loadPipeline(model, backend) {
  const tf = await import('@huggingface/transformers');
  const key = `${model.id}:${backend}`;
  if (cache.key !== key) {
    await releasePipe();
    const files = new Map();
    const dtype = model.dtypes?.[backend] ?? model.dtype;
    cache.pipe = await tf.pipeline(TASKS[model.type], model.repo, {
      device: backend,
      ...(dtype ? { dtype } : {}),
      progress_callback: (p) => {
        if (p.status !== 'progress' || !p.total) return;
        files.set(p.file, [p.loaded, p.total]);
        let loaded = 0, total = 0;
        for (const [l, t] of files.values()) { loaded += l; total += t; }
        hooks.progress(loaded / total, `${Math.round(loaded / 1e6)} of ${Math.round(total / 1e6)} MB`);
      },
    });
    cache.key = key;
  }
  return tf;
}

async function runText(model, prompt, params, backend) {
  hooks.stage('load');
  hooks.progress(null, 'Fetching files as needed');
  const tf = await loadPipeline(model, backend);
  hooks.stage('generate');
  hooks.progress(0, 'Waiting for first token');
  let tokens = 0, firstTokenAt = 0;
  const start = performance.now();
  const streamer = new tf.TextStreamer(cache.pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => hooks.token(text),
    token_callback_function: () => {
      if (!tokens) firstTokenAt = performance.now();
      tokens++;
      hooks.progress(Math.min(1, tokens / params.maxTokens), `${tokens} tokens`);
    },
  });
  stopper = new tf.InterruptableStoppingCriteria();
  try {
    const sample = params.temperature > 0;
    const res = await cache.pipe([{ role: 'user', content: prompt }], {
      max_new_tokens: params.maxTokens,
      do_sample: sample,
      ...(sample ? { temperature: params.temperature } : {}),
      streamer,
      stopping_criteria: stopper,
    });
    const end = performance.now();
    const gen = res[0].generated_text;
    const text = Array.isArray(gen) ? gen.at(-1).content : gen;
    const seconds = (end - start) / 1000;
    const decodeSeconds = tokens > 1 ? (end - firstTokenAt) / 1000 : seconds;
    return {
      kind: 'text', text, seconds,
      metrics: [
        ['Tokens', String(tokens)],
        ['Speed', tokens > 1 ? `${((tokens - 1) / decodeSeconds).toFixed(1)} tok/s` : '—'],
        ['First token', `${((firstTokenAt - start) / 1000).toFixed(2)} s`],
      ],
    };
  } finally {
    stopper = null;
  }
}

async function runSpeech(model, prompt, params, backend) {
  hooks.stage('load');
  hooks.progress(null, 'Fetching files as needed');
  await loadPipeline(model, backend);
  hooks.stage('generate');
  hooks.progress(null, 'Synthesizing audio');
  const options = model.id === 'supertonic'
    ? {
      speaker_embeddings: `https://huggingface.co/${model.repo}/resolve/main/voices/${params.voice}.bin`,
      num_inference_steps: params.steps,
      speed: params.speed,
    }
    : {};
  const start = performance.now();
  const res = await cache.pipe(prompt, options);
  const seconds = (performance.now() - start) / 1000;
  const duration = res.audio.length / res.sampling_rate;
  return {
    kind: 'audio', seconds, blob: res.toBlob(), samples: res.audio, sampleRate: res.sampling_rate,
    metrics: [
      ['Audio length', `${duration.toFixed(1)} s`],
      ['Vs real time', `${(duration / seconds).toFixed(1)}× faster`],
    ],
  };
}

// Whisper emits a language token right after start-of-transcript when none is forced: read that one token.
async function detectLanguage(samples) {
  const { model, processor } = cache.pipe;
  const config = model.generation_config;
  const langToId = config?.lang_to_id;
  if (!langToId || config.decoder_start_token_id == null) return null;
  const inputs = await processor(samples.subarray(0, STT_RATE * 30));
  const out = await model.generate({ ...inputs, decoder_input_ids: [config.decoder_start_token_id], max_new_tokens: 1 });
  const ids = (out.sequences ?? out).tolist()[0].map(Number);
  const token = Object.keys(langToId).find((k) => Number(langToId[k]) === ids.at(-1));
  return token ? token.replace(/[<|>]/g, '') : null;
}

async function runTranscribe(model, clip, params, backend) {
  hooks.stage('load');
  hooks.progress(null, 'Fetching files as needed');
  const tf = await loadPipeline(model, backend);
  hooks.stage('generate');
  const whisper = model.family === 'whisper';
  const start = performance.now();
  let language = params.language, detected = null;
  if (whisper && language === 'auto') {
    hooks.progress(null, 'Detecting language');
    detected = await detectLanguage(clip.samples).catch((e) => { console.warn('language detection failed', e); return null; });
    language = detected || 'en';
  }
  hooks.progress(null, 'Listening');
  const streamer = new tf.TextStreamer(cache.pipe.tokenizer, {
    skip_prompt: true, skip_special_tokens: true, callback_function: (text) => hooks.token(text),
  });
  const options = whisper
    ? { chunk_length_s: 30, stride_length_s: 5, language, task: params.task, streamer }
    : { streamer };
  const res = await cache.pipe(clip.samples, options);
  const seconds = (performance.now() - start) / 1000;
  const text = (res.text || '').trim();
  return {
    kind: 'text', text: text || '(no speech recognised)', seconds,
    metrics: [
      ['Audio length', `${clip.duration.toFixed(1)} s`],
      ['Vs real time', `${(clip.duration / seconds).toFixed(1)}× faster`],
      ['Words', String(text ? text.split(/\s+/).length : 0)],
      ...(whisper && params.language === 'auto' ? [['Language', detected ? `${detected} (detected)` : 'en (fallback)']] : []),
    ],
  };
}

async function runImage(model, prompt, params) {
  const { loadImageModel, generateImage } = await import('./image.js');
  await releasePipe(); // free GPU memory held by a text or speech pipeline
  hooks.stage('load');
  hooks.progress(null, 'Checking cache');
  await loadImageModel((stage, fraction, text) => { hooks.stage(stage); hooks.progress(fraction, text); });
  const seed = params.seed ?? randomSeed();
  const start = performance.now();
  const blob = await generateImage(prompt, { seed });
  const seconds = (performance.now() - start) / 1000;
  return { kind: 'image', blob, seconds, seed, metrics: [['Seed', String(seed)], ['Resolution', '512 × 512']] };
}

async function runVideo(model, prompt, params, backend) {
  const { DrishyaWeb, markedFrames, prepareImage } = await import('./drishya-web.js');
  const { encodeVideo } = await import('./video-encode.js');
  const useImage = params.firstFrame === 'image';
  await releasePipe();
  hooks.stage('load');
  let generateImage = null;
  if (useImage) {
    const image = await import('./image.js');
    generateImage = image.generateImage;
    hooks.progress(null, 'Checking image model');
    // image.js keeps reporting through this callback while it generates the frame
    await image.loadImageModel((stage, fraction, text) => {
      if (stage === 'load') hooks.progress(fraction, `Image model · ${text}`);
      else { hooks.stage('frame'); hooks.progress(null, text); }
    });
  }
  if (cache.video && cache.videoBackend !== backend) cache.video = null;
  if (!cache.video) {
    const instance = new DrishyaWeb(undefined, { forceWasm: backend === 'wasm' });
    await instance.plan();
    hooks.progress(0, 'Video model · starting download');
    await instance.load((loaded, total) => hooks.progress(loaded / total, `Video model · ${Math.round(loaded / 1e6)} of ${Math.round(total / 1e6)} MB`));
    cache.video = instance;
    cache.videoBackend = backend;
  }
  const seed = params.seed ?? randomSeed();
  const start = performance.now();
  let frame = null, frameBlob = null, frameSeconds = 0;
  if (useImage) {
    hooks.stage('frame');
    frameBlob = await generateImage(prompt, { seed });
    hooks.progress(null, 'Resizing to 256 × 256');
    frame = (await withCanvasDocument(() => prepareImage(frameBlob))).rgb;
    await cache.video.loadEncoder();
    frameSeconds = (performance.now() - start) / 1000;
  }
  hooks.stage('generate');
  hooks.progress(0, `Step 0 of ${params.steps}`);
  const result = await cache.video.generate(prompt, {
    steps: params.steps, cfg: params.cfg, seed, image: frame,
    onStep: (step, total) => hooks.progress(step / total, `Step ${step} of ${total}`),
  });
  const seconds = (performance.now() - start) / 1000;
  hooks.stage('encode');
  hooks.progress(null, 'Encoding WebM');
  const frames = await withCanvasDocument(() => markedFrames(result.frames));
  const blob = await encodeVideo(frames);
  return {
    kind: 'video', blob, seconds, seed, frames: 17, fps: 8, frameBlob,
    backend: cache.video.stats.backend === 'WebGPU' ? 'webgpu' : 'wasm',
    metrics: [
      ...(useImage ? [['First frame', `${frameSeconds.toFixed(1)} s`]] : []),
      ['Per step', `${((seconds - frameSeconds) / params.steps).toFixed(2)} s`], ['Steps', String(params.steps)], ['Seed', String(seed)],
    ],
  };
}

function run(model, input, params, backend) {
  if (model.type === 'text') return runText(model, input, params, backend);
  if (model.type === 'stt') return runTranscribe(model, input, params, backend);
  if (model.type === 'speech') return runSpeech(model, input, params, backend);
  if (model.type === 'image') return runImage(model, input, params);
  return runVideo(model, input, params, backend);
}

self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { stopper?.interrupt(); return; }
  if (data.type !== 'run') return;
  try {
    const model = MODELS.find((m) => m.id === data.modelId);
    const result = await run(model, data.input, data.params, data.backend);
    postMessage({ type: 'done', result });
  } catch (error) {
    console.error(error);
    postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
