/* Platform layer: connects the game to our server (AI master, turn limits, Stars purchases)
   and to Telegram when the page runs as a Mini App. Loaded before the game script. */
(() => {
'use strict';
const W = window.Telegram && window.Telegram.WebApp;
const tg = W && W.initData ? W : null;
if (tg){
  tg.ready(); tg.expand();
  try { tg.setHeaderColor('#0b0916'); tg.setBackgroundColor('#0b0916'); } catch(e){}
  document.documentElement.classList.add('in-tg');
}
let guest = null;
try { guest = localStorage.getItem('gf-guest'); if (!guest){ guest = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); localStorage.setItem('gf-guest', guest); } } catch(e){ guest = 'tmp' + String(Math.random()).slice(2, 12); }

// One player action can need several AI calls (check, then outcome); the server counts it as one turn.
let turnId = 'boot';
window.addEventListener('submit', () => { turnId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }, true);

const headers = () => ({ 'content-type': 'application/json', 'x-tg-init': tg ? tg.initData : '', 'x-guest': guest, 'x-turn': turnId });
async function post(url, body){
  let r, j = null;
  try { r = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) }); } catch(e){ throw { code: 'upstream_error' }; }
  try { j = await r.json(); } catch(e){}
  if (j && j.quota) setQuota(j.quota);
  if (!r.ok || !j || j.error) throw { code: (j && j.error) || 'upstream_error' };
  return j;
}

let config = { bot: '', ai: true, products: [] };
const ready = fetch('/api/config').then(r => r.json()).then(c => { config = c; }).catch(() => {});
// With opts.onText the server streams the answer and the page shows the master's text as it is written.
async function streamAi(prompt, onText){
  let r;
  try { r = await fetch('/api/ai', { method: 'POST', headers: headers(), body: JSON.stringify({ prompt, stream: true }) }); } catch(e){ throw { code: 'upstream_error' }; }
  if (!/ndjson/.test(r.headers.get('content-type') || '') || !r.body){
    let j = null; try { j = await r.json(); } catch(e){}
    if (j && j.quota) setQuota(j.quota);
    if (!r.ok || !j || j.error) throw { code: (j && j.error) || 'upstream_error' };
    return j.data;
  }
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = '', acc = '', last = null;
  for (;;){
    const { value, done } = await rd.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0){
      const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch(e){ continue; }
      if (m.d != null){ acc += m.d; try { onText(acc); } catch(e){} } else last = m;
    }
    if (done) break;
  }
  if (last && last.quota) setQuota(last.quota);
  if (!last || last.error || !last.done) throw { code: (last && last.error) || 'upstream_error' };
  return last.data;
}
const sample = { json: async (prompt, opts) => opts && typeof opts.onText === 'function' ? streamAi(prompt, opts.onText) : (await post('/api/ai', { prompt })).data };
const db = { collection: () => ({ add: doc => post('/api/log', doc).catch(() => {}) }) };
window.claude = { use: async name => {
  await ready;
  if (name === 'sample'){ if (!config.ai) throw { code: 'sampling_disabled' }; return sample; }
  if (name === 'db') return db;
  throw { code: 'not_declared' };
} };

/* ---------- turn counter and purchases ---------- */
let Q = null;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
let badge = null;
function setQuota(q){
  Q = q; if (!badge) return;
  if (q.pass) badge.textContent = '∞ ходов до ' + new Date(q.pass).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  else { const left = Math.max(0, q.free - q.used) + (q.starter || 0) + q.bonus; badge.textContent = 'Ходов: ' + left; badge.classList.toggle('low', left <= 5); }
}
// reason: why the window opened — 'limit_reached' (out of turns), 'busy_today' (free play paused for everyone), or none (the badge).
function paywall(reason){
  if (document.querySelector('.pw-back')) return;
  const back = el('div', 'pw-back'), box = el('div', 'pw');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  const free = Q ? Q.free : 'новые';
  const note = tg ? ' Я напишу тебе в бот, когда он отдохнёт.' : '';
  if (reason === 'busy_today'){
    box.append(el('h2', null, '🕯 Мастер устал'));
    box.append(el('p', null, 'Сегодня у костра слишком много героев, и мастер выдохся. Бесплатная игра вернётся завтра.' + note));
  } else if (reason === 'limit_reached'){
    box.append(el('h2', null, '🕯 Мастер отдыхает'));
    box.append(el('p', null, `Ходы на сегодня кончились. Завтра будет ${free} бесплатных ходов.` + note));
  } else {
    box.append(el('h2', null, 'Ещё ходов?'));
    box.append(el('p', null, Q ? `Каждый день — ${Q.free} бесплатных ходов, они обновляются каждые сутки.` : 'Бесплатные ходы обновляются каждые сутки.'));
  }
  if (reason && tg && config.products.length) box.append(el('p', null, 'А продолжить можно прямо сейчас:'));
  if (tg){
    config.products.forEach(p => {
      const b = el('button', 'pw-buy'); b.type = 'button';
      b.append(el('b', null, p.title), el('span', null, p.description), el('em', null, `${p.stars} ⭐`));
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const { link } = await post('/api/invoice', { product: p.id });
          tg.openInvoice(link, status => { if (status === 'paid'){ refresh(); close(); } b.disabled = false; });
        } catch(e){ b.disabled = false; }
      });
      box.append(b);
    });
  } else {
    box.append(el('p', null, 'Покупки и больше бесплатных ходов — в Telegram-версии игры.'));
    if (config.bot){ const a = el('a', 'pw-buy', 'Открыть в Telegram'); a.href = `https://t.me/${config.bot}`; a.target = '_blank'; a.rel = 'noopener'; box.append(a); }
  }
  const x = el('button', 'btn pw-close', 'Закрыть'); x.type = 'button'; box.append(x);
  const close = () => back.remove();
  x.addEventListener('click', close); back.addEventListener('click', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', function esc(e){ if (e.key === 'Escape'){ close(); document.removeEventListener('keydown', esc); } });
  back.append(box); document.body.append(back); x.focus();
}
const refresh = () => fetch('/api/me', { headers: headers() }).then(r => r.json()).then(j => j.quota && setQuota(j.quota)).catch(() => {});

/* ---------- voice input ---------- */
function addMic(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const form = document.getElementById('form'), cmd = document.getElementById('cmd'), go = document.getElementById('go');
  if (!SR || !form) return;
  const mic = el('button', 'mic', '🎙'); mic.type = 'button'; mic.setAttribute('aria-label', 'Сказать голосом');
  let rec = null;
  mic.addEventListener('click', () => {
    if (rec){ rec.stop(); return; }
    try { rec = new SR(); } catch(e){ mic.remove(); return; }
    rec.lang = 'ru-RU'; rec.interimResults = true; rec.maxAlternatives = 1;
    const before = cmd.value ? cmd.value.trim() + ' ' : '';
    rec.onresult = e => { cmd.value = before + [...e.results].map(r => r[0].transcript).join(''); };
    rec.onend = () => { rec = null; mic.classList.remove('on'); };  // no focus: the keyboard must not pop up after speaking
    rec.onerror = () => {};
    mic.classList.add('on'); rec.start();
  });
  form.insertBefore(mic, go);
}

function mount(){
  const tools = document.querySelector('.tools');
  if (tools){
    badge = el('button', 'btn quota', 'Ходов: …'); badge.type = 'button';
    badge.addEventListener('click', () => paywall());
    tools.prepend(badge);
  }
  addMic(); refresh();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
window.Platform = { paywall, telegram: !!tg };
})();
