import { h, icon, clear, formatSeconds, timeAgo } from './dom.js';
import { Segmented, Slider, Select, SeedInput, Rating, Popover, Chip, Kbd, CommandPalette, toast, confirmDialog } from './components.js';
import { AudioPlayer, VideoPlayer, ImageViewer, TextOutput } from './players.js';
import { MODELS, MODALITIES, LICENSES, modality, modelUrl, stagesFor, sizeFor, REPO_URL } from '../models.js';
import { openStorageDialog, openAboutDialog, isConstrainedDevice, HEAVY_BYTES } from './panels.js';
import { state, subscribe, emit, saveSettings, saveRuns, addRun, currentModel, currentParams, resolveBackend } from '../store.js';
import { runModel, requestStop } from '../runners.js';
import { AudioInput } from './audio-input.js';

const ACCENTS = [['iris', 'Iris'], ['ember', 'Ember'], ['aqua', 'Aqua'], ['rose', 'Rose'], ['gold', 'Gold'], ['mono', 'Mono']];
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';
const BACKEND_LABEL = { webgpu: 'WebGPU', wasm: 'CPU · WASM' };

/* ---------- theme ---------- */
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const theme = state.theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : state.theme;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.accent = state.accent;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#0c0d10' : '#f5f6f8');
}
systemDark.addEventListener('change', applyTheme);

function licenseChip(model) {
  const lic = LICENSES[model.license];
  const kind = { permissive: 'ok', conditions: 'neutral', noncommercial: 'warn' }[lic.kind];
  return Chip(lic.name, { kind, iconName: lic.kind === 'noncommercial' ? 'TriangleAlert' : 'Scale', tip: lic.note });
}

function missingRequirement(model) {
  if (!state.device.checked) return null;
  if (state.params[model.id].firstFrame === 'image' && !state.device.f16) return 'A generated first frame needs WebGPU with shader-f16, which this device lacks. Set First frame to “From text only”.';
  if (!model.requires) return null;
  if (model.requires.includes('webgpu') && !state.device.webgpu) return 'This model needs WebGPU, which this browser or device does not expose.';
  if (model.requires.includes('shader-f16') && !state.device.f16) return 'This model needs the WebGPU shader-f16 feature, which this GPU does not support.';
  return null;
}

/* ---------- header ---------- */
function Header({ onPalette, onStorage }) {
  const tabs = Segmented({
    label: 'Modality', value: state.type,
    options: MODALITIES.map((m) => ({ value: m.id, label: m.label, icon: m.icon })),
    onChange: (v) => { state.type = v; saveSettings(); emit('type'); },
  });
  const device = h('span.device-chip', { 'data-tip': 'Checking what this device can run' }, h('span.dot'), h('span.device-text', 'Checking device'));

  const themeSeg = Segmented({
    label: 'Theme', size: 'sm', value: state.theme,
    options: [{ value: 'system', label: 'System', icon: 'Monitor' }, { value: 'light', label: 'Light', icon: 'Sun' }, { value: 'dark', label: 'Dark', icon: 'Moon' }],
    onChange: (v) => { state.theme = v; applyTheme(); saveSettings(); },
  });
  const swatches = h('div.swatches', { role: 'radiogroup', 'aria-label': 'Accent color' }, ACCENTS.map(([id, name]) =>
    h('button.swatch', {
      type: 'button', role: 'radio', dataset: { accent: id }, 'aria-label': name, 'data-tip': name,
      onclick: () => { state.accent = id; applyTheme(); saveSettings(); paintSwatches(); },
    }, icon('Check', 13))));
  function paintSwatches() {
    for (const s of swatches.children) s.setAttribute('aria-checked', s.dataset.accent === state.accent);
  }
  paintSwatches();
  const appearance = Popover({
    anchor: h('button.icon-button', { type: 'button', 'aria-label': 'Appearance', 'data-tip': 'Appearance' }, icon('Palette', 17)),
    align: 'end', className: 'appearance',
    content: [h('p.popover-title', 'Theme'), themeSeg.el, h('p.popover-title', 'Accent'), swatches],
  });

  const el = h('header.topbar',
    h('a.brand', { href: '#top', 'aria-label': 'Nano Lab' },
      h('span.brand-mark', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i'), h('i'), h('i'), h('i'), h('i')),
      h('span.brand-name', 'Nano Lab')),
    h('nav.topbar-tabs', { 'aria-label': 'Modality' }, tabs.el),
    h('div.topbar-actions',
      device,
      h('button.search-button', { type: 'button', onclick: onPalette, 'aria-label': 'Open command palette' },
        icon('Search', 14), h('span', 'Actions'), Kbd(MOD, 'K')),
      h('button.icon-button', { type: 'button', 'aria-label': 'Storage', 'data-tip': 'Storage', onclick: onStorage }, icon('HardDrive', 17)),
      h('a.icon-button', { href: REPO_URL, target: '_blank', rel: 'noreferrer', 'aria-label': 'Source code on GitHub', 'data-tip': 'Source on GitHub' }, icon('CodeXml', 17)),
      h('button.icon-button', { type: 'button', 'aria-label': 'About and licenses', 'data-tip': 'About & licenses', onclick: openAboutDialog }, icon('Info', 17)),
      appearance.el));

  subscribe((t) => {
    if (t.has('type')) tabs.set(state.type);
    if (t.has('run')) tabs.setDisabled(state.run.status === 'running');
    if (t.has('device')) {
      const d = state.device;
      device.classList.toggle('is-ok', d.webgpu);
      device.classList.toggle('is-warn', !d.webgpu);
      device.querySelector('.device-text').textContent = d.webgpu ? 'WebGPU ready' : 'CPU only';
      device.dataset.tip = d.webgpu
        ? `GPU acceleration available${d.f16 ? ', including shader-f16' : ', without shader-f16 (image model unavailable)'}`
        : 'No WebGPU: text and speech run on CPU, image generation is unavailable';
    }
    if (t.has('theme')) { themeSeg.set(state.theme); paintSwatches(); }
  });
  return el;
}

/* ---------- composer ---------- */
function Composer({ onRun, onStorage }) {
  const modelList = h('div.model-list', { role: 'radiogroup', 'aria-label': 'Model' });
  const promptLabel = h('label.field-label', { htmlFor: 'prompt' });
  const counter = h('span.counter');
  const prompt = h('textarea.prompt-input', { id: 'prompt', maxLength: 2000, rows: 4, spellcheck: true, placeholder: 'Describe what you want…' });
  const examples = h('div.examples');
  const controls = h('div.controls');
  const alert = h('div.inline-alert', { hidden: true, role: 'alert' });
  const note = h('p.run-note');
  const runBtn = h('button.button.primary.run-button', { type: 'button', onclick: onRun });
  let widgets = [];
  const audioIn = AudioInput({ onChange: () => paintState() });

  const el = h('section.card.composer', { 'aria-label': 'Experiment setup' },
    h('div.card-section',
      h('div.section-head', h('h2', 'Model'), h('span.section-count')),
      modelList),
    h('div.card-section',
      h('div.field-row', promptLabel, counter),
      h('div.prompt-box', prompt, h('div.prompt-foot', examples,
        h('button.icon-button.small', { type: 'button', 'aria-label': 'Reset prompt', 'data-tip': 'Reset to default', onclick: resetPrompt }, icon('RotateCcw', 14)))),
      audioIn.el),
    h('div.card-section.settings-section', h('div.section-head', h('h2', 'Settings')), controls),
    h('div.card-foot', alert, h('div.run-row', note, runBtn)));

  function autosize() {
    prompt.style.height = 'auto';
    prompt.style.height = `${Math.min(320, Math.max(104, prompt.scrollHeight + 2))}px`;
  }
  function paintCounter() {
    const n = prompt.value.length;
    counter.textContent = `${n} / 2000`;
    counter.classList.toggle('is-near', n > 1800);
  }
  function setPrompt(text) {
    prompt.value = text;
    state.prompts[state.type] = text;
    saveSettings();
    autosize();
    paintCounter();
  }
  function resetPrompt() { setPrompt(modality(state.type).defaultPrompt); prompt.focus(); }
  prompt.addEventListener('input', () => { state.prompts[state.type] = prompt.value; saveSettings(); autosize(); paintCounter(); });

  function paintModels() {
    const options = MODELS.filter((m) => m.type === state.type);
    el.querySelector('.section-count').textContent = `${options.length} available`;
    const selected = currentModel().id;
    clear(modelList, options.map((m) => {
      const on = m.id === selected;
      return h('div.model-card', {
        role: 'radio', 'aria-checked': on, tabIndex: on ? 0 : -1, class: on ? 'is-selected' : '', dataset: { model: m.id },
        onclick: (e) => { if (!e.target.closest('a')) chooseModel(m.id); },
        onkeydown: (e) => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); chooseModel(m.id); }
          const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
          if (dir) {
            e.preventDefault();
            const next = options[(options.indexOf(m) + dir + options.length) % options.length];
            chooseModel(next.id);
            modelList.querySelector(`[data-model="${next.id}"]`)?.focus();
          }
        },
      },
      h('span.model-radio', { 'aria-hidden': 'true' }),
      h('div.model-main',
        h('div.model-title', h('strong', m.name), h('span', m.variant)),
        h('p.model-desc', m.description),
        h('div.chips',
          Chip(sizeFor(m, resolveBackend(m)), { iconName: 'HardDriveDownload', tip: 'First-run download on the current backend' }),
          m.params !== '—' && Chip(`${m.params} params`, { iconName: 'Cpu' }),
          licenseChip(m))),
      h('a.model-link', { href: modelUrl(m), target: '_blank', rel: 'noreferrer', 'aria-label': `${m.name} model card`, 'data-tip': 'Model card' }, icon('ArrowUpRight', 15)));
    }));
  }
  function chooseModel(id) {
    if (state.run.status === 'running' || state.model[state.type] === id) return;
    state.model[state.type] = id;
    saveSettings();
    emit('model');
  }

  function paintControls() {
    const model = currentModel();
    const params = currentParams();
    const set = (key) => (v) => { params[key] = v; saveSettings(); emit('params'); };
    widgets = model.controls.map((c) => {
      if (c.type === 'slider') return Slider({ ...c, value: params[c.key], onChange: set(c.key) });
      if (c.type === 'select') return Select({ ...c, value: params[c.key], onChange: set(c.key), iconName: c.icon || 'Mic' });
      if (c.type === 'choice') {
        const seg = Segmented({ label: c.label, size: 'sm', value: params[c.key], options: c.options, onChange: set(c.key) });
        return { el: h('div.field', h('span.field-label', c.label), seg.el, c.hint && h('p.field-hint', c.hint)), setDisabled: seg.setDisabled };
      }
      return SeedInput({ label: c.label, value: params[c.key], onChange: set(c.key) });
    });
    if (!model.requires) {
      const seg = Segmented({
        label: 'Backend', size: 'sm', value: state.backend === 'wasm' ? 'wasm' : 'auto',
        options: [{ value: 'auto', label: state.device.webgpu ? 'Auto · WebGPU' : 'Auto · CPU' }, { value: 'wasm', label: 'CPU only' }],
        onChange: (v) => { state.backend = v; saveSettings(); emit('backend'); },
      });
      widgets.push({ el: h('div.field', h('span.field-label', 'Backend'), seg.el), setDisabled: seg.setDisabled });
    }
    clear(controls, widgets.map((w) => w.el));
    clear(note, icon('HardDrive', 14), h('span', model.note, ' Saved in this browser, not your Downloads folder. ',
      h('button.link-button', { type: 'button', onclick: onStorage }, 'See storage')));
    paintState();
  }

  function paintState() {
    const running = state.run.status === 'running';
    const model = currentModel();
    const missing = missingRequirement(model);
    alert.hidden = !missing;
    if (missing) clear(alert, icon('TriangleAlert', 15), h('span', missing));
    widgets.forEach((w) => w.setDisabled?.(running));
    prompt.readOnly = running;
    audioIn.setDisabled(running);
    el.classList.toggle('is-running', running);
    const stoppable = running;
    runBtn.disabled = !!missing || (running && !stoppable);
    runBtn.classList.toggle('is-stop', stoppable);
    clear(runBtn, ...(stoppable
      ? [icon('Square', 14), 'Stop']
      : running
        ? [h('span.spinner'), 'Running…']
        : [icon('Play', 15), modality(state.type).verb, Kbd(MOD, '↵')]));
  }

  function paintType() {
    const m = modality(state.type);
    const isAudio = m.input === 'audio';
    promptLabel.textContent = m.promptLabel;
    el.querySelector('.prompt-box').hidden = isAudio;
    audioIn.el.hidden = !isAudio;
    counter.hidden = isAudio;
    prompt.value = state.prompts[state.type] ?? '';
    clear(examples, m.examples.map(([label, text]) =>
      h('button.example', { type: 'button', onclick: () => { if (state.run.status !== 'running') setPrompt(text); } }, label)));
    paintModels();
    paintControls();
    autosize();
    paintCounter();
  }

  subscribe((t) => {
    if (t.has('type')) paintType();
    else if (t.has('model')) { paintModels(); paintControls(); }
    else if (t.has('device') || t.has('backend')) { paintModels(); paintControls(); }
    else if (t.has('run') || t.has('params')) paintState();
    if (t.has('prompt')) { prompt.value = state.prompts[state.type]; autosize(); paintCounter(); }
  });
  paintType();
  requestAnimationFrame(autosize);
  return {
    el,
    getPrompt: () => prompt.value.trim(),
    getAudio: () => audioIn.get(),
    loadAudio: (blob, label) => audioIn.load(blob, label),
    focus: () => prompt.focus(),
    flag() {
      const box = modality(state.type).input === 'audio' ? audioIn.el : el.querySelector('.prompt-box');
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
      prompt.focus();
    },
  };
}

/* ---------- stage (progress + output) ---------- */
function Stage({ onRun, onFocusPrompt, onTranscribe }) {
  const title = h('div.stage-title');
  const status = h('span.status-pill');
  const body = h('div.stage-body');
  const el = h('section.card.stage', { 'aria-label': 'Output', 'aria-live': 'polite' }, h('header.stage-head', title, status), body);
  let shown = null; // { model, run } for the result on screen
  let timer = 0;
  let urls = [];
  let rating = null;

  function setHead(model, backend) {
    clear(title,
      h('div.stage-icon', icon(modality(model.type).icon, 18)),
      h('div', h('h2', model.name, ' ', h('span', model.variant)),
        h('div.chips', backend && Chip(BACKEND_LABEL[backend] || backend, { iconName: backend === 'webgpu' ? 'Zap' : 'Cpu' }), licenseChip(model))));
  }
  function setStatus(kind, text) {
    status.className = `status-pill is-${kind}`;
    clear(status, kind === 'running' ? h('span.spinner') : h('span.dot'), text);
  }

  function idle() {
    if (shown) return;
    const model = currentModel();
    const m = modality(model.type);
    setHead(model, resolveBackend(model));
    setStatus('idle', 'Ready');
    clear(body, h('div.empty',
      h('div.empty-art', { 'aria-hidden': 'true' }, h('span.ring'), h('span.ring'), h('span.ring'), icon(m.icon, 26)),
      h('h3', 'Nothing generated yet'),
      h('p', `${m.input === 'audio' ? 'Pick a model, add some audio, and run it.' : 'Pick a model, write a prompt, and run it.'} Everything happens in this tab — nothing is sent to a server.`),
      h('div.empty-actions',
        h('button.button.primary', { type: 'button', onclick: onRun }, icon('Play', 15), m.verb),
        m.input !== 'audio' && h('button.button.ghost', { type: 'button', onclick: onFocusPrompt }, 'Edit prompt', Kbd('/')))));
  }

  function begin(model, backend, params) {
    const stages = stagesFor(model, params);
    shown = null;
    rating = null;
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    setHead(model, backend);
    setStatus('running', 'Running');
    const steps = stages.map(([id, label], i) => h('li.step', { dataset: { stage: id } }, h('span.step-mark', h('span.step-num', String(i + 1)), icon('Check', 12)), h('span.step-label', label)));
    const fill = h('div.progress-fill');
    const bar = h('div.progress', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, fill);
    const detail = h('span.progress-detail', 'Preparing');
    const elapsed = h('span.progress-time', '0.0 s');
    const live = h('div.live');
    clear(body, h('div.running', h('ol.stepper', steps), h('div.progress-block', bar, h('div.progress-row', detail, elapsed)), live));
    const started = performance.now();
    clearInterval(timer);
    timer = setInterval(() => { elapsed.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`; }, 100);
    let textOut = null;
    let active = null;
    return {
      get textOut() { return textOut; },
      stage(id) {
        if (id === active) return;
        active = id;
        const index = stages.findIndex(([s]) => s === id);
        steps.forEach((s, i) => { s.classList.toggle('is-done', i < index); s.classList.toggle('is-active', i === index); });
      },
      progress(fraction, text) {
        bar.classList.toggle('is-indeterminate', fraction == null);
        if (fraction != null) {
          fill.style.width = `${Math.round(fraction * 100)}%`;
          bar.setAttribute('aria-valuenow', Math.round(fraction * 100));
        }
        if (text) detail.textContent = text;
      },
      token(text) {
        if (!textOut) { textOut = TextOutput(); live.append(textOut.el); }
        textOut.append(text);
      },
    };
  }

  function finish(model, result, run, hooks) {
    clearInterval(timer);
    shown = { model, run };
    setHead(model, run.backend);
    setStatus('done', 'Complete');
    let view;
    if (result.kind === 'text') {
      const out = hooks.textOut || TextOutput();
      out.finish(result.text);
      view = out.el;
    } else if (result.kind === 'audio') {
      const url = URL.createObjectURL(result.blob);
      urls.push(url);
      view = AudioPlayer({ url, samples: result.samples, sampleRate: result.sampleRate, filename: 'nano-lab-speech.wav' }).el;
    } else if (result.kind === 'image') {
      const url = URL.createObjectURL(result.blob);
      urls.push(url);
      view = ImageViewer({ url, alt: run.prompt, filename: 'nano-lab-image.png' }).el;
    } else {
      const url = URL.createObjectURL(result.blob);
      urls.push(url);
      view = VideoPlayer({ url, fps: result.fps, frames: result.frames, filename: 'nano-lab-video.webm' }).el;
    }
    rating = Rating({ value: run.rating, onChange: (n) => { run.rating = n; saveRuns(); emit('runs'); } });
    const metrics = [['Generation', formatSeconds(result.seconds)], ...(result.metrics || [])];
    clear(body, h('div.result',
      h('div.result-view', view),
      h('div.metrics', metrics.map(([label, value], i) => h('div.metric', { class: i === 0 ? 'is-primary' : '' }, h('span.metric-label', label), h('span.metric-value', value)))),
      h('div.result-foot',
        h('div.rate-block', h('span', 'How good is it?'), rating.el),
        h('div.result-actions',
          result.kind === 'audio' && h('button.button.ghost', { type: 'button', onclick: () => onTranscribe(result.blob) }, icon('Captions', 14), 'Transcribe this'),
          h('button.button.ghost', { type: 'button', onclick: onRun }, icon('RefreshCw', 14), 'Run again')))));
  }

  function fail(model, backend, error) {
    clearInterval(timer);
    shown = null;
    setHead(model, backend);
    setStatus('error', 'Failed');
    clear(body, h('div.empty.is-error',
      h('div.empty-art', { 'aria-hidden': 'true' }, h('span.ring'), icon('CircleAlert', 26)),
      h('h3', 'That run did not finish'),
      h('p.error-message', error?.message || 'An unexpected error occurred.'),
      h('p', 'Check your connection and that hardware acceleration is enabled, then try again.'),
      h('div.empty-actions', h('button.button.primary', { type: 'button', onclick: onRun }, icon('RefreshCw', 14), 'Try again'))));
  }

  subscribe((t) => {
    if ((t.has('type') || t.has('model') || t.has('device') || t.has('backend')) && state.run.status !== 'running') idle();
    if (t.has('runs') && shown) {
      const still = state.runs.find((r) => r.id === shown.run.id);
      if (still) rating?.set(still.rating);
    }
  });
  idle();
  return { el, begin, finish, fail, reset() { clearInterval(timer); shown = null; idle(); } };
}

/* ---------- history ---------- */
function History({ onReuse }) {
  const filter = Segmented({
    label: 'Filter runs', size: 'sm', value: state.filter,
    options: [{ value: 'all', label: 'All', badge: '0' }, ...MODALITIES.map((m) => ({ value: m.id, label: m.label, badge: '0' }))],
    onChange: (v) => { state.filter = v; paint(); },
  });
  const sort = Select({
    label: 'Sort runs', compact: true, iconName: 'ArrowDownUp', value: state.sort,
    options: [{ value: 'newest', label: 'Newest' }, { value: 'fastest', label: 'Fastest' }, { value: 'rated', label: 'Top rated' }],
    onChange: (v) => { state.sort = v; paint(); },
  });
  const exportBtn = h('button.icon-button', { type: 'button', 'aria-label': 'Export runs as JSON', 'data-tip': 'Export JSON', onclick: exportRuns }, icon('Download', 16));
  const clearBtn = h('button.icon-button', { type: 'button', 'aria-label': 'Clear history', 'data-tip': 'Clear history', onclick: clearAll }, icon('Trash2', 16));
  const tiles = h('div.tiles');
  const chart = h('div.chart');
  const list = h('ul.run-list');
  const el = h('section.history', { id: 'runs', 'aria-label': 'Run history' },
    h('div.history-head',
      h('div', h('h2', 'Runs'), h('p', 'Compare speed and your own quality ratings. Stored only in this browser.')),
      h('div.history-tools', filter.el, sort.el, exportBtn, clearBtn)),
    tiles,
    h('div.history-grid', h('div.card.run-card', list), h('div.card.chart-card', h('h3', 'Average generation time'), chart)),
    h('p.footnote', 'Times exclude downloads. Image time includes session setup; video time excludes it. Sizes are estimates.'));

  function exportRuns() {
    if (!state.runs.length) return toast('No runs to export yet');
    const data = state.runs.map(({ thumb, ...rest }) => rest);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    h('a', { href: url, download: 'nano-lab-runs.json' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function clearAll() {
    if (!state.runs.length) return toast('History is already empty');
    const ok = await confirmDialog({
      title: 'Clear run history?', danger: true, confirmLabel: 'Clear history',
      message: `This removes all ${state.runs.length} recorded runs and their ratings from this browser. It cannot be undone.`,
    });
    if (!ok) return;
    state.runs = [];
    saveRuns();
    emit('runs');
  }
  function remove(run) {
    const index = state.runs.indexOf(run);
    if (index < 0) return;
    state.runs.splice(index, 1);
    saveRuns();
    emit('runs');
    toast('Run removed');
  }

  function paint() {
    filter.setBadge('all', String(state.runs.length));
    for (const m of MODALITIES) filter.setBadge(m.id, String(state.runs.filter((r) => r.type === m.id).length));
    const visible = state.runs.filter((r) => state.filter === 'all' || r.type === state.filter);
    const sorted = [...visible].sort((a, b) =>
      state.sort === 'fastest' ? a.seconds - b.seconds : state.sort === 'rated' ? (b.rating - a.rating) || (b.at - a.at) : b.at - a.at);

    const secs = visible.map((r) => r.seconds).sort((a, b) => a - b);
    const rated = visible.filter((r) => r.rating > 0);
    const byModel = new Map();
    for (const r of visible) {
      const g = byModel.get(r.name) || { name: r.name, type: r.type, total: 0, n: 0, stars: 0, rated: 0 };
      g.total += r.seconds; g.n++;
      if (r.rating) { g.stars += r.rating; g.rated++; }
      byModel.set(r.name, g);
    }
    const groups = [...byModel.values()].map((g) => ({ ...g, avg: g.total / g.n })).sort((a, b) => a.avg - b.avg);
    const best = [...groups].filter((g) => g.rated).sort((a, b) => b.stars / b.rated - a.stars / a.rated)[0];
    const tile = (label, value, sub, iconName) => h('div.tile', h('span.tile-icon', icon(iconName, 16)), h('div', h('span.tile-label', label), h('span.tile-value', value), h('span.tile-sub', sub)));
    clear(tiles,
      tile('Runs', String(visible.length), visible.length ? `across ${groups.length} model${groups.length === 1 ? '' : 's'}` : 'none recorded yet', 'FlaskConical'),
      tile('Median generation', secs.length ? formatSeconds(secs[Math.floor((secs.length - 1) / 2)]) : '—', secs.length ? `fastest ${formatSeconds(secs[0])}` : 'run something to measure', 'Timer'),
      tile('Average rating', rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : '—', rated.length ? `${rated.length} of ${visible.length} rated` : 'no ratings yet', 'Star'),
      tile('Top rated model', best ? best.name : '—', best ? `${(best.stars / best.rated).toFixed(1)} average` : 'rate a few runs', 'Trophy'));

    const maxAvg = Math.max(...groups.map((g) => g.avg), 0.001);
    clear(chart, groups.length
      ? groups.map((g) => h('div.bar-row',
        h('div.bar-label', icon(modality(g.type)?.icon || 'Circle', 13), h('span', g.name)),
        h('div.bar-track', h('div.bar-fill', { style: { width: `${Math.max(2, (g.avg / maxAvg) * 100)}%` } })),
        h('span.bar-value', formatSeconds(g.avg)),
        h('span.bar-n', `${g.n} run${g.n === 1 ? '' : 's'}`)))
      : h('p.chart-empty', 'A bar per model appears here once you have runs to compare.'));

    const maxByType = {};
    for (const r of visible) maxByType[r.type] = Math.max(maxByType[r.type] || 0, r.seconds);
    clear(list, sorted.length
      ? sorted.map((r) => {
        const m = modality(r.type);
        const stars = Rating({ value: r.rating, onChange: (n) => { r.rating = n; saveRuns(); emit('runs'); } });
        return h('li.run',
          r.thumb ? h('img.run-thumb', { src: r.thumb, alt: '' }) : h('span.run-thumb', icon(m?.icon || 'Circle', 16)),
          h('div.run-main',
            h('div.run-title', h('strong', r.name), r.backend && h('span.run-backend', BACKEND_LABEL[r.backend] || r.backend)),
            h('p.run-prompt', r.prompt || `${m?.label || r.type} run`)),
          h('div.run-time', h('span', formatSeconds(r.seconds)), h('div.mini-track', h('div.mini-fill', { style: { width: `${Math.max(4, (r.seconds / maxByType[r.type]) * 100)}%` } }))),
          stars.el,
          h('span.run-when', { 'data-tip': new Date(r.at).toLocaleString() }, timeAgo(r.at)),
          h('div.run-actions',
            r.prompt && h('button.icon-button.small', { type: 'button', 'aria-label': 'Reuse this prompt and model', 'data-tip': 'Reuse setup', onclick: () => onReuse(r) }, icon('CornerUpLeft', 14)),
            h('button.icon-button.small', { type: 'button', 'aria-label': 'Delete run', 'data-tip': 'Delete', onclick: () => remove(r) }, icon('X', 14))));
      })
      : h('li.run-empty', icon('History', 20), h('strong', state.runs.length ? 'No runs in this filter' : 'No runs yet'),
        h('span', state.runs.length ? 'Switch the filter to see the rest.' : 'Each successful run lands here with its timing, ready to rate.')));
  }
  subscribe((t) => { if (t.has('runs')) paint(); });
  paint();
  return { el, clearAll, exportRuns };
}

/* ---------- app ---------- */
function thumbnail(blob) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 72;
      c.getContext('2d').drawImage(img, 0, 0, 72, 72);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

async function checkDevice() {
  let webgpu = false, f16 = false;
  try {
    const adapter = navigator.gpu && (await navigator.gpu.requestAdapter());
    webgpu = !!adapter;
    f16 = !!adapter?.features.has('shader-f16');
  } catch { /* stays CPU only */ }
  state.device = { webgpu, f16, checked: true };
  emit('device');
}

export function mountApp(root) {
  applyTheme();
  let composer, stage, history;
  const constrained = isConstrainedDevice();
  const heavyOk = new Set();
  const openStorage = () => openStorageDialog({ isBusy: () => state.run.status === 'running' });

  async function run() {
    const model = currentModel();
    if (state.run.status === 'running') {
      if (requestStop() === 'graceful') toast('Stopping after the current token');
      return;
    }
    const isAudio = modality(model.type).input === 'audio';
    const prompt = isAudio ? composer.getAudio() : composer.getPrompt();
    if (!prompt) { composer.flag(); toast(isAudio ? 'Record or choose some audio first' : 'Add a prompt first', { kind: 'error' }); return; }
    const missing = missingRequirement(model);
    if (missing) { toast(missing, { kind: 'error', duration: 5000 }); return; }
    const backend = resolveBackend(model);
    const params = { ...currentParams() };
    if (constrained && model.bytes >= HEAVY_BYTES && !heavyOk.has(model.id)) {
      const ok = await confirmDialog({
        title: 'This is a large model', confirmLabel: 'Run anyway',
        message: `${model.name} downloads ${sizeFor(model, backend).replace('~', 'about ')} and needs a lot of memory. On phones and low-memory devices the tab may reload or crash.`,
      });
      if (!ok) return;
      heavyOk.add(model.id);
    }
    state.run = { status: 'running' };
    emit('run');
    const hooks = stage.begin(model, backend, params);
    try {
      const result = await runModel(model, prompt, params, backend, hooks);
      const record = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(),
        modelId: model.id, name: `${model.name} ${model.variant}`, type: model.type, size: sizeFor(model, backend),
        seconds: result.seconds, rating: 0, backend: result.backend || backend,
        prompt: isAudio ? `${prompt.label} · ${prompt.duration.toFixed(1)} s` : prompt.slice(0, 280), params: { ...params, ...(result.seed != null ? { seed: result.seed } : {}) },
      };
      if (result.kind === 'image' || result.frameBlob) record.thumb = await thumbnail(result.frameBlob || result.blob);
      stage.finish(model, result, record, hooks);
      addRun(record);
      state.run = { status: 'done' };
    } catch (error) {
      if (error?.name === 'AbortError') {
        stage.reset();
        state.run = { status: 'idle' };
        toast('Run stopped. Loaded models were released from memory.');
        return;
      }
      console.error(error);
      stage.fail(model, backend, error);
      state.run = { status: 'error' };
      toast('Run failed — details are in the output panel', { kind: 'error' });
    } finally {
      emit('run');
    }
  }

  function reuse(r) {
    if (state.run.status === 'running') return toast('Wait for the current run to finish');
    const model = MODELS.find((m) => m.id === r.modelId) || MODELS.find((m) => `${m.name} ${m.variant}` === r.name);
    if (!model) return toast('That model is no longer in the library', { kind: 'error' });
    state.type = model.type;
    state.model[model.type] = model.id;
    state.prompts[model.type] = r.prompt;
    if (r.params) Object.assign(state.params[model.id], Object.fromEntries(Object.entries(r.params).filter(([k]) => k in state.params[model.id])));
    saveSettings();
    emit('type', 'prompt');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Setup restored from that run', { kind: 'success' });
  }

  const palette = CommandPalette(() => {
    const busy = state.run.status === 'running';
    const setTheme = (v) => () => { state.theme = v; applyTheme(); saveSettings(); emit('theme'); };
    return [
      { group: 'Run', label: busy ? 'Stop generation' : modality(state.type).verb, icon: busy ? 'Square' : 'Play', hint: `${MOD} ↵`, run },
      { group: 'Run', label: 'Edit prompt', icon: 'PenLine', hint: '/', run: () => composer.focus() },
      ...(busy ? [] : MODALITIES.map((m) => ({ group: 'Modality', label: `Switch to ${m.label}`, icon: m.icon, run: () => { state.type = m.id; saveSettings(); emit('type'); } }))),
      ...(busy ? [] : MODELS.map((m) => ({
        group: 'Model', label: `${m.name} ${m.variant}`, icon: modality(m.type).icon, keywords: `${m.type} ${LICENSES[m.license].name}`,
        run: () => { state.type = m.type; state.model[m.type] = m.id; saveSettings(); emit('type'); },
      }))),
      { group: 'Appearance', label: 'Dark theme', icon: 'Moon', run: setTheme('dark') },
      { group: 'Appearance', label: 'Light theme', icon: 'Sun', run: setTheme('light') },
      { group: 'Appearance', label: 'Match system theme', icon: 'Monitor', run: setTheme('system') },
      ...ACCENTS.map(([id, name]) => ({ group: 'Appearance', label: `${name} accent`, icon: 'Palette', keywords: 'color', run: () => { state.accent = id; applyTheme(); saveSettings(); emit('theme'); } })),
      { group: 'History', label: 'Export runs as JSON', icon: 'Download', run: () => history.exportRuns() },
      { group: 'History', label: 'Clear run history', icon: 'Trash2', run: () => history.clearAll() },
      { group: 'App', label: 'Storage and downloads', icon: 'HardDrive', keywords: 'cache delete models memory', run: openStorage },
      { group: 'App', label: 'View source on GitHub', icon: 'CodeXml', keywords: 'repo repository code', run: () => window.open(REPO_URL, '_blank', 'noopener') },
      { group: 'App', label: 'About and licenses', icon: 'Info', keywords: 'license credits', run: openAboutDialog },
    ];
  });

  composer = Composer({ onRun: run, onStorage: openStorage });
  stage = Stage({
    onRun: run, onFocusPrompt: () => composer.focus(),
    onTranscribe: async (blob) => {
      state.type = 'stt';
      saveSettings();
      emit('type');
      await composer.loadAudio(blob, 'Speech result');
      toast('Audio loaded — pick a model and transcribe', { kind: 'success' });
    },
  });
  history = History({ onReuse: reuse });

  clear(root,
    h('div.shell', { id: 'top' },
      Header({ onPalette: palette.open, onStorage: openStorage }),
      !state.storageNoticeDismissed && h('div.notice.notice-info', { role: 'note' },
        icon('HardDrive', 18),
        h('span', h('strong', 'Where do the models go? '), 'Each model downloads once and is saved inside this browser\'s own storage for this site — not in your Downloads folder, and other sites can\'t read it. You can see the space used and delete everything at any time.'),
        h('button.button.ghost.small', { type: 'button', onclick: openStorage }, 'Manage storage'),
        h('button.icon-button.small', { type: 'button', 'aria-label': 'Dismiss', onclick: (e) => { state.storageNoticeDismissed = true; saveSettings(); e.currentTarget.parentElement.remove(); } }, icon('X', 14))),
      constrained && !state.noticeDismissed && h('div.notice', { role: 'note' },
        icon('Smartphone', 16),
        h('span', 'On phones and low-memory devices, stick to Text and Transcribe. Image, video and the larger speech model can exhaust memory and reload the tab.'),
        h('button.icon-button.small', { type: 'button', 'aria-label': 'Dismiss', onclick: (e) => { state.noticeDismissed = true; saveSettings(); e.currentTarget.parentElement.remove(); } }, icon('X', 14))),
      h('main.workspace', composer.el, stage.el),
      history.el,
      h('footer.footer',
        h('span', 'Nano Lab · small models, run locally in your browser · ', h('a.footer-link', { href: REPO_URL, target: '_blank', rel: 'noreferrer' }, 'Source on GitHub')),
        h('span.footer-keys', Kbd(MOD, 'K'), 'actions', Kbd(MOD, '↵'), 'run', Kbd('/'), 'prompt'))));

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.open(); }
    else if (mod && e.key === 'Enter') { e.preventDefault(); if (!document.querySelector('dialog[open]')) run(); }
    else if (e.key === '/' && !mod && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      composer.focus();
    }
  });
  checkDevice();
}
