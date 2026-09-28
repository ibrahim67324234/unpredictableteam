import { api } from '../api.js';
import { icon, h, $, esc, linkify, avatar, clock, dayLabel, toast, autoGrow, fileSize, SECTIONS, groupName, confirmBox } from '../ui.js';

// Real-time group chat for one group. opts: { group, fill, showBack }
export function groupChat(ctx, opts) {
  const g = opts.group;
  const sec = SECTIONS[g];
  const el = h(`<div class="gc ${opts.fill ? 'fill' : ''}" style="--sc:var(--c-${g})">
    <div class="gc-head">
      ${opts.showBack ? `<a class="btn ghost icon" href="#/chat" aria-label="رجوع">${icon('back')}</a>` : ''}
      <div class="gi">${icon(sec.icon)}</div>
      <div><b>${esc(groupName(g))}</b><small class="muted" data-online></small></div>
    </div>
    <div class="msgs"></div>
    <div class="typing"></div>
    <div class="pending-att hidden"></div>
    <div class="composer">
      <button class="btn icon" data-attach title="إرفاق PDF أو صورة">${icon('clip')}</button>
      <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden>
      <textarea class="input" rows="1" dir="auto" placeholder="اكتب رسالة للفريق والكوتش..."></textarea>
      <button class="btn primary icon" data-send aria-label="إرسال">${icon('send')}</button>
    </div>
  </div>`);
  const box = $('.msgs', el), ta = $('textarea', el), typingEl = $('.typing', el), pend = $('.pending-att', el);
  const grow = autoGrow(ta, 140);
  let list = [], more = false, loadingOlder = false, attachment = null, active = !!opts.active, typingTimer = null, lastTyping = 0;
  const offs = [];

  const online = () => {
    const n = ctx.usersList.filter(u => ctx.online.has(u.username)).length;
    $('[data-online]', el).textContent = `${ctx.usersList.length} أعضاء · ${n} متصل دلوقتي`;
  };
  online();

  function msgEl(m, prev) {
    const u = ctx.users[m.user] || { name: m.user, color: '#888' };
    const me = m.user === ctx.user.username;
    const cont = prev && prev.user === m.user && m.ts - prev.ts < 5 * 60000 && new Date(prev.ts).toDateString() === new Date(m.ts).toDateString();
    let att = '';
    if (m.attachment) {
      const url = '/api/files/' + encodeURIComponent(m.attachment.id);
      att = m.attachment.type.startsWith('image/')
        ? `<a href="${url}" target="_blank" rel="noopener"><img class="att-img" src="${url}" alt="${esc(m.attachment.name)}" loading="lazy"></a>`
        : `<a class="att" href="${url}" target="_blank" rel="noopener">${icon('file')} <span>${esc(m.attachment.name)}</span> <span class="small" style="opacity:.7">${fileSize(m.attachment.size)}</span></a>`;
    }
    const canDel = me || ctx.user.role === 'coach';
    const e = h(`<div class="msg ${me ? 'me' : ''} ${cont ? 'cont' : ''}" data-id="${esc(m._id)}">
      ${avatar(u, 'sm')}
      <div class="bubble" style="--uc:${esc(u.color)}">
        ${!me && !cont ? `<div class="who">${esc(u.name)}${u.role === 'coach' ? ' · الكوتش' : ''}</div>` : ''}
        ${att}
        ${m.text ? `<div class="txt" dir="auto">${linkify(esc(m.text))}</div>` : ''}
        <time>${clock(m.ts)}</time>
        ${canDel ? `<button class="del" title="امسح الرسالة">${icon('trash')}</button>` : ''}
      </div></div>`);
    const del = $('.del', e);
    if (del) del.onclick = async () => {
      if (!(await confirmBox('تمسح الرسالة دي؟', 'امسح'))) return;
      ctx.socket.emit('chat:delete', { id: m._id }, r => { if (r && r.error) toast(r.error, 'bad'); });
    };
    return e;
  }
  function render(keepPos) {
    const oldH = box.scrollHeight, oldTop = box.scrollTop;
    box.innerHTML = '';
    if (!list.length) box.append(h(`<div class="empty">${icon('chat')}مفيش رسايل لسه — ابدأ الكلام مع الفريق 👋</div>`));
    let prev = null, lastDay = '';
    for (const m of list) {
      const d = new Date(m.ts).toDateString();
      if (d !== lastDay) { box.append(h(`<div class="day">${esc(dayLabel(m.ts))}</div>`)); lastDay = d; prev = null; }
      box.append(msgEl(m, prev)); prev = m;
    }
    if (keepPos) box.scrollTop = box.scrollHeight - oldH + oldTop; else box.scrollTop = box.scrollHeight;
  }
  async function load() {
    try {
      const r = await api.get('/api/chat/' + g);
      list = r.messages; more = r.more; render();
      if (active) ctx.markRead(g);
    } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  box.addEventListener('scroll', async () => {
    if (box.scrollTop < 40 && more && !loadingOlder && list.length) {
      loadingOlder = true;
      try { const r = await api.get(`/api/chat/${g}?before=${list[0].ts}`); list = [...r.messages, ...list]; more = r.more; render(true); } catch {}
      loadingOlder = false;
    }
  });

  offs.push(ctx.on('chat:new', m => {
    if (m.group !== g) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    list.push(m);
    if (list.length === 1) render();
    else {
      const prev = list[list.length - 2];
      if (new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString()) box.append(h(`<div class="day">${esc(dayLabel(m.ts))}</div>`));
      box.append(msgEl(m, prev));
    }
    if (atBottom || m.user === ctx.user.username) box.scrollTop = box.scrollHeight;
    if (m.user !== ctx.user.username) typingEl.textContent = '';
  }));
  offs.push(ctx.on('chat:deleted', d => {
    if (d.group !== g) return;
    list = list.filter(m => m._id !== d.id); render(true);
  }));
  offs.push(ctx.on('chat:typing', d => {
    if (d.group !== g || d.user === ctx.user.username) return;
    typingEl.textContent = `${ctx.userName(d.user)} بيكتب...`;
    clearTimeout(typingTimer); typingTimer = setTimeout(() => (typingEl.textContent = ''), 3000);
  }));
  offs.push(ctx.on('presence', online));

  function send() {
    const text = ta.value.trim();
    if (!text && !attachment) return;
    const payload = { group: g, text, attachmentId: attachment ? attachment.id : undefined };
    $('[data-send]', el).disabled = true;
    ctx.socket.timeout(10000).emit('chat:send', payload, (err, r) => {
      $('[data-send]', el).disabled = false;
      if (err) return toast('الرسالة ما اتبعتتش — اتأكد من النت', 'bad');
      if (r && r.error) return toast(r.error, 'bad');
      ta.value = ''; grow(); attachment = null; pend.classList.add('hidden');
    });
  }
  $('[data-send]', el).onclick = send;
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  ta.addEventListener('input', () => { if (Date.now() - lastTyping > 2000) { lastTyping = Date.now(); ctx.socket.emit('chat:typing', { group: g }); } });
  const input = $('input[type=file]', el);
  $('[data-attach]', el).onclick = () => input.click();
  async function attach(f) {
    if (!f) return;
    pend.classList.remove('hidden'); pend.innerHTML = `${icon('upload')} جاري رفع ${esc(f.name)}...`;
    try {
      attachment = await api.upload(f, 'chat');
      pend.innerHTML = `${icon('file')} ${esc(attachment.name)} <button class="btn ghost sm icon" aria-label="إلغاء">${icon('x')}</button>`;
      $('button', pend).onclick = () => { attachment = null; pend.classList.add('hidden'); };
      ta.focus();
    } catch (e) { pend.classList.add('hidden'); toast(e.message, 'bad'); }
  }
  input.onchange = () => { attach(input.files[0]); input.value = ''; };
  el.addEventListener('dragover', e => e.preventDefault());
  el.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) attach(e.dataTransfer.files[0]); });

  function setActive(on) {
    active = on;
    ctx.activeGroups.set(g, on);
    if (on) { ctx.markRead(g); requestAnimationFrame(() => (box.scrollTop = box.scrollHeight)); }
  }
  setActive(active);
  load();
  return {
    el, setActive,
    destroy() { offs.forEach(f => f()); ctx.activeGroups.delete(g); clearTimeout(typingTimer); }
  };
}
