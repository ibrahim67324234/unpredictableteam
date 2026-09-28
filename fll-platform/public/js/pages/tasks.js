import { api } from '../api.js';
import { icon, h, $, $$, esc, avatar, toast, modal, confirmBox, timeAgo, fileSize, tabs as makeTabs, store } from '../ui.js';
import { groupChat } from '../components/groupchat.js';

const SUBSECTIONS = {
  programming: ['Programming', 'code', 'programming'], robot_game: ['Robot Game', 'robot', 'robot_game'],
  mechanics: ['Mechanics', 'gear', 'mechanics'], core_values: ['Core Values', 'heart', 'core_values'],
  innovation: ['Innovation Project', 'sparkles', 'general'], other: ['أخرى', 'file', 'tasks']
};
const STATUS = { pending: ['مستني تقييم ⏳', 'status-pending'], approved: ['مقبول ✅', 'status-approved'], revise: ['محتاج تعديل ✏️', 'status-revise'] };

export default function tasks(view, ctx, params) {
  view.style.setProperty('--sc', 'var(--c-tasks)');
  if (params[0]) return detail(view, ctx, params[0]);
  return list(view, ctx);
}

// ---------------- list ----------------
function list(view, ctx) {
  ctx.setTitle('Task Submissions', 'tasks');
  const coach = ctx.user.role === 'coach';
  view.append(h(`<div class="page-head"><div class="ic">${icon('tasks')}</div><div style="flex:1"><h1>Task Submissions</h1><p>ابعت تاسكاتك PDF للكوتش نور عشان تقيّمها، أو لأي حد من زمايلك عشان يساعدك.</p></div>
    <button class="btn primary" data-new>${icon('plus')} تاسك جديد</button></div>`));
  let gc = null;
  const listPane = h('<div></div>'), groupPane = h('<div class="hidden"></div>');
  const t = makeTabs(view, [{ key: 'list', label: 'التاسكات', icon: 'tasks' }, { key: 'group', label: 'جروب التاسكات', icon: 'chat', badge: true }], k => {
    listPane.classList.toggle('hidden', k !== 'list'); groupPane.classList.toggle('hidden', k !== 'group');
    if (k === 'group' && !gc) { gc = groupChat(ctx, { group: 'tasks' }); groupPane.append(gc.el); }
    if (gc) gc.setActive(k === 'group');
  });
  view.append(listPane, groupPane);
  const upd = () => t.setBadge('group', ctx.unread.tasks || 0);
  const offU = ctx.on('unread', upd); upd();

  const filters = coach
    ? [['review', 'مستني تقييمك'], ['all', 'الكل'], ['graded', 'اتقيّمت']]
    : [['all', 'الكل'], ['mine', 'اللي بعتها'], ['received', 'وصلتلي للمساعدة']];
  let f = ctx.query.get('f') || store.get('tasks:f', filters[0][0]);
  if (!filters.some(x => x[0] === f)) f = filters[0][0];
  const bar = h(`<div class="row" style="margin-bottom:12px">
    <div class="row" style="gap:6px" data-f>${filters.map(([k, l]) => `<button class="btn sm ${k === f ? 'primary' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
    <div style="flex:1"></div>
    <select class="input" data-sec style="width:auto;padding:5px 10px"><option value="">كل الأقسام</option>${Object.entries(SUBSECTIONS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
  </div>`);
  const box = h('<div class="task-list"></div>');
  listPane.append(bar, box);
  let all = [];
  function render() {
    const sec = $('[data-sec]', bar).value, me = ctx.user.username;
    let items = all.filter(s => !sec || s.section === sec);
    if (f === 'mine') items = items.filter(s => s.owner === me);
    if (f === 'received') items = items.filter(s => s.recipients.includes(me));
    if (f === 'review') items = items.filter(s => s.status === 'pending');
    if (f === 'graded') items = items.filter(s => s.grade);
    box.innerHTML = '';
    if (!items.length) {
      box.append(h(`<div class="card empty">${icon('tasks')}<b>مفيش تاسكات هنا</b><div class="small">${coach ? 'لما حد من الطلاب يبعت تاسك هيظهر هنا.' : 'دوس "تاسك جديد" وابعت أول تاسك.'}</div></div>`));
      return;
    }
    for (const s of items) {
      const [secName, secIcon, secColor] = SUBSECTIONS[s.section] || SUBSECTIONS.other;
      const st = STATUS[s.status];
      const recips = s.recipients.map(r => avatar(ctx.users[r], 'sm')).join('');
      box.append(h(`<a class="card task" href="#/tasks/${esc(s._id)}" style="--sc:var(--c-${secColor})">
        <div class="ti">${icon(secIcon)}</div>
        <div class="body"><b dir="auto">${esc(s.title)}</b>
          <div class="row small muted" style="gap:6px">${avatar(ctx.users[s.owner], 'sm')} ${esc(ctx.userName(s.owner))} ← <span class="avatars" style="gap:2px">${recips}</span> · ${esc(secName)} · ${timeAgo(s.updatedAt)} ${s.comments.length ? `· 💬 ${s.comments.length}` : ''} ${s.versions.length > 1 ? `· نسخة ${s.versions.length}` : ''}</div>
        </div>
        ${s.grade ? `<div class="score">${s.grade.score}<span class="muted small">/10</span></div>` : ''}
        <span class="chip ${st[1]}">${st[0]}</span>
      </a>`));
    }
  }
  async function load() {
    try { all = (await api.get('/api/submissions')).submissions; render(); }
    catch (e) { box.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
  }
  $$('[data-f] button', bar).forEach(b => (b.onclick = () => { f = b.dataset.k; store.set('tasks:f', f); $$('[data-f] button', bar).forEach(x => x.classList.toggle('primary', x === b)); render(); }));
  $('[data-sec]', bar).onchange = render;
  $('[data-new]', view).onclick = () => newTask(ctx, s => { location.hash = '#/tasks/' + s._id; });
  const off = ctx.on('submissions:changed', load);
  load();
  if (ctx.query.get('new')) newTask(ctx, s => { location.hash = '#/tasks/' + s._id; });
  return () => { off(); offU(); if (gc) gc.destroy(); };
}

function dropzone(label) {
  const dz = h(`<div><div class="dropzone" tabindex="0" role="button">${icon('upload')}<b>${label}</b><div class="small">PDF (أو صورة) — لحد 10MB</div></div><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden></div>`);
  const z = $('.dropzone', dz), input = $('input', dz);
  const state = { file: null, uploading: false };
  async function pick(f) {
    if (!f) return;
    state.uploading = true; z.classList.remove('has'); z.innerHTML = `${icon('upload')}<b>جاري رفع ${esc(f.name)}...</b>`;
    try { state.file = await api.upload(f, 'submission'); z.classList.add('has'); z.innerHTML = `${icon('check')}<b>${esc(state.file.name)}</b><div class="small">${fileSize(state.file.size)} — دوس لو عايز تغيّره</div>`; }
    catch (e) { state.file = null; z.innerHTML = `${icon('upload')}<b>${label}</b><div class="small" style="color:var(--bad)">${esc(e.message)}</div>`; }
    state.uploading = false;
  }
  z.onclick = () => input.click();
  z.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => { pick(input.files[0]); input.value = ''; };
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('over'); pick(e.dataTransfer.files[0]); });
  return { el: dz, state };
}

function newTask(ctx, onDone) {
  const others = ctx.usersList.filter(u => u.username !== ctx.user.username);
  const body = h(`<form>
    <label class="field"><span>عنوان التاسك</span><input class="input" name="title" maxlength="120" required placeholder="مثلاً: كود مهمة 4 — gyro turn"></label>
    <label class="field"><span>القسم</span><select class="input" name="section">${Object.entries(SUBSECTIONS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label>
    <label class="field"><span>وصف / سؤالك (اختياري)</span><textarea class="input" name="description" rows="3" maxlength="3000" dir="auto" placeholder="اكتب عملت ايه، وعايز مساعدة في ايه بالظبط"></textarea></label>
    <div class="field"><span style="display:block;font-weight:600;font-size:13px;margin-bottom:4px">الملف</span><div data-dz></div></div>
    <div class="field"><span style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">ابعته لمين؟</span>
      <div class="recips">${others.map(u => `<label>${`<input type="checkbox" value="${esc(u.username)}" ${u.role === 'coach' ? 'checked' : ''}>`}${avatar(u, 'sm')} ${esc(u.name)}${u.role === 'coach' ? ' (الكوتش — للتقييم)' : ''}</label>`).join('')}</div>
    </div>
  </form>`);
  const dz = dropzone('اسحب ملف التاسك هنا أو دوس للاختيار');
  $('[data-dz]', body).append(dz.el);
  body.addEventListener('submit', e => e.preventDefault());
  modal({
    title: 'تاسك جديد', body, actions: [
      { label: 'إلغاء' },
      { label: `${icon('send')} ابعت`, cls: 'primary', onClick: async (btn) => {
        const f = body.elements;
        const title = f.title.value.trim();
        const recipients = $$('.recips input:checked', body).map(i => i.value);
        if (!title) { toast('اكتب عنوان للتاسك', 'bad'); f.title.focus(); return false; }
        if (dz.state.uploading) { toast('استنى لحد ما الملف يترفع', 'bad'); return false; }
        if (!dz.state.file) { toast('ارفع ملف الـ PDF الأول', 'bad'); return false; }
        if (!recipients.length) { toast('اختار حد تبعتله', 'bad'); return false; }
        btn.disabled = true;
        try {
          const { submission } = await api.post('/api/submissions', { title, section: f.section.value, description: f.description.value, fileId: dz.state.file.id, recipients });
          toast('اتبعت ✅', 'ok'); onDone(submission);
        } catch (e) { toast(e.message, 'bad'); btn.disabled = false; return false; }
      } }
    ]
  });
}

// ---------------- detail ----------------
async function detail(view, ctx, id) {
  ctx.setTitle('Task Submissions', 'tasks');
  const coach = ctx.user.role === 'coach';
  let s, verIdx = null;
  const root = h('<div></div>'); view.append(root);
  async function load() {
    try { s = (await api.get('/api/submissions/' + id)).submission; }
    catch (e) { root.innerHTML = `<div class="card empty">${esc(e.message)}<br><a href="#/tasks">رجوع للتاسكات</a></div>`; return; }
    render();
  }
  function render() {
    const [secName, secIcon, secColor] = SUBSECTIONS[s.section] || SUBSECTIONS.other;
    const st = STATUS[s.status];
    if (verIdx == null || verIdx >= s.versions.length) verIdx = s.versions.length - 1;
    const v = s.versions[verIdx];
    const url = '/api/files/' + encodeURIComponent(v.fileId);
    const isOwner = s.owner === ctx.user.username;
    root.innerHTML = '';
    root.append(h(`<div class="page-head" style="--sc:var(--c-${secColor})">
      <a class="btn ghost icon" href="#/tasks" aria-label="رجوع">${icon('back')}</a>
      <div class="ic">${icon(secIcon)}</div>
      <div style="flex:1;min-width:0"><h1 dir="auto">${esc(s.title)}</h1>
        <p class="row" style="gap:6px">${avatar(ctx.users[s.owner], 'sm')} ${esc(ctx.userName(s.owner))} · ${esc(secName)} · ${timeAgo(s.createdAt)} <span class="chip ${st[1]}">${st[0]}</span></p></div>
    </div>`));
    const grid = h('<div class="task-detail"></div>');
    const left = h(`<div class="card" style="padding:12px">
      <div class="row" style="margin-bottom:10px">
        ${s.versions.length > 1 ? `<select class="input" data-ver style="width:auto;padding:4px 10px">${s.versions.map((x, i) => `<option value="${i}" ${i === verIdx ? 'selected' : ''}>نسخة ${i + 1} — ${timeAgo(x.at)}</option>`).join('')}</select>` : ''}
        <b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" dir="auto">${icon('file')} ${esc(v.fileName)}</b>
        <span class="muted small">${fileSize(v.size || 0)}</span>
        <a class="btn sm" href="${url}" target="_blank" rel="noopener">${icon('eye')} فتح</a>
        <a class="btn sm" href="${url}?download=1">${icon('download')} تحميل</a>
      </div>
      ${v.note ? `<div class="banner" style="margin-bottom:10px;background:var(--primary-soft);border-color:transparent" dir="auto">📝 ${esc(v.note)}</div>` : ''}
      ${(v.type || 'application/pdf').startsWith('image/') ? `<img src="${url}" alt="" style="max-width:100%;border-radius:10px">` : `<iframe class="pdf-frame" src="${url}#view=FitH" title="ملف التاسك"></iframe><div class="muted small" style="margin-top:6px">لو الملف مش ظاهر (زي على بعض الموبايلات)، دوس "فتح".</div>`}
    </div>`);
    const sv = $('[data-ver]', left); if (sv) sv.onchange = () => { verIdx = Number(sv.value); render(); };
    const right = h('<div class="stack"></div>');
    right.append(h(`<div class="card"><h3>${icon('file')} تفاصيل</h3>
      ${s.description ? `<p style="margin:0 0 12px;white-space:pre-wrap" dir="auto">${esc(s.description)}</p>` : '<p class="muted small" style="margin:0 0 12px">مفيش وصف.</p>'}
      <div class="row small" style="gap:6px"><span class="muted">اتبعت لـ:</span>${s.recipients.map(r => `<span class="chip">${avatar(ctx.users[r], 'sm')} ${esc(ctx.userName(r))}</span>`).join('')}</div></div>`));
    if (s.grade) {
      const good = s.status === 'approved';
      right.append(h(`<div class="card grade-box" style="background:${good ? 'var(--ok-soft)' : 'var(--bad-soft)'};border-color:transparent">
        <div class="row nowrap"><div class="big">${s.grade.score}<span style="font-size:16px">/10</span></div><div style="flex:1"><b>${good ? 'مقبول ✅' : 'محتاج تعديل ✏️'}</b><div class="muted small">قيّمتها ${esc(ctx.userName(s.grade.by))} · ${timeAgo(s.grade.at)}${s.versions.length > (s.grade.version || 1) ? ' · (اترفعت نسخة أحدث بعد التقييم)' : ''}</div></div></div>
        ${s.grade.feedback ? `<p style="margin:10px 0 0;white-space:pre-wrap" dir="auto">${esc(s.grade.feedback)}</p>` : ''}</div>`));
    }
    if (coach) {
      const g = h(`<div class="card"><h3>${icon('check')} تقييم الكوتش</h3>
        <div class="slider-row"><div class="top"><span>الدرجة</span><span class="ltr" data-sv></span></div><input type="range" min="0" max="10" step="0.5" data-score></div>
        <div class="row" style="margin-bottom:10px">
          <label class="row" style="gap:4px;cursor:pointer"><input type="radio" name="st" value="approved"> مقبول ✅</label>
          <label class="row" style="gap:4px;cursor:pointer"><input type="radio" name="st" value="revise"> محتاج تعديل ✏️</label>
        </div>
        <textarea class="input" rows="4" data-fb dir="auto" placeholder="ملاحظاتك للطالب: ايه الحلو، وايه اللي يتحسن..."></textarea>
        <button class="btn primary" style="margin-top:10px" data-save>${icon('save')} حفظ التقييم</button></div>`);
      const sc = $('[data-score]', g), svv = $('[data-sv]', g);
      sc.value = s.grade ? s.grade.score : 8; svv.textContent = sc.value + ' / 10';
      sc.oninput = () => (svv.textContent = sc.value + ' / 10');
      $(`input[value="${s.status === 'revise' ? 'revise' : 'approved'}"]`, g).checked = true;
      $('[data-fb]', g).value = s.grade ? s.grade.feedback : '';
      $('[data-save]', g).onclick = async (e) => {
        e.target.disabled = true;
        try { s = (await api.post(`/api/submissions/${s._id}/grade`, { score: Number(sc.value), status: $('input[name=st]:checked', g).value, feedback: $('[data-fb]', g).value })).submission; toast('اتحفظ التقييم ✅ ووصل إشعار للطالب', 'ok'); render(); }
        catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
      };
      right.append(g);
    }
    if (isOwner) {
      const o = h(`<div class="card"><h3>${icon('upload')} ارفع نسخة جديدة</h3><div data-dz></div>
        <input class="input" data-note maxlength="500" placeholder="اتغير ايه في النسخة دي؟ (اختياري)" style="margin-top:8px" dir="auto">
        <div class="row" style="margin-top:10px"><button class="btn primary" data-up>${icon('send')} ابعت النسخة الجديدة</button><div style="flex:1"></div><button class="btn ghost" data-del style="color:var(--bad)">${icon('trash')} حذف التاسك</button></div></div>`);
      const dz = dropzone('ملف النسخة الجديدة');
      $('[data-dz]', o).append(dz.el);
      $('[data-up]', o).onclick = async (e) => {
        if (dz.state.uploading) return toast('استنى لحد ما الملف يترفع', 'bad');
        if (!dz.state.file) return toast('ارفع الملف الأول', 'bad');
        e.target.disabled = true;
        try { s = (await api.post(`/api/submissions/${s._id}/versions`, { fileId: dz.state.file.id, note: $('[data-note]', o).value })).submission; verIdx = null; toast('اتبعتت النسخة الجديدة ✅', 'ok'); render(); }
        catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
      };
      $('[data-del]', o).onclick = async () => {
        if (!(await confirmBox('تحذف التاسك ده نهائيًا؟', 'احذف'))) return;
        try { await api.del('/api/submissions/' + s._id); toast('اتحذف'); location.hash = '#/tasks'; } catch (err) { toast(err.message, 'bad'); }
      };
      right.append(o);
    } else if (coach) {
      const d = h(`<div class="row"><div style="flex:1"></div><button class="btn ghost sm" style="color:var(--bad)">${icon('trash')} حذف التاسك</button></div>`);
      $('button', d).onclick = async () => { if (!(await confirmBox('تحذفي التاسك ده نهائيًا؟', 'احذف'))) return; try { await api.del('/api/submissions/' + s._id); location.hash = '#/tasks'; } catch (err) { toast(err.message, 'bad'); } };
      right.append(d);
    }
    const cm = h(`<div class="card"><h3>${icon('chat')} التعليقات والمساعدة (${s.comments.length})</h3><div data-list></div>
      <div class="row nowrap" style="margin-top:10px;align-items:flex-end"><textarea class="input" rows="2" data-c dir="auto" placeholder="${isOwner ? 'اسأل أو رد على التعليقات...' : 'ساعد زميلك: اكتب ملاحظة أو اقتراح...'}"></textarea><button class="btn primary icon" data-send>${icon('send')}</button></div></div>`);
    const cl = $('[data-list]', cm);
    if (!s.comments.length) cl.append(h('<div class="muted small">مفيش تعليقات لسه.</div>'));
    for (const c of s.comments) cl.append(h(`<div class="comment">${avatar(ctx.users[c.user], 'sm')}<div style="flex:1;min-width:0"><b>${esc(ctx.userName(c.user))}</b> ${ctx.users[c.user]?.role === 'coach' ? '<span class="chip">الكوتش</span>' : ''} <span class="muted small">${timeAgo(c.at)}</span><div class="ct" dir="auto">${esc(c.text)}</div></div></div>`));
    const send = async () => {
      const ta = $('[data-c]', cm); const text = ta.value.trim(); if (!text) return;
      try { s = (await api.post(`/api/submissions/${s._id}/comments`, { text })).submission; render(); } catch (e) { toast(e.message, 'bad'); }
    };
    $('[data-send]', cm).onclick = send;
    $('[data-c]', cm).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    right.append(cm);
    grid.append(left, right);
    root.append(grid);
  }
  const off = ctx.on('submissions:changed', d => {
    if (d.id !== id) return;
    if (d.deleted) { toast('التاسك ده اتحذف'); location.hash = '#/tasks'; return; }
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') && active.value) return; // don't wipe what the user is typing
    load();
  });
  await load();
  return off;
}
