import { h, icon, clear, append, clamp, nextId } from './dom.js';

/* ---------- Segmented control (tabs with a sliding thumb) ---------- */
export function Segmented({ options, value, onChange, label, size = 'md', iconOnly = false }) {
  const thumb = h('span.seg-thumb', { 'aria-hidden': 'true' });
  const buttons = options.map((o) =>
    h('button.seg-item', {
      type: 'button', role: 'radio', dataset: { value: o.value },
      'aria-label': iconOnly ? o.label : null, 'data-tip': iconOnly ? o.label : null,
      onclick: () => select(o.value, true),
    }, o.icon && icon(o.icon, size === 'sm' ? 14 : 16), !iconOnly && h('span', o.label), o.badge != null && h('span.seg-badge', o.badge)));
  const el = h(`div.seg.seg-${size}`, { role: 'radiogroup', 'aria-label': label }, thumb, buttons);
  let current = value;

  function place() {
    const active = buttons.find((b) => b.dataset.value === current);
    if (!active || !active.offsetWidth) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  }
  function paint() {
    for (const b of buttons) {
      const on = b.dataset.value === current;
      b.setAttribute('aria-checked', on);
      b.tabIndex = on ? 0 : -1;
    }
    place();
  }
  function select(v, user) {
    if (el.classList.contains('is-disabled')) return;
    if (v === current) return;
    current = v;
    paint();
    if (user) onChange?.(v);
  }
  el.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === current);
    const next = options[(i + dir + options.length) % options.length].value;
    select(next, true);
    buttons.find((b) => b.dataset.value === next)?.focus();
  });
  new ResizeObserver(place).observe(el);
  document.fonts?.ready.then(place);
  paint();
  return {
    el,
    set: (v) => select(v, false),
    setDisabled: (d) => el.classList.toggle('is-disabled', d),
    setBadge(v, text) {
      const b = buttons.find((x) => x.dataset.value === v)?.querySelector('.seg-badge');
      if (b) { b.textContent = text; place(); }
    },
  };
}

/* ---------- Slider ---------- */
export function Slider({ label, min, max, step, value, format = (v) => String(v), onChange, hint }) {
  const id = nextId('slider');
  const out = h('output.slider-value', { htmlFor: id });
  const input = h('input.slider-input', { id, type: 'range', min, max, step, value });
  const el = h('div.field.slider',
    h('div.field-row', h('label.field-label', { htmlFor: id }, label), out),
    h('div.slider-track', input),
    hint && h('p.field-hint', hint));
  function paint() {
    const v = Number(input.value);
    out.textContent = format(v);
    input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
  }
  input.addEventListener('input', () => { paint(); onChange?.(Number(input.value)); });
  paint();
  return { el, set: (v) => { input.value = v; paint(); }, setDisabled: (d) => { input.disabled = d; } };
}

/* ---------- Popover (anchored, closes on outside click / Escape) ---------- */
export function Popover({ anchor, content, align = 'start', className = '' }) {
  const panel = h(`div.popover ${className}`, { role: 'dialog', hidden: true }, content);
  const wrap = h('div.popover-wrap', anchor, panel);
  panel.dataset.align = align;
  let open = false;
  const onDoc = (e) => { if (!wrap.contains(e.target)) toggle(false); };
  const onKey = (e) => { if (e.key === 'Escape') { toggle(false); anchor.focus(); } };
  function toggle(next = !open) {
    if (next === open) return;
    open = next;
    panel.hidden = !open;
    anchor.setAttribute('aria-expanded', open);
    if (open) {
      panel.classList.remove('flip');
      const r = panel.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8 && r.height < wrap.getBoundingClientRect().top) panel.classList.add('flip');
      setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
      document.addEventListener('keydown', onKey);
    } else {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    }
  }
  anchor.setAttribute('aria-haspopup', 'true');
  anchor.setAttribute('aria-expanded', 'false');
  anchor.addEventListener('click', () => toggle());
  return { el: wrap, panel, toggle, close: () => toggle(false), isOpen: () => open };
}

/* ---------- Select (custom listbox) ---------- */
export function Select({ label, options, value, onChange, compact = false, iconName }) {
  const id = nextId('select');
  let current = value;
  let active = 0;
  const valueEl = h('span.select-value');
  const button = h('button.select-button', { type: 'button', id, role: 'combobox', 'aria-label': compact ? label : null },
    iconName && icon(iconName, 14), valueEl, icon('ChevronsUpDown', 14, 'select-caret'));
  const list = h('ul.select-list', { role: 'listbox', tabIndex: -1 });
  const pop = Popover({ anchor: button, content: list, className: 'select-popover', align: compact ? 'end' : 'stretch' });
  const el = compact
    ? h('div.select.select-compact', pop.el)
    : h('div.field.select', h('label.field-label', { htmlFor: id }, label), pop.el);

  function paint() {
    const chosen = options.find((o) => o.value === current) || options[0];
    clear(valueEl, chosen.label);
    clear(list, options.map((o, i) =>
      h('li.select-option', {
        role: 'option', 'aria-selected': o.value === current, class: i === active ? 'is-active' : '',
        onpointerenter: () => { active = i; mark(); },
        onclick: () => choose(o.value),
      }, h('span', o.label), o.hint && h('span.select-hint', o.hint), o.value === current && icon('Check', 14))));
  }
  function mark() {
    [...list.children].forEach((li, i) => li.classList.toggle('is-active', i === active));
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  }
  function choose(v) {
    current = v;
    pop.close();
    paint();
    button.focus();
    onChange?.(v);
  }
  button.addEventListener('click', () => {
    active = Math.max(0, options.findIndex((o) => o.value === current));
    paint();
  });
  el.addEventListener('keydown', (e) => {
    if (!pop.isOpen()) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); button.click(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % options.length; mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + options.length) % options.length; mark(); }
    else if (e.key === 'Home') { e.preventDefault(); active = 0; mark(); }
    else if (e.key === 'End') { e.preventDefault(); active = options.length - 1; mark(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[active].value); }
    else if (e.key === 'Tab') pop.close();
  });
  paint();
  return { el, set: (v) => { current = v; paint(); }, setDisabled: (d) => { button.disabled = d; } };
}

/* ---------- Seed control: number + shuffle + lock ---------- */
export function SeedInput({ label, value, onChange }) {
  const id = nextId('seed');
  let locked = value != null;
  const input = h('input.seed-input', {
    id, type: 'text', inputMode: 'numeric', placeholder: 'Random each run', autocomplete: 'off',
    value: value ?? '',
  });
  const lock = h('button.icon-button', { type: 'button' });
  const dice = h('button.icon-button', { type: 'button', 'data-tip': 'New random seed', 'aria-label': 'New random seed' }, icon('Dices', 15));
  const el = h('div.field.seed',
    h('label.field-label', { htmlFor: id }, label),
    h('div.seed-row', input, dice, lock));
  function paint() {
    clear(lock, icon(locked ? 'Lock' : 'LockOpen', 15));
    lock.setAttribute('aria-pressed', locked);
    lock.setAttribute('aria-label', locked ? 'Seed is fixed' : 'Seed changes every run');
    lock.dataset.tip = locked ? 'Fixed: runs are repeatable' : 'Random every run';
    lock.classList.toggle('is-on', locked);
    input.classList.toggle('is-muted', !locked);
  }
  function commit() {
    const n = parseInt(input.value.replace(/\D/g, ''), 10);
    if (Number.isFinite(n)) { input.value = String(n >>> 0); locked = true; onChange?.(n >>> 0); }
    else { input.value = ''; locked = false; onChange?.(null); }
    paint();
  }
  input.addEventListener('change', commit);
  dice.addEventListener('click', () => { input.value = String(randomSeed()); commit(); });
  lock.addEventListener('click', () => {
    if (locked) { input.value = ''; commit(); } else { input.value = String(randomSeed()); commit(); }
  });
  paint();
  return {
    el,
    set: (v) => { input.value = v ?? ''; locked = v != null; paint(); },
    setDisabled: (d) => { input.disabled = dice.disabled = lock.disabled = d; },
  };
}
export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/* ---------- Star rating ---------- */
export function Rating({ value = 0, onChange, label = 'Quality rating' }) {
  let current = value;
  const stars = [1, 2, 3, 4, 5].map((n) =>
    h('button.star', {
      type: 'button', role: 'radio', 'aria-label': `${n} of 5`,
      onclick: () => set(current === n ? 0 : n, true),
      onpointerenter: () => preview(n),
    }, icon('Star', 15)));
  const el = h('div.rating', { role: 'radiogroup', 'aria-label': label, onpointerleave: () => preview(0) }, stars);
  function preview(n) {
    stars.forEach((s, i) => s.classList.toggle('is-preview', n > 0 && i < n));
    el.classList.toggle('is-previewing', n > 0);
  }
  function paint() {
    stars.forEach((s, i) => {
      s.classList.toggle('is-on', i < current);
      s.setAttribute('aria-checked', i + 1 === current);
      s.tabIndex = (current ? i + 1 === current : i === 0) ? 0 : -1;
    });
  }
  function set(n, user) { current = n; paint(); if (user) onChange?.(n); }
  el.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    set(clamp(current + dir, 0, 5), true);
    stars[Math.max(0, current - 1)].focus();
  });
  paint();
  return { el, set: (n) => set(n, false) };
}

/* ---------- Toasts ---------- */
let toastHost;
export function toast(message, { kind = 'info', duration = 3200 } = {}) {
  if (!toastHost) {
    toastHost = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const names = { info: 'Info', success: 'CircleCheck', error: 'CircleAlert' };
  const el = h(`div.toast.toast-${kind}`, icon(names[kind] || 'Info', 16), h('span', message));
  toastHost.append(el);
  const close = () => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  setTimeout(close, duration);
  el.addEventListener('click', close);
}

/* ---------- Dialogs ---------- */
export function openDialog({ title, body, actions = [], className = '', onClose }) {
  const dialog = h(`dialog.dialog ${className}`);
  const close = (result) => { dialog.close(); dialog.remove(); onClose?.(result); };
  append(dialog, [
    title && h('header.dialog-head', h('h2', title),
      h('button.icon-button', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('X', 16))),
    h('div.dialog-body', body),
    actions.length > 0 && h('footer.dialog-actions', actions.map((a) =>
      h(`button.button.${a.kind || 'ghost'}`, { type: 'button', autofocus: a.autofocus, onclick: () => close(a.value) }, a.label)))]);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    openDialog({
      title, body: h('p', message), className: 'dialog-confirm',
      actions: [
        { label: 'Cancel', value: false, kind: 'ghost' },
        { label: confirmLabel, value: true, kind: danger ? 'danger' : 'primary', autofocus: true },
      ],
      onClose: (v) => resolve(!!v),
    });
  });
}

/* ---------- Command palette ---------- */
export function CommandPalette(getCommands) {
  let handle = null;
  function open() {
    if (handle) return;
    const commands = getCommands();
    let filtered = commands;
    let active = 0;
    const input = h('input.palette-input', { type: 'text', placeholder: 'Search actions, models, themes…', 'aria-label': 'Command', autocomplete: 'off', spellcheck: false });
    const list = h('ul.palette-list', { role: 'listbox' });
    const empty = h('p.palette-empty', 'No matching actions.');
    function paint() {
      let group = null;
      clear(list, filtered.flatMap((c, i) => {
        const row = h('li.palette-item', {
          role: 'option', 'aria-selected': i === active, class: i === active ? 'is-active' : '',
          onpointermove: () => { if (active !== i) { active = i; mark(); } },
          onclick: () => run(c),
        }, icon(c.icon || 'ArrowRight', 16), h('span.palette-label', c.label), c.hint && h('kbd', c.hint));
        const head = c.group !== group ? h('li.palette-group', { role: 'presentation' }, c.group) : null;
        group = c.group;
        return [head, row];
      }));
      empty.hidden = filtered.length > 0;
    }
    function mark() {
      const rows = list.querySelectorAll('.palette-item');
      rows.forEach((r, i) => { r.classList.toggle('is-active', i === active); r.setAttribute('aria-selected', i === active); });
      rows[active]?.scrollIntoView({ block: 'nearest' });
    }
    function run(c) { handle.close(); c.run(); }
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      filtered = q ? commands.filter((c) => `${c.group} ${c.label} ${c.keywords || ''}`.toLowerCase().includes(q)) : commands;
      active = 0;
      paint();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(filtered.length - 1, active + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
      else if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); run(filtered[active]); }
    });
    handle = openDialog({
      className: 'palette',
      body: [h('div.palette-search', icon('Search', 16), input, h('kbd', 'Esc')), list, empty],
      onClose: () => { handle = null; },
    });
    paint();
    input.focus();
  }
  return { open };
}

/* ---------- Small pieces ---------- */
export function Chip(text, { kind = '', iconName, tip, href } = {}) {
  const el = h(href ? 'a.chip' : 'span.chip', { class: kind ? `chip-${kind}` : '', 'data-tip': tip, href, target: href ? '_blank' : null, rel: href ? 'noreferrer' : null },
    iconName && icon(iconName, 12), text);
  return el;
}

export function Kbd(...keys) {
  return h('span.kbd-group', keys.map((k) => h('kbd', k)));
}
