// Grey Fang server: serves the game page, proxies the game master to Claude with
// per-player daily limits, and runs the Telegram bot (Mini App button + Stars payments).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const PORT = +env.PORT || 8080;
const BOT_TOKEN = env.BOT_TOKEN || '';
const PUBLIC_URL = (env.PUBLIC_URL || (env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + env.RAILWAY_PUBLIC_DOMAIN : '')).replace(/\/$/, '');
const DATA_DIR = env.DATA_DIR || (env.RAILWAY_VOLUME_MOUNT_PATH || path.join(here, 'data'));
const GM_MODEL = env.GM_MODEL || 'claude-haiku-5-5';
const TALK_MODEL = env.TALK_MODEL || 'claude-sonnet-5-5';
const FREE_TURNS = +env.FREE_TURNS || 30;          // free AI turns a day for a Telegram player
const FREE_TURNS_WEB = +env.FREE_TURNS_WEB || 10;  // free AI turns a day outside Telegram
const MAX_CALLS_DAY = +env.MAX_CALLS_DAY || 5000;  // wallet guard: AI calls a day for everyone together
const ADMIN_KEY = env.ADMIN_KEY || '';
const SUPPORT = env.SUPPORT_CONTACT || '';
const PRODUCTS = {
  turns50: { title: '+50 ходов', description: '50 дополнительных ходов мастера. Не сгорают.', stars: +env.PRICE_TURNS50 || 50, turns: 50 },
  month: { title: '30 дней без лимита', description: 'Играй сколько хочешь 30 дней.', stars: +env.PRICE_MONTH || 250, days: 30 },
};

const anthropic = env.ANTHROPIC_API_KEY ? new Anthropic() : null;
if (!anthropic) console.warn('ANTHROPIC_API_KEY is not set: the game runs in offline mode');

/* ---------- storage: one JSON file on the volume ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'state.json'), LOG_FILE = path.join(DATA_DIR, 'log.jsonl');
let db = { users: {}, ips: {}, payments: [], day: '', calls: 0 };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch {}
let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = DB_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), e => { if (!e) fs.rename(tmp, DB_FILE, () => {}); });
  }, 1000);
}
function logLine(obj) {
  fs.appendFile(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...obj }) + '\n', () => {});
}
const today = () => new Date().toISOString().slice(0, 10);
function rollDay() {
  const d = today();
  if (db.day !== d) { db.day = d; db.calls = 0; db.ips = {}; }
}
function user(key) {
  rollDay();
  const u = db.users[key] ||= { bonus: 0, passUntil: 0, day: '', used: 0, art: 0, turns: {} };
  if (u.day !== db.day) { u.day = db.day; u.used = 0; u.art = 0; u.turns = {}; }
  return u;
}
const quota = (u, tg) => ({ free: tg ? FREE_TURNS : FREE_TURNS_WEB, used: u.used, bonus: u.bonus, pass: u.passUntil > Date.now() ? u.passUntil : 0, telegram: tg });

/* ---------- Telegram Mini App identity ---------- */
function tgUser(initData) {
  if (!initData || !BOT_TOKEN) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const sig = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (sig.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - +p.get('auth_date') > 7 * 86400) return null;
  try { return JSON.parse(p.get('user')); } catch { return null; }
}
function who(req) {
  const tu = tgUser(req.headers['x-tg-init']);
  if (tu && tu.id) return { key: 'tg:' + tu.id, tg: true, name: tu.username || tu.first_name || '' };
  const g = String(req.headers['x-guest'] || '').replace(/[^\w-]/g, '').slice(0, 40);
  return { key: 'web:' + (g || 'anon'), tg: false, ip: clientIp(req) };
}
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

/* ---------- the game master ---------- */
const SYSTEM = 'Ты работаешь внутри компьютерной ролевой игры «Пещера Серого Зуба». Игра присылает тебе правила, состояние и действие игрока. Следуй правилам из сообщения и отвечай ровно тем JSON-объектом, который они просят, без пояснений вокруг.';
function kindOf(prompt) {
  if (prompt.startsWith('Ты отыгрываешь персонажа')) return 'talk';
  if (prompt.startsWith('Нарисуй пиксельную иконку')) return 'art';
  if (prompt.startsWith('Ты — мастер настольной игры') || prompt.startsWith('Ты — ведущий')) return 'gm';
  return null;
}
// The rules head every game-master prompt and never change, so they go into a cached system block.
function split(prompt) {
  const i = prompt.indexOf('\n\nСОСТОЯНИЕ');
  return i > 2000 ? [prompt.slice(0, i), prompt.slice(i + 2)] : ['', prompt];
}
function parseJson(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}
async function callClaude(prompt, kind) {
  const [fixed, rest] = split(prompt);
  const system = [{ type: 'text', text: SYSTEM }];
  if (fixed) system.push({ type: 'text', text: fixed, cache_control: { type: 'ephemeral' } });
  const msg = await anthropic.messages.create({
    model: kind === 'talk' ? TALK_MODEL : GM_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: rest }],
    output_config: { effort: 'low' },
  });
  if (msg.stop_reason === 'refusal') throw { code: 'refused' };
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const data = parseJson(text);
  if (!data) throw { code: 'invalid_json' };
  return { data, usage: msg.usage, model: msg.model };
}

async function apiAi(req, body) {
  const me = who(req);
  const prompt = String(body.prompt || '');
  const kind = kindOf(prompt);
  if (!kind || prompt.length > 60000) return [400, { error: 'invalid_request' }];
  if (!anthropic) return [503, { error: 'sampling_disabled' }];
  const u = user(me.key);
  if (db.calls >= MAX_CALLS_DAY) return [429, { error: 'busy_today', quota: quota(u, me.tg) }];
  if (!me.tg) {
    const n = db.ips[me.ip] = (db.ips[me.ip] || 0) + 1;
    if (n > FREE_TURNS_WEB * 6) return [429, { error: 'limit_reached', quota: quota(u, me.tg) }];
  }
  if (kind === 'art') {
    if (u.art >= 20) return [429, { error: 'rate_limited' }];
    u.art++;
  } else {
    const turn = String(req.headers['x-turn'] || '').slice(0, 24) || 'none';
    if (!u.turns[turn]) {
      if (u.passUntil > Date.now()) {}
      else if (u.used < (me.tg ? FREE_TURNS : FREE_TURNS_WEB)) u.used++;
      else if (u.bonus > 0) u.bonus--;
      else return [402, { error: 'limit_reached', quota: quota(u, me.tg) }];
      u.turns[turn] = 0;
    }
    if (++u.turns[turn] > 4) return [429, { error: 'rate_limited', quota: quota(u, me.tg) }];
  }
  db.calls++; persist();
  try {
    const t0 = Date.now();
    const r = await callClaude(prompt, kind);
    logLine({ type: 'ai', user: me.key, kind, ms: Date.now() - t0, model: r.model, usage: r.usage });
    return [200, { data: r.data, quota: quota(u, me.tg) }];
  } catch (e) {
    const code = e && e.code ? e.code : e instanceof Anthropic.RateLimitError ? 'rate_limited' : 'upstream_error';
    logLine({ type: 'ai_error', user: me.key, kind, code, err: String(e && e.message || e).slice(0, 300) });
    return [502, { error: code, quota: quota(u, me.tg) }];
  }
}

/* ---------- Telegram bot ---------- */
let botName = '';
async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
  return j.result;
}
const hookSecret = () => crypto.createHash('sha256').update('hook:' + BOT_TOKEN).digest('hex').slice(0, 48);
const playButton = () => ({ inline_keyboard: [[{ text: '⚔️ Играть', web_app: { url: PUBLIC_URL + '/' } }]] });

async function onUpdate(up) {
  if (up.pre_checkout_query) {
    const q = up.pre_checkout_query;
    let ok = false; try { ok = !!PRODUCTS[JSON.parse(q.invoice_payload).p]; } catch {}
    await tg('answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok } : { pre_checkout_query_id: q.id, ok, error_message: 'Товар не найден. Попробуй ещё раз из игры.' });
    return;
  }
  const m = up.message; if (!m) return;
  if (m.successful_payment) {
    const sp = m.successful_payment;
    let p = null; try { p = JSON.parse(sp.invoice_payload); } catch {}
    const prod = p && PRODUCTS[p.p];
    const u = user('tg:' + m.from.id);
    if (prod && prod.turns) u.bonus += prod.turns;
    if (prod && prod.days) u.passUntil = Math.max(u.passUntil, Date.now()) + prod.days * 86400000;
    db.payments.push({ at: Date.now(), user: m.from.id, product: p && p.p, stars: sp.total_amount, charge: sp.telegram_payment_charge_id });
    persist();
    logLine({ type: 'payment', user: 'tg:' + m.from.id, product: p && p.p, stars: sp.total_amount });
    await tg('sendMessage', { chat_id: m.chat.id, text: 'Спасибо! Покупка зачислена, возвращайся в игру.', reply_markup: playButton() });
    return;
  }
  const text = m.text || '';
  if (text.startsWith('/paysupport')) {
    await tg('sendMessage', { chat_id: m.chat.id, text: 'Проблема с оплатой? Напиши, что случилось' + (SUPPORT ? `: ${SUPPORT}` : ' прямо сюда, в этот чат.') + ' Если покупка не зачислилась, вернём звёзды.' });
    return;
  }
  if (text.startsWith('/start') || text.startsWith('/play')) {
    await tg('sendMessage', {
      chat_id: m.chat.id,
      text: '🕯 Пещера Серого Зуба\n\nТёмное фэнтези по правилам D&D 5e. Пиши что угодно — ИИ-мастер бросит кости и решит, что из этого выйдет.\n\nКаждый день ' + FREE_TURNS + ' ходов бесплатно.',
      reply_markup: playButton(),
    });
  }
}
async function setupBot() {
  if (!BOT_TOKEN) { console.warn('BOT_TOKEN is not set: Telegram bot is off'); return; }
  try {
    botName = (await tg('getMe')).username;
    if (!PUBLIC_URL) { console.warn('PUBLIC_URL is not set: cannot register the webhook'); return; }
    await tg('setWebhook', { url: PUBLIC_URL + '/tg/hook', secret_token: hookSecret(), allowed_updates: ['message', 'pre_checkout_query'] });
    await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: PUBLIC_URL + '/' } } });
    await tg('setMyCommands', { commands: [{ command: 'start', description: 'Начать игру' }, { command: 'paysupport', description: 'Помощь с оплатой' }] });
    console.log(`bot @${botName} ready, webhook ${PUBLIC_URL}/tg/hook`);
  } catch (e) { console.error('bot setup failed:', e.message); }
}

/* ---------- http ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
const PUB = path.join(here, 'public');
function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 100000) {
  return new Promise((ok, bad) => {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > limit) { bad(new Error('too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch { ok({}); } });
    req.on('error', bad);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'POST' && url.pathname === '/tg/hook') {
      if (req.headers['x-telegram-bot-api-secret-token'] !== hookSecret()) return send(res, 403, { ok: false });
      const up = await readBody(req);
      send(res, 200, { ok: true });
      onUpdate(up).catch(e => console.error('update failed:', e.message));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/ai') {
      const [code, obj] = await apiAi(req, await readBody(req));
      return send(res, code, obj);
    }
    if (req.method === 'POST' && url.pathname === '/api/log') {
      const me = who(req), body = await readBody(req, 40000);
      logLine({ type: 'turn', user: me.key, ...body });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/invoice') {
      const me = who(req), body = await readBody(req);
      const prod = PRODUCTS[body.product];
      if (!me.tg || !prod) return send(res, 400, { error: 'invalid_request' });
      const link = await tg('createInvoiceLink', {
        title: prod.title, description: prod.description, currency: 'XTR', provider_token: '',
        payload: JSON.stringify({ p: body.product, u: me.key }), prices: [{ label: prod.title, amount: prod.stars }],
      });
      return send(res, 200, { link });
    }
    if (url.pathname === '/api/me') {
      const me = who(req);
      return send(res, 200, { quota: quota(user(me.key), me.tg), name: me.name || '' });
    }
    if (url.pathname === '/api/config') {
      return send(res, 200, { bot: botName, ai: !!anthropic, products: Object.entries(PRODUCTS).map(([id, p]) => ({ id, title: p.title, description: p.description, stars: p.stars })) });
    }
    if (url.pathname.startsWith('/api/admin/')) {
      if (!ADMIN_KEY || url.searchParams.get('key') !== ADMIN_KEY) return send(res, 403, { error: 'forbidden' });
      if (url.pathname === '/api/admin/stats') {
        const users = Object.entries(db.users);
        return send(res, 200, { day: db.day, callsToday: db.calls, users: users.length, activeToday: users.filter(([, u]) => u.day === db.day && u.used).length, payments: db.payments.length, stars: db.payments.reduce((s, p) => s + (p.stars || 0), 0) });
      }
      if (url.pathname === '/api/admin/log') {
        const n = Math.min(+url.searchParams.get('n') || 200, 5000);
        let lines = [];
        try { lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-n); } catch {}
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
        return res.end(lines.join('\n') + '\n');
      }
      return send(res, 404, { error: 'not_found' });
    }
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    // static files
    const file = path.join(PUB, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(PUB)) return send(res, 404, { error: 'not_found' });
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, { error: 'not_found' });
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
      res.end(buf);
    });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'upstream_error' });
  }
});

server.listen(PORT, () => { console.log(`Grey Fang on :${PORT}`); setupBot(); });
