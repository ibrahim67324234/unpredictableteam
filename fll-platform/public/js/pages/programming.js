import { icon, h, $, $$, esc, store } from '../ui.js';
import { sectionShell } from '../components/section.js';
import { aiChat } from '../components/aichat.js';

const S = window.SimCore;

export default function programming(view, ctx) {
  return sectionShell(view, ctx, {
    section: 'programming', group: 'programming', title: 'Programming', iconName: 'code',
    desc: 'الصق الكود والمساعد يشرحهولك خطوة بخطوة، واتعلم الـ PID وجرّبه بنفسك في الـ PID Lab.',
    tabs: [
      { key: 'ai', label: 'المساعد الذكي', icon: 'sparkles', render: pane => aiTab(pane, ctx) },
      { key: 'pid', label: 'PID Lab', icon: 'wave', render: pane => pidLab(pane) }
    ]
  });
}

function aiTab(pane, ctx) {
  const k = 'prog:' + ctx.user.username;
  const wrap = h(`<div class="split">
    <div class="card code-panel" style="padding:12px">
      <div class="row" style="margin-bottom:8px">
        <b style="flex:1">${icon('code')} الكود بتاعك</b>
        <select class="input" data-lang style="width:auto;padding:4px 8px;font-size:13px">
          <option>SPIKE Prime Python</option><option>SPIKE Word Blocks (مكتوبة)</option><option>Pybricks</option><option>EV3 MicroPython</option><option>EV3 Classroom (مكتوبة)</option><option>Arduino / C++</option><option>غير ذلك</option>
        </select>
      </div>
      <textarea class="input code" data-code spellcheck="false" placeholder="الصق الكود هنا (أو اكتب البلوكات بالترتيب)...&#10;&#10;مثال:&#10;from hub import port&#10;import motor_pair, runloop&#10;&#10;async def main():&#10;    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)&#10;    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 720, 0, velocity=500)&#10;&#10;runloop.run(main())"></textarea>
      <div class="row" style="margin-top:8px">
        <button class="btn sm" data-q="اشرحلي الكود ده سطر سطر بطريقة بسيطة.">${icon('book')} اشرحه سطر سطر</button>
        <button class="btn sm" data-q="فين الغلط في الكود ده؟ وليه؟ وإزاي أصلحه بنفسي؟">🐞 فين الغلط؟</button>
        <button class="btn sm" data-q="إزاي أحسّن الكود ده وأخليه أنضف وأسهل يتعدل (functions مثلاً)؟">✨ حسّنه</button>
        <button class="btn sm" data-q="إزاي أضيف PID أو gyro correction للكود ده عشان الروبوت يبقى أدق؟">🎯 ضيف PID</button>
      </div>
    </div>
    <div data-ai></div>
  </div>`);
  pane.append(wrap);
  const codeEl = $('[data-code]', wrap), langEl = $('[data-lang]', wrap);
  codeEl.value = store.get(k + ':code', '');
  langEl.value = store.get(k + ':lang', 'SPIKE Prime Python');
  codeEl.addEventListener('input', () => store.set(k + ':code', codeEl.value));
  langEl.addEventListener('change', () => store.set(k + ':lang', langEl.value));
  codeEl.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); codeEl.setRangeText('    ', codeEl.selectionStart, codeEl.selectionEnd, 'end'); codeEl.dispatchEvent(new Event('input')); } });
  const ai = aiChat(ctx, {
    section: 'programming', title: 'مساعد البرمجة',
    intro: 'الصق الكود في المربع وأنا أشرحهولك، أو اسألني عن أي حاجة في البرمجة والـ PID.',
    quick: ['ايه هو الـ PID ببساطة؟', 'إزاي أظبط Kp و Kd؟', 'الفرق بين move_for_degrees و move_tank_for_degrees', 'إزاي الروبوت يمشي مستقيم بالجيرو؟', 'اشرحلي async و await في SPIKE'],
    getContext: () => codeEl.value.trim() ? `كود الطالب (${langEl.value}):\n\`\`\`\n${codeEl.value.slice(0, 12000)}\n\`\`\`` : '',
    contextLabel: 'ابعت الكود اللي في المربع مع السؤال',
    allowFile: true, fileHint: 'إرفاق صورة للبلوكات أو PDF'
  });
  $('[data-ai]', wrap).append(ai.el);
  $$('[data-q]', wrap).forEach(b => (b.onclick = () => {
    if (!codeEl.value.trim()) { codeEl.focus(); codeEl.placeholder = '⬅️ الصق الكود هنا الأول'; return; }
    ai.send(b.dataset.q);
  }));
  return ai;
}

// ---------------- PID Lab ----------------
function buildTrack() {
  const cx = 1181, cy = 571, N = 140, pts = [];
  for (let i = 0; i < N; i++) { const t = (i / N) * Math.PI * 2; pts.push([cx + 820 * Math.cos(t), cy + 330 * Math.sin(t) + 95 * Math.sin(3 * t)]); }
  const items = [];
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % N];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    items.push({ kind: 'line', color: 'black', x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, w: len + 6, h: 20, rot: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI });
  }
  // start pose: sensor on the right edge of the line, heading along the track
  const p = pts[0], q = pts[1];
  const hd = Math.atan2(q[1] - p[1], q[0] - p[0]);
  const T = [Math.cos(hd), Math.sin(hd)], R = [-T[1], T[0]];
  const sx = p[0] + R[0] * 11, sy = p[1] + R[1] * 11;
  return { pts, items, start: { x: sx - T[0] * 75, y: sy - T[1] * 75, h: hd * 180 / Math.PI } };
}
let TRACK = null;
function simulatePID({ kp, ki, kd, base, secs = 14, accel = 1500 }) {
  TRACK ||= buildTrack();
  const w = S.createWorld({ items: TRACK.items, robot: TRACK.start });
  w.accel = accel; // a heavier robot reacts slower — this is what makes D useful
  const api = S.makeApi(w, ms => { for (let i = 0; i < Math.max(1, Math.round(ms / 5)); i++) S.step(w, 5); }, { print() {} });
  let integral = 0, last = 0, lostMs = 0, lost = false;
  const log = [], path = [];
  const N = TRACK.pts.length;
  const nearest = (x, y) => { let d = Infinity, idx = 0; TRACK.pts.forEach((p, i) => { const dd = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (dd < d) { d = dd; idx = i; } }); return [Math.sqrt(d), idx]; };
  let lastIdx = 0, progress = 0, checkT = 0, checkP = 0, reason = '';
  // like a real robot: the control loop runs every ~20 ms and the reading reaches the motors a bit late
  const delay = [0];
  while (w.t < secs * 1000) {
    delay.push(api.reflection() - 50);
    const e = delay.shift();
    integral = Math.max(-5000, Math.min(5000, integral + e));
    const d = e - last; last = e;
    const turn = kp * e + ki * integral + kd * d;
    api.drive(base - turn, base + turn);
    api.wait(5);
    if (w.t % 15 === 0) {
      const [sx, sy] = S.sensorPos(w);
      log.push([w.t, e]); path.push([w.robot.x, w.robot.y, e]);
      const [dist, idx] = nearest(sx, sy);
      let dIdx = idx - lastIdx; if (dIdx > N / 2) dIdx -= N; if (dIdx < -N / 2) dIdx += N;
      progress += dIdx; lastIdx = idx;
      if (dist > 70) { lostMs += 15; if (lostMs > 400) { lost = true; reason = 'off'; break; } } else lostMs = 0;
      if (w.t - checkT >= 2000) { if (progress - checkP < 4) { lost = true; reason = 'spin'; break; } checkT = w.t; checkP = progress; }
    }
  }
  const errs = log.map(l => Math.abs(l[1]));
  return { log, path, lost, reason, laps: progress / N, t: w.t, mean: errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length), max: Math.max(0, ...errs) };
}

function pidLab(pane) {
  const presets = {
    'P بس': { kp: 0.5, ki: 0, kd: 0 },
    'Kp صغير (بيخرج)': { kp: 0.15, ki: 0, kd: 0 },
    'Kp كبير (بيتذبذب)': { kp: 1.2, ki: 0, kd: 0 },
    'PD (الـ D بيهدّيه)': { kp: 1.2, ki: 0, kd: 3 },
    'PID كامل': { kp: 1, ki: 0.004, kd: 3 },
    'Ki كبير (تمايل)': { kp: 0.5, ki: 0.05, kd: 1 }
  };
  const st = { kp: 0.5, ki: 0, kd: 0, base: 40, ...store.get('pidlab2', {}) };
  const el = h(`<div class="pid-grid">
    <div class="stack">
      <div class="card">
        <h3>${icon('target')} ظبّط المعاملات</h3>
        ${slider('kp', 'Kp — التناسبي (P)', 0, 3, 0.05)}
        ${slider('ki', 'Ki — التكاملي (I)', 0, 0.05, 0.001)}
        ${slider('kd', 'Kd — التفاضلي (D)', 0, 10, 0.1)}
        ${slider('base', 'السرعة الأساسية %', 15, 80, 5)}
        <div class="row" style="gap:6px">${Object.keys(presets).map(p => `<button class="btn sm" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      </div>
      <div class="card">
        <h3>${icon('book')} يعني ايه PID؟</h3>
        <div class="stack" style="gap:8px">
          <div class="md" style="direction:ltr;text-align:center"><code>turn = Kp·error + Ki·Σerror + Kd·(error − lastError)</code></div>
          <div class="term"><b>error = الانعكاس − 50</b><p>50 هو نص المسافة بين الأسود (≈7) والأبيض (≈98)، يعني الحساس واقف على حافة الخط بالظبط.</p></div>
          <div class="term"><b>P — Proportional</b><p>بيصحّح على قد الغلط دلوقتي: كل ما تبعد عن الخط أكتر، تلف أكتر. Kp صغير = الروبوت بيتأخر وممكن يخرج، Kp كبير = بيتذبذب يمين وشمال.</p></div>
          <div class="term"><b>I — Integral</b><p>بيجمع الغلط على مر الوقت، فبيصلّح الانحراف الصغير اللي بيفضل موجود. لازم يكون صغير جدًا وإلا الروبوت هيتمايل.</p></div>
          <div class="term"><b>D — Derivative</b><p>بيبص على سرعة تغيّر الغلط، فبيفرمل اللف قبل ما يعدّي الخط ويقلل التذبذب.</p></div>
          <div class="term"><b>طريقة الضبط</b><p>1) خلي Ki و Kd = 0 وزوّد Kp لحد ما يبدأ يتذبذب، وبعدين قلله شوية. 2) زوّد Kd لحد ما التذبذب يهدى. 3) لو محتاج، زوّد Ki حاجة صغيرة جدًا.</p></div>
        </div>
      </div>
    </div>
    <div class="stack">
      <div class="card">
        <div class="row" style="margin-bottom:8px"><h3 style="margin:0;flex:1">${icon('robot')} الروبوت بيتبع الخط</h3><span data-status class="chip"></span></div>
        <canvas class="pid-canvas" data-track></canvas>
        <div class="grid g4" style="margin-top:10px">
          <div class="metric"><b data-m="mean"></b><span>متوسط الخطأ</span></div>
          <div class="metric"><b data-m="max"></b><span>أكبر خطأ</span></div>
          <div class="metric"><b data-m="time"></b><span>وقت على الخط</span></div>
          <div class="metric"><b data-m="score"></b><span>التقييم</span></div>
        </div>
      </div>
      <div class="card"><h3>${icon('wave')} الـ error مع الوقت</h3><canvas class="pid-canvas" data-plot></canvas>
        <p class="muted small" style="margin:8px 0 0">الخط الأحمر = الخطأ. كل ما يكون قريب من الصفر ومش بيتذبذب، كل ما الـ PID أحسن. جرّب نفس القيم بعد كده في قسم Robot Game على الروبوت 🤖</p></div>
    </div>
  </div>`);
  pane.append(el);
  function slider(k, label, min, max, step) {
    return `<div class="slider-row"><div class="top"><span>${label}</span><span class="ltr" data-v="${k}"></span></div><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}"></div>`;
  }
  const trackC = $('[data-track]', el), plotC = $('[data-plot]', el);
  let timer = null, res = null;
  function sync() {
    for (const k of ['kp', 'ki', 'kd', 'base']) { $(`[data-k="${k}"]`, el).value = st[k]; $(`[data-v="${k}"]`, el).textContent = k === 'base' ? st[k] + '%' : String(st[k]); }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 40); }
  function run() {
    store.set('pidlab2', st);
    res = simulatePID(st);
    draw();
  }
  function setupCanvas(c, ratio) {
    const w = c.clientWidth || 600, dpr = window.devicePixelRatio || 1;
    c.style.height = w * ratio + 'px'; c.width = Math.round(w * dpr); c.height = Math.round(w * ratio * dpr);
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return [g, w, w * ratio];
  }
  function draw() {
    if (!res) return;
    // track view
    const [g, W, H] = setupCanvas(trackC, 1143 / 2362);
    const s = W / 2362;
    g.fillStyle = '#f7f6f0'; g.fillRect(0, 0, W, H);
    g.save(); g.scale(s, s);
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 20; g.lineJoin = 'round'; g.beginPath();
    TRACK.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke();
    g.lineWidth = 7; g.lineCap = 'round';
    for (let i = 1; i < res.path.length; i++) {
      const a = res.path[i - 1], b = res.path[i], e = Math.min(1, Math.abs(b[2]) / 45);
      g.strokeStyle = `hsl(${140 - e * 140}, 80%, 45%)`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    const end = res.path[res.path.length - 1];
    if (end) { g.fillStyle = res.lost ? '#dc2626' : '#4f46e5'; g.beginPath(); g.arc(end[0], end[1], 26, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#16a34a'; g.beginPath(); g.arc(TRACK.start.x, TRACK.start.y, 18, 0, Math.PI * 2); g.fill();
    g.restore();
    // plot
    const [p, PW, PH] = setupCanvas(plotC, 0.32);
    p.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface-2'); p.fillRect(0, 0, PW, PH);
    const secs = 14, pad = 26;
    const x = t => pad + (t / (secs * 1000)) * (PW - pad - 8), y = e => PH / 2 - (e / 50) * (PH / 2 - 10);
    p.strokeStyle = 'rgba(128,128,128,.35)'; p.lineWidth = 1;
    for (const e of [-40, -20, 0, 20, 40]) { p.beginPath(); p.moveTo(pad, y(e)); p.lineTo(PW - 8, y(e)); p.stroke(); }
    p.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted'); p.font = '11px sans-serif'; p.textAlign = 'right';
    for (const e of [-40, 0, 40]) p.fillText(String(e), pad - 4, y(e) + 4);
    p.textAlign = 'center'; for (let t = 2; t <= secs; t += 2) p.fillText(t + 's', x(t * 1000), PH - 3);
    p.strokeStyle = '#ef4444'; p.lineWidth = 2; p.beginPath();
    res.log.forEach(([t, e], i) => (i ? p.lineTo(x(t), y(Math.max(-50, Math.min(50, e)))) : p.moveTo(x(t), y(e)))); p.stroke();
    // metrics
    const onLine = res.t / 1000;
    const score = res.lost ? 'خرج من الخط ❌' : res.mean < 8 ? 'ممتاز 🏆' : res.mean < 14 ? 'كويس 👍' : res.mean < 22 ? 'محتاج ضبط' : 'متذبذب جدًا';
    $('[data-m="mean"]', el).textContent = res.mean.toFixed(1);
    $('[data-m="max"]', el).textContent = res.max.toFixed(0);
    $('[data-m="time"]', el).textContent = onLine.toFixed(1) + ' ث';
    $('[data-m="score"]', el).textContent = score;
    const stEl = $('[data-status]', el);
    stEl.textContent = res.lost ? (res.reason === 'spin' ? 'الروبوت بيلف حوالين نفسه 🌀' : 'الروبوت خرج عن الخط') : `مشي ${res.laps.toFixed(2)} لفة ✅`;
    stEl.className = 'chip ' + (res.lost ? 'status-revise' : 'status-approved');
  }
  $$('input[data-k]', el).forEach(inp => inp.addEventListener('input', () => { st[inp.dataset.k] = Number(inp.value); sync(); schedule(); }));
  $$('[data-p]', el).forEach(b => (b.onclick = () => { Object.assign(st, presets[b.dataset.p]); sync(); schedule(); }));
  const ro = new ResizeObserver(() => draw());
  sync();
  return {
    onShow() { if (!res) setTimeout(run, 20); else draw(); ro.observe(trackC); },
    destroy() { ro.disconnect(); clearTimeout(timer); }
  };
}
