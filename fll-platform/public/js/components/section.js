import { icon, h, $, esc, tabs as makeTabs, store } from '../ui.js';
import { groupChat } from './groupchat.js';

// Standard section page: header + tabs, with the section's team group chat as the last tab.
// tabs: [{ key, label, icon, render(pane) -> { destroy?() } }]
export function sectionShell(view, ctx, { section, group, title, desc, iconName, tabs }) {
  view.style.setProperty('--sc', `var(--c-${section})`);
  ctx.setTitle(title, iconName);
  view.append(h(`<div class="page-head"><div class="ic">${icon(iconName)}</div><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div></div>`));
  const all = [...tabs, { key: 'group', label: 'جروب القسم', icon: 'chat', badge: true, render: pane => groupChat(ctx, { group }) }];
  const panes = {}, comps = {};
  const holder = h('<div></div>');
  let gc = null;
  const t = makeTabs(view, all, key => {
    for (const k in panes) panes[k].classList.toggle('hidden', k !== key);
    if (!panes[key]) {
      const pane = h('<div></div>'); panes[key] = pane; holder.append(pane);
      const def = all.find(x => x.key === key);
      const comp = def.render(pane, ctx);
      if (comp && comp.el && !pane.contains(comp.el)) pane.append(comp.el);
      comps[key] = comp;
      if (key === 'group') gc = comp;
    }
    if (gc) gc.setActive(key === 'group');
    if (comps[key] && comps[key].onShow) comps[key].onShow();
    store.set('tab:' + section, key);
  }, (k => (all.some(x => x.key === k) ? k : tabs[0].key))(store.get('tab:' + section, tabs[0].key)));
  view.append(holder);
  const upd = () => t.setBadge('group', ctx.unread[group] || 0);
  const off = ctx.on('unread', upd); upd();
  return () => { off(); for (const k in comps) if (comps[k] && comps[k].destroy) comps[k].destroy(); };
}
