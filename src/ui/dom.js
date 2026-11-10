import {
  createElement,
  Type, AudioLines, Image, Clapperboard, ChevronsUpDown, Check, Dices, Lock, LockOpen, Star, Info, CircleCheck, CircleAlert, X, Search, ArrowRight, Play, Pause, Download, Repeat, StepBack, StepForward, Maximize, Maximize2, Copy, TriangleAlert, Scale, Monitor, Sun, Moon, Palette, RotateCcw, Mic, HardDriveDownload, Cpu, ArrowUpRight, Square, Zap, RefreshCw, ArrowDownUp, Trash2, FlaskConical, Timer, Trophy, Circle, CornerUpLeft, History, PenLine, Upload, Languages, FileAudio, Captions, HardDrive, Smartphone, CodeXml,
} from 'lucide';

const ICONS = {
  Type, AudioLines, Image, Clapperboard, ChevronsUpDown, Check, Dices, Lock, LockOpen, Star, Info, CircleCheck, CircleAlert, X, Search, ArrowRight, Play, Pause, Download, Repeat, StepBack, StepForward, Maximize, Maximize2, Copy, TriangleAlert, Scale, Monitor, Sun, Moon, Palette, RotateCcw, Mic, HardDriveDownload, Cpu, ArrowUpRight, Square, Zap, RefreshCw, ArrowDownUp, Trash2, FlaskConical, Timer, Trophy, Circle, CornerUpLeft, History, PenLine, Upload, Languages, FileAudio, Captions, HardDrive, Smartphone, CodeXml,
};

/** Tiny hyperscript helper: h('button.primary', {onclick}, 'Run') */
export function h(spec, props, ...children) {
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props && (props instanceof Node || typeof props !== 'object' || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = [el.className, value].filter(Boolean).join(' ');
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el && !key.startsWith('aria') && key !== 'list' && key !== 'role') {
      try { el[key] = value; } catch { el.setAttribute(key, value); }
    } else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

/** Lucide icon by PascalCase name, e.g. icon('Play', 16) */
export function icon(name, size = 16, extraClass = '') {
  const node = ICONS[name] || Circle;
  if (!ICONS[name]) console.warn(`Unknown icon: ${name}`);
  const svg = createElement(node);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  if (extraClass) svg.classList.add(extraClass);
  return svg;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function formatSeconds(s) {
  if (s == null || Number.isNaN(s)) return '—';
  if (s < 10) return `${s.toFixed(2)} s`;
  if (s < 100) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

export function formatClock(s) {
  if (!Number.isFinite(s)) s = 0;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

export function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 45) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 86400 * 7) return `${Math.round(d / 86400)} d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

let uid = 0;
export const nextId = (prefix = 'id') => `${prefix}-${++uid}`;
