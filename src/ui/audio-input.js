import { h, icon, clear, formatClock } from './dom.js';
import { toast } from './components.js';
import { AudioPlayer } from './players.js';

export const STT_RATE = 16000;
const MAX_RECORD_SECONDS = 120;

/** Any audio Blob -> mono Float32Array at 16 kHz (what the speech-to-text models expect). */
export async function decodeTo16k(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ sampleRate: STT_RATE });
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const out = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) out[i] += data[i] / buffer.numberOfChannels;
    }
    return out;
  } finally {
    ctx.close();
  }
}

/** Record from the microphone, pick a file, or drop one. Holds a single clip. */
export function AudioInput({ onChange }) {
  const el = h('div.audio-input');
  const fileInput = h('input', { type: 'file', accept: 'audio/*,video/webm,video/mp4', hidden: true });
  let clip = null; // { samples, url, label, duration }
  let disabled = false;
  let recorder = null;

  function setClip(next) {
    if (clip?.url) URL.revokeObjectURL(clip.url);
    clip = next;
    paint();
    onChange?.(clip);
  }

  async function load(blob, label) {
    paintBusy('Decoding audio…');
    try {
      const samples = await decodeTo16k(blob);
      if (samples.length < STT_RATE * 0.2) throw new Error('too short');
      setClip({ samples, url: URL.createObjectURL(blob), label, duration: samples.length / STT_RATE });
    } catch {
      toast('Could not read that as audio', { kind: 'error' });
      paint();
    }
  }

  async function startRecording() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast('Microphone access was blocked or is unavailable', { kind: 'error' });
      return;
    }
    const chunks = [];
    const media = new MediaRecorder(stream);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const level = new Uint8Array(analyser.frequencyBinCount);
    const bars = Array.from({ length: 28 }, () => h('i'));
    const time = h('span.rec-time', '0:00.0');
    const started = performance.now();
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(level);
      let peak = 0;
      for (const v of level) peak = Math.max(peak, Math.abs(v - 128) / 128);
      bars.push(bars.shift());
      bars.at(-1).style.height = `${Math.max(8, Math.min(100, peak * 160))}%`;
      meter.replaceChildren(...bars);
      const seconds = (performance.now() - started) / 1000;
      time.textContent = formatClock(seconds);
      if (seconds >= MAX_RECORD_SECONDS) media.stop();
      else raf = requestAnimationFrame(tick);
    };
    const meter = h('div.rec-meter', { 'aria-hidden': 'true' }, bars);
    media.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    media.onstop = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      recorder = null;
      load(new Blob(chunks, { type: media.mimeType }), 'Microphone recording');
    };
    recorder = media;
    clear(el, h('div.rec',
      h('button.rec-stop', { type: 'button', 'aria-label': 'Stop recording', onclick: () => media.stop() }, icon('Square', 16)),
      h('div.rec-body', h('div.rec-head', h('span.rec-dot'), 'Recording', time), meter)));
    media.start();
    tick();
  }

  function paintBusy(text) {
    clear(el, h('div.audio-drop.is-busy', h('span.spinner'), h('span', text)));
  }

  function paint() {
    if (recorder) return;
    if (clip) {
      const player = AudioPlayer({ url: clip.url, samples: clip.samples, sampleRate: STT_RATE });
      clear(el, fileInput,
        h('div.clip-head',
          icon('FileAudio', 15), h('span.clip-name', clip.label), h('span.clip-meta', `${clip.duration.toFixed(1)} s`), h('span.spacer'),
          h('button.icon-button.small', { type: 'button', disabled, 'aria-label': 'Remove audio', 'data-tip': 'Remove', onclick: () => setClip(null) }, icon('Trash2', 14))),
        player.el);
      return;
    }
    const drop = h('div.audio-drop',
      h('div.audio-drop-icon', icon('AudioLines', 22)),
      h('strong', 'Add audio to transcribe'),
      h('span', 'Record from your microphone, or drop an audio file here.'),
      h('div.audio-drop-actions',
        h('button.button.primary.small', { type: 'button', disabled, onclick: startRecording }, icon('Mic', 14), 'Record'),
        h('button.button.ghost.small', { type: 'button', disabled, onclick: () => fileInput.click() }, icon('Upload', 14), 'Choose file')));
    clear(el, fileInput, drop);
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (file) load(file, file.name);
  });
  el.addEventListener('dragover', (e) => { if (!disabled && !recorder) { e.preventDefault(); el.classList.add('is-over'); } });
  el.addEventListener('dragleave', () => el.classList.remove('is-over'));
  el.addEventListener('drop', (e) => {
    el.classList.remove('is-over');
    if (disabled || recorder) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) load(file, file.name);
  });

  paint();
  return {
    el,
    get: () => clip,
    load,
    setDisabled(d) { if (d === disabled) return; disabled = d; paint(); },
  };
}
