import { MODELS, MODALITIES, defaultParams } from './models.js';

const SETTINGS_KEY = 'nano-settings';
const RUNS_KEY = 'nano-runs';
const MAX_RUNS = 60;

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

const saved = read(SETTINGS_KEY, {});
const firstModel = (type) => MODELS.find((m) => m.type === type).id;

export const state = {
  theme: saved.theme || 'system',
  accent: saved.accent || 'iris',
  type: MODALITIES.some((m) => m.id === saved.type) ? saved.type : 'text',
  // per-modality selections
  model: Object.fromEntries(MODALITIES.map((m) => {
    const id = saved.model?.[m.id];
    return [m.id, MODELS.some((x) => x.id === id && x.type === m.id) ? id : firstModel(m.id)];
  })),
  prompts: Object.fromEntries(MODALITIES.map((m) => [m.id, saved.prompts?.[m.id] ?? m.defaultPrompt ?? ''])),
  params: Object.fromEntries(MODELS.map((m) => [m.id, { ...defaultParams(m), ...(saved.params?.[m.id] || {}) }])),
  backend: saved.backend || 'auto',
  noticeDismissed: !!saved.noticeDismissed,
  device: { webgpu: false, f16: false, checked: false },
  runs: read(RUNS_KEY, []).filter((r) => r && typeof r.seconds === 'number'),
  filter: 'all',
  sort: 'newest',
  run: { status: 'idle' }, // idle | running | done | error
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** topics let components ignore changes they don't care about */
export function emit(...topics) {
  for (const fn of listeners) fn(new Set(topics));
}

export function saveSettings() {
  const { theme, accent, type, model, prompts, params, backend, noticeDismissed } = state;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme, accent, type, model, prompts, params, backend, noticeDismissed }));
  } catch { /* storage full or blocked: settings just don't persist */ }
}

export function saveRuns() {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(state.runs));
  } catch {
    // thumbnails are the heavy part; drop them and retry once
    state.runs.forEach((r) => delete r.thumb);
    try { localStorage.setItem(RUNS_KEY, JSON.stringify(state.runs)); } catch { /* give up */ }
  }
}

export function addRun(run) {
  state.runs.unshift(run);
  state.runs = state.runs.slice(0, MAX_RUNS);
  saveRuns();
  emit('runs');
}

export const currentModel = () => MODELS.find((m) => m.id === state.model[state.type]);
export const currentParams = () => state.params[currentModel().id];

export function resolveBackend(model) {
  if (model.requires?.includes('webgpu')) return 'webgpu';
  if (state.backend === 'wasm') return 'wasm';
  return state.device.webgpu ? 'webgpu' : 'wasm';
}
