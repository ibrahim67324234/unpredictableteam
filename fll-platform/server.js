// FLL Team Platform — server
require('./src/env').load();
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { createStore } = require('./src/store');
const { streamAI, AIError } = require('./src/ai');

const PORT = process.env.PORT || 3000;
const MAX_FILE = 10 * 1024 * 1024;
const GROUPS = ['general', 'programming', 'robot_game', 'tasks', 'mechanics', 'core_values'];
const AI_SECTIONS = ['programming', 'robot_game', 'mechanics', 'core_values'];
const SUB_SECTIONS = ['programming', 'robot_game', 'mechanics', 'core_values', 'innovation', 'other'];
const COOKIE = 'fll_token';

const id = () => crypto.randomBytes(12).toString('hex');
const now = () => Date.now();
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function main() {
  const store = await createStore();
  console.log(`[store] using ${store.kind === 'mongo' ? 'MongoDB' : 'local files (./data) — for testing only'}`);

  // ---- seed accounts (first run only) ----
  if ((await store.count('users')) === 0) {
    const seed = require('./seed-users.json');
    for (const u of seed) await store.insert('users', { _id: u.username, ...u, tv: 1, createdAt: now() });
    console.log(`[seed] created ${seed.length} accounts`);
  }

  // ---- JWT secret (env, or generated once and stored in the DB) ----
  let SECRET = process.env.JWT_SECRET;
  if (!SECRET) {
    const meta = await store.findOne('meta', { _id: 'jwt' });
    if (meta) SECRET = meta.secret;
    else { SECRET = crypto.randomBytes(48).toString('hex'); await store.insert('meta', { _id: 'jwt', secret: SECRET }); }
  }

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      "connect-src 'self' ws: wss:",
      "worker-src 'self' blob:",
      "frame-src 'self' blob:",
      "object-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'"
    ].join('; '));
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // ---------- auth helpers ----------
  const publicUser = u => ({ username: u.username, name: u.name, role: u.role, color: u.color });
  const sign = u => jwt.sign({ u: u.username, tv: u.tv }, SECRET, { expiresIn: '30d' });
  async function userFromToken(token) {
    if (!token) return null;
    try {
      const p = jwt.verify(token, SECRET);
      const u = await store.findOne('users', { _id: p.u });
      if (!u || u.tv !== p.tv) return null;
      return u;
    } catch { return null; }
  }
  const auth = async (req, res, next) => {
    const hdr = req.headers.authorization || '';
    const token = req.cookies[COOKIE] || (hdr.startsWith('Bearer ') ? hdr.slice(7) : null);
    const u = await userFromToken(token);
    if (!u) return res.status(401).json({ error: 'لازم تسجل دخول الأول' });
    req.user = u; next();
  };
  const coachOnly = (req, res, next) => req.user.role === 'coach' ? next() : res.status(403).json({ error: 'الصلاحية دي للكوتش بس' });
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // simple in-memory rate limiters
  const buckets = new Map();
  function limited(key, max, windowMs) {
    const t = now(); const b = buckets.get(key) || { n: 0, reset: t + windowMs };
    if (t > b.reset) { b.n = 0; b.reset = t + windowMs; }
    b.n++; buckets.set(key, b);
    return b.n > max;
  }
  setInterval(() => { const t = now(); for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k); }, 60000).unref();

  // ---------- notifications / realtime ----------
  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 1e6 });
  async function notify(to, n) {
    const doc = { _id: id(), to, read: false, ts: now(), ...n };
    await store.insert('notifications', doc);
    io.to('user:' + to).emit('notify', doc);
  }

  // ---------- auth routes ----------
  app.post('/api/login', wrap(async (req, res) => {
    const username = str(req.body.username, 40).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const key = 'login:' + req.ip + ':' + username;
    const lock = buckets.get(key);
    if (lock && lock.n >= 6 && now() < lock.reset) return res.status(429).json({ error: 'محاولات كتير غلط — استنى 5 دقايق وجرب تاني' });
    const u = await store.findOne('users', { _id: username });
    if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
      limited(key, 6, 5 * 60000);
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر غلط' });
    }
    buckets.delete(key);
    res.cookie(COOKIE, sign(u), { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 30 * 864e5 });
    res.json({ user: publicUser(u) });
  }));
  app.post('/api/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });
  app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user), groups: GROUPS }));
  app.post('/api/me/password', auth, wrap(async (req, res) => {
    const { current, next } = req.body || {};
    if (typeof next !== 'string' || next.length < 8) return res.status(400).json({ error: 'كلمة السر الجديدة لازم تكون 8 حروف على الأقل' });
    if (!(await bcrypt.compare(String(current || ''), req.user.passwordHash))) return res.status(400).json({ error: 'كلمة السر الحالية غلط' });
    const u = { ...req.user, passwordHash: await bcrypt.hash(next, 12), tv: (req.user.tv || 1) + 1 };
    await store.replace('users', u._id, u);
    res.cookie(COOKIE, sign(u), { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 30 * 864e5 });
    res.json({ ok: true });
  }));
  app.get('/api/users', auth, wrap(async (req, res) => {
    const users = await store.find('users', {});
    const order = ['coach', 'student'];
    users.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
    res.json({ users: users.map(publicUser) });
  }));
  app.post('/api/users/:u/password', auth, coachOnly, wrap(async (req, res) => {
    const target = await store.findOne('users', { _id: req.params.u });
    if (!target) return res.status(404).json({ error: 'المستخدم مش موجود' });
    const next = req.body && req.body.next;
    if (typeof next !== 'string' || next.length < 8) return res.status(400).json({ error: 'كلمة السر لازم تكون 8 حروف على الأقل' });
    await store.replace('users', target._id, { ...target, passwordHash: await bcrypt.hash(next, 12), tv: (target.tv || 1) + 1 });
    res.json({ ok: true });
  }));

  // ---------- files ----------
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: 1 }, defParamCharset: 'utf8' });
  function sniff(buf) {
    if (buf.slice(0, 5).toString() === '%PDF-') return 'application/pdf';
    if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
    return null;
  }
  const canSeeFile = (u, meta) => meta.owner === u.username || u.role === 'coach' || meta.access === 'team' || (meta.allowed || []).includes(u.username);

  app.post('/api/files', auth, (req, res, next) => upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'الملف أكبر من 10MB' : 'مشكلة في رفع الملف' });
    next();
  }), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'مفيش ملف' });
    const purpose = ['chat', 'submission', 'ai'].includes(req.body.purpose) ? req.body.purpose : 'chat';
    const type = sniff(req.file.buffer);
    if (!type) return res.status(400).json({ error: 'نوع الملف مش مدعوم — ارفع PDF أو صورة (PNG/JPG/WEBP)' });
    if (limited('upload:' + req.user.username, 40, 60 * 60000)) return res.status(429).json({ error: 'رفعت ملفات كتير — استنى شوية' });
    const name = String(req.file.originalname || 'file').replace(/[\\/\r\n"]/g, '_');
    const meta = {
      _id: id(), owner: req.user.username, name: name.slice(0, 120), type, size: req.file.size, purpose,
      access: purpose === 'chat' ? 'team' : 'private', allowed: [], createdAt: now()
    };
    await store.putFile(meta, req.file.buffer);
    res.json({ file: { id: meta._id, name: meta.name, type, size: meta.size } });
  }));
  app.get('/api/files/:id', auth, wrap(async (req, res) => {
    const f = await store.getFile(req.params.id);
    if (!f || !canSeeFile(req.user, f.meta)) return res.status(404).json({ error: 'الملف مش موجود' });
    res.setHeader('Content-Type', f.meta.type);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    const disp = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disp}; filename*=UTF-8''${encodeURIComponent(f.meta.name)}`);
    res.end(f.buffer);
  }));

  // ---------- chat ----------
  app.get('/api/chat/summary', auth, wrap(async (req, res) => {
    const reads = (await store.findOne('reads', { _id: req.user.username })) || { groups: {} };
    const out = {};
    for (const g of GROUPS) {
      const [last] = await store.find('messages', { group: g }, { sort: { ts: -1 }, limit: 1 });
      const since = reads.groups[g] || 0;
      const unread = await store.count('messages', { group: g, ts: { $gt: since }, user: { $ne: req.user.username } });
      out[g] = { last: last || null, unread };
    }
    res.json({ groups: out });
  }));
  app.get('/api/chat/:group', auth, wrap(async (req, res) => {
    const g = req.params.group;
    if (!GROUPS.includes(g)) return res.status(404).json({ error: 'الجروب مش موجود' });
    const q = { group: g };
    const before = Number(req.query.before);
    if (before) q.ts = { $lt: before };
    const list = await store.find('messages', q, { sort: { ts: -1 }, limit: 60 });
    res.json({ messages: list.reverse(), more: list.length === 60 });
  }));

  // ---------- submissions ----------
  const canSeeSub = (u, s) => u.role === 'coach' || s.owner === u.username || s.recipients.includes(u.username);
  async function allowFile(fileId, users) {
    const f = await store.findOne('files', { _id: fileId });
    if (f) await store.updateFileMeta(fileId, { allowed: [...new Set([...(f.allowed || []), ...users])] });
  }
  async function ownFile(u, fileId) {
    const f = await store.findOne('files', { _id: fileId });
    return f && f.owner === u.username ? f : null;
  }
  app.get('/api/submissions', auth, wrap(async (req, res) => {
    const all = await store.find('submissions', {}, { sort: { updatedAt: -1 } });
    res.json({ submissions: all.filter(s => canSeeSub(req.user, s)) });
  }));
  app.get('/api/submissions/:id', auth, wrap(async (req, res) => {
    const s = await store.findOne('submissions', { _id: req.params.id });
    if (!s || !canSeeSub(req.user, s)) return res.status(404).json({ error: 'التاسك مش موجود' });
    res.json({ submission: s });
  }));
  app.post('/api/submissions', auth, wrap(async (req, res) => {
    const title = str(req.body.title, 120);
    const description = str(req.body.description, 3000);
    const section = SUB_SECTIONS.includes(req.body.section) ? req.body.section : 'other';
    const users = (await store.find('users', {})).map(u => u.username);
    const recipients = [...new Set((Array.isArray(req.body.recipients) ? req.body.recipients : []))]
      .filter(r => users.includes(r) && r !== req.user.username);
    if (!title) return res.status(400).json({ error: 'اكتب عنوان للتاسك' });
    if (!recipients.length) return res.status(400).json({ error: 'اختار حد تبعتله التاسك (الكوتش أو زميل)' });
    const f = await ownFile(req.user, req.body.fileId);
    if (!f) return res.status(400).json({ error: 'ارفع ملف الـ PDF الأول' });
    await allowFile(f._id, recipients);
    const s = {
      _id: id(), title, description, section, owner: req.user.username, recipients,
      status: 'pending', grade: null, comments: [],
      versions: [{ fileId: f._id, fileName: f.name, size: f.size, type: f.type, note: '', at: now() }],
      createdAt: now(), updatedAt: now()
    };
    await store.insert('submissions', s);
    for (const r of recipients) await notify(r, { type: 'submission', text: `${req.user.name} بعتلك تاسك: ${title}`, link: '#/tasks/' + s._id });
    io.emit('submissions:changed', { id: s._id });
    res.json({ submission: s });
  }));
  app.post('/api/submissions/:id/comments', auth, wrap(async (req, res) => {
    const s = await store.findOne('submissions', { _id: req.params.id });
    if (!s || !canSeeSub(req.user, s)) return res.status(404).json({ error: 'التاسك مش موجود' });
    const text = str(req.body.text, 3000);
    if (!text) return res.status(400).json({ error: 'اكتب تعليق' });
    s.comments.push({ id: id(), user: req.user.username, text, at: now() });
    s.updatedAt = now();
    await store.replace('submissions', s._id, s);
    const involved = new Set([s.owner, ...s.recipients]);
    involved.delete(req.user.username);
    for (const u of involved) await notify(u, { type: 'comment', text: `${req.user.name} علّق على: ${s.title}`, link: '#/tasks/' + s._id });
    io.emit('submissions:changed', { id: s._id });
    res.json({ submission: s });
  }));
  app.post('/api/submissions/:id/grade', auth, coachOnly, wrap(async (req, res) => {
    const s = await store.findOne('submissions', { _id: req.params.id });
    if (!s) return res.status(404).json({ error: 'التاسك مش موجود' });
    const score = Math.max(0, Math.min(10, Math.round(Number(req.body.score) * 2) / 2));
    if (!Number.isFinite(score)) return res.status(400).json({ error: 'الدرجة لازم تكون رقم من 0 لـ 10' });
    const status = req.body.status === 'revise' ? 'revise' : 'approved';
    s.grade = { score, feedback: str(req.body.feedback, 3000), by: req.user.username, at: now(), version: s.versions.length };
    s.status = status; s.updatedAt = now();
    await store.replace('submissions', s._id, s);
    await notify(s.owner, { type: 'grade', text: `الكوتش ${req.user.name} قيّمت "${s.title}": ${score}/10 ${status === 'approved' ? '✅' : '✏️ محتاج تعديل'}`, link: '#/tasks/' + s._id });
    io.emit('submissions:changed', { id: s._id });
    res.json({ submission: s });
  }));
  app.post('/api/submissions/:id/versions', auth, wrap(async (req, res) => {
    const s = await store.findOne('submissions', { _id: req.params.id });
    if (!s || s.owner !== req.user.username) return res.status(404).json({ error: 'التاسك مش موجود' });
    const f = await ownFile(req.user, req.body.fileId);
    if (!f) return res.status(400).json({ error: 'ارفع الملف الجديد الأول' });
    await allowFile(f._id, s.recipients);
    s.versions.push({ fileId: f._id, fileName: f.name, size: f.size, type: f.type, note: str(req.body.note, 500), at: now() });
    s.status = 'pending'; s.updatedAt = now();
    await store.replace('submissions', s._id, s);
    for (const r of s.recipients) await notify(r, { type: 'version', text: `${req.user.name} رفع نسخة جديدة من: ${s.title}`, link: '#/tasks/' + s._id });
    io.emit('submissions:changed', { id: s._id });
    res.json({ submission: s });
  }));
  app.delete('/api/submissions/:id', auth, wrap(async (req, res) => {
    const s = await store.findOne('submissions', { _id: req.params.id });
    if (!s || (s.owner !== req.user.username && req.user.role !== 'coach')) return res.status(404).json({ error: 'التاسك مش موجود' });
    await store.remove('submissions', { _id: s._id });
    io.emit('submissions:changed', { id: s._id, deleted: true });
    res.json({ ok: true });
  }));

  // ---------- notifications ----------
  app.get('/api/notifications', auth, wrap(async (req, res) => {
    const list = await store.find('notifications', { to: req.user.username }, { sort: { ts: -1 }, limit: 30 });
    res.json({ notifications: list });
  }));
  app.post('/api/notifications/read', auth, wrap(async (req, res) => {
    const list = await store.find('notifications', { to: req.user.username, read: false });
    for (const n of list) await store.replace('notifications', n._id, { ...n, read: true });
    res.json({ ok: true });
  }));

  // ---------- simulator layouts (shared with the team) ----------
  app.get('/api/layouts', auth, wrap(async (req, res) => {
    res.json({ layouts: await store.find('layouts', {}, { sort: { createdAt: -1 }, limit: 100 }) });
  }));
  app.post('/api/layouts', auth, wrap(async (req, res) => {
    const name = str(req.body.name, 60);
    const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 200) : [];
    if (!name) return res.status(400).json({ error: 'اكتب اسم للطاولة' });
    const clean = items.map(it => ({
      id: str(it.id, 40) || id(), kind: str(it.kind, 20), color: str(it.color, 20),
      x: +it.x || 0, y: +it.y || 0, w: +it.w || 0, h: +it.h || 0, r: +it.r || 0, rot: +it.rot || 0
    }));
    const robot = req.body.robot && typeof req.body.robot === 'object' ? { x: +req.body.robot.x || 0, y: +req.body.robot.y || 0, heading: +req.body.robot.heading || 0 } : null;
    const code = str(req.body.code, 20000);
    const lang = req.body.lang === 'python' ? 'python' : 'js';
    const doc = { _id: id(), name, owner: req.user.username, items: clean, robot, code, lang, createdAt: now() };
    await store.insert('layouts', doc);
    res.json({ layout: doc });
  }));
  app.delete('/api/layouts/:id', auth, wrap(async (req, res) => {
    const l = await store.findOne('layouts', { _id: req.params.id });
    if (!l || (l.owner !== req.user.username && req.user.role !== 'coach')) return res.status(404).json({ error: 'مش موجودة' });
    await store.remove('layouts', { _id: l._id });
    res.json({ ok: true });
  }));

  // ---------- dashboard ----------
  app.get('/api/dashboard', auth, wrap(async (req, res) => {
    const users = await store.find('users', {});
    const subs = (await store.find('submissions', {})).filter(s => canSeeSub(req.user, s));
    const me = req.user.username;
    const stats = {
      total: subs.length,
      mine: subs.filter(s => s.owner === me).length,
      minePending: subs.filter(s => s.owner === me && s.status === 'pending').length,
      mineApproved: subs.filter(s => s.owner === me && s.status === 'approved').length,
      mineRevise: subs.filter(s => s.owner === me && s.status === 'revise').length,
      received: subs.filter(s => s.recipients.includes(me)).length,
      toReview: req.user.role === 'coach' ? subs.filter(s => s.status === 'pending').length : subs.filter(s => s.recipients.includes(me) && s.status === 'pending').length
    };
    let team = null;
    if (req.user.role === 'coach') {
      team = users.filter(u => u.role === 'student').map(u => {
        const own = subs.filter(s => s.owner === u.username);
        const graded = own.filter(s => s.grade);
        return {
          ...publicUser(u), total: own.length,
          pending: own.filter(s => s.status === 'pending').length,
          avg: graded.length ? Math.round(graded.reduce((a, s) => a + s.grade.score, 0) / graded.length * 10) / 10 : null
        };
      });
    }
    const recent = subs.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5)
      .map(s => ({ _id: s._id, title: s.title, owner: s.owner, status: s.status, section: s.section, updatedAt: s.updatedAt, score: s.grade ? s.grade.score : null }));
    res.json({ stats, team, recent, aiReady: !!process.env.GEMINI_API_KEY || process.env.AI_MOCK === '1', storage: store.kind });
  }));

  // ---------- AI ----------
  app.get('/api/ai/:section/history', auth, wrap(async (req, res) => {
    if (!AI_SECTIONS.includes(req.params.section)) return res.status(404).json({ error: 'قسم غير معروف' });
    const h = await store.findOne('ai_history', { _id: req.user.username + ':' + req.params.section });
    res.json({ messages: h ? h.messages : [] });
  }));
  app.delete('/api/ai/:section/history', auth, wrap(async (req, res) => {
    await store.remove('ai_history', { _id: req.user.username + ':' + req.params.section });
    res.json({ ok: true });
  }));
  app.post('/api/ai/:section', auth, wrap(async (req, res) => {
    const section = req.params.section;
    if (!AI_SECTIONS.includes(section)) return res.status(404).json({ error: 'قسم غير معروف' });
    const message = str(req.body.message, 8000);
    const context = str(req.body.context, 20000);
    if (!message && !req.body.fileId) return res.status(400).json({ error: 'اكتب سؤالك' });
    if (limited('ai:' + req.user.username, 12, 60000)) return res.status(429).json({ error: 'بتسأل بسرعة أوي 😅 استنى دقيقة' });

    const hid = req.user.username + ':' + section;
    const hist = (await store.findOne('ai_history', { _id: hid })) || { _id: hid, user: req.user.username, section, messages: [] };
    let file = null;
    if (req.body.fileId) {
      const f = await store.getFile(req.body.fileId);
      if (!f || f.meta.owner !== req.user.username) return res.status(400).json({ error: 'الملف مش موجود' });
      file = f;
    }
    // find the latest file in the conversation so follow-up questions still "see" it
    const start = Math.max(0, hist.messages.length - 24);
    let lastFileIdx = -1;
    if (!file) for (let i = hist.messages.length - 1; i >= Math.max(start, hist.messages.length - 12); i--) if (hist.messages[i].file) { lastFileIdx = i; break; }
    const contents = [];
    for (let i = start; i < hist.messages.length; i++) {
      const m = hist.messages[i];
      const parts = [];
      if (m.file) {
        if (i === lastFileIdx) {
          const f = await store.getFile(m.file.id);
          if (f) parts.push({ inlineData: { mimeType: f.meta.type, data: f.buffer.toString('base64') } });
        } else parts.push({ text: `[ملف مرفق سابقًا: ${m.file.name}]` });
      }
      if (m.text) parts.push({ text: m.text });
      contents.push({ role: m.role === 'ai' ? 'model' : 'user', parts });
    }
    const userParts = [];
    if (file) userParts.push({ inlineData: { mimeType: file.meta.type, data: file.buffer.toString('base64') } });
    const who = `(الطالب اللي بيكلمك: ${req.user.name}${req.user.role === 'coach' ? ' — دي الكوتش' : ''})`;
    userParts.push({ text: `${who}\n${context ? 'سياق من المنصة:\n' + context + '\n\n' : ''}${message || 'بص على الملف ده وقولي رأيك.'}` });
    contents.push({ role: 'user', parts: userParts });

    let started = false; let reply = '';
    try {
      for await (const chunk of streamAI({ section, contents })) {
        if (!started) {
          started = true;
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
        }
        reply += chunk; res.write(chunk);
      }
    } catch (e) {
      const msg = e instanceof AIError ? e.message : 'حصلت مشكلة غير متوقعة مع الـ AI';
      if (!started) return res.status(e.status || 500).json({ error: msg });
      res.write('\n\n⚠️ ' + msg); reply += '\n\n⚠️ ' + msg;
    }
    if (!started) res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end();
    hist.messages.push({ role: 'user', text: message, file: file ? { id: file.meta._id, name: file.meta.name, type: file.meta.type } : null, at: now() });
    hist.messages.push({ role: 'ai', text: reply, at: now() });
    hist.messages = hist.messages.slice(-40);
    await store.replace('ai_history', hid, hist);
  }));

  // ---------- static ----------
  const nm = p => path.join(__dirname, 'node_modules', p);
  const staticOpts = { maxAge: '7d' };
  app.use('/vendor/marked', express.static(nm('marked/lib'), staticOpts));
  app.use('/vendor/purify', express.static(nm('dompurify/dist'), staticOpts));
  app.use('/vendor/hljs', express.static(nm('@highlightjs/cdn-assets'), staticOpts));
  app.use('/vendor/pyodide', express.static(nm('pyodide'), staticOpts));
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: true }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'حصلت مشكلة في السيرفر' }); });

  // ---------- sockets ----------
  const online = new Map();
  const emitPresence = () => io.emit('presence', [...online.keys()]);
  io.use(async (socket, next) => {
    const cookies = Object.fromEntries((socket.handshake.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
    const u = await userFromToken(cookies[COOKIE] || (socket.handshake.auth && socket.handshake.auth.token));
    if (!u) return next(new Error('unauthorized'));
    socket.data.user = u; next();
  });
  io.on('connection', socket => {
    const u = socket.data.user;
    socket.join('user:' + u.username);
    online.set(u.username, (online.get(u.username) || 0) + 1);
    emitPresence();
    socket.on('disconnect', () => {
      const n = (online.get(u.username) || 1) - 1;
      if (n <= 0) online.delete(u.username); else online.set(u.username, n);
      emitPresence();
    });
    socket.on('chat:send', async (data, ack = () => {}) => {
      try {
        if (!data || !GROUPS.includes(data.group)) return ack({ error: 'جروب غير معروف' });
        if (limited('chat:' + u.username, 30, 60000)) return ack({ error: 'بتبعت بسرعة أوي، استنى ثانية' });
        const text = str(data.text, 4000);
        let attachment = null;
        if (data.attachmentId) {
          const f = await store.findOne('files', { _id: data.attachmentId });
          if (!f || f.owner !== u.username) return ack({ error: 'المرفق مش موجود' });
          if (f.access !== 'team') await store.updateFileMeta(f._id, { access: 'team' });
          attachment = { id: f._id, name: f.name, type: f.type, size: f.size };
        }
        if (!text && !attachment) return ack({ error: 'الرسالة فاضية' });
        const msg = { _id: id(), group: data.group, user: u.username, text, attachment, ts: now() };
        await store.insert('messages', msg);
        io.emit('chat:new', msg);
        ack({ ok: true, message: msg });
      } catch (e) { console.error(e); ack({ error: 'مشكلة في الإرسال' }); }
    });
    socket.on('chat:delete', async (data, ack = () => {}) => {
      try {
        const m = await store.findOne('messages', { _id: data && data.id });
        if (!m || (m.user !== u.username && u.role !== 'coach')) return ack({ error: 'مش مسموح' });
        await store.remove('messages', { _id: m._id });
        io.emit('chat:deleted', { id: m._id, group: m.group });
        ack({ ok: true });
      } catch (e) { ack({ error: 'مشكلة' }); }
    });
    socket.on('chat:read', async (data) => {
      try {
        if (!data || !GROUPS.includes(data.group)) return;
        const r = (await store.findOne('reads', { _id: u.username })) || { _id: u.username, groups: {} };
        r.groups[data.group] = Math.min(now(), Number(data.ts) || now());
        await store.replace('reads', u.username, r);
      } catch {}
    });
    socket.on('chat:typing', (data) => {
      if (data && GROUPS.includes(data.group)) socket.broadcast.emit('chat:typing', { group: data.group, user: u.username });
    });
  });

  server.listen(PORT, () => console.log(`FLL platform running on http://localhost:${PORT}`));
}

main().catch(e => { console.error('Failed to start:', e); process.exit(1); });
