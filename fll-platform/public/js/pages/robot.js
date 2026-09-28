import { api } from '../api.js';
import { icon, h, $, $$, esc, toast, modal, confirmBox, timeAgo, tabs as makeTabs, store } from '../ui.js';
import { aiChat } from '../components/aichat.js';
import { groupChat } from '../components/groupchat.js';
import { PRESETS, EXAMPLES, ITEM_DEFAULTS } from '../sim/presets.js';

const S = window.SimCore;
const { TABLE, ROBOT, COLORS, COLOR_AR } = S;
const RAD = Math.PI / 180;
const M = 45; // frame margin (mm) drawn around the mat
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const r1 = v => Math.round(v * 10) / 10;

export default function robotPage(view, ctx) {
  const U = ctx.user.username;
  const key = k => `sim:${U}:${k}`;
  view.style.setProperty('--sc', 'var(--c-robot_game)');
  ctx.setTitle('Robot Game', 'robot');

  // ---------- state ----------
  let items = store.get(key('items')) || clone(PRESETS.missions.items).map(i => ({ ...i, id: uid() }));
  let startPose = store.get(key('start')) || { ...PRESETS.missions.robot };
  let lang = store.get(key('lang'), 'python');
  const code = { js: store.get(key('code:js')) || EXAMPLES[1].js, python: store.get(key('code:python')) || EXAMPLES[1].py };
  let realism = store.get(key('realism'), false);
  let speed = store.get(key('speed'), 1);
  let selColor = 'black';
  let world = S.createWorld({ items, robot: startPose, realism });
  let running = false, worker = null, beforeRun = null, trail = [], dirty = true, sensors = S.sense(world);
  let selected = null; // { type: 'item', id } | { type: 'robot' }
  let consoleLines = [];
  let ta = null, gutter = null, consoleEl = null;
  let timer = null, timerLeft = 150;
  const keys = new Set();
  const manual = { A: 0, B: 0, C: 0, D: 0 };
  let manualSpeed = store.get(key('mspeed'), 40);

  const saveLocal = () => { store.set(key('items'), items); store.set(key('start'), startPose); };
  const saveCode = () => { store.set(key('code:js'), code.js); store.set(key('code:python'), code.python); store.set(key('lang'), lang); };
  const syncWorldItems = () => { world.items = items; };
  world.items = items; // share the same array: edits are visible to the physics

  // ---------- layout ----------
  view.append(h(`<div class="page-head"><div class="ic">${icon('robot')}</div><div><h1>Robot Game</h1>
    <p>محاكي طاولة FLL: روبوت كامل (2 Large motors للحركة، 2 Medium motors للأذرع، Color / Distance / Force sensors و Motion sensor). اسحب ألوان وعقبات على الطاولة، اكتب الكود وشغّله.</p></div></div>`));
  const top = h(`<div class="sim-top">
    <div class="grp">
      <button class="btn primary" data-run>${icon('play')} تشغيل</button>
      <button class="btn bad hidden" data-stop>${icon('stop')} إيقاف</button>
      <button class="btn" data-reset title="رجّع الروبوت والطاولة زي ما كانوا قبل التشغيل">${icon('reset')} رجوع</button>
    </div>
    <div class="grp">
      <select class="input" data-speed title="سرعة المحاكاة" style="width:auto;padding:5px 8px">
        <option value="0.5">0.5x</option><option value="1">1x</option><option value="2">2x</option><option value="4">4x</option><option value="10">10x</option>
      </select>
      <label class="row small" style="gap:4px;padding:0 6px;cursor:pointer" title="انزلاق العجل، فرق بسيط في مقاس العجل، وdrift في الجيرو — زي الروبوت الحقيقي"><input type="checkbox" data-realism> أخطاء واقعية</label>
    </div>
    <div class="grp"><button class="btn" data-timer title="تايمر الماتش 2:30">${icon('timer')} <span class="timer">2:30</span></button></div>
    <div class="grp">
      <select class="input" data-preset style="width:auto;padding:5px 8px"><option value="">طاولة جاهزة...</option>${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join('')}</select>
      <button class="btn" data-save title="احفظ الطاولة للفريق">${icon('save')}</button>
      <button class="btn" data-open title="افتح طاولة محفوظة">${icon('folder')}</button>
      <button class="btn" data-clear title="امسح كل حاجة من على الطاولة">${icon('trash')}</button>
    </div>
  </div>`);
  view.append(top);

  const layout = h(`<div class="sim-layout">
    <div class="card palette">
      <div class="pt">الألوان</div>
      <div class="swatches">${Object.keys(COLORS).filter(c => c !== 'white').concat('white').map(c => `<button class="sw" data-c="${c}" title="${COLOR_AR[c]}" style="background:${COLORS[c]}"></button>`).join('')}</div>
      ${['zone', 'line', 'circle', 'ring'].map(k => `<div class="pitem" data-kind="${k}"><canvas width="88" height="60"></canvas>${ITEM_DEFAULTS[k].label}</div>`).join('')}
      <div class="pt">العقبات</div>
      ${['wall', 'box', 'pillar'].map(k => `<div class="pitem" data-kind="${k}"><canvas width="88" height="60"></canvas>${ITEM_DEFAULTS[k].label}</div>`).join('')}
      <div class="muted" style="font-size:11px;text-align:center;line-height:1.4">اسحب أي عنصر وحطه على الطاولة</div>
    </div>
    <div>
      <div class="table-wrap"><canvas class="table" tabindex="0" aria-label="طاولة المحاكي"></canvas><div class="props hidden"></div></div>
      <div class="sensors">
        <div class="sensor" title="حساس اللون"><span>Color</span><b data-s="color"></b></div>
        <div class="sensor" title="الضوء المنعكس (حساس اللون)"><span>Reflection</span><b data-s="refl"></b></div>
        <div class="sensor" title="حساس المسافة"><span>Distance</span><b data-s="dist"></b></div>
        <div class="sensor" title="حساس القوة (البامبر الأحمر)"><span>Force</span><b data-s="force"></b></div>
        <div class="sensor" title="Motion sensor — زاوية الجيرو"><span>Yaw</span><b data-s="yaw"></b></div>
        <div class="sensor" title="قراءة الـ encoders بالدرجات"><span>Motors °</span><b data-s="motors" style="font-size:11.5px;line-height:1.35;display:block;text-align:left"></b></div>
      </div>
      <div class="manual card" style="padding:10px 14px">
        <b class="small">تحكم يدوي</b>
        <div class="dpad"><span></span><button data-k="up" aria-label="قدام">▲</button><span></span><button data-k="left" aria-label="شمال">◀</button><button data-k="down" aria-label="ورا">▼</button><button data-k="right" aria-label="يمين">▶</button></div>
        <div class="armpad">C <button data-arm="C" data-dir="-1">⟲</button><button data-arm="C" data-dir="1">⟳</button></div>
        <div class="armpad">D <button data-arm="D" data-dir="-1">⟲</button><button data-arm="D" data-dir="1">⟳</button></div>
        <label class="small" style="display:flex;align-items:center;gap:6px;min-width:150px">سرعة <input type="range" min="10" max="100" step="5" data-mspeed style="width:100px"> <span class="ltr" data-mspeed-v></span></label>
        <span class="muted small">كيبورد: الأسهم أو WASD · Q/E دراع C · Z/X دراع D · R لف العنصر · Delete مسح</span>
      </div>
    </div>
    <div class="card sim-side"></div>
  </div>`);
  view.append(layout);

  const canvas = $('canvas.table', layout), g = canvas.getContext('2d');
  const propsEl = $('.props', layout);
  const side = $('.sim-side', layout);

  // ---------- side panel: code / AI / group / reference ----------
  const panes = {};
  let aiComp = null, gcComp = null;
  const sideTabs = makeTabs(side, [
    { key: 'code', label: 'الكود', icon: 'code' },
    { key: 'ai', label: 'المساعد', icon: 'sparkles' },
    { key: 'group', label: 'الجروب', icon: 'chat', badge: true },
    { key: 'ref', label: 'الأوامر', icon: 'book' }
  ], k => {
    for (const p in panes) panes[p].classList.toggle('hidden', p !== k);
    if (!panes[k]) createPane(k);
    if (gcComp) gcComp.setActive(k === 'group');
    store.set(key('sidetab'), k);
  }, 'code');
  function createPane(k) {
    const pane = h('<div class="pane"></div>'); panes[k] = pane; side.append(pane);
    if (k === 'code') buildEditor(pane);
    if (k === 'ai') {
      aiComp = aiChat(ctx, {
        section: 'robot_game', fill: true, title: 'مساعد الـ Robot Game',
        subtitle: 'بيشوف الكود والطاولة وقراءات الحساسات',
        intro: 'اسألني عن المهمات، الاستراتيجية، أو ليه الروبوت مش ماشي صح في المحاكي.',
        quick: ['ليه الكود بتاعي مش شغال صح؟', 'اكتبلي كود يوصّل الروبوت للمنطقة الخضرا', 'إزاي أخلي الروبوت يمشي مستقيم بالجيرو؟', 'اشرحلي line squaring', 'إزاي أقسّم المهمات على الـ runs؟'],
        allowFile: true, getContext: buildContext, contextLabel: 'ابعت الكود وحالة الطاولة مع السؤال'
      });
      pane.append(aiComp.el);
    }
    if (k === 'group') { gcComp = groupChat(ctx, { group: 'robot_game', fill: true }); pane.append(gcComp.el); }
    if (k === 'ref') pane.append(apiRef());
  }
  const upd = () => sideTabs.setBadge('group', ctx.unread.robot_game || 0);
  const offUnread = ctx.on('unread', upd); upd();
  const savedTab = store.get(key('sidetab'));
  if (savedTab && savedTab !== 'code') sideTabs.select(savedTab);

  // ---------- editor ----------
  function buildEditor(pane) {
    const bar = h(`<div class="code-bar">
      <select class="input" data-lang><option value="python">Python</option><option value="js">JavaScript</option></select>
      <select class="input" data-example style="flex:1;min-width:0"><option value="">📚 أمثلة جاهزة...</option>${EXAMPLES.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>
      <button class="btn sm" data-ask title="اسأل المساعد عن الكود ده">${icon('sparkles')} اشرح</button>
    </div>`);
    const ed = h(`<div class="editor"><div class="gutter"></div><textarea class="code" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="الكود"></textarea></div>`);
    consoleEl = h(`<div class="console" aria-live="polite"></div>`);
    pane.append(bar, ed, consoleEl);
    ta = $('textarea', ed); gutter = $('.gutter', ed);
    const langSel = $('[data-lang]', bar); langSel.value = lang;
    ta.value = code[lang];
    const lines = () => { const n = ta.value.split('\n').length; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); gutter.scrollTop = ta.scrollTop; };
    lines();
    ta.addEventListener('input', () => { code[lang] = ta.value; lines(); saveCode(); });
    ta.addEventListener('scroll', () => (gutter.scrollTop = ta.scrollTop));
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.setRangeText('    ', s, en, 'end'); ta.dispatchEvent(new Event('input'));
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
      else if (e.key === 'Enter') {
        // keep indentation (and indent after ":" or "{")
        const s = ta.selectionStart; const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
        const line = ta.value.slice(lineStart, s); let ind = line.match(/^\s*/)[0];
        if (/[:{]\s*$/.test(line)) ind += '    ';
        e.preventDefault(); ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input'));
      }
    });
    langSel.onchange = () => { lang = langSel.value; ta.value = code[lang]; lines(); saveCode(); if (lang === 'python') preloadPython(); };
    $('[data-example]', bar).onchange = async e => {
      const ex = EXAMPLES.find(x => x.id === e.target.value); e.target.value = '';
      if (!ex) return;
      code[lang] = lang === 'python' ? ex.py : ex.js; ta.value = code[lang]; lines(); saveCode();
      if (ex.preset) { loadPreset(ex.preset); log(`📋 اتحمّل المثال "${ex.name}" وطاولة "${PRESETS[ex.preset].name}". دوس تشغيل ▶`, 'sys'); }
    };
    $('[data-ask]', bar).onclick = () => {
      sideTabs.select('ai');
      aiComp.send('اشرحلي الكود بتاعي خطوة بخطوة، وقولي هل فيه مشاكل وإزاي أحسّنه.');
    };
    renderConsole();
    if (lang === 'python') preloadPython();
  }
  function highlightLine(n) {
    if (!ta || !n) return;
    const ls = ta.value.split('\n'); if (n < 1 || n > ls.length) return;
    let s = 0; for (let i = 0; i < n - 1; i++) s += ls[i].length + 1;
    ta.focus(); ta.setSelectionRange(s, s + ls[n - 1].length);
    ta.scrollTop = Math.max(0, (n - 4) * 20);
  }
  function log(text, cls = '') {
    consoleLines.push({ text: String(text), cls });
    if (consoleLines.length > 400) consoleLines.splice(0, consoleLines.length - 400);
    if (consoleEl) {
      const d = document.createElement('div'); if (cls) d.className = cls; d.dir = 'auto'; d.textContent = text; consoleEl.append(d);
      while (consoleEl.childNodes.length > 400) consoleEl.firstChild.remove();
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  }
  function renderConsole() {
    if (!consoleEl) return;
    consoleEl.innerHTML = '';
    if (!consoleLines.length) log('💡 اختار مثال جاهز من فوق أو اكتب الكود ودوس تشغيل ▶ (أو Ctrl+Enter)', 'sys');
    else for (const l of consoleLines.splice(0)) log(l.text, l.cls);
  }

  function apiRef() {
    const rows = [
      ['robot.move(cm, speed)', 'يمشي مستقيم مسافة بالسنتي (سالب = لورا)'],
      ['robot.turn(deg, speed)', 'يلف في مكانه بالـ encoders (موجب = يمين)'],
      ['robot.gyro_turn(deg, speed)', 'يلف بالجيرو (أدق)'],
      ['robot.drive(left, right)', 'يشغّل موتور A و B بسرعات (-100 لـ 100) ويفضل ماشي'],
      ['robot.steer(steering, speed)', 'زي SPIKE: 0 مستقيم، 50 pivot، 100 spin'],
      ['robot.stop()', 'يوقف موتورات الحركة'],
      ['robot.wait(ms)', 'يستنى (المحاكاة شغالة)'],
      ['robot.run_motor("C", deg, speed)', 'يلف موتور لعدد درجات (C و D = الأذرع)'],
      ['robot.start_motor(p, speed) / stop_motor(p)', 'تشغيل/إيقاف موتور'],
      ['robot.motor_degrees("A")', 'قراءة الـ encoder بالدرجات'],
      ['robot.reset_motors()', 'تصفير كل الـ encoders'],
      ['robot.color()', "'black' 'white' 'red' 'green' 'blue' 'yellow' 'violet' 'azure'"],
      ['robot.reflection()', 'الضوء المنعكس 0-100 (أسود≈7، أبيض≈98)'],
      ['robot.distance()', 'المسافة بالسنتي قدام الروبوت (-1 = مفيش حاجة)'],
      ['robot.force() / robot.is_pressed()', 'قوة الضغط بالنيوتن / مضغوط ولا لأ'],
      ['robot.yaw() / robot.reset_yaw()', 'زاوية الجيرو (-180..180، موجب = يمين)'],
      ['robot.time()', 'الوقت بالملّي ثانية من بداية البرنامج'],
      ['print(...)', 'يطبع في الـ console']
    ];
    return h(`<div class="api-ref">
      <p style="margin:0 0 8px">كل الأوامر بتستنى لحد ما تخلص (مفيش <code>await</code>). في JavaScript استخدم نفس الأسماء بـ camelCase زي <code>robot.gyroTurn()</code> أو بالشرطة زي Python.</p>
      <table>${rows.map(([a, b]) => `<tr><td><code>${esc(a)}</code></td><td>${esc(b)}</td></tr>`).join('')}</table>
      <h4 style="margin:12px 0 6px">مواصفات الروبوت</h4>
      <table>
        <tr><td>A / B</td><td>Large motors للحركة (عجل 5.6 سم، المسافة بين العجلتين 11.2 سم)</td></tr>
        <tr><td>C / D</td><td>Medium motors للأذرع الجانبية (0° = مقفولة، موجب = تفتح لبره، 180° = لقدام)</td></tr>
        <tr><td>Color</td><td>قدام الروبوت بـ 7.5 سم وبيبص على الأرض</td></tr>
        <tr><td>Distance</td><td>في الوش وبيبص لقدام (لحد 200 سم)</td></tr>
        <tr><td>Force</td><td>البامبر الأحمر في الوش</td></tr>
        <tr><td>Motion</td><td>جيرو الـ Hub (yaw)</td></tr>
      </table>
      <p class="muted" style="margin-top:8px">ملحوظة: الـ SPIKE Prime الحقيقي فيه 6 منافذ بس، فالروبوت ده متخيَّل فيه كل الحساسات مع بعض عشان التدريب.</p>
    </div>`);
  }

  function buildContext() {
    const s = sensors, r = world.robot;
    const itemsTxt = items.map(i => {
      const pos = `(${r1(i.x / 10)}, ${r1(i.y / 10)}) cm`;
      const size = i.r ? `r=${r1(i.r / 10)}cm${i.kind === 'ring' ? ` thickness=${r1(i.w / 10)}cm` : ''}` : `${r1(i.w / 10)}x${r1(i.h / 10)}cm rot=${Math.round(i.rot || 0)}°`;
      return `- ${i.kind}${i.color && S.isZone(i) ? ' ' + i.color : ''} at ${pos} ${size}`;
    }).join('\n');
    const out = consoleLines.slice(-15).map(l => l.text).join('\n');
    return `Simulator state (table 236.2 x 114.3 cm, origin top-left, x right, y down, heading 0 = facing right, positive = clockwise/right):
Language: ${lang === 'python' ? 'Python' : 'JavaScript'}
Code:
\`\`\`${lang === 'python' ? 'python' : 'js'}
${code[lang].slice(0, 6000)}
\`\`\`
Last console output:
${out || '(empty)'}
Robot pose: x=${r1(r.x / 10)}cm y=${r1(r.y / 10)}cm heading=${r1(r.h)}°  | start pose: x=${r1(startPose.x / 10)} y=${r1(startPose.y / 10)} heading=${startPose.h}°
Sensors now: color=${s.color} reflection=${s.reflection} distance=${s.distance}cm force=${s.force}N yaw=${s.yaw}° motors A=${s.A} B=${s.B} C=${s.C} D=${s.D}
Realism mode: ${realism ? 'on' : 'off'}
Table items:
${itemsTxt || '(none)'}`;
  }

  // ---------- canvas sizing & coordinates ----------
  let scale = 1, dpr = 1;
  function resize() {
    const w = canvas.parentElement.clientWidth || 800;
    dpr = window.devicePixelRatio || 1;
    scale = w / (TABLE.w + 2 * M);
    const hgt = (TABLE.h + 2 * M) * scale;
    canvas.style.height = hgt + 'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
    dirty = true;
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);
  function toWorldPt(e) {
    const b = canvas.getBoundingClientRect();
    return [(e.clientX - b.left) / scale - M, (e.clientY - b.top) / scale - M];
  }

  // ---------- drawing ----------
  function roundRect(x, y, w, hh, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, r) : g.rect(x, y, w, hh); }
  function drawItem(it, gg = g) {
    gg.save();
    if (S.isZone(it)) {
      const c = COLORS[it.color] || '#000';
      if (it.kind === 'ring') { gg.strokeStyle = c; gg.lineWidth = it.w; gg.beginPath(); gg.arc(it.x, it.y, it.r, 0, Math.PI * 2); gg.stroke(); }
      else if (it.kind === 'circle') { gg.fillStyle = c; gg.beginPath(); gg.arc(it.x, it.y, it.r, 0, Math.PI * 2); gg.fill(); if (it.color === 'white') { gg.strokeStyle = '#ccc'; gg.lineWidth = 2; gg.stroke(); } }
      else { gg.translate(it.x, it.y); gg.rotate((it.rot || 0) * RAD); gg.fillStyle = c; gg.fillRect(-it.w / 2, -it.h / 2, it.w, it.h); if (it.color === 'white') { gg.strokeStyle = '#ccc'; gg.lineWidth = 2; gg.strokeRect(-it.w / 2, -it.h / 2, it.w, it.h); } }
    } else if (it.kind === 'pillar') {
      const gr = gg.createRadialGradient(it.x - it.r * .3, it.y - it.r * .3, it.r * .1, it.x, it.y, it.r);
      gr.addColorStop(0, '#b8c0cf'); gr.addColorStop(1, '#4b5467');
      gg.fillStyle = gr; gg.beginPath(); gg.arc(it.x, it.y, it.r, 0, Math.PI * 2); gg.fill();
      gg.strokeStyle = '#2f3544'; gg.lineWidth = 3; gg.stroke();
    } else {
      gg.translate(it.x, it.y); gg.rotate((it.rot || 0) * RAD);
      const w = it.w, hh = it.h;
      gg.shadowColor = 'rgba(0,0,0,.25)'; gg.shadowBlur = 10; gg.shadowOffsetY = 4;
      if (it.kind === 'wall') { gg.fillStyle = '#5a6376'; gg.fillRect(-w / 2, -hh / 2, w, hh); gg.shadowColor = 'transparent'; gg.strokeStyle = '#353b49'; gg.lineWidth = 3; gg.strokeRect(-w / 2, -hh / 2, w, hh); gg.strokeStyle = 'rgba(255,255,255,.15)'; gg.lineWidth = 2; for (let y = -hh / 2 + 20; y < hh / 2; y += 40) { gg.beginPath(); gg.moveTo(-w / 2, y); gg.lineTo(w / 2, y); gg.stroke(); } }
      else { gg.fillStyle = '#f59e0b'; gg.fillRect(-w / 2, -hh / 2, w, hh); gg.shadowColor = 'transparent'; gg.strokeStyle = '#b45309'; gg.lineWidth = 4; gg.strokeRect(-w / 2 + 2, -hh / 2 + 2, w - 4, hh - 4); gg.beginPath(); gg.moveTo(-w / 2 + 6, -hh / 2 + 6); gg.lineTo(w / 2 - 6, hh / 2 - 6); gg.moveTo(w / 2 - 6, -hh / 2 + 6); gg.lineTo(-w / 2 + 6, hh / 2 - 6); gg.lineWidth = 3; gg.stroke(); }
    }
    gg.restore();
  }
  function drawRobot() {
    const r = world.robot, Mo = world.motors;
    // arms (under the body so the pivots look attached)
    for (const p of ['C', 'D']) {
      const { pivot, tip } = S.armTip(r, p, Mo[p].pos);
      g.strokeStyle = p === 'C' ? '#0d9488' : '#7c3aed'; g.lineWidth = ROBOT.arms[p].w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(pivot[0], pivot[1]); g.lineTo(tip[0], tip[1]); g.stroke();
    }
    g.save(); g.translate(r.x, r.y); g.rotate(r.h * RAD);
    g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 14; g.shadowOffsetY = 5;
    g.fillStyle = '#eef1f7'; roundRect(-100, -80, 200, 160, 18); g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = '#3b4257'; g.lineWidth = 4; g.stroke();
    // wheels
    g.fillStyle = '#1f2330';
    for (const y of [-56, 56]) { roundRect(-28, y - 9, 56, 18, 5); g.fill(); }
    g.fillStyle = '#50586e'; for (const y of [-56, 56]) for (let x = -22; x <= 22; x += 11) g.fillRect(x - 1.5, y - 8, 3, 16);
    // hub
    g.fillStyle = '#ffffff'; roundRect(-62, -44, 104, 88, 12); g.fill(); g.strokeStyle = '#c9ced9'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#ffd400'; roundRect(-48, -30, 60, 60, 8); g.fill();
    g.fillStyle = '#6b5a00'; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { g.beginPath(); g.arc(-40 + i * 11, -22 + j * 11, 2.6, 0, Math.PI * 2); g.fill(); }
    // direction arrow
    g.fillStyle = '#4f46e5'; g.beginPath(); g.moveTo(40, 0); g.lineTo(22, -12); g.lineTo(22, 12); g.closePath(); g.fill();
    // distance sensor (eyes)
    for (const y of [-15, 15]) { g.fillStyle = '#222'; g.beginPath(); g.arc(92, y, 10, 0, Math.PI * 2); g.fill(); g.fillStyle = '#9ad1ff'; g.beginPath(); g.arc(92, y, 4.5, 0, Math.PI * 2); g.fill(); }
    // force sensor bumper
    g.fillStyle = sensors.pressed ? '#ef4444' : '#991b1b'; roundRect(100, -45, 12, 90, 4); g.fill();
    // color sensor
    g.fillStyle = '#222'; g.beginPath(); g.arc(75, 0, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = COLORS[sensors.color] || '#fff'; g.beginPath(); g.arc(75, 0, 6, 0, Math.PI * 2); g.fill();
    g.restore();
    // arm pivots + labels
    for (const p of ['C', 'D']) {
      const { pivot } = S.armTip(r, p, Mo[p].pos);
      g.fillStyle = p === 'C' ? '#0f766e' : '#6d28d9'; g.beginPath(); g.arc(pivot[0], pivot[1], 10, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p, pivot[0], pivot[1] + 1);
    }
  }
  function drawRay() {
    const hit = S.rayHit(world);
    const len = Math.min(hit.t, 2000);
    const r = world.robot;
    const ex = hit.ox + Math.cos(r.h * RAD) * len, ey = hit.oy + Math.sin(r.h * RAD) * len;
    g.save(); g.strokeStyle = 'rgba(59,130,246,.55)'; g.lineWidth = 3; g.setLineDash([14, 10]);
    g.beginPath(); g.moveTo(hit.ox, hit.oy); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
    if (hit.t <= 2000) { g.fillStyle = '#3b82f6'; g.beginPath(); g.arc(ex, ey, 7, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  function selectionShape() {
    if (!selected) return null;
    if (selected.type === 'robot') {
      const p = world.robot;
      return { poly: S.bodyPoly(p), cx: p.x, cy: p.y, handle: S.toWorld(p, 190, 0) };
    }
    const it = items.find(i => i.id === selected.id); if (!it) return null;
    const ext = it.r ? it.r + (it.w ? it.w / 2 : 0) : Math.max(it.w, it.h) / 2;
    const rot = it.r ? 0 : (it.rot || 0);
    const hx = it.x + Math.sin(rot * RAD) * (ext + 60), hy = it.y - Math.cos(rot * RAD) * (ext + 60);
    return { poly: it.r ? null : S.rectPoly(it.x, it.y, it.w, Math.max(it.h, 4), rot), circle: it.r ? ext : null, cx: it.x, cy: it.y, handle: it.r ? null : [hx, hy] };
  }
  function draw() {
    const cw = canvas.width, ch = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const k = dpr * scale;
    g.setTransform(k, 0, 0, k, k * M, k * M);
    // frame
    const wood = g.createLinearGradient(-M, -M, TABLE.w + M, TABLE.h + M);
    wood.addColorStop(0, '#6b4a2f'); wood.addColorStop(1, '#4a321f');
    g.fillStyle = wood; g.fillRect(-M, -M, TABLE.w + 2 * M, TABLE.h + 2 * M);
    // mat
    g.fillStyle = '#f7f6f0'; g.fillRect(0, 0, TABLE.w, TABLE.h);
    g.strokeStyle = '#e7e3d6'; g.lineWidth = 1.5;
    for (let x = 100; x < TABLE.w; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TABLE.h); g.stroke(); }
    for (let y = 100; y < TABLE.h; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(TABLE.w, y); g.stroke(); }
    // launch areas (visual only)
    g.save(); g.setLineDash([18, 12]); g.strokeStyle = '#9aa6c7'; g.lineWidth = 4;
    g.strokeRect(8, 8, 400, TABLE.h - 16); g.strokeRect(TABLE.w - 408, 8, 400, TABLE.h - 16);
    g.setLineDash([]); g.fillStyle = '#9aa6c7'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
    g.fillText('HOME', 208, 52); g.fillText('HOME', TABLE.w - 208, 52);
    g.restore();
    // cm ruler labels
    g.fillStyle = '#c8c1ad'; g.font = '22px sans-serif'; g.textAlign = 'left';
    for (let x = 500; x < TABLE.w; x += 500) g.fillText(x / 10 + ' cm', x + 6, TABLE.h - 10);
    for (const it of items) if (S.isZone(it)) drawItem(it);
    // trail
    if (trail.length > 1) { g.strokeStyle = 'rgba(79,70,229,.45)'; g.lineWidth = 5; g.lineJoin = 'round'; g.beginPath(); g.moveTo(trail[0][0], trail[0][1]); for (const p of trail) g.lineTo(p[0], p[1]); g.stroke(); }
    // start pose ghost
    if (!running) {
      g.save(); g.globalAlpha = .25; g.strokeStyle = '#4f46e5'; g.lineWidth = 3; g.setLineDash([10, 8]);
      const sp = S.bodyPoly(startPose); g.beginPath(); sp.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke(); g.restore();
    }
    for (const it of items) if (S.isObstacle(it)) drawItem(it);
    drawRay();
    drawRobot();
    // selection
    const sel = selectionShape();
    if (sel) {
      g.save(); g.strokeStyle = '#4f46e5'; g.lineWidth = 4; g.setLineDash([12, 8]);
      g.beginPath();
      if (sel.circle) g.arc(sel.cx, sel.cy, sel.circle + 12, 0, Math.PI * 2);
      else { sel.poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }
      g.stroke(); g.setLineDash([]);
      if (sel.handle) {
        g.strokeStyle = '#4f46e5'; g.lineWidth = 3; g.beginPath(); g.moveTo(sel.cx, sel.cy); g.lineTo(sel.handle[0], sel.handle[1]); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(sel.handle[0], sel.handle[1], 18, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#4f46e5'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⟳', sel.handle[0], sel.handle[1] + 1);
      }
      g.restore();
    }
  }

  // ---------- sensors readout ----------
  const sEl = k => $(`[data-s="${k}"]`, layout);
  let lastSensorDom = 0;
  function showSensors(force) {
    const t = performance.now(); if (!force && t - lastSensorDom < 80) return; lastSensorDom = t;
    const s = sensors;
    sEl('color').innerHTML = `${esc(s.color)} <span class="cdot" style="background:${COLORS[s.color]}"></span>`;
    sEl('refl').textContent = s.reflection + '%';
    sEl('dist').textContent = s.distance === -1 ? '—' : s.distance.toFixed(1) + ' cm';
    sEl('force').innerHTML = `${s.force.toFixed(1)} N${s.pressed ? ' <span class="cdot" style="background:#ef4444" title="pressed"></span>' : ''}`;
    sEl('yaw').textContent = s.yaw.toFixed(1) + '°';
    sEl('motors').innerHTML = `A ${s.A} · B ${s.B}<br>C ${s.C} · D ${s.D}`;
  }

  // ---------- main loop ----------
  let raf = 0, lastT = performance.now(), acc = 0;
  function loop(t) {
    raf = requestAnimationFrame(loop);
    let dt = Math.min(60, t - lastT); lastT = t;
    if (!running) {
      applyManual();
      const Mo = world.motors;
      const moving = ['A', 'B', 'C', 'D'].some(k => Mo[k].vel !== 0 || (Mo[k].mode === 'speed' && Mo[k].target !== 0));
      if (moving) {
        acc += dt;
        while (acc >= S.DT) { S.step(world, S.DT); acc -= S.DT; }
        sensors = S.sense(world); pushTrail(); dirty = true;
      } else acc = 0;
    }
    if (dirty) { draw(); showSensors(); dirty = false; }
  }
  function pushTrail() {
    const r = world.robot, last = trail[trail.length - 1];
    if (!last || Math.hypot(last[0] - r.x, last[1] - r.y) > 8) trail.push([r.x, r.y]);
    if (trail.length > 4000) trail.splice(0, 1000);
  }
  function applyManual() {
    const sp = manualSpeed;
    const up = keys.has('up'), down = keys.has('down'), left = keys.has('left'), right = keys.has('right');
    let l = 0, r = 0;
    if (up || down) { const d = up ? 1 : -1; l = r = sp * d; if (left) { l *= 0.35; } if (right) { r *= 0.35; } }
    else if (left) { l = -sp * 0.5; r = sp * 0.5; }
    else if (right) { l = sp * 0.5; r = -sp * 0.5; }
    setManual('A', l); setManual('B', r);
    setManual('C', keys.has('C+') ? sp : keys.has('C-') ? -sp : 0);
    setManual('D', keys.has('D+') ? sp : keys.has('D-') ? -sp : 0);
  }
  function setManual(k, v) {
    const mt = world.motors[k];
    if (v) { mt.mode = 'speed'; mt.target = v * S.DEG_PER_PCT; manual[k] = v; }
    else if (manual[k]) { mt.mode = 'hold'; mt.target = 0; mt.goal = mt.pos; manual[k] = 0; }
  }

  // ---------- run / stop / reset ----------
  const runBtn = $('[data-run]', top), stopBtn = $('[data-stop]', top);
  function setRunning(on) {
    running = on;
    runBtn.classList.toggle('hidden', on); stopBtn.classList.toggle('hidden', !on);
    canvas.style.cursor = on ? 'default' : '';
    if (on) { selected = null; renderProps(); }
    dirty = true;
  }
  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('/js/sim/sim-worker.js');
    worker.onmessage = onWorker;
    worker.onerror = e => { log('⚠️ ' + (e.message || 'مشكلة في المحاكي'), 'err'); setRunning(false); };
    return worker;
  }
  function preloadPython() { ensureWorker().postMessage({ type: 'preload' }); }
  let runStart = 0;
  function onWorker(ev) {
    const m = ev.data;
    if (m.type === 'state') {
      if (!running) return;
      const st = m.state;
      world.robot = st.robot;
      for (const k of ['A', 'B', 'C', 'D']) { world.motors[k].pos = st.motors[k]; }
      for (const mv of st.movables) { const it = items.find(i => i.id === mv.id); if (it) { it.x = mv.x; it.y = mv.y; } }
      world.yawZero = st.yawZero; world.drift = st.drift;
      sensors = st.sensors; pushTrail(); dirty = true;
    } else if (m.type === 'print') log(m.text, m.err ? 'err' : '');
    else if (m.type === 'status') log(m.text, 'sys');
    else if (m.type === 'started') { runStart = performance.now(); }
    else if (m.type === 'done') { finishRun(); log(`✔ البرنامج خلص — وقت المحاكاة ${(m.ms / 1000).toFixed(1)} ثانية`, 'ok'); }
    else if (m.type === 'error') {
      if (!running) { log('⚠️ ' + m.message, 'err'); return; }
      finishRun();
      log(`✖ خطأ${m.line ? ' في سطر ' + m.line : ''}: ${m.message}`, 'err');
      if (m.line) highlightLine(m.line);
    }
  }
  function finishRun() {
    setRunning(false);
    for (const k of ['A', 'B', 'C', 'D']) { const mt = world.motors[k]; mt.vel = 0; mt.mode = 'hold'; mt.goal = mt.pos; mt.target = 0; mt.done = true; }
    sensors = S.sense(world); dirty = true;
  }
  function run() {
    if (running) return;
    if (!ta) { sideTabs.select('code'); }
    if (!code[lang].trim()) return toast('اكتب كود الأول', 'bad');
    beforeRun = { items: clone(items), robot: { ...world.robot }, motors: Object.fromEntries(['A', 'B', 'C', 'D'].map(k => [k, world.motors[k].pos])), yawZero: world.yawZero };
    trail = [[world.robot.x, world.robot.y]];
    keys.clear(); applyManual();
    if (consoleEl) consoleEl.innerHTML = ''; consoleLines = [];
    log(`▶ تشغيل (${lang === 'python' ? 'Python' : 'JavaScript'}) بسرعة ${speed}x${realism ? ' + أخطاء واقعية' : ''}`, 'sys');
    setRunning(true);
    ensureWorker().postMessage({
      type: 'run', lang, code: code[lang], items, robot: world.robot,
      motors: beforeRun.motors, realism, speed, seed: (Math.random() * 1e9) | 0
    });
  }
  function stop(silent) {
    if (!running) return;
    if (worker) { worker.terminate(); worker = null; }
    finishRun();
    if (!silent) log('■ اتوقف البرنامج', 'sys');
    if (lang === 'python') setTimeout(() => { if (!worker && document.body.contains(canvas)) preloadPython(); }, 300);
  }
  function reset() {
    stop(true);
    if (beforeRun) {
      items.splice(0, items.length, ...clone(beforeRun.items));
      world = S.createWorld({ items: [], robot: beforeRun.robot, realism }); world.items = items;
      for (const k of ['A', 'B', 'C', 'D']) { world.motors[k].pos = beforeRun.motors[k]; world.motors[k].goal = beforeRun.motors[k]; }
      world.yawZero = beforeRun.yawZero;
      beforeRun = null;
    } else {
      world = S.createWorld({ items: [], robot: startPose, realism }); world.items = items;
    }
    trail = []; sensors = S.sense(world); dirty = true; renderProps();
  }
  runBtn.onclick = run; stopBtn.onclick = () => stop();
  $('[data-reset]', top).onclick = reset;
  const speedSel = $('[data-speed]', top); speedSel.value = String(speed);
  speedSel.onchange = () => { speed = Number(speedSel.value); store.set(key('speed'), speed); };
  const realBox = $('[data-realism]', top); realBox.checked = realism;
  realBox.onchange = () => { realism = realBox.checked; store.set(key('realism'), realism); world.realism = realism; if (!running) { const nw = S.createWorld({ items: [], robot: world.robot, realism }); for (const k in nw.motors) nw.motors[k].pos = world.motors[k].pos; nw.items = items; world = nw; } };

  // timer
  const timerBtn = $('[data-timer]', top), timerLbl = $('.timer', top);
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  timerBtn.onclick = () => {
    if (timer) { clearInterval(timer); timer = null; timerLeft = 150; timerLbl.textContent = '2:30'; timerLbl.classList.remove('low'); return; }
    timerLeft = 150; timerLbl.textContent = fmt(timerLeft);
    timer = setInterval(() => {
      timerLeft--; timerLbl.textContent = fmt(Math.max(0, timerLeft)); timerLbl.classList.toggle('low', timerLeft <= 30);
      if (timerLeft <= 0) { clearInterval(timer); timer = null; toast('⏱ الوقت خلص! نهاية الماتش'); if (running) { stop(true); log('⏱ الماتش خلص (2:30) — اتوقف الروبوت', 'sys'); } }
    }, 1000);
  };

  // ---------- presets / layouts ----------
  function loadPreset(k) {
    const p = PRESETS[k]; if (!p) return;
    stop(true);
    items.splice(0, items.length, ...clone(p.items).map(i => ({ ...i, id: uid() })));
    startPose = { ...p.robot };
    world = S.createWorld({ items: [], robot: startPose, realism }); world.items = items;
    beforeRun = null; trail = []; selected = null; sensors = S.sense(world); dirty = true; renderProps(); saveLocal();
  }
  $('[data-preset]', top).onchange = async e => {
    const k = e.target.value; e.target.value = '';
    if (!k) return;
    if (items.length && !(await confirmBox('الطاولة الحالية هتتشال وتتحط مكانها الطاولة الجاهزة. تمام؟', 'تمام', 'primary'))) return;
    loadPreset(k);
  };
  $('[data-clear]', top).onclick = async () => {
    if (!items.length) return;
    if (!(await confirmBox('تمسح كل العناصر من على الطاولة؟', 'امسح'))) return;
    stop(true); items.splice(0); selected = null; renderProps(); saveLocal(); sensors = S.sense(world); dirty = true;
  };
  $('[data-save]', top).onclick = () => {
    const m = modal({
      title: 'احفظ الطاولة للفريق', body: `<label class="field"><span>اسم الطاولة</span><input class="input" data-n maxlength="60" placeholder="مثلاً: تدريب مهمة 3"></label><label class="row small"><input type="checkbox" data-c checked> احفظ الكود كمان (${lang === 'python' ? 'Python' : 'JavaScript'})</label>`,
      actions: [{ label: 'إلغاء' }, {
        label: 'حفظ', cls: 'primary', onClick: async () => {
          const bg = m.el;
          const name = $('[data-n]', bg).value.trim(); if (!name) { toast('اكتب اسم', 'bad'); return false; }
          try {
            await api.post('/api/layouts', { name, items: running && beforeRun ? beforeRun.items : items, robot: startPose, code: $('[data-c]', bg).checked ? code[lang] : '', lang });
            toast('اتحفظت ✅ — أي حد في الفريق يقدر يفتحها', 'ok');
          } catch (e) { toast(e.message, 'bad'); return false; }
        }
      }]
    });
  };
  $('[data-open]', top).onclick = async () => {
    const body = h('<div class="stack"><div class="empty small">جاري التحميل...</div></div>');
    const m = modal({ title: 'طاولات الفريق المحفوظة', body, wide: true });
    try {
      const { layouts } = await api.get('/api/layouts');
      body.innerHTML = '';
      if (!layouts.length) body.append(h('<div class="empty small">لسه مفيش طاولات محفوظة.</div>'));
      for (const l of layouts) {
        const row = h(`<div class="row nowrap card" style="padding:10px 12px">
          <div style="flex:1;min-width:0"><b>${esc(l.name)}</b><div class="muted small">${esc(ctx.userName(l.owner))} · ${timeAgo(l.createdAt)} · ${l.items.length} عنصر${l.code ? ' · فيها كود ' + (l.lang === 'python' ? 'Python' : 'JS') : ''}</div></div>
          <button class="btn sm primary" data-o>فتح</button>
          ${l.owner === ctx.user.username || ctx.user.role === 'coach' ? `<button class="btn sm ghost" data-d title="حذف">${icon('trash')}</button>` : ''}
        </div>`);
        $('[data-o]', row).onclick = () => {
          stop(true);
          items.splice(0, items.length, ...clone(l.items).map(i => ({ ...i, id: i.id || uid() })));
          if (l.robot) startPose = { x: l.robot.x, y: l.robot.y, h: l.robot.heading };
          world = S.createWorld({ items: [], robot: startPose, realism }); world.items = items;
          if (l.code) { lang = l.lang; code[lang] = l.code; saveCode(); if (ta) { ta.value = l.code; $('[data-lang]', side).value = lang; ta.dispatchEvent(new Event('input')); } }
          beforeRun = null; trail = []; selected = null; sensors = S.sense(world); dirty = true; renderProps(); saveLocal();
          m.close(); toast('اتفتحت: ' + l.name, 'ok');
        };
        const d = $('[data-d]', row);
        if (d) d.onclick = async () => { if (!(await confirmBox('تحذف الطاولة دي؟', 'احذف'))) return; await api.del('/api/layouts/' + l._id).catch(e => toast(e.message, 'bad')); row.remove(); };
        body.append(row);
      }
    } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  };

  // ---------- palette (drag & drop from toolbar) ----------
  function paintPalette() {
    for (const el of $$('.pitem', layout)) {
      const c = $('canvas', el), gg = c.getContext('2d'), kind = el.dataset.kind;
      gg.setTransform(1, 0, 0, 1, 0, 0); gg.clearRect(0, 0, 88, 60);
      const sc = { zone: 0.22, line: 0.14, circle: 0.24, ring: 0.075, wall: 0.16, box: 0.3, pillar: 0.45 }[kind];
      gg.setTransform(sc, 0, 0, sc, 44, 30);
      const d = ITEM_DEFAULTS[kind];
      drawItem({ kind, color: selColor, x: 0, y: 0, w: d.w, h: d.h, r: d.r, rot: kind === 'wall' ? 90 : 0, ...(kind === 'ring' ? { w: 60 } : {}) }, gg);
    }
    $$('.sw', layout).forEach(b => b.classList.toggle('sel', b.dataset.c === selColor));
  }
  $$('.palette .sw', layout).forEach(b => (b.onclick = () => {
    selColor = b.dataset.c; paintPalette();
    const it = selected && selected.type === 'item' && items.find(i => i.id === selected.id);
    if (it && S.isZone(it)) { it.color = selColor; saveLocal(); dirty = true; renderProps(); }
  }));
  function addItem(kind, x, y) {
    const d = ITEM_DEFAULTS[kind];
    const it = { id: uid(), kind, x: S.clamp(x, 0, TABLE.w), y: S.clamp(y, 0, TABLE.h) };
    if (d.r) it.r = d.r; if (d.w) it.w = d.w; if (d.h) it.h = d.h; if ('rot' in d) it.rot = d.rot;
    if (S.isZone(it)) it.color = selColor;
    if (S.isZone(it)) { let i = items.length; while (i > 0 && S.isObstacle(items[i - 1])) i--; items.splice(i, 0, it); } else items.push(it);
    selected = { type: 'item', id: it.id }; saveLocal(); sensors = S.sense(world); dirty = true; renderProps();
  }
  for (const el of $$('.pitem', layout)) {
    el.addEventListener('pointerdown', e => {
      if (running) return toast('وقّف البرنامج الأول عشان تعدّل الطاولة');
      e.preventDefault();
      const kind = el.dataset.kind;
      const ghost = h(`<canvas class="drag-ghost" width="88" height="60"></canvas>`);
      ghost.getContext('2d').drawImage($('canvas', el), 0, 0);
      document.body.append(ghost);
      const sx = e.clientX, sy = e.clientY; let movedFar = false;
      const mv = ev => { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) movedFar = true; };
      mv(e);
      const upH = ev => {
        document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', upH); document.removeEventListener('pointercancel', upH); ghost.remove();
        const b = canvas.getBoundingClientRect();
        if (!movedFar) { addItem(kind, TABLE.w / 2 + (Math.random() - .5) * 300, TABLE.h / 2 + (Math.random() - .5) * 200); return; }
        if (ev.clientX >= b.left && ev.clientX <= b.right && ev.clientY >= b.top && ev.clientY <= b.bottom) { const [x, y] = toWorldPt(ev); addItem(kind, x, y); }
      };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', upH); document.addEventListener('pointercancel', upH);
    });
  }

  // ---------- canvas interaction ----------
  function hitRobot(x, y) {
    const r = world.robot, c = Math.cos(-r.h * RAD), s = Math.sin(-r.h * RAD), dx = x - r.x, dy = y - r.y;
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) <= 112 && Math.abs(ly) <= 85;
  }
  function hitItem(x, y) {
    const order = [...items.filter(S.isObstacle)].reverse().concat([...items.filter(S.isZone)].reverse());
    for (const it of order) {
      if (it.kind === 'ring') { const d = Math.hypot(x - it.x, y - it.y); if (Math.abs(d - it.r) <= it.w / 2 + 14) return it; continue; }
      if (it.kind === 'line' || (it.h && it.h < 30) || (it.w && it.w < 30)) { const fat = { ...it, w: Math.max(it.w, 30), h: Math.max(it.h, 30) }; if (S.pointInItem(fat, x, y)) return it; continue; }
      if (S.pointInItem(it, x, y)) return it;
    }
    return null;
  }
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.focus({ preventScroll: true });
    if (running) return;
    const [x, y] = toWorldPt(e);
    const sel = selectionShape();
    if (sel && sel.handle && Math.hypot(x - sel.handle[0], y - sel.handle[1]) < 30) {
      drag = { mode: 'rotate' }; canvas.setPointerCapture(e.pointerId); return;
    }
    if (hitRobot(x, y)) { selected = { type: 'robot' }; drag = { mode: 'robot', ox: x - world.robot.x, oy: y - world.robot.y }; }
    else {
      const it = hitItem(x, y);
      if (it) { selected = { type: 'item', id: it.id }; drag = { mode: 'item', it, ox: x - it.x, oy: y - it.y }; }
      else { selected = null; drag = null; }
    }
    if (drag) canvas.setPointerCapture(e.pointerId);
    renderProps(); dirty = true;
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) {
      if (running) return;
      const [x, y] = toWorldPt(e);
      const sel = selectionShape();
      canvas.style.cursor = sel && sel.handle && Math.hypot(x - sel.handle[0], y - sel.handle[1]) < 30 ? 'grab' : (hitRobot(x, y) || hitItem(x, y)) ? 'move' : 'default';
      return;
    }
    const [x, y] = toWorldPt(e);
    if (drag.mode === 'robot') { world.robot.x = S.clamp(x - drag.ox, 90, TABLE.w - 90); world.robot.y = S.clamp(y - drag.oy, 90, TABLE.h - 90); trail = []; }
    else if (drag.mode === 'item') { drag.it.x = S.clamp(x - drag.ox, 0, TABLE.w); drag.it.y = S.clamp(y - drag.oy, 0, TABLE.h); }
    else if (drag.mode === 'rotate') {
      const sh = selectionShape(); if (!sh) return;
      let ang = Math.atan2(y - sh.cy, x - sh.cx) / RAD;
      if (selected.type === 'robot') { ang = e.shiftKey ? ang : Math.round(ang / 5) * 5; world.robot.h = ang; world.yawZero = ang; }
      else { const it = items.find(i => i.id === selected.id); let rot = ang + 90; rot = e.shiftKey ? rot : Math.round(rot / 5) * 5; it.rot = ((rot % 360) + 360) % 360; }
    }
    sensors = S.sense(world); dirty = true; renderPropsValues();
  });
  const endDrag = () => { if (drag) { drag = null; saveLocal(); renderProps(); } };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

  // ---------- properties panel ----------
  function renderProps() {
    if (!selected) { propsEl.classList.add('hidden'); return; }
    propsEl.classList.remove('hidden');
    if (selected.type === 'robot') {
      propsEl.innerHTML = `<b>🤖 الروبوت</b>
        <label>X <input class="input ltr" type="number" step="0.5" data-p="rx"> سم</label>
        <label>Y <input class="input ltr" type="number" step="0.5" data-p="ry"> سم</label>
        <label>الاتجاه <input class="input ltr" type="number" step="5" data-p="rh">°</label>
        <button class="btn sm" data-a="rl">⟲ 15°</button><button class="btn sm" data-a="rr">⟳ 15°</button>
        <button class="btn sm primary" data-a="start">📍 خليه مكان البداية</button>
        <button class="btn sm ghost" data-a="x">${icon('x')}</button>`;
    } else {
      const it = items.find(i => i.id === selected.id); if (!it) { selected = null; return renderProps(); }
      const zone = S.isZone(it);
      const dims = it.kind === 'ring'
        ? `<label>نص القطر <input class="input ltr" type="number" step="1" min="5" data-p="r"> سم</label><label>السُمك <input class="input ltr" type="number" step="0.5" min="1" data-p="w"> سم</label>`
        : it.r ? `<label>نص القطر <input class="input ltr" type="number" step="1" min="2" data-p="r"> سم</label>`
          : `<label>الطول <input class="input ltr" type="number" step="1" min="1" data-p="w"> سم</label><label>العرض <input class="input ltr" type="number" step="0.5" min="1" data-p="h"> سم</label><label>لف <input class="input ltr" type="number" step="5" data-p="rot">°</label>`;
      propsEl.innerHTML = `<b>${esc(ITEM_DEFAULTS[it.kind].label)}</b>
        ${zone ? `<span class="row" style="gap:3px">${Object.keys(COLORS).map(c => `<button class="sw ${it.color === c ? 'sel' : ''}" data-col="${c}" title="${COLOR_AR[c]}" style="background:${COLORS[c]}"></button>`).join('')}</span>` : ''}
        ${dims}
        <button class="btn sm" data-a="dup" title="نسخة">${icon('copy')}</button>
        ${zone ? `<button class="btn sm" data-a="front" title="هاته فوق باقي الألوان">⬆</button>` : ''}
        <button class="btn sm bad" data-a="del" title="مسح">${icon('trash')}</button>
        <button class="btn sm ghost" data-a="x">${icon('x')}</button>`;
      $$('[data-col]', propsEl).forEach(b => (b.onclick = () => { it.color = b.dataset.col; selColor = it.color; paintPalette(); saveLocal(); sensors = S.sense(world); dirty = true; renderProps(); }));
    }
    renderPropsValues();
    $$('input[data-p]', propsEl).forEach(inp => inp.addEventListener('input', () => {
      const v = Number(inp.value); if (!Number.isFinite(v)) return;
      const p = inp.dataset.p;
      if (selected.type === 'robot') {
        if (p === 'rx') world.robot.x = S.clamp(v * 10, 90, TABLE.w - 90);
        if (p === 'ry') world.robot.y = S.clamp(v * 10, 90, TABLE.h - 90);
        if (p === 'rh') { world.robot.h = v; world.yawZero = v; }
      } else {
        const it = items.find(i => i.id === selected.id);
        if (p === 'rot') it.rot = v; else it[p] = Math.max(p === 'w' && it.kind === 'ring' ? 5 : 10, v * 10);
      }
      saveLocal(); sensors = S.sense(world); dirty = true;
    }));
    $$('[data-a]', propsEl).forEach(b => (b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'x') { selected = null; }
      else if (a === 'rl' || a === 'rr') { world.robot.h += a === 'rr' ? 15 : -15; world.yawZero = world.robot.h; }
      else if (a === 'start') { startPose = { x: Math.round(world.robot.x), y: Math.round(world.robot.y), h: Math.round(world.robot.h) }; beforeRun = null; toast('📍 اتحفظ مكان البداية', 'ok'); }
      else {
        const idx = items.findIndex(i => i.id === selected.id), it = items[idx];
        if (a === 'del') { items.splice(idx, 1); selected = null; }
        if (a === 'dup') { const c = { ...clone(it), id: uid(), x: Math.min(TABLE.w, it.x + 60), y: Math.min(TABLE.h, it.y + 60) }; items.splice(idx + 1, 0, c); selected = { type: 'item', id: c.id }; }
        if (a === 'front') { items.splice(idx, 1); let i = items.length; while (i > 0 && S.isObstacle(items[i - 1])) i--; items.splice(i, 0, it); }
      }
      saveLocal(); sensors = S.sense(world); dirty = true; renderProps();
    }));
  }
  function renderPropsValues() {
    if (!selected) return;
    const set = (p, v) => { const i = $(`[data-p="${p}"]`, propsEl); if (i && document.activeElement !== i) i.value = v; };
    if (selected.type === 'robot') { set('rx', r1(world.robot.x / 10)); set('ry', r1(world.robot.y / 10)); set('rh', Math.round(world.robot.h)); }
    else { const it = items.find(i => i.id === selected.id); if (!it) return; set('w', r1(it.w / 10)); set('h', r1(it.h / 10)); set('r', r1(it.r / 10)); set('rot', Math.round(it.rot || 0)); }
  }

  // ---------- keyboard & manual pad ----------
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', KeyQ: 'C-', KeyE: 'C+', KeyZ: 'D-', KeyX: 'D+' };
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable); };
  function onKeyDown(e) {
    if (typing() || !document.body.contains(canvas) || document.querySelector('.modal-bg')) return;
    const k = KEYMAP[e.code];
    if (k && !running) { keys.add(k); e.preventDefault(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && selected.type === 'item' && !running) {
      const idx = items.findIndex(i => i.id === selected.id); if (idx >= 0) items.splice(idx, 1); selected = null; saveLocal(); renderProps(); sensors = S.sense(world); dirty = true; e.preventDefault();
    }
    if (e.code === 'KeyR' && selected && !running) {
      const d = e.shiftKey ? -15 : 15;
      if (selected.type === 'robot') { world.robot.h += d; world.yawZero = world.robot.h; }
      else { const it = items.find(i => i.id === selected.id); if (it) it.rot = ((it.rot || 0) + d + 360) % 360; }
      saveLocal(); renderPropsValues(); sensors = S.sense(world); dirty = true;
    }
    if (e.key === 'Escape' && selected) { selected = null; renderProps(); dirty = true; }
  }
  function onKeyUp(e) { const k = KEYMAP[e.code]; if (k) keys.delete(k); }
  document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
  const blurAll = () => keys.clear();
  window.addEventListener('blur', blurAll);
  for (const b of $$('.dpad button, .armpad button', layout)) {
    const k = b.dataset.k || (b.dataset.arm + (b.dataset.dir === '1' ? '+' : '-'));
    const on = e => { e.preventDefault(); if (running) return; keys.add(k); b.setPointerCapture(e.pointerId); };
    const off = () => keys.delete(k);
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  }
  const ms = $('[data-mspeed]', layout), msv = $('[data-mspeed-v]', layout);
  ms.value = manualSpeed; msv.textContent = manualSpeed + '%';
  ms.oninput = () => { manualSpeed = Number(ms.value); msv.textContent = manualSpeed + '%'; store.set(key('mspeed'), manualSpeed); };

  // ---------- go ----------
  const offTheme = ctx.on('theme', () => (dirty = true));
  paintPalette(); resize(); sensors = S.sense(world); showSensors(true);
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf); ro.disconnect();
    document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', blurAll);
    if (worker) worker.terminate();
    if (timer) clearInterval(timer);
    offUnread(); offTheme();
    if (aiComp) aiComp.destroy(); if (gcComp) gcComp.destroy();
    saveLocal();
  };
}
