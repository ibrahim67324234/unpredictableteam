import { api } from '../api.js';
import { icon, h, $, esc, avatar, timeAgo, SECTIONS } from '../ui.js';

const STATUS = { pending: ['مستني تقييم', 'status-pending'], approved: ['مقبول ✅', 'status-approved'], revise: ['محتاج تعديل', 'status-revise'] };

export default async function home(view, ctx) {
  ctx.setTitle('الرئيسية', 'home');
  const coach = ctx.user.role === 'coach';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : 'مساء الخير';
  view.append(h(`<div class="card hero"><h1>${greet} يا ${esc(ctx.user.name)} 👋</h1><p>${coach ? 'دي لوحة الكوتش — تقدري تتابعي تاسكات الفريق وتقيّميها وتكلمي الفريق في الجروبات.' : 'جاهز تتمرن النهارده؟ اختار قسم وابدأ — والمساعد الذكي موجود لو احتجت مساعدة.'}</p></div>`));
  const body = h('<div class="stack" style="margin-top:16px"></div>');
  view.append(body);

  let d;
  try { d = await api.get('/api/dashboard'); } catch (e) { body.append(h(`<div class="card empty">${esc(e.message)}</div>`)); return; }
  if (coach && d.storage === 'file') body.append(h(`<div class="banner">💾 البيانات دلوقتي متخزنة على السيرفر نفسه ومش دايمة (ممكن تتمسح لما السيرفر يعيد التشغيل). ضيفي <b>MONGODB_URI</b> في إعدادات Render عشان الرسايل والتاسكات تتحفظ على طول — الخطوات في دليل التشغيل.</div>`));
  if (!d.aiReady) body.append(h(`<div class="banner">⚠️ المساعد الذكي لسه مش متفعّل على السيرفر. ${coach ? 'ضيفي <b>GEMINI_API_KEY</b> في إعدادات Render (Environment) — الخطوات في ملف دليل التشغيل.' : 'قول للكوتش نور تفعّله.'}</div>`));

  const s = d.stats;
  const cards = coach
    ? [['tasks', 'مستني تقييمك', s.toReview, '#/tasks?f=review'], ['users', 'طلاب الفريق', (d.team || []).length, '#/chat/general'], ['file', 'كل التاسكات', s.total, '#/tasks'], ['chat', 'رسايل مش مقروءة', Object.values(ctx.unread).reduce((a, b) => a + b, 0), '#/chat']]
    : [['upload', 'تاسكات بعتها', s.mine, '#/tasks?f=mine'], ['check', 'اتقبلت', s.mineApproved, '#/tasks?f=mine'], ['reset', 'محتاجة تعديل', s.mineRevise, '#/tasks?f=mine'], ['users', 'زمايلك طالبين مساعدتك', s.toReview, '#/tasks?f=received']];
  const statRow = h('<div class="grid g4"></div>');
  cards.forEach(([ic, label, n, link]) => statRow.append(h(`<a class="card stat" href="${link}" style="color:var(--text)"><div class="ic">${icon(ic)}</div><div><b>${n ?? 0}</b><span>${esc(label)}</span></div></a>`)));
  body.append(statRow);

  const secs = h('<div class="grid g3"></div>');
  for (const k of ['programming', 'robot_game', 'tasks', 'mechanics', 'core_values']) {
    const sc = SECTIONS[k];
    const unread = ctx.unread[k] || 0;
    secs.append(h(`<a class="card section-card" href="#/${sc.route}" style="--sc:var(--c-${k})">
      <div class="row nowrap"><div class="ic">${icon(sc.icon)}</div><div style="flex:1"><b>${esc(sc.name)}</b><div class="muted small">${esc(sc.ar)}</div></div>${unread ? `<span class="badge" title="رسايل جديدة في الجروب">${unread}</span>` : ''}</div>
      <p>${esc(sc.desc)}</p></a>`));
  }
  secs.append(h(`<a class="card section-card" href="#/chat/general" style="--sc:var(--c-general)">
      <div class="row nowrap"><div class="ic">${icon('users')}</div><div style="flex:1"><b>جروب الفريق</b><div class="muted small">الكلام العام مع الفريق والكوتش</div></div>${ctx.unread.general ? `<span class="badge">${ctx.unread.general}</span>` : ''}</div>
      <p>اتفقوا على مواعيد التدريب وشاركوا أفكاركم.</p></a>`));
  body.append(secs);

  const lower = h('<div class="grid g2"></div>');
  const recent = h(`<div class="card"><h3>${icon('tasks')} آخر التاسكات</h3><div class="task-list"></div></div>`);
  const rl = $('.task-list', recent);
  if (!d.recent.length) rl.append(h(`<div class="empty small">مفيش تاسكات لسه. <a href="#/tasks">ابعت أول تاسك</a></div>`));
  for (const t of d.recent) {
    const st = STATUS[t.status];
    rl.append(h(`<a class="row nowrap" href="#/tasks/${esc(t._id)}" style="color:var(--text);padding:6px 0;border-bottom:1px solid var(--border)">
      ${avatar(ctx.users[t.owner], 'sm')}<div style="flex:1;min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</b><span class="muted small">${esc(ctx.userName(t.owner))} · ${timeAgo(t.updatedAt)}</span></div>
      ${t.score != null ? `<b>${t.score}/10</b>` : ''}<span class="chip ${st[1]}">${st[0]}</span></a>`));
  }
  lower.append(recent);

  if (coach && d.team) {
    const tm = h(`<div class="card"><h3>${icon('users')} متابعة الفريق</h3><table class="tbl"><thead><tr><th>الطالب</th><th>تاسكات</th><th>مستني</th><th>متوسط الدرجات</th></tr></thead><tbody></tbody></table></div>`);
    for (const u of d.team) $('tbody', tm).append(h(`<tr><td><div class="row nowrap">${avatar(u, 'sm')} ${esc(u.name)}</div></td><td>${u.total}</td><td>${u.pending ? `<span class="chip status-pending">${u.pending}</span>` : '0'}</td><td>${u.avg != null ? `<b>${u.avg}</b>/10` : '<span class="muted">—</span>'}</td></tr>`));
    lower.append(tm);
  } else {
    const team = h(`<div class="card"><h3>${icon('users')} الفريق</h3><div class="stack" data-team></div></div>`);
    const renderTeam = () => {
      const el = $('[data-team]', team); el.innerHTML = '';
      for (const u of ctx.usersList) el.append(h(`<div class="row nowrap">${avatar(u, ctx.online.has(u.username) ? '' : 'off')}<div style="flex:1"><b>${esc(u.name)}</b> ${u.role === 'coach' ? '<span class="chip">الكوتش</span>' : ''}<div class="muted small">${ctx.online.has(u.username) ? '🟢 متصل دلوقتي' : 'مش متصل'}</div></div></div>`));
    };
    renderTeam();
    const off = ctx.on('presence', renderTeam);
    lower.append(team);
    body.append(lower);
    return off;
  }
  body.append(lower);
}
