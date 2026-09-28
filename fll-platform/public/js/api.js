// Thin fetch wrapper for the platform's REST API.
async function request(method, url, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch { throw new Error('مفيش اتصال بالسيرفر — اتأكد من النت'); }
  let data = null;
  try { data = await res.json(); } catch {}
  if (res.status === 401 && !url.endsWith('/login')) { window.dispatchEvent(new Event('fll:logout')); }
  if (!res.ok) throw new Error((data && data.error) || 'حصلت مشكلة (' + res.status + ')');
  return data;
}
export const api = {
  get: u => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  del: u => request('DELETE', u),
  async upload(file, purpose) {
    if (file.size > 10 * 1024 * 1024) throw new Error('الملف أكبر من 10MB');
    const fd = new FormData(); fd.append('purpose', purpose); fd.append('file', file);
    return (await request('POST', '/api/files', fd)).file;
  },
  // Streams the AI answer; calls onChunk(textSoFar) as it arrives.
  async aiStream(section, payload, onChunk, signal) {
    let res;
    try {
      res = await fetch('/api/ai/' + section, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal });
    } catch (e) { if (e.name === 'AbortError') throw e; throw new Error('مفيش اتصال بالسيرفر'); }
    if (!res.ok) { let d = null; try { d = await res.json(); } catch {} throw new Error((d && d.error) || 'مشكلة في الـ AI'); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let text = '';
    while (true) { const { value, done } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); onChunk(text); }
    return text;
  }
};
