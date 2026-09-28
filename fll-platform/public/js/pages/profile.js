import { api } from '../api.js';
import { icon, h, $, $$, esc, avatar, toast, modal } from '../ui.js';

export default function profile(view, ctx) {
  ctx.setTitle('حسابي', 'user');
  const u = ctx.user;
  const el = h(`<div class="grid g2" style="align-items:start">
    <div class="card">
      <div class="row nowrap" style="margin-bottom:16px">${avatar(u, 'lg')}<div><h3 style="margin:0">${esc(u.name)}</h3><div class="muted ltr" style="text-align:start">@${esc(u.username)}</div><span class="chip">${u.role === 'coach' ? 'الكوتش — صلاحية تقييم التاسكات' : 'طالب في الفريق'}</span></div></div>
      <h3>${icon('lock')} غيّر كلمة السر</h3>
      <form data-pw>
        <label class="field"><span>كلمة السر الحالية</span><input class="input ltr" type="password" name="current" autocomplete="current-password" required></label>
        <label class="field"><span>كلمة السر الجديدة (8 حروف على الأقل)</span><input class="input ltr" type="password" name="next" autocomplete="new-password" minlength="8" required></label>
        <label class="field"><span>أكّد كلمة السر الجديدة</span><input class="input ltr" type="password" name="confirm" autocomplete="new-password" minlength="8" required></label>
        <button class="btn primary">${icon('check')} حفظ</button>
      </form>
      <hr style="border:none;border-top:1px solid var(--border);margin:18px 0">
      <button class="btn bad" data-logout>${icon('logout')} تسجيل الخروج</button>
    </div>
    <div class="stack" data-right></div>
  </div>`);
  view.append(el);
  $('[data-pw]', el).onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    if (f.next.value !== f.confirm.value) return toast('كلمتين السر الجداد مش زي بعض', 'bad');
    try { await api.post('/api/me/password', { current: f.current.value, next: f.next.value }); toast('اتغيرت كلمة السر ✅', 'ok'); f.reset(); }
    catch (err) { toast(err.message, 'bad'); }
  };
  $('[data-logout]', el).onclick = () => ctx.logout();
  const right = $('[data-right]', el);
  if (u.role === 'coach') {
    const c = h(`<div class="card"><h3>${icon('users')} حسابات الفريق</h3><p class="muted small" style="margin-top:0">لو حد نسي كلمة السر، تقدري تعمليله كلمة سر جديدة من هنا.</p><div class="stack" data-list></div></div>`);
    for (const s of ctx.usersList.filter(x => x.role === 'student')) {
      const row = h(`<div class="row nowrap">${avatar(s, 'sm')}<div style="flex:1"><b>${esc(s.name)}</b> <span class="muted small ltr">@${esc(s.username)}</span></div><button class="btn sm">${icon('lock')} كلمة سر جديدة</button></div>`);
      $('button', row).onclick = () => {
        const AB = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const gen = Array.from(crypto.getRandomValues(new Uint32Array(10)), b => AB[b % AB.length]).join('');
        const m = modal({
          title: 'كلمة سر جديدة لـ ' + s.name,
          body: `<label class="field"><span>كلمة السر الجديدة</span><input class="input ltr" data-n value="${gen}" minlength="8"></label><p class="muted small" style="margin:0">ابعتيها لـ ${esc(s.name)} وهو يقدر يغيرها بعد كده من صفحة "حسابي".</p>`,
          actions: [{ label: 'إلغاء' }, { label: 'حفظ', cls: 'primary', onClick: async () => {
            const v = $('[data-n]', m.body).value;
            try { await api.post(`/api/users/${s.username}/password`, { next: v }); toast('اتغيرت ✅', 'ok'); } catch (err) { toast(err.message, 'bad'); return false; }
          } }]
        });
      };
      $('[data-list]', c).append(row);
    }
    right.append(c);
  }
  right.append(h(`<div class="card"><h3>${icon('book')} عن المنصة</h3>
    <ul class="small" style="margin:0;padding-inline-start:20px;line-height:1.9">
      <li><b>Programming:</b> مساعد يشرح الكود + PID Lab.</li>
      <li><b>Robot Game:</b> محاكي طاولة بالروبوت والحساسات، اكتب Python أو JavaScript.</li>
      <li><b>Task Submissions:</b> ابعت PDF للكوتش أو لزمايلك، والكوتش بتقيّم.</li>
      <li><b>Mechanics:</b> ارفع PDF/صور الروبوت والمساعد يقيّمه ويشرح البناء.</li>
      <li><b>Core Values:</b> مساعد للقيم والتحضير للـ judging.</li>
      <li>كل قسم له جروب للفريق والكوتش، والإشعارات بتوصلك على طول 🔔</li>
    </ul></div>`));
}
