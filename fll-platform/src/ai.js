// Google Gemini integration (streaming), with automatic model fallback and a mock mode for offline testing.
const { PROMPTS } = require('./prompts');

const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
let workingModel = null;

function modelList() {
  const list = [];
  if (workingModel) list.push(workingModel);
  if (process.env.GEMINI_MODEL) list.push(...process.env.GEMINI_MODEL.split(',').map(s => s.trim()).filter(Boolean));
  list.push(...DEFAULT_MODELS);
  return [...new Set(list)];
}

class AIError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

function friendlyError(status, body) {
  const msg = (body && body.error && body.error.message) || '';
  if (status === 400 && /API key/i.test(msg)) return new AIError('مفتاح Gemini (GEMINI_API_KEY) غير صحيح — الكوتش محتاجة تتأكد منه في إعدادات Render.', 500);
  if (status === 401 || status === 403) return new AIError('مفتاح Gemini مش شغال أو مش مسموح له بالنموذج ده. اتأكدوا من المفتاح في Google AI Studio.', 500);
  if (status === 429) return new AIError('الحد المجاني للـ AI اتخطى مؤقتًا ⏳ استنوا دقيقة وجربوا تاني.', 429);
  if (status >= 500) return new AIError('خدمة Gemini مشغولة دلوقتي، جربوا كمان شوية.', 503);
  if (status === 400 && /size|too large|exceeds/i.test(msg)) return new AIError('الملف كبير على الـ AI، جربوا ملف أصغر (أقل من 10MB).', 400);
  return new AIError('حصلت مشكلة مع الـ AI: ' + (msg || status), 502);
}

// Merge consecutive messages from the same role (Gemini prefers alternating turns).
function normalizeContents(contents) {
  const out = [];
  for (const c of contents) {
    if (!c.parts.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === c.role) last.parts.push(...c.parts);
    else out.push({ role: c.role, parts: [...c.parts] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

async function* mockStream(section, contents) {
  const last = contents[contents.length - 1];
  const hasFile = last.parts.some(p => p.inlineData) || contents.some(c => c.parts.some(p => p.inlineData));
  const text = (last.parts.filter(p => p.text).map(p => p.text).join(' ') || '').slice(-200);
  const reply = `### وضع تجريبي (Mock) — قسم ${section}\n\nده رد تجريبي لأن \`AI_MOCK=1\`. ${hasFile ? '📎 وصلني ملف مع الرسالة.' : ''}\n\nسؤالك كان:\n> ${text.replace(/\n/g, ' ')}\n\n1. خطوة أولى\n2. خطوة تانية\n\n\`\`\`python\nrobot.move(30, 50)\nrobot.gyro_turn(90)\n\`\`\`\n`;
  for (const piece of reply.match(/.{1,12}/gs)) { await new Promise(r => setTimeout(r, 15)); yield piece; }
}

async function* streamAI({ section, contents }) {
  const system = PROMPTS[section];
  contents = normalizeContents(contents);
  if (process.env.AI_MOCK === '1') { yield* mockStream(section, contents); return; }
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIError('الـ AI لسه مش متفعّل — الكوتش محتاجة تضيف GEMINI_API_KEY في إعدادات السيرفر (شوفوا دليل التشغيل).', 503);

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 8192 }
  });

  for (const model of modelList()) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body });
    } catch (e) {
      throw new AIError('السيرفر مش قادر يوصل لـ Gemini دلوقتي. جربوا تاني بعد شوية.', 503);
    }
    if (res.status === 404) { await res.text().catch(() => {}); continue; } // model not available → try the next one
    if (!res.ok) {
      let j = null; try { j = await res.json(); } catch {}
      throw friendlyError(res.status, j);
    }
    workingModel = model;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let gotText = false;
    let blocked = null;
    const handleLine = (line) => {
      if (!line.startsWith('data:')) return null;
      const json = line.slice(5).trim();
      if (!json || json === '[DONE]') return null;
      let obj; try { obj = JSON.parse(json); } catch { return null; }
      if (obj.promptFeedback && obj.promptFeedback.blockReason) blocked = obj.promptFeedback.blockReason;
      const cand = obj.candidates && obj.candidates[0];
      if (cand && ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(cand.finishReason)) blocked = cand.finishReason;
      const parts = (cand && cand.content && cand.content.parts) || [];
      return parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) {
        const t = handleLine(line);
        if (t) { gotText = true; yield t; }
      }
    }
    if (buf) { const t = handleLine(buf); if (t) { gotText = true; yield t; } }
    if (!gotText) {
      if (blocked) yield '⚠️ الـ AI رفض يرد على الرسالة دي. جربوا تصيغوا السؤال بطريقة تانية.';
      else yield '⚠️ مفيش رد من الـ AI. جربوا تاني.';
    }
    return;
  }
  throw new AIError('مفيش نموذج Gemini متاح بالمفتاح ده. جربوا تحطوا GEMINI_MODEL=gemini-2.5-flash في الإعدادات.', 502);
}

module.exports = { streamAI, AIError };
