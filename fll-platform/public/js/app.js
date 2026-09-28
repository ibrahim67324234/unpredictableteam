import { api } from './api.js';
import { icon, h, $, $$, esc, avatar, toast, timeAgo, SECTIONS, GROUP_ORDER, store } from './ui.js';

// ---------- theme ----------
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
applyTheme(store.get('theme'));
const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';

const app = document.getElementById('app');
const ctx = {
  user: null, users: {}, usersList: [], online: new Set(), unread: {}, notifications: [],
  bus: new EventTarget(), socket: null, activeGroups: new Map(),
  emit(type, detail) { this.bus.dispatchEvent(new CustomEvent(type, { detail })); },
  on(type, fn) { const f = e => fn(e.detail); this.bus.addEventListener(type, f); return () => this.bus.removeEventListener(type, f); },
  setTitle(t, iconName) { const el = $('#page-title'); if (el) el.innerHTML = (iconName ? icon(iconName) : '') + esc(t); document.title = t + ' · منصة الفريق'; },
  navigate(hash) { location.hash = hash; },
  userName(u) { return this.users[u] ? this.users[u].name : u; }
};
window.__ctx = ctx;

// ---------- login ----------
function showLogin() {
  app.innerHTML = '';
  const el = h(`<div class="login-wrap"><form class="login-card" autocomplete="on">
    <div class="logo">${icon('robot')}</div>
    <h1>منصة فريق FLL</h1>
    <p class="sub">سجّل دخولك بالحساب اللي الكوتش بعتهولك</p>
    <label class="field"><span>اسم المستخدم</span><input class="input ltr" name="username" autocomplete="username" required placeholder="مثلاً: mariam" autocapitalize="none" spellcheck="false"></label>
    <label class="field"><span>كلمة السر</span><input class="input ltr" type="password" name="password" autocomplete="current-password" required></label>
    <div class="err"></div>
    <button class="btn primary" style="width:100%;justify-content:center;padding:10px">${icon('lock')} دخول</button>
  </form></div>`);
  app.append(el);
  const form = $('form', el);
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button', form); btn.disabled = true; $('.err', form).textContent = '';
    try {
      const { user } = await api.post('/api/login', { username: form.username.value.trim().toLowerCase(), password: form.password.value });
      ctx.user = user; await start();
    } catch (err) { $('.err', form).textContent = err.message; btn.disabled = false; }
  };
  $('input', form).focus();
}

// ---------- shell ----------
const NAV = [
  { key: 'home', label: 'الرئيسية', icon: 'home', color: '#818cf8' },
  { sep: 'الأقسام' },
  { key: 'programming', label: 'Programming', icon: 'code', group: 'programming' },
  { key: 'robot', label: 'Robot Game', icon: 'robot', group: 'robot_game' },
  { key: 'tasks', label: 'Task Submissions', icon: 'tasks', group: 'tasks' },
  { key: 'mechanics', label: 'Mechanics', icon: 'gear', group: 'mechanics' },
  { key: 'values', label: 'Core Values', icon: 'heart', group: 'core_values' },
  { sep: 'الفريق' },
  { key: 'chat', label: 'الرسايل والجروبات', icon: 'chat', color: '#a78bfa', chatAll: true },
  { key: 'profile', label: 'حسابي', icon: 'user', color: '#94a3b8' }
];

function buildShell() {
  app.innerHTML = '';
  const nav = NAV.map(n => {
    if (n.sep) return `<div class="label">${esc(n.sep)}</div>`;
    const color = n.group ? `var(--c-${n.group})` : n.color;
    return `<a href="#/${n.key}" data-k="${n.key}" style="--dot:${color}">${icon(n.icon)}<span>${esc(n.label)}</span><span class="badge hidden" data-badge="${n.group || (n.chatAll ? '*' : '')}"></span></a>`;
  }).join('');
  const shell = h(`<div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="logo">${icon('robot')}</div><div><b>فريق FLL</b><small>منصة التدريب</small></div></div>
      <nav class="nav">${nav}</nav>
      <div class="online"><div class="t">الفريق</div><div class="avatars" id="online-list"></div></div>
    </aside>
    <div class="backdrop"></div>
    <div class="main">
      <header class="topbar">
        <button class="btn ghost icon menu-btn" aria-label="القائمة">${icon('menu')}</button>
        <h2 id="page-title"></h2>
        <div class="spacer"></div>
        <button class="btn ghost icon" id="theme-btn" aria-label="الوضع الليلي">${icon(isDark() ? 'sun' : 'moon')}</button>
        <div class="bell-wrap"><button class="btn ghost icon" id="bell-btn" aria-label="الإشعارات">${icon('bell')}</button><span class="badge hidden" id="bell-badge"></span></div>
        <a class="user-chip" href="#/profile">${avatar(ctx.user, 'sm')}<span class="nm">${esc(ctx.user.name)}${ctx.user.role === 'coach' ? ' · كوتش' : ''}</span></a>
      </header>
      <section class="view" id="view"></section>
    </div>
  </div>`);
  app.append(shell);
  const sidebar = $('.sidebar', shell), backdrop = $('.backdrop', shell);
  const closeMenu = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };
  $('.menu-btn', shell).onclick = () => { sidebar.classList.add('open'); backdrop.classList.add('show'); };
  backdrop.onclick = closeMenu;
  $$('.nav a', shell).forEach(a => a.addEventListener('click', closeMenu));
  $('#theme-btn').onclick = () => {
    const next = isDark() ? 'light' : 'dark'; store.set('theme', next); applyTheme(next);
    $('#theme-btn').innerHTML = icon(isDark() ? 'sun' : 'moon'); ctx.emit('theme');
  };
  $('#bell-btn').onclick = toggleNotifications;
  renderOnline(); renderBadges(); renderBell();
}

function renderOnline() {
  const el = $('#online-list'); if (!el) return;
  el.innerHTML = ctx.usersList.map(u => avatar(u, ctx.online.has(u.username) ? 'on' : 'off')).join('');
  $$('.avatar', el).forEach((a, i) => { const u = ctx.usersList[i]; a.title = u.name + (u.role === 'coach' ? ' (الكوتش)' : '') + (ctx.online.has(u.username) ? ' — متصل' : ''); });
}
function renderBadges() {
  let total = 0;
  for (const g of GROUP_ORDER) total += ctx.unread[g] || 0;
  $$('[data-badge]').forEach(b => {
    const k = b.dataset.badge; if (!k) return;
    const n = k === '*' ? total : (ctx.unread[k] || 0);
    b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n);
  });
  ctx.emit('unread', ctx.unread);
}
ctx.renderBadges = renderBadges;
ctx.markRead = (group) => {
  if (ctx.unread[group]) { ctx.unread[group] = 0; renderBadges(); }
  if (ctx.socket) ctx.socket.emit('chat:read', { group, ts: Date.now() });
};

// ---------- notifications ----------
function renderBell() {
  const n = ctx.notifications.filter(x => !x.read).length;
  const b = $('#bell-badge'); if (!b) return;
  b.textContent = n; b.classList.toggle('hidden', !n);
}
function toggleNotifications(e) {
  e.stopPropagation();
  const wrap = $('.bell-wrap');
  const old = $('.dropdown', wrap);
  if (old) { old.remove(); return; }
  const dd = h(`<div class="dropdown"><div class="head">الإشعارات</div><div class="list"></div></div>`);
  const list = $('.list', dd);
  if (!ctx.notifications.length) list.innerHTML = `<div class="empty small">مفيش إشعارات لسه</div>`;
  for (const n of ctx.notifications) {
    const a = h(`<a class="n ${n.read ? '' : 'unread'}" href="${esc(n.link || '#/home')}">${esc(n.text)}<time>${timeAgo(n.ts)}</time></a>`);
    a.onclick = () => dd.remove();
    list.append(a);
  }
  wrap.append(dd);
  const off = ev => { if (!dd.contains(ev.target)) { dd.remove(); document.removeEventListener('click', off); } };
  setTimeout(() => document.addEventListener('click', off));
  if (ctx.notifications.some(n => !n.read)) {
    api.post('/api/notifications/read').catch(() => {});
    ctx.notifications.forEach(n => (n.read = true)); renderBell();
  }
}

// ---------- realtime ----------
function connectSocket() {
  const s = window.io({ withCredentials: true });
  ctx.socket = s;
  s.on('connect_error', err => { if (String(err.message).includes('unauthorized')) logout(); });
  s.on('presence', list => { ctx.online = new Set(list); renderOnline(); ctx.emit('presence', ctx.online); });
  s.on('chat:new', m => {
    ctx.emit('chat:new', m);
    if (m.user !== ctx.user.username) {
      const viewing = ctx.activeGroups.get(m.group) && document.visibilityState === 'visible';
      if (viewing) ctx.markRead(m.group);
      else { ctx.unread[m.group] = (ctx.unread[m.group] || 0) + 1; renderBadges(); }
    }
  });
  s.on('chat:deleted', d => ctx.emit('chat:deleted', d));
  s.on('chat:typing', d => ctx.emit('chat:typing', d));
  s.on('submissions:changed', d => ctx.emit('submissions:changed', d));
  s.on('notify', n => { ctx.notifications.unshift(n); renderBell(); const t = toast('🔔 ' + n.text); t.onclick = () => { location.hash = n.link; t.remove(); }; });
  s.io.on('reconnect', () => refreshUnread());
}
async function refreshUnread() {
  try {
    const { groups } = await api.get('/api/chat/summary');
    for (const g of GROUP_ORDER) ctx.unread[g] = ctx.activeGroups.get(g) ? 0 : (groups[g] ? groups[g].unread : 0);
    ctx.summary = groups; renderBadges();
  } catch {}
}
ctx.refreshUnread = refreshUnread;

// ---------- router ----------
const PAGES = {
  home: () => import('./pages/home.js'),
  programming: () => import('./pages/programming.js'),
  robot: () => import('./pages/robot.js'),
  tasks: () => import('./pages/tasks.js'),
  mechanics: () => import('./pages/mechanics.js'),
  values: () => import('./pages/values.js'),
  chat: () => import('./pages/chat.js'),
  profile: () => import('./pages/profile.js')
};
let cleanup = null; let routeSeq = 0;
async function route() {
  if (!ctx.user) return;
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  ctx.query = new URLSearchParams(qs || '');
  const parts = (path || 'home').split('/');
  const key = PAGES[parts[0]] ? parts[0] : 'home';
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.k === key));
  const seq = ++routeSeq;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  const view = $('#view');
  view.innerHTML = '<div class="empty"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
  try {
    const mod = await PAGES[key]();
    if (seq !== routeSeq) return;
    view.innerHTML = '';
    window.scrollTo(0, 0);
    cleanup = (await mod.default(view, ctx, parts.slice(1))) || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card empty">حصلت مشكلة في فتح الصفحة: ${esc(e.message)}</div>`;
  }
}
window.addEventListener('hashchange', route);

async function logout() {
  try { await api.post('/api/logout'); } catch {}
  if (ctx.socket) ctx.socket.disconnect();
  ctx.user = null; location.hash = ''; showLogin();
}
ctx.logout = logout;
window.addEventListener('fll:logout', () => { if (ctx.user) { ctx.user = null; if (ctx.socket) ctx.socket.disconnect(); showLogin(); toast('انتهت الجلسة، سجّل دخول تاني'); } });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') for (const [g, on] of ctx.activeGroups) if (on) ctx.markRead(g);
});

async function start() {
  const { users } = await api.get('/api/users');
  ctx.usersList = users; ctx.users = Object.fromEntries(users.map(u => [u.username, u]));
  try { ctx.notifications = (await api.get('/api/notifications')).notifications; } catch {}
  buildShell();
  connectSocket();
  await refreshUnread();
  route();
}

(async function boot() {
  try {
    const { user } = await api.get('/api/me');
    ctx.user = user; await start();
  } catch { showLogin(); }
})();
