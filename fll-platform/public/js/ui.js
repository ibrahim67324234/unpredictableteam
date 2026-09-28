// Small UI helpers shared by all pages.

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  code: '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/><path d="m14 4-4 16"/>',
  robot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3" r="1"/><circle cx="9" cy="13" r="1.3"/><circle cx="15" cy="13" r="1.3"/><path d="M9 16.5h6"/><path d="M2 12v3M22 12v3"/>',
  tasks: '<path d="M9 4h6v3H9z"/><path d="M15 5h3v16H6V5h3"/><path d="m9 13 2 2 4-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.3a3.5 3.5 0 0 1 0 7.4"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>',
  back: '<path d="m9 18 6-6-6-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  wave: '<path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'
};

export function icon(name, cls = 'i') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export const SECTIONS = {
  programming: { name: 'Programming', ar: 'البرمجة', icon: 'code', route: 'programming', desc: 'مساعد يشرحلك الكود خطوة بخطوة و PID Lab تجرب فيه' },
  robot_game: { name: 'Robot Game', ar: 'الروبوت جيم', icon: 'robot', route: 'robot', desc: 'محاكي طاولة كامل بالروبوت والحساسات + مساعد للمهمات' },
  tasks: { name: 'Task Submissions', ar: 'تسليم التاسكات', icon: 'tasks', route: 'tasks', desc: 'ابعت تاسكاتك PDF للكوتش نور أو لزمايلك' },
  mechanics: { name: 'Mechanics', ar: 'الميكانيكا', icon: 'gear', route: 'mechanics', desc: 'ابعت PDF أو صور الروبوت والـ AI يقيّمه ويشرح طريقة بنائه' },
  core_values: { name: 'Core Values', ar: 'القيم الأساسية', icon: 'heart', route: 'values', desc: 'مساعد للـ Core Values والتحضير للـ judging' },
  general: { name: 'General', ar: 'الفريق كله', icon: 'users', route: 'chat/general', desc: 'جروب الفريق العام' }
};
export const GROUP_ORDER = ['general', 'programming', 'robot_game', 'tasks', 'mechanics', 'core_values'];
export const groupName = g => (g === 'general' ? 'جروب الفريق' : 'جروب ' + SECTIONS[g].name);
export const sectionColor = s => `var(--c-${s})`;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function linkify(escaped) {
  return escaped.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const el = t.content.firstElementChild;
  el.remove(); // detach from the template fragment so parentNode is null
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function avatar(user, cls = '') {
  if (!user) return `<span class="avatar ${cls}" style="--c:#888">?</span>`;
  return `<span class="avatar ${cls}" style="--c:${esc(user.color)}" title="${esc(user.name)}">${esc([...user.name.replace(/^ال/, '')][0] || '?')}</span>`;
}

const rtf = new Intl.RelativeTimeFormat('ar-EG', { numeric: 'auto' });
export function timeAgo(ts) {
  const s = (ts - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 45) return 'دلوقتي';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 604800) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ts).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}
export const clock = ts => new Date(ts).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
export const dayLabel = ts => {
  const d = new Date(ts); const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'النهارده';
  if (d.toDateString() === y.toDateString()) return 'امبارح';
  return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
};
export const fileSize = n => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export function toast(msg, type = '') {
  let box = $('.toasts');
  if (!box) { box = h('<div class="toasts"></div>'); document.body.append(box); }
  const t = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  box.append(t);
  const kill = () => t.remove();
  t.onclick = kill;
  setTimeout(kill, type === 'bad' ? 6000 : 3500);
  return t;
}

export function modal({ title, body, actions = [], wide = false }) {
  const bg = h(`<div class="modal-bg"><div class="modal" ${wide ? 'style="max-width:760px"' : ''} role="dialog" aria-modal="true">
    <div class="mh"><h3>${esc(title)}</h3><button class="btn ghost icon" data-x aria-label="قفل">${icon('x')}</button></div>
    <div class="mb"></div><div class="mf"></div></div></div>`);
  const mb = $('.mb', bg);
  if (typeof body === 'string') mb.innerHTML = body; else mb.append(body);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('[data-x]', bg).onclick = close;
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  for (const a of actions) {
    const b = h(`<button class="btn ${a.cls || ''}">${a.label}</button>`);
    b.onclick = async () => { if (a.onClick) { const r = await a.onClick(b); if (r === false) return; } close(); };
    $('.mf', bg).append(b);
  }
  if (!actions.length) $('.mf', bg).remove();
  document.body.append(bg);
  setTimeout(() => { const f = $('input, textarea, select', mb); if (f) f.focus(); }, 30);
  return { el: bg, body: mb, close };
}

export function confirmBox(text, okLabel = 'تأكيد', cls = 'bad') {
  return new Promise(res => {
    let done = false;
    const m = modal({ title: 'متأكد؟', body: `<p style="margin:0">${esc(text)}</p>`, actions: [
      { label: 'إلغاء', onClick: () => { done = true; res(false); } },
      { label: okLabel, cls, onClick: () => { done = true; res(true); } }
    ] });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) res(false); } });
    obs.observe(document.body, { childList: true });
  });
}

// Markdown → safe HTML (marked + DOMPurify + highlight.js)
export function renderMarkdown(el, text) {
  const html = window.DOMPurify.sanitize(window.marked.parse(text || '', { breaks: true, gfm: true }), { ADD_ATTR: ['target'] });
  el.innerHTML = html;
  el.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  el.querySelectorAll('pre code').forEach(c => {
    try { window.hljs.highlightElement(c); } catch {}
    const pre = c.parentElement;
    if (!pre.querySelector('.copy')) {
      const b = document.createElement('button');
      b.className = 'copy'; b.textContent = 'نسخ';
      b.onclick = () => { navigator.clipboard.writeText(c.innerText).then(() => { b.textContent = 'اتنسخ ✓'; setTimeout(() => (b.textContent = 'نسخ'), 1500); }); };
      pre.append(b);
    }
  });
  el.querySelectorAll('p, li, h1, h2, h3, h4, td, th, blockquote').forEach(x => x.setAttribute('dir', 'auto'));
}

export function autoGrow(ta, max = 180) {
  const f = () => { ta.style.height = 'auto'; ta.style.height = Math.min(max, ta.scrollHeight + 2) + 'px'; };
  ta.addEventListener('input', f); f();
  return f;
}

export function tabs(container, items, onChange, active) {
  const bar = h('<div class="tabs" role="tablist"></div>');
  for (const it of items) {
    const b = h(`<button role="tab" data-k="${it.key}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>${it.badge ? '<span class="badge hidden"></span>' : ''}</button>`);
    b.onclick = () => select(it.key);
    bar.append(b);
  }
  function select(k) {
    $$('button', bar).forEach(b => b.classList.toggle('active', b.dataset.k === k));
    onChange(k);
  }
  container.append(bar);
  select(active || items[0].key);
  return { bar, select, setBadge(k, n) { const b = $(`[data-k="${k}"] .badge`, bar); if (b) { b.textContent = n; b.classList.toggle('hidden', !n); } } };
}

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem('fll:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fll:' + k, JSON.stringify(v)); } catch {} }
};
