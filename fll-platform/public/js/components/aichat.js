import { api } from '../api.js';
import { icon, h, $, esc, toast, renderMarkdown, autoGrow, fileSize, confirmBox } from '../ui.js';

// Reusable AI assistant panel.
// opts: { section, title, subtitle, intro, quick:[], allowFile, fileHint, getContext():string, contextLabel, fill, placeholder }
export function aiChat(ctx, opts) {
  const el = h(`<div class="ai ${opts.fill ? 'fill' : ''}" style="--sc:var(--c-${opts.section})">
    <div class="ai-head"><div class="bot">${icon('sparkles')}</div>
      <div><b>${esc(opts.title)}</b><small>${esc(opts.subtitle || 'مساعد ذكي بيشرح ويساعد — مش بيحل بدالك 😉')}</small></div>
      <div style="flex:1"></div>
      <button class="btn ghost sm" data-clear title="امسح المحادثة وابدأ من جديد">${icon('trash')}<span>محادثة جديدة</span></button>
    </div>
    <div class="msgs" aria-live="polite"></div>
    <div class="composer">
      <div class="attach-chip hidden"></div>
      ${opts.getContext ? `<label class="ctx"><input type="checkbox" data-ctx checked> ${esc(opts.contextLabel || 'ضمّن السياق')}</label>` : ''}
      <div class="bar">
        ${opts.allowFile ? `<button class="btn icon" data-attach title="${esc(opts.fileHint || 'إرفاق PDF أو صورة')}">${icon('clip')}</button><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden>` : ''}
        <textarea class="input" rows="1" dir="auto" placeholder="${esc(opts.placeholder || 'اكتب سؤالك هنا... (Enter للإرسال، Shift+Enter لسطر جديد)')}"></textarea>
        <button class="btn primary icon" data-send aria-label="إرسال">${icon('send')}</button>
      </div>
    </div>
  </div>`);
  const msgs = $('.msgs', el), ta = $('textarea', el), chip = $('.attach-chip', el), sendBtn = $('[data-send]', el);
  const grow = autoGrow(ta);
  let messages = [], busy = false, pendingFile = null, abort = null, dead = false;

  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }
  function welcome() {
    const w = h(`<div class="welcome"><div class="big">${icon('sparkles')}</div><b>${esc(opts.title)}</b><div>${opts.intro || ''}</div><div class="quick"></div></div>`);
    for (const q of opts.quick || []) {
      const b = h(`<button type="button">${esc(q)}</button>`);
      b.onclick = () => send(q);
      $('.quick', w).append(b);
    }
    return w;
  }
  function fileChip(f) {
    return `<a class="filechip" href="/api/files/${esc(f.id)}" target="_blank" rel="noopener">${icon('file')} ${esc(f.name)}</a>`;
  }
  function addUser(m) {
    const b = h(`<div class="m user" dir="auto">${m.file ? fileChip(m.file) + '<br>' : ''}${esc(m.text || '')}</div>`);
    msgs.append(b); return b;
  }
  function addAI(text) {
    const b = h(`<div class="m ai-msg md"></div>`);
    if (text == null) b.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    else renderMarkdown(b, text);
    msgs.append(b); return b;
  }
  function renderAll() {
    msgs.innerHTML = '';
    if (!messages.length) { msgs.append(welcome()); return; }
    for (const m of messages) m.role === 'ai' ? addAI(m.text) : addUser(m);
    scrollDown();
  }
  async function load() {
    try { messages = (await api.get(`/api/ai/${opts.section}/history`)).messages; } catch { messages = []; }
    if (!dead) renderAll();
  }

  async function send(text) {
    text = (text ?? ta.value).trim();
    if (busy || (!text && !pendingFile)) return;
    busy = true; sendBtn.disabled = true;
    const file = pendingFile; pendingFile = null; chip.classList.add('hidden');
    ta.value = ''; grow();
    if (!messages.length) msgs.innerHTML = '';
    const userMsg = { role: 'user', text, file };
    messages.push(userMsg); addUser(userMsg);
    const bubble = addAI(null); scrollDown();
    let context = '';
    const ctxBox = $('[data-ctx]', el);
    if (opts.getContext && (!ctxBox || ctxBox.checked)) { try { context = opts.getContext() || ''; } catch {} }
    abort = new AbortController();
    let last = 0, pending = null;
    try {
      const reply = await api.aiStream(opts.section, { message: text, fileId: file ? file.id : undefined, context }, (sofar) => {
        pending = sofar;
        const t = performance.now();
        if (t - last > 90) { last = t; const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80; renderMarkdown(bubble, sofar); if (atBottom) scrollDown(); }
      }, abort.signal);
      renderMarkdown(bubble, reply || pending || '');
      messages.push({ role: 'ai', text: reply });
    } catch (e) {
      if (e.name === 'AbortError') return;
      bubble.innerHTML = `<div class="banner" style="background:var(--bad-soft)">⚠️ ${esc(e.message)}</div>`;
      messages.pop();
      if (file) { pendingFile = file; showChip(); }
      if (text && !ta.value) { ta.value = text; grow(); }
    } finally {
      busy = false; sendBtn.disabled = false; abort = null; scrollDown();
    }
  }

  function showChip() {
    chip.innerHTML = `${icon('file')} <span>${esc(pendingFile.name)}</span> <span class="muted small">${fileSize(pendingFile.size || 0)}</span> <button class="btn ghost icon sm" aria-label="شيل الملف">${icon('x')}</button>`;
    chip.classList.remove('hidden');
    $('button', chip).onclick = () => { pendingFile = null; chip.classList.add('hidden'); };
  }
  async function attach(f) {
    if (!f) return;
    chip.classList.remove('hidden'); chip.innerHTML = `${icon('upload')} جاري رفع ${esc(f.name)}...`;
    try { pendingFile = await api.upload(f, 'ai'); showChip(); ta.focus(); }
    catch (e) { chip.classList.add('hidden'); toast(e.message, 'bad'); }
  }
  if (opts.allowFile) {
    const input = $('input[type=file]', el);
    $('[data-attach]', el).onclick = () => input.click();
    input.onchange = () => { attach(input.files[0]); input.value = ''; };
    el.addEventListener('dragover', e => { e.preventDefault(); });
    el.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) attach(e.dataTransfer.files[0]); });
  }
  sendBtn.onclick = () => send();
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  $('[data-clear]', el).onclick = async () => {
    if (!messages.length) return;
    if (!(await confirmBox('هتمسح المحادثة دي مع المساعد؟', 'امسح'))) return;
    if (abort) abort.abort();
    await api.del(`/api/ai/${opts.section}/history`).catch(() => {});
    messages = []; renderAll();
  };
  load();
  return {
    el, send, attach,
    setDraft(t) { ta.value = t; grow(); ta.focus(); },
    destroy() { dead = true; if (abort) abort.abort(); }
  };
}
