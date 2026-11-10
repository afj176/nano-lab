import { h, icon, clear, formatBytes } from './dom.js';
import { openDialog, confirmDialog, toast, Chip } from './components.js';
import { MODELS, LICENSES, modality, modelUrl, REPO_URL } from '../models.js';
import { unloadModels, hasLoadedModels } from '../runners.js';

/* ---------- device class ---------- */
export function isConstrainedDevice() {
  const mobile = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return mobile || (navigator.deviceMemory != null && navigator.deviceMemory <= 4);
}
export const HEAVY_BYTES = 250e6;

/* ---------- storage ---------- */
const CACHE_LABELS = [
  [/^transformers-cache$/, 'Text, speech and transcription models'],
  [/^nano-lab-nanodiffuser/, 'Image model (NanoDiffuser)'],
  [/^drishya-tiny/, 'Video model (Drishya Tiny)'],
  [/^nano-lab-shell/, 'App files for offline use'],
];
const labelFor = (name) => CACHE_LABELS.find(([re]) => re.test(name))?.[1] || name;

async function cacheSize(name) {
  const cache = await caches.open(name);
  let bytes = 0, files = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response) continue;
    const declared = Number(response.headers.get('content-length'));
    bytes += declared > 0 ? declared : (await response.blob()).size;
    files++;
  }
  return { name, bytes, files };
}

export function openStorageDialog({ isBusy }) {
  const body = h('div.storage');
  async function paint() {
    clear(body, h('div.storage-loading', h('span.spinner'), 'Measuring downloads…'));
    let estimate = {}, entries = [];
    try {
      estimate = (await navigator.storage?.estimate?.()) || {};
      entries = await Promise.all((await caches.keys()).map(cacheSize));
    } catch {
      clear(body, h('p', 'This browser does not expose its cache storage here (private windows often block it).'));
      return;
    }
    entries.sort((a, b) => b.bytes - a.bytes);
    const total = entries.reduce((s, e) => s + e.bytes, 0);
    const used = estimate.usage ?? total;
    const pct = estimate.quota ? Math.min(100, (used / estimate.quota) * 100) : 0;

    const clearOne = async (entry) => {
      if (isBusy()) return toast('Wait for the current run to finish');
      const ok = await confirmDialog({
        title: `Delete ${labelFor(entry.name).toLowerCase()}?`, danger: true, confirmLabel: 'Delete',
        message: `This frees ${formatBytes(entry.bytes)}. The files download again the next time they are needed.`,
      });
      if (!ok) return;
      unloadModels();
      await caches.delete(entry.name);
      toast('Deleted', { kind: 'success' });
      paint();
    };
    const clearAll = async () => {
      if (isBusy()) return toast('Wait for the current run to finish');
      const ok = await confirmDialog({
        title: 'Delete all downloads?', danger: true, confirmLabel: 'Delete everything',
        message: `This frees about ${formatBytes(total)}. Every model downloads again on its next run. Your run history is kept.`,
      });
      if (!ok) return;
      unloadModels();
      for (const e of entries) await caches.delete(e.name);
      toast('All downloads deleted', { kind: 'success' });
      paint();
    };
    const unload = () => {
      if (!unloadModels()) return toast('Wait for the current run to finish');
      toast('Models released from memory', { kind: 'success' });
      paint();
    };

    clear(body,
      h('p.storage-intro', 'Models are saved in this browser\'s site storage (its Cache Storage, inside your browser profile) so they only download once. They are not in your Downloads folder, other websites can\'t read them, and deleting them here removes them from your disk.'),
      h('div.storage-total',
        h('div', h('span.storage-big', formatBytes(used) === '—' ? '0 MB' : formatBytes(used)),
          h('span.storage-of', estimate.quota ? ` of ${formatBytes(estimate.quota)} available to this site` : ' used by this site')),
        h('div.progress', h('div.progress-fill', { style: { width: `${Math.max(pct, used ? 1 : 0)}%` } }))),
      entries.length
        ? h('ul.storage-list', entries.map((e) => h('li',
          h('span.tile-icon', icon('HardDrive', 16)),
          h('div.storage-name', h('strong', labelFor(e.name)), h('span', `${e.files} file${e.files === 1 ? '' : 's'}`)),
          h('span.storage-size', formatBytes(e.bytes)),
          h('button.icon-button', { type: 'button', 'aria-label': `Delete ${labelFor(e.name)}`, onclick: () => clearOne(e) }, icon('Trash2', 15)))))
        : h('p.storage-empty', 'Nothing downloaded yet. Models are saved here the first time you run them.'),
      h('div.storage-actions',
        h('button.button.ghost.small', { type: 'button', disabled: !hasLoadedModels(), onclick: unload }, icon('Zap', 14), 'Release memory'),
        h('span.spacer'),
        entries.length > 0 && h('button.button.ghost.small', { type: 'button', onclick: clearAll }, icon('Trash2', 14), 'Delete all downloads')),
      h('p.field-hint', 'Clearing this site\'s data in your browser settings removes them too, and the browser may evict them on its own when disk space runs low.'));
  }
  openDialog({ title: 'Storage', body, className: 'dialog-wide' });
  paint();
}

/* ---------- about & licenses ---------- */
const LIBRARIES = [
  ['Transformers.js', 'Apache-2.0', 'https://github.com/huggingface/transformers.js'],
  ['ONNX Runtime Web', 'MIT', 'https://github.com/microsoft/onnxruntime'],
  ['Drishya browser runtime', 'Apache-2.0', 'https://github.com/udgamlabs/drishya-tiny'],
  ['webm-muxer', 'MIT', 'https://github.com/Vanilagy/webm-muxer'],
  ['Lucide icons', 'ISC', 'https://lucide.dev'],
  ['Geist typefaces', 'OFL-1.1', 'https://github.com/vercel/geist-font'],
];

export function openAboutDialog() {
  const kindChip = (key) => {
    const lic = LICENSES[key];
    return Chip(lic.name, { kind: { permissive: 'ok', conditions: 'neutral', noncommercial: 'warn' }[lic.kind] });
  };
  const hasNC = MODELS.some((m) => LICENSES[m.license].kind === 'noncommercial');
  openDialog({
    title: 'About Nano Lab', className: 'dialog-wide',
    body: h('div.about',
      h('p', 'Nano Lab runs small generative models entirely in your browser. Prompts, audio and outputs never leave this device; the only network traffic is downloading the app and the model files.'),
      h('p', 'The app is open source under the MIT license: ', h('a.text-link', { href: REPO_URL, target: '_blank', rel: 'noreferrer' }, 'github.com/afj176/nano-lab'), '.'),
      h('h3', 'Models'),
      h('ul.about-list', MODELS.map((m) => h('li',
        h('span.tile-icon', icon(modality(m.type).icon, 15)),
        h('div.about-name', h('strong', `${m.name} ${m.variant}`), h('span', LICENSES[m.license].note)),
        kindChip(m.license),
        h('a.icon-button', { href: modelUrl(m), target: '_blank', rel: 'noreferrer', 'aria-label': `${m.name} model card` }, icon('ArrowUpRight', 15))))),
      hasNC && h('p.inline-alert', icon('TriangleAlert', 15), h('span', 'Models marked CC BY-NC are for noncommercial use only, and so is anything you make with them. Generated first frames for video also carry NanoDiffuser\'s OpenRAIL++ terms.')),
      h('h3', 'Built with'),
      h('ul.about-libs', LIBRARIES.map(([name, license, url]) => h('li', h('a', { href: url, target: '_blank', rel: 'noreferrer' }, name), h('span', license))))),
  });
}
