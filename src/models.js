// Model registry. Everything the UI shows about a model (size, license, controls) comes from here.

export const LICENSES = {
  apache: { name: 'Apache-2.0', kind: 'permissive', note: 'Permissive. Commercial use allowed.' },
  openrail: { name: 'OpenRAIL', kind: 'conditions', note: 'Commercial use allowed, with use-based restrictions.' },
  openrailpp: { name: 'OpenRAIL++', kind: 'conditions', note: 'Commercial use allowed, with use-based restrictions.' },
  mit: { name: 'MIT', kind: 'permissive', note: 'Permissive. Commercial use allowed.' },
  ccbync: { name: 'CC BY-NC 4.0', kind: 'noncommercial', note: 'Noncommercial use only.' },
};

export const MODALITIES = [
  {
    id: 'text', label: 'Text', icon: 'Type', verb: 'Generate text', promptLabel: 'Prompt',
    defaultPrompt: 'Write a short, imaginative description of a city built inside a giant greenhouse.',
    examples: [
      ['Greenhouse city', 'Write a short, imaginative description of a city built inside a giant greenhouse.'],
      ['Explain simply', 'Explain how a neural network learns, in three sentences a ten-year-old would follow.'],
      ['Haiku', 'Write a haiku about a tiny model running on an old laptop.'],
      ['Product blurb', 'Write a two-sentence product description for a solar-powered desk lamp.'],
    ],
  },
  {
    id: 'speech', label: 'Speech', icon: 'AudioLines', verb: 'Synthesize speech', promptLabel: 'Text to speak',
    defaultPrompt: 'The future is not somewhere we are going. It is something we make, one small idea at a time.',
    examples: [
      ['Quote', 'The future is not somewhere we are going. It is something we make, one small idea at a time.'],
      ['Announcement', 'Attention please. The next train to the coast departs from platform four in ten minutes.'],
      ['Tongue twister', 'She sells seashells by the seashore, and the shells she sells are seashells, I am sure.'],
    ],
  },
  {
    id: 'image', label: 'Image', icon: 'Image', verb: 'Generate image', promptLabel: 'Prompt',
    defaultPrompt: 'A dreamy greenhouse city at golden hour, cinematic light, intricate details',
    examples: [
      ['Greenhouse city', 'A dreamy greenhouse city at golden hour, cinematic light, intricate details'],
      ['Macro', 'Macro photograph of a dew-covered spider web at sunrise, shallow depth of field'],
      ['Isometric', 'Isometric illustration of a cozy reading nook with plants and warm lamps'],
      ['Landscape', 'A lighthouse on a cliff during a storm, dramatic clouds, oil painting'],
    ],
  },
  {
    id: 'video', label: 'Video', icon: 'Clapperboard', verb: 'Generate video', promptLabel: 'Prompt',
    defaultPrompt: 'A jellyfish drifting through a glowing underwater world',
    examples: [
      ['Jellyfish', 'A jellyfish drifting through a glowing underwater world'],
      ['Clouds', 'Clouds rolling over snowy mountain peaks at sunrise'],
      ['Waves', 'Waves breaking on a rocky shore at dusk'],
      ['Aurora', 'Northern lights shimmering above a frozen lake'],
    ],
  },
  {
    id: 'stt', label: 'Transcribe', icon: 'Captions', verb: 'Transcribe audio', promptLabel: 'Audio', input: 'audio',
    defaultPrompt: '', examples: [],
  },
];

const STT_DTYPES = { wasm: 'q8', webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' } };
const LANGUAGES = [['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['pl', 'Polish'], ['uk', 'Ukrainian'], ['ru', 'Russian'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean']];

const BACKEND_NOTE = 'First run downloads the weights into your browser cache. The size depends on the backend.';

export const MODELS = [
  {
    id: 'smol135', type: 'text', name: 'SmolLM2', variant: '135M Instruct', params: '135M',
    size: '~182 MB', bytes: 182e6, repo: 'HuggingFaceTB/SmolLM2-135M-Instruct', dtype: 'q4', license: 'apache',
    description: 'The smallest instruction-tuned model here. Quick, focused, easily confused.',
    note: BACKEND_NOTE,
    controls: [
      { key: 'maxTokens', type: 'slider', label: 'Max new tokens', min: 32, max: 512, step: 16, default: 160 },
      { key: 'temperature', type: 'slider', label: 'Temperature', min: 0, max: 1.5, step: 0.1, default: 0, format: (v) => (v === 0 ? 'Greedy' : v.toFixed(1)) },
    ],
    stages: [['load', 'Load model'], ['generate', 'Generate']],
  },
  {
    id: 'smol360', type: 'text', name: 'SmolLM2', variant: '360M Instruct', params: '360M',
    size: '~388 MB', bytes: 388e6, repo: 'HuggingFaceTB/SmolLM2-360M-Instruct', dtype: 'q4', license: 'apache',
    description: 'More capacity for on-device writing, at about twice the download.',
    note: BACKEND_NOTE,
    controls: [
      { key: 'maxTokens', type: 'slider', label: 'Max new tokens', min: 32, max: 512, step: 16, default: 160 },
      { key: 'temperature', type: 'slider', label: 'Temperature', min: 0, max: 1.5, step: 0.1, default: 0, format: (v) => (v === 0 ? 'Greedy' : v.toFixed(1)) },
    ],
    stages: [['load', 'Load model'], ['generate', 'Generate']],
  },
  {
    id: 'supertonic', type: 'speech', name: 'Supertonic', variant: 'TTS', params: '66M',
    size: '~263 MB', bytes: 263e6, repo: 'onnx-community/Supertonic-TTS-ONNX', license: 'openrail',
    description: 'Expressive 44.1 kHz speech with ten voices and adjustable pace.',
    note: BACKEND_NOTE,
    controls: [
      {
        key: 'voice', type: 'select', label: 'Voice', default: 'F1',
        options: ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'].map((v) => ({ value: v, label: `${v[0] === 'F' ? 'Female' : 'Male'} ${v[1]}`, hint: v })),
      },
      { key: 'steps', type: 'slider', label: 'Quality steps', min: 1, max: 20, step: 1, default: 5 },
      { key: 'speed', type: 'slider', label: 'Pace', min: 0.8, max: 1.2, step: 0.05, default: 1.05, format: (v) => `${v.toFixed(2)}×` },
    ],
    stages: [['load', 'Load model'], ['generate', 'Synthesize']],
  },
  {
    id: 'mms', type: 'speech', name: 'MMS TTS', variant: 'English', params: '36M',
    size: '~114 MB', sizes: { webgpu: '~114 MB', wasm: '~38 MB' }, bytes: 114e6, repo: 'Xenova/mms-tts-eng', license: 'ccbync',
    description: 'A compact single-voice English pipeline from Meta’s MMS project.',
    note: BACKEND_NOTE,
    controls: [],
    stages: [['load', 'Load model'], ['generate', 'Synthesize']],
  },
  {
    id: 'sd', type: 'image', name: 'NanoDiffuser', variant: 'One-step diffusion', params: '—',
    size: '~400 MB', bytes: 400e6, repo: 'utkucoban/NanoDiffuser', license: 'openrailpp',
    requires: ['webgpu', 'shader-f16'],
    description: 'Quantized one-step 512 × 512 image generation.',
    note: 'Needs WebGPU with shader-f16. About 400 MB on first run.',
    controls: [{ key: 'seed', type: 'seed', label: 'Seed', default: null }],
    stages: [['load', 'Download'], ['encode', 'Encode prompt'], ['generate', 'Denoise'], ['decode', 'Decode']],
  },
  {
    id: 'moonshine-tiny', type: 'stt', family: 'moonshine', name: 'Moonshine', variant: 'Tiny', params: '27M',
    size: '~28 MB', sizes: { webgpu: '~76 MB', wasm: '~28 MB' }, bytes: 76e6, repo: 'onnx-community/moonshine-tiny-ONNX', dtypes: STT_DTYPES, license: 'mit',
    description: 'The lightest model in the lab. English only, best on clips under 30 seconds.',
    note: BACKEND_NOTE,
    controls: [],
    stages: [['load', 'Load model'], ['generate', 'Transcribe']],
  },
  {
    id: 'whisper-base', type: 'stt', family: 'whisper', name: 'Whisper', variant: 'Base', params: '74M',
    size: '~77 MB', sizes: { webgpu: '~209 MB', wasm: '~77 MB' }, bytes: 209e6, repo: 'onnx-community/whisper-base', dtypes: STT_DTYPES, license: 'apache',
    description: 'Multilingual, handles long audio in 30-second windows, and can translate into English.',
    note: BACKEND_NOTE,
    controls: [
      { key: 'language', type: 'select', label: 'Spoken language', icon: 'Languages', default: 'auto', options: [['auto', 'Auto-detect'], ...LANGUAGES].map(([value, label]) => ({ value, label, hint: value })) },
      { key: 'task', type: 'choice', label: 'Output', default: 'transcribe', options: [{ value: 'transcribe', label: 'Same language' }, { value: 'translate', label: 'Translate to English' }] },
    ],
    stages: [['load', 'Load model'], ['generate', 'Transcribe']],
  },
  {
    id: 'video', type: 'video', name: 'Drishya Tiny', variant: 'Text-to-video', params: '212M',
    size: '~665 MB', bytes: 665e6, repo: 'udgamlabs/Drishya-Tiny', license: 'ccbync',
    description: '17 frames at 256 × 256, animated from a generated first frame or from text alone. Best on nature scenes.',
    note: 'About 665 MB on first run, plus about 400 MB for the first-frame image model.',
    controls: [
      {
        key: 'firstFrame', type: 'choice', label: 'First frame', default: 'image',
        options: [{ value: 'image', label: 'Generated image' }, { value: 'text', label: 'From text only' }],
        hint: 'Generated image: NanoDiffuser paints the opening frame and Drishya animates it. Adds a ~400 MB download, needs shader-f16, and the clip also falls under OpenRAIL++.',
      },
      { key: 'steps', type: 'slider', label: 'Denoising steps', min: 10, max: 40, step: 1, default: 25 },
      { key: 'cfg', type: 'slider', label: 'Prompt guidance', min: 1, max: 9, step: 0.5, default: 5, format: (v) => v.toFixed(1) },
      { key: 'seed', type: 'seed', label: 'Seed', default: 42 },
    ],
    stages: (params) => [['load', 'Download'], ...(params.firstFrame === 'image' ? [['frame', 'First frame']] : []), ['generate', 'Denoise'], ['encode', 'Encode clip']],
  },
];

export const stagesFor = (model, params) => (typeof model.stages === 'function' ? model.stages(params) : model.stages);

export function defaultParams(model) {
  return Object.fromEntries(model.controls.map((c) => [c.key, c.default]));
}

/** First-run download for the backend that will actually be used. */
export const sizeFor = (model, backend) => model.sizes?.[backend] ?? model.size;
export const modelUrl = (model) => `https://huggingface.co/${model.repo}`;
export const modality = (id) => MODALITIES.find((m) => m.id === id);
