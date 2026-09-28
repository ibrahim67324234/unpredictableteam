import { icon, h, $, $$, esc } from '../ui.js';
import { sectionShell } from '../components/section.js';
import { aiChat } from '../components/aichat.js';

const VALUES = [
  ['Discovery', 'الاكتشاف', 'بنستكشف مهارات وأفكار جديدة', '#2563eb'],
  ['Innovation', 'الابتكار', 'بنستخدم الإبداع والمثابرة لحل المشاكل', '#7c3aed'],
  ['Impact', 'التأثير', 'بنطبّق اللي اتعلمناه عشان نحسّن عالمنا', '#0d9488'],
  ['Inclusion', 'الشمول', 'بنحترم بعض وبنرحّب باختلافاتنا', '#ea580c'],
  ['Teamwork', 'العمل الجماعي', 'إحنا أقوى لما نشتغل مع بعض', '#e11d48'],
  ['Fun', 'المتعة', 'بنستمتع ونحتفل باللي بنعمله', '#ca8a04']
];

export default function values(view, ctx) {
  return sectionShell(view, ctx, {
    section: 'core_values', group: 'core_values', title: 'Core Values', iconName: 'heart',
    desc: 'القيم الأساسية هي روح FLL — المساعد هنا بيساعدكم تفهموها وتطبقوها وتتحضروا للـ judging.',
    tabs: [{ key: 'ai', label: 'المساعد والقيم', icon: 'sparkles', render: pane => cvTab(pane, ctx) }]
  });
}

function cvTab(pane, ctx) {
  const grid = h(`<div class="cv-grid">${VALUES.map(([en, ar, d, c]) => `<button class="cv" style="background:${c};border:none;text-align:start;cursor:pointer" data-v="${en}"><b>${en} · ${ar}</b><span>${d}</span></button>`).join('')}</div>`);
  pane.append(grid);
  pane.append(h(`<p class="muted small" style="margin:-6px 0 12px">والكل مربوط بـ <b>Gracious Professionalism®</b> و <b>Coopertition®</b>. دوس على أي قيمة عشان المساعد يشرحها بأمثلة من شغلكم.</p>`));
  const ai = aiChat(ctx, {
    section: 'core_values', title: 'مساعد الـ Core Values',
    intro: 'اسألني عن القيم الأساسية، أنشطة للفريق، أو إزاي تتحضروا لجلسة الـ judging.',
    quick: ['حضّرني لأسئلة الـ Core Values judging', 'اقترح نشاط teamwork في 10 دقايق', 'إزاي نحل خلاف في الفريق بشكل محترم؟', 'ساعدني أكتب reflection عن الأسبوع ده', 'يعني ايه Gracious Professionalism بأمثلة؟'],
    allowFile: true, fileHint: 'إرفاق PDF (مثلاً Core Values poster أو notebook)'
  });
  pane.append(ai.el);
  $$('[data-v]', grid).forEach(b => (b.onclick = () => ai.send(`اشرحلي قيمة ${b.dataset.v} بأمثلة عملية من شغل فريق FLL، وإزاي نوريها للحكام.`)));
  return ai;
}
