import { icon, h, $, $$, esc } from '../ui.js';
import { sectionShell } from '../components/section.js';
import { aiChat } from '../components/aichat.js';

export default function mechanics(view, ctx) {
  return sectionShell(view, ctx, {
    section: 'mechanics', group: 'mechanics', title: 'Mechanics', iconName: 'gear',
    desc: 'ابعت PDF أو صور لشكل الروبوت، والمساعد يقيّم التصميم ويشرحلك طريقة عمله وبناءه خطوة بخطوة.',
    tabs: [{ key: 'ai', label: 'تقييم التصميم', icon: 'sparkles', render: pane => mechTab(pane, ctx) }]
  });
}

function mechTab(pane, ctx) {
  const wrap = h(`<div class="split">
    <div class="stack">
      <div class="card">
        <h3>${icon('upload')} ارفع تصميم الروبوت</h3>
        <div class="dropzone" tabindex="0" role="button">${icon('file')}<b>اسحب الـ PDF أو الصورة هنا</b><div class="small">أو دوس عشان تختار ملف (PDF / PNG / JPG — لحد 10MB)</div></div>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden>
        <div class="row" style="margin-top:12px;gap:6px" data-acts>
          <button class="btn sm" data-q="قيّم تصميم الروبوت ده بجدول درجات، وقولي أهم نقاط القوة والضعف.">📊 قيّم التصميم</button>
          <button class="btn sm" data-q="اشرحلي الروبوت ده بيشتغل إزاي، وإزاي أبنيه خطوة بخطوة (ابدأ بالـ chassis وبعدين الموتورات والحساسات والـ attachments).">🧱 طريقة البناء خطوة بخطوة</button>
          <button class="btn sm" data-q="بص على مركز الثقل والثبات والعجل. ايه اللي ممكن يخلي الروبوت يلف أو يميل؟ وإزاي أحسنه؟">⚖️ الثبات ومركز الثقل</button>
          <button class="btn sm" data-q="اقترح attachments ونظام تغيير سريع (quick-swap) مناسب للروبوت ده للمهمات.">🦾 أفكار attachments</button>
        </div>
      </div>
      <div class="card">
        <h3>${icon('eye')} نصايح لصور أوضح</h3>
        <ul class="small" style="margin:0;padding-inline-start:20px;color:var(--muted)">
          <li>صوّر الروبوت من فوق، ومن الجنب، ومن قدام — في إضاءة كويسة.</li>
          <li>لو عندكم ملف Studio أو instructions، صدّروه PDF وابعتوه.</li>
          <li>اكتبوا مع الصورة: الموتورات في أنهي منافذ ومقاس العجل.</li>
          <li>بعد التقييم، اسأل أسئلة متابعة عادي — المساعد فاكر آخر ملف.</li>
        </ul>
      </div>
      <div class="card">
        <h3>${icon('check')} Checklist سريع لتصميم الروبوت</h3>
        <div class="stack small" data-check style="gap:6px"></div>
      </div>
    </div>
    <div data-ai></div>
  </div>`);
  pane.append(wrap);
  const ai = aiChat(ctx, {
    section: 'mechanics', title: 'مساعد الميكانيكا',
    intro: 'ارفع PDF أو صورة للروبوت من المربع اللي جنبي أو من زرار 📎، وأنا أقيّمه وأشرحلك طريقة بنائه.',
    quick: ['ايه أفضل drive base لـ FLL؟', 'الفرق بين الـ gear ratio العالي والواطي', 'إزاي أعمل attachment بيتركب بسرعة؟', 'إزاي أخلي الروبوت يمشي مستقيم ميكانيكيًا؟'],
    allowFile: true, fileHint: 'إرفاق PDF أو صورة للروبوت'
  });
  $('[data-ai]', wrap).append(ai.el);
  const dz = $('.dropzone', wrap), input = $('input[type=file]', wrap);
  let has = false;
  async function pick(f) {
    if (!f) return;
    dz.classList.remove('has');
    dz.innerHTML = `${icon('upload')}<b>جاري رفع ${esc(f.name)}...</b>`;
    await ai.attach(f);
    has = true;
    dz.classList.add('has');
    dz.innerHTML = `${icon('check')}<b>${esc(f.name)}</b><div class="small">اتضاف للمحادثة — اختار سؤال من تحت أو اكتب سؤالك</div>`;
  }
  dz.onclick = () => input.click();
  dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => { pick(input.files[0]); input.value = ''; };
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); pick(e.dataTransfer.files[0]); });
  $$('[data-q]', wrap).forEach(b => (b.onclick = () => ai.send(b.dataset.q)));

  const checks = ['الروبوت يدخل في منطقة الانطلاق وارتفاعه في الحدود المسموحة', 'العجلتين على نفس المحور ومربوطين من الناحيتين', 'مركز الثقل واطي وقريب من العجل', 'حساس اللون قريب من الأرض (حوالي 1 سم) وقدام العجل', 'الـ Hub سهل الوصول للزراير والشاحن', 'الكابلات متربطة ومش هتتشد في الـ attachments', 'الـ attachments بتتركب وتتشال في أقل من 5 ثواني', 'الروبوت متماسك: جرّب تضغط عليه — مفيش حاجة بتتحرك'];
  const k = 'mechcheck:' + ctx.user.username;
  let state = {}; try { state = JSON.parse(localStorage.getItem(k) || '{}'); } catch {}
  const box = $('[data-check]', wrap);
  checks.forEach((c, i) => {
    const row = h(`<label class="row nowrap" style="cursor:pointer;align-items:flex-start"><input type="checkbox" ${state[i] ? 'checked' : ''} style="margin-top:5px"> <span>${esc(c)}</span></label>`);
    $('input', row).onchange = e => { state[i] = e.target.checked; try { localStorage.setItem(k, JSON.stringify(state)); } catch {} };
    box.append(row);
  });
  return ai;
}
