import { h, icon, clear, clamp, formatClock } from './dom.js';
import { openDialog, toast } from './components.js';

const cssVar = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

/* ---------- Audio player with a real waveform ---------- */
export function AudioPlayer({ url, samples, sampleRate, filename }) {
  const audio = h('audio', { src: url, preload: 'auto' });
  const canvas = h('canvas.wave-canvas');
  const wave = h('div.wave', { role: 'slider', tabIndex: 0, 'aria-label': 'Seek', 'aria-valuemin': 0 }, canvas);
  const playBtn = h('button.play-button', { type: 'button', 'aria-label': 'Play' }, icon('Play', 20));
  const time = h('span.player-time', '0:00.0');
  const rates = [1, 1.25, 1.5, 0.75];
  const rateBtn = h('button.button.ghost.small', { type: 'button', 'data-tip': 'Playback speed' }, '1×');
  const duration = samples.length / sampleRate;
  wave.setAttribute('aria-valuemax', duration.toFixed(1));

  const el = h('div.player.audio-player',
    audio,
    h('div.audio-main', playBtn, wave),
    h('div.player-bar',
      time,
      h('span.player-meta', `${(sampleRate / 1000).toFixed(1)} kHz · mono`),
      h('span.spacer'),
      rateBtn,
      filename && h('a.button.ghost.small', { href: url, download: filename }, icon('Download', 14), 'WAV')));

  let peaks = [];
  function computePeaks(count) {
    const block = Math.max(1, Math.floor(samples.length / count));
    const out = new Float32Array(count);
    let max = 1e-4;
    for (let i = 0; i < count; i++) {
      let peak = 0;
      const start = i * block;
      for (let j = start; j < start + block && j < samples.length; j += 4) peak = Math.max(peak, Math.abs(samples[j]));
      out[i] = peak;
      if (peak > max) max = peak;
    }
    for (let i = 0; i < count; i++) out[i] /= max;
    return out;
  }
  function draw() {
    const w = wave.clientWidth, hgt = wave.clientHeight;
    if (!w || !hgt) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
      peaks = computePeaks(Math.max(24, Math.floor(w / 4)));
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    const played = (audio.currentTime / (audio.duration || duration)) * peaks.length;
    const on = cssVar(el, '--accent'), off = cssVar(el, '--border-strong');
    const step = w / peaks.length, bar = Math.max(1.5, step - 1.5);
    for (let i = 0; i < peaks.length; i++) {
      const bh = Math.max(2, peaks[i] * (hgt - 8));
      g.fillStyle = i < played ? on : off;
      g.beginPath();
      g.roundRect(i * step, (hgt - bh) / 2, bar, bh, bar / 2);
      g.fill();
    }
  }
  let raf = 0;
  function loop() {
    draw();
    time.textContent = `${formatClock(audio.currentTime)} / ${formatClock(audio.duration || duration)}`;
    wave.setAttribute('aria-valuenow', audio.currentTime.toFixed(1));
    if (!audio.paused) raf = requestAnimationFrame(loop);
  }
  function setPlaying(playing) {
    clear(playBtn, icon(playing ? 'Pause' : 'Play', 20));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    cancelAnimationFrame(raf);
    loop();
  }
  const toggle = () => (audio.paused ? audio.play() : audio.pause());
  playBtn.addEventListener('click', toggle);
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => setPlaying(false));
  audio.addEventListener('loadedmetadata', loop);

  const seekTo = (clientX) => {
    const r = wave.getBoundingClientRect();
    audio.currentTime = clamp((clientX - r.left) / r.width, 0, 1) * (audio.duration || duration);
    loop();
  };
  wave.addEventListener('pointerdown', (e) => {
    wave.setPointerCapture(e.pointerId);
    seekTo(e.clientX);
    const move = (ev) => seekTo(ev.clientX);
    wave.addEventListener('pointermove', move);
    wave.addEventListener('pointerup', () => wave.removeEventListener('pointermove', move), { once: true });
  });
  wave.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') { audio.currentTime = Math.min(duration, audio.currentTime + 0.5); loop(); }
    else if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 0.5); loop(); }
  });
  rateBtn.addEventListener('click', () => {
    const next = rates[(rates.indexOf(audio.playbackRate) + 1) % rates.length];
    audio.playbackRate = next;
    rateBtn.textContent = `${next}×`;
  });
  new ResizeObserver(draw).observe(wave);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
  return { el };
}

/* ---------- Video player with frame stepping ---------- */
export function VideoPlayer({ url, fps = 8, frames = 0, filename, caption }) {
  const video = h('video.video-el', { src: url, loop: true, muted: true, playsInline: true, autoplay: true });
  const playBtn = h('button.icon-button', { type: 'button', 'aria-label': 'Pause' }, icon('Pause', 16));
  const loopBtn = h('button.icon-button.is-on', { type: 'button', 'aria-pressed': 'true', 'aria-label': 'Loop', 'data-tip': 'Loop' }, icon('Repeat', 16));
  const prev = h('button.icon-button', { type: 'button', 'aria-label': 'Previous frame', 'data-tip': 'Previous frame' }, icon('StepBack', 16));
  const next = h('button.icon-button', { type: 'button', 'aria-label': 'Next frame', 'data-tip': 'Next frame' }, icon('StepForward', 16));
  const full = h('button.icon-button', { type: 'button', 'aria-label': 'Fullscreen', 'data-tip': 'Fullscreen' }, icon('Maximize', 16));
  const scrub = h('input.scrub', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Seek' });
  const label = h('span.player-time');
  const frameWrap = h('div.video-frame', video, caption && h('span.video-caption', caption));

  const el = h('div.player.video-player',
    frameWrap,
    h('div.scrub-row', scrub),
    h('div.player-bar', playBtn, prev, next, label, h('span.spacer'), loopBtn, full,
      h('a.button.ghost.small', { href: url, download: filename }, icon('Download', 14), 'WebM')));

  const dur = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : frames / fps || 1);
  let raf = 0;
  function tick() {
    const d = dur();
    scrub.value = Math.round((video.currentTime / d) * 1000);
    scrub.style.setProperty('--fill', `${(video.currentTime / d) * 100}%`);
    const total = frames || Math.round(d * fps);
    const frame = clamp(Math.floor(video.currentTime * fps) + 1, 1, total);
    label.textContent = `Frame ${frame} / ${total} · ${fps} fps`;
    if (!video.paused) raf = requestAnimationFrame(tick);
  }
  function setPlaying(playing) {
    clear(playBtn, icon(playing ? 'Pause' : 'Play', 16));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    cancelAnimationFrame(raf);
    tick();
  }
  const toggle = () => (video.paused ? video.play() : video.pause());
  const stepFrame = (dir) => {
    video.pause();
    video.currentTime = clamp(video.currentTime + dir / fps, 0, dur() - 0.001);
    tick();
  };
  playBtn.addEventListener('click', toggle);
  video.addEventListener('click', toggle);
  video.addEventListener('play', () => setPlaying(true));
  video.addEventListener('pause', () => setPlaying(false));
  video.addEventListener('seeked', tick);
  video.addEventListener('loadedmetadata', tick);
  prev.addEventListener('click', () => stepFrame(-1));
  next.addEventListener('click', () => stepFrame(1));
  loopBtn.addEventListener('click', () => {
    video.loop = !video.loop;
    loopBtn.classList.toggle('is-on', video.loop);
    loopBtn.setAttribute('aria-pressed', video.loop);
  });
  full.addEventListener('click', () => frameWrap.requestFullscreen?.());
  scrub.addEventListener('input', () => { video.pause(); video.currentTime = (scrub.value / 1000) * dur(); tick(); });
  el.addEventListener('keydown', (e) => {
    if (e.target === scrub) return;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') stepFrame(1);
    else if (e.key === 'ArrowLeft') stepFrame(-1);
  });
  return { el };
}

/* ---------- Image viewer with lightbox ---------- */
export function ImageViewer({ url, alt, filename, size = 512 }) {
  const img = h('img.image-el', { src: url, alt, width: size, height: size });
  const open = () => openDialog({ className: 'lightbox', body: h('img', { src: url, alt }) });
  async function copy() {
    try {
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast('Image copied to clipboard', { kind: 'success' });
    } catch {
      toast('Could not copy the image in this browser', { kind: 'error' });
    }
  }
  const el = h('div.player.image-player',
    h('button.image-frame', { type: 'button', 'aria-label': 'Open full size', onclick: open }, img,
      h('span.image-zoom', icon('Maximize2', 14), 'View full size')),
    h('div.player-bar',
      h('span.player-meta', `${size} × ${size} · PNG`),
      h('span.spacer'),
      h('button.button.ghost.small', { type: 'button', onclick: copy }, icon('Copy', 14), 'Copy'),
      h('a.button.ghost.small', { href: url, download: filename }, icon('Download', 14), 'PNG')));
  return { el };
}

/* ---------- Streaming text output ---------- */
export function TextOutput() {
  const body = h('div.text-body');
  const caret = h('span.text-caret', { 'aria-hidden': 'true' });
  const count = h('span.player-meta');
  const copyBtn = h('button.button.ghost.small', { type: 'button' }, icon('Copy', 14), 'Copy');
  const el = h('div.player.text-player', h('div.text-scroll', body), h('div.player-bar', count, h('span.spacer'), copyBtn));
  let text = '';
  function paint(streaming) {
    clear(body, text, streaming && caret);
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    count.textContent = `${words} word${words === 1 ? '' : 's'} · ${text.length} characters`;
    if (streaming) body.parentElement.scrollTop = body.parentElement.scrollHeight;
  }
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Text copied to clipboard', { kind: 'success' });
    } catch {
      toast('Could not access the clipboard', { kind: 'error' });
    }
  });
  paint(true);
  return {
    el,
    append: (chunk) => { text += chunk; paint(true); },
    finish: (final) => { if (final != null) text = final; paint(false); },
    get text() { return text; },
  };
}
