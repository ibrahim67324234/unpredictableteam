import { api } from '../api.js';
import { icon, h, $, $$, esc, timeAgo, SECTIONS, GROUP_ORDER, groupName } from '../ui.js';
import { groupChat } from '../components/groupchat.js';

export default async function chatPage(view, ctx, params) {
  ctx.setTitle('الرسايل والجروبات', 'chat');
  const current = GROUP_ORDER.includes(params[0]) ? params[0] : null;
  const layout = h(`<div class="chat-layout ${current ? 'in-group' : ''}">
    <div class="card group-card" style="padding:6px"><div class="group-list"></div></div>
    <div class="conv"></div>
  </div>`);
  view.append(layout);
  const list = $('.group-list', layout);
  let summary = {};
  async function loadSummary() { try { summary = (await api.get('/api/chat/summary')).groups; } catch {} renderList(); }
  function renderList() {
    list.innerHTML = '';
    for (const g of GROUP_ORDER) {
      const s = summary[g] || {}, last = s.last;
      const unread = ctx.unread[g] || 0;
      const preview = last ? `${last.user === ctx.user.username ? 'إنت' : esc(ctx.userName(last.user))}: ${last.attachment ? '📎 ' : ''}${esc((last.text || last.attachment?.name || '').slice(0, 60))}` : 'مفيش رسايل لسه';
      list.append(h(`<a href="#/chat/${g}" class="${g === current ? 'active' : ''}" style="--sc:var(--c-${g})">
        <div class="gi">${icon(SECTIONS[g].icon)}</div>
        <div class="meta"><b>${esc(groupName(g))}</b><span dir="auto">${preview}</span></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">${last ? `<span class="muted" style="font-size:11px">${timeAgo(last.ts)}</span>` : ''}${unread ? `<span class="badge">${unread}</span>` : ''}</div>
      </a>`));
    }
  }
  const conv = $('.conv', layout);
  let gc = null;
  if (current) {
    gc = groupChat(ctx, { group: current, showBack: true, active: true });
    conv.append(gc.el);
  } else {
    conv.append(h(`<div class="card empty" style="height:100%;display:grid;place-items:center"><div>${icon('chat')}<b>اختار جروب من القايمة</b><div class="small">كل قسم له جروب للفريق والكوتش، وفيه جروب عام للفريق كله.</div></div></div>`));
  }
  const offs = [
    ctx.on('chat:new', m => { summary[m.group] = { ...(summary[m.group] || {}), last: m }; renderList(); }),
    ctx.on('unread', renderList),
    ctx.on('chat:deleted', () => loadSummary())
  ];
  loadSummary();
  return () => { offs.forEach(f => f()); if (gc) gc.destroy(); };
}
