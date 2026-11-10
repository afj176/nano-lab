// Page-side client for the inference worker (src/worker.js). The UI passes hooks and never touches
// model code directly:
//   hooks.stage(id)                      a pipeline stage started
//   hooks.progress(fraction|null, text)  progress within the stage (null = indeterminate)
//   hooks.token(text)                    streamed text
let worker = null;
let pending = null; // { resolve, reject, hooks, model, stage }

function settle(fn) {
  const p = pending;
  pending = null;
  if (p) fn(p);
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (!pending) return;
    if (data.type === 'stage') { pending.stage = data.id; pending.hooks.stage(data.id); }
    else if (data.type === 'progress') pending.hooks.progress(data.fraction, data.text);
    else if (data.type === 'token') pending.hooks.token(data.text);
    else if (data.type === 'done') settle((p) => p.resolve(data.result));
    else if (data.type === 'error') settle((p) => p.reject(new Error(data.message)));
  };
  worker.onerror = (event) => {
    killWorker();
    settle((p) => p.reject(new Error(event.message || 'The inference worker crashed.')));
  };
  return worker;
}

function killWorker() {
  worker?.terminate();
  worker = null;
}

export function runModel(model, input, params, backend, hooks) {
  return new Promise((resolve, reject) => {
    pending = { resolve, reject, hooks, model, stage: null };
    getWorker().postMessage({ type: 'run', modelId: model.id, input, params, backend });
  });
}

/**
 * Stop the current run. Text that is already generating stops after the current token and keeps what it
 * wrote ('graceful'). Anything else ends immediately by shutting the worker down ('hard'), which also
 * drops loaded models from memory; they reload from the browser cache next time.
 */
export function requestStop() {
  if (!pending) return null;
  if (pending.model.type === 'text' && pending.stage === 'generate') {
    worker.postMessage({ type: 'stop' });
    return 'graceful';
  }
  killWorker();
  settle((p) => p.reject(Object.assign(new Error('Run stopped'), { name: 'AbortError' })));
  return 'hard';
}

/** Free every loaded model. Returns false while a run is in progress. */
export function unloadModels() {
  if (pending) return false;
  killWorker();
  return true;
}

export const hasLoadedModels = () => !!worker;
