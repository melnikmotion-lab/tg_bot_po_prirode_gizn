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
const FREE_TURNS = +env.FREE_TURNS || 12;          // free AI turns a day for a Telegram player
const FREE_TURNS_WEB = +env.FREE_TURNS_WEB || 8;   // free AI turns a day outside Telegram
// A one-time welcome bank: the opening of the first adventure, up to its first night.
const STARTER_TURNS = +env.STARTER_TURNS || 40;
const STARTER_TURNS_WEB = +env.STARTER_TURNS_WEB || 30;
// Wallet guards, in dollars of real Claude spend (computed from token usage of every call).
const DAY_BUDGET = +env.DAY_BUDGET || 3;            // free play stops for everyone after this much spend in a day
const HARD_DAY_BUDGET = +env.HARD_DAY_BUDGET || 10; // nothing runs after this, paid or not
const FREE_USER_DAY = +env.FREE_USER_DAY || 0.10;   // one free player's spend a day
const PASS_USER_DAY = +env.PASS_USER_DAY || 0.10;   // one unlimited-pass player's spend a day (the pass brings ~$0.2 a day)
// $ per million tokens: input, output. Cache writes cost 1.25x input, cache reads 0.1x.
const PRICES = { 'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20] };
function costOf(model, us) {
  const [i, o] = PRICES[model] || PRICES['claude-sonnet-5-5'];
  return ((us.input_tokens || 0) * i + (us.cache_creation_input_tokens || 0) * i * 1.25 + (us.cache_read_input_tokens || 0) * i * 0.1 + (us.output_tokens || 0) * o) / 1e6;
}
const ADMIN_KEY = env.ADMIN_KEY || '';
const SUPPORT = env.SUPPORT_CONTACT || '';
const PRODUCTS = {
  turns50: { title: '+50 ходов', description: '50 дополнительных ходов мастера. Не сгорают.', stars: +env.PRICE_TURNS50 || 75, turns: 50 },
  month: { title: '30 дней без лимита', description: 'Играй сколько хочешь 30 дней.', stars: +env.PRICE_MONTH || 500, days: 30 },
};

const anthropic = env.ANTHROPIC_API_KEY ? new Anthropic() : null;
if (!anthropic) console.warn('ANTHROPIC_API_KEY is not set: the game runs in offline mode');

/* ---------- storage: one JSON file on the volume ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'state.json'), LOG_FILE = path.join(DATA_DIR, 'log.jsonl');
let db = { users: {}, ips: {}, payments: [], day: '', calls: 0, spend: 0, spendTotal: 0 };
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
  if (db.day !== d) { db.day = d; db.calls = 0; db.spend = 0; db.ips = {}; }
}
function user(key) {
  rollDay();
  const u = db.users[key] ||= { bonus: 0, passUntil: 0, day: '', used: 0, art: 0, turns: {}, cost: 0, paidTurns: {}, starter: key.startsWith('tg:') ? STARTER_TURNS : STARTER_TURNS_WEB };
  if (u.starter === undefined) u.starter = 0;
  if (u.day !== db.day) { u.day = db.day; u.used = 0; u.art = 0; u.turns = {}; u.cost = 0; u.paidTurns = {}; }
  u.paidTurns ||= {}; u.cost ||= 0;
  return u;
}
const quota = (u, tg) => ({ free: tg ? FREE_TURNS : FREE_TURNS_WEB, used: u.used, starter: u.starter || 0, bonus: u.bonus, pass: u.passUntil > Date.now() ? u.passUntil : 0, telegram: tg });

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
  if (tu && tu.id) return { key: 'tg:' + tu.id, tg: true, name: tu.first_name || tu.username || '' };
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
// onText (optional) gets the answer text as it grows, so the player sees the master writing.
async function callClaude(prompt, kind, paid, onText) {
  const [fixed, rest] = split(prompt);
  const system = [{ type: 'text', text: SYSTEM }];
  if (fixed) system.push({ type: 'text', text: fixed, cache_control: { type: 'ephemeral' } });
  const params = {
    model: kind === 'talk' && paid ? TALK_MODEL : GM_MODEL,  // the smarter voice is for paying players
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: rest }],
    output_config: { effort: 'low' },
  };
  let msg;
  if (onText) {
    const stream = anthropic.messages.stream(params);
    for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') onText(ev.delta.text);
    msg = await stream.finalMessage();
  } else msg = await anthropic.messages.create(params);
  if (msg.stop_reason === 'refusal') throw { code: 'refused' };
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const data = parseJson(text);
  if (!data) throw { code: 'invalid_json' };
  return { data, usage: msg.usage, model: msg.model };
}

// A Telegram player who ran out of turns gets one note in the bot the next day (see remindLoop).
function blocked(u, me, code) {
  if (me.tg) u.remindDay = db.day;
  return [code === 'limit_reached' ? 402 : 429, { error: code, quota: quota(u, me.tg) }];
}

async function apiAi(req, body, onText) {
  const me = who(req);
  const prompt = String(body.prompt || '');
  const kind = kindOf(prompt);
  if (!kind || prompt.length > 60000) return [400, { error: 'invalid_request' }];
  if (!anthropic) return [503, { error: 'sampling_disabled' }];
  const u = user(me.key);
  const pass = u.passUntil > Date.now();
  if (db.spend >= HARD_DAY_BUDGET) return blocked(u, me, 'busy_today');
  if (pass && u.cost >= PASS_USER_DAY) return [429, { error: 'fair_use', quota: quota(u, me.tg) }];
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
      const freeOk = u.used < (me.tg ? FREE_TURNS : FREE_TURNS_WEB) && u.cost < FREE_USER_DAY && db.spend < DAY_BUDGET;
      if (pass) u.paidTurns[turn] = 1;
      else if (freeOk) u.used++;
      else if (u.starter > 0 && db.spend < DAY_BUDGET) u.starter--;
      else if (u.bonus > 0) { u.bonus--; u.paidTurns[turn] = 1; }
      else if (u.used < (me.tg ? FREE_TURNS : FREE_TURNS_WEB) && db.spend >= DAY_BUDGET) return blocked(u, me, 'busy_today');
      else return blocked(u, me, 'limit_reached');
      u.turns[turn] = 0;
    }
    if (++u.turns[turn] > 4) return [429, { error: 'rate_limited', quota: quota(u, me.tg) }];
  }
  db.calls++; persist();
  try {
    const t0 = Date.now();
    const turn = String(req.headers['x-turn'] || '').slice(0, 24) || 'none';
    const r = await callClaude(prompt, kind, pass || !!u.paidTurns[turn], kind === 'art' ? null : onText);
    const cost = costOf(r.model, r.usage || {});
    u.cost += cost; db.spend += cost; db.spendTotal += cost; persist();
    logLine({ type: 'ai', user: me.key, kind, ms: Date.now() - t0, model: r.model, usage: r.usage, cost: +cost.toFixed(5) });
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
// A new address on every server start, so Telegram never opens a cached old version of the game.
const BUILD = Date.now().toString(36);
const playUrl = () => `${PUBLIC_URL}/?v=${BUILD}`;
const playButton = () => ({ inline_keyboard: [[{ text: '⚔️ Играть', web_app: { url: playUrl() } }]] });

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
  const inv = /^\/start\s+room_([A-Z0-9]{5})/i.exec(text);
  if (inv) {
    await tg('sendMessage', { chat_id: m.chat.id, text: `🕯 Тебя зовут в отряд. Комната ${inv[1].toUpperCase()}: жми «Войти», выбери героя и жди, пока ведущий начнёт.`,
      reply_markup: { inline_keyboard: [[{ text: '⚔️ Войти в отряд', web_app: { url: `${playUrl()}&room=${inv[1].toUpperCase()}` } }]] } });
    return;
  }
  if (text.startsWith('/start') || text.startsWith('/play')) {
    const u = user('tg:' + m.from.id); if (u.dmOff) { u.dmOff = false; persist(); }
    await tg('sendMessage', {
      chat_id: m.chat.id,
      text: '🕯 Пещера Серого Зуба\n\nТёмное фэнтези по правилам настольных ролевых игр 5-й редакции. Пиши что угодно — ИИ-мастер бросит кости и решит, что из этого выйдет.\n\nДля начала — ' + STARTER_TURNS + ' ходов в подарок, а дальше ' + FREE_TURNS + ' бесплатных ходов каждый день.',
      reply_markup: playButton(),
    });
  }
}
// Once a day, after 09:00 Moscow, tell players who hit the limit yesterday that the master is back.
// At most one note in three days per player, none if they already came back on their own,
// and never again to someone who blocked the bot.
const REMIND_GAP = 3 * 86400000;
async function remindLoop() {
  if (!BOT_TOKEN || !anthropic) return;
  const h = new Date().getUTCHours();
  if (h < 6 || h >= 18) return;
  rollDay();
  for (const [key, u] of Object.entries(db.users)) {
    if (!u.remindDay || u.remindDay >= db.day || !key.startsWith('tg:')) continue;
    u.remindDay = '';
    if (u.dmOff || (u.day === db.day && u.used) || Date.now() - (u.remindedAt || 0) < REMIND_GAP) continue;
    if (u.passUntil > Date.now()) continue;
    u.remindedAt = Date.now(); persist();
    try {
      await tg('sendMessage', { chat_id: key.slice(3), text: `🕯 Мастер отдохнул. У тебя снова ${FREE_TURNS} бесплатных ходов — герои ждут у костра.`, reply_markup: playButton() });
      logLine({ type: 'remind', user: key });
    } catch (e) {
      if (/blocked|deactivated|chat not found|403/i.test(e.message)) u.dmOff = true;
      logLine({ type: 'remind_error', user: key, err: e.message.slice(0, 200) });
    }
    await new Promise(r => setTimeout(r, 60));  // stay well under Telegram's 30 messages a second
  }
  persist();
}

async function setupBot() {
  if (!BOT_TOKEN) { console.warn('BOT_TOKEN is not set: Telegram bot is off'); return; }
  try {
    botName = (await tg('getMe')).username;
    if (!PUBLIC_URL) { console.warn('PUBLIC_URL is not set: cannot register the webhook'); return; }
    await tg('setWebhook', { url: PUBLIC_URL + '/tg/hook', secret_token: hookSecret(), allowed_updates: ['message', 'pre_checkout_query'] });
    await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: playUrl() } } });
    await tg('setMyCommands', { commands: [{ command: 'start', description: 'Начать игру' }, { command: 'paysupport', description: 'Помощь с оплатой' }] });
    console.log(`bot @${botName} ready, webhook ${PUBLIC_URL}/tg/hook`);
  } catch (e) { console.error('bot setup failed:', e.message); }
}

/* ---------- rooms: up to four players in one game ---------- */
// One member's page (the host) runs the game engine and talks to the master; the others send their actions
// here and get the shared state back. The host is the first member who is online, so if the host leaves,
// the next one takes over from the last saved state and the actions still waiting in the queue.
const ROOM_MAX = 4, ROOM_TTL = 3 * 86400000;
db.rooms ||= {};
const rooms = new Map();
for (const [code, r] of Object.entries(db.rooms)) {
  if (Date.now() - (r.touched || 0) > ROOM_TTL) { delete db.rooms[code]; continue; }
  rooms.set(code, { ...r, clients: new Set(), members: r.members.map(m => ({ ...m, conns: 0 })) });
}
function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) { const c = Array.from({ length: 5 }, () => A[crypto.randomInt(A.length)]).join(''); if (!rooms.has(c)) return c; }
}
const hostOf = r => (r.members.find(m => m.conns > 0) || r.members[0]).pid;
const roomView = r => ({ code: r.code, adv: r.adv, host: hostOf(r), timer: r.timer, started: r.started,
  members: r.members.map(m => ({ pid: m.pid, name: m.name, hero: m.hero, online: m.conns > 0 })) });
function saveRoom(r) {
  r.touched = Date.now();
  const { clients, ...keep } = r;
  db.rooms[r.code] = { ...keep, members: r.members.map(({ conns, ...m }) => m) };
  persist();
}
function emit(r, type, data) {
  const line = JSON.stringify({ type, data }) + '\n';
  for (const c of r.clients) { try { c.write(line); } catch {} }
}
const memberOf = (r, me) => r.members.find(m => m.key === me.key);
setInterval(() => { for (const r of rooms.values()) for (const c of r.clients) { try { c.write('\n'); } catch {} } }, 20000);

async function roomApi(req, res, url) {
  const me = who(req), body = await readBody(req, 1500000);
  const name = cleanName(body.name || me.name) || 'Игрок';
  if (url.pathname === '/api/room/create') {
    const r = { code: roomCode(), adv: String(body.adv || 'bell').slice(0, 20), created: Date.now(), timer: 60, started: false,
      members: [{ key: me.key, name, pid: 'p1', hero: null, conns: 0 }], queue: [], chat: [], state: null, nextId: 1, clients: new Set() };
    rooms.set(r.code, r); saveRoom(r);
    return send(res, 200, { code: r.code, pid: 'p1' });
  }
  const r = rooms.get(String(body.code || '').toUpperCase().trim());
  if (!r) return send(res, 404, { error: 'room_not_found' });
  let m = memberOf(r, me);
  if (url.pathname === '/api/room/join') {
    if (!m) {
      if (r.started) return send(res, 409, { error: 'room_started' });
      if (r.members.length >= ROOM_MAX) return send(res, 409, { error: 'room_full' });
      const used = new Set(r.members.map(x => x.pid));
      m = { key: me.key, name, pid: ['p1','p2','p3','p4'].find(p => !used.has(p)), hero: null, conns: 0 };
      r.members.push(m); saveRoom(r); emit(r, 'room', roomView(r));
    }
    return send(res, 200, { code: r.code, pid: m.pid, adv: r.adv });
  }
  if (!m) return send(res, 403, { error: 'not_in_room' });
  if (url.pathname === '/api/room/stream') {
    // one long response, a JSON object per line: the room, the state, the waiting actions, then live events
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    r.clients.add(res); m.conns++;
    res.write(JSON.stringify({ type: 'hello', data: { room: roomView(r), you: m.pid, state: r.state, queue: r.queue, chat: r.chat.slice(-30) } }) + '\n');
    emit(r, 'room', roomView(r));
    res.on('close', () => { r.clients.delete(res); m.conns = Math.max(0, m.conns - 1); emit(r, 'room', roomView(r)); });
    return;
  }
  if (url.pathname !== '/api/room/send') return send(res, 404, { error: 'not_found' });
  const isHost = hostOf(r) === m.pid, t = body.type;
  if (t === 'pick' && !r.started) {
    const hero = body.hero == null ? null : String(body.hero).slice(0, 20);
    if (hero && hero !== 'custom' && r.members.some(x => x !== m && x.hero === hero)) return send(res, 409, { error: 'hero_taken' });
    m.hero = hero; saveRoom(r); emit(r, 'room', roomView(r));
  } else if (t === 'timer' && isHost) {
    r.timer = Math.max(30, Math.min(120, +body.sec || 60)); saveRoom(r); emit(r, 'room', roomView(r));
  } else if ((t === 'start' || t === 'state') && isHost && body.state && typeof body.state === 'object') {
    if (t === 'start') r.started = true;
    r.state = body.state;
    const ack = new Set(Array.isArray(body.ack) ? body.ack : []);
    if (ack.size) r.queue = r.queue.filter(a => !ack.has(a.id));
    saveRoom(r); emit(r, 'state', { state: r.state, ack: [...ack], room: t === 'start' ? roomView(r) : undefined });
  } else if (t === 'act' && r.started) {
    const a = { id: r.nextId++, pid: m.pid, kind: body.kind === 'bag' ? 'bag' : 'act', text: String(body.text || '').slice(0, 240), item: body.item ? String(body.item).slice(0, 40) : undefined, label: body.label ? String(body.label).slice(0, 40) : undefined, at: Date.now() };
    if (!a.text && a.kind === 'act') return send(res, 400, { error: 'invalid_request' });
    if (r.queue.length > 40) return send(res, 429, { error: 'rate_limited' });
    r.queue.push(a); saveRoom(r); emit(r, 'act', a);
  } else if (t === 'chat') {
    const c = { pid: m.pid, name: m.name, text: String(body.text || '').slice(0, 300), at: Date.now() };
    if (!c.text.trim()) return send(res, 400, { error: 'invalid_request' });
    r.chat.push(c); if (r.chat.length > 60) r.chat.shift(); saveRoom(r); emit(r, 'chat', c);
  } else if (t === 'typing') {
    emit(r, 'typing', { pid: m.pid });
  } else return send(res, 400, { error: 'invalid_request' });
  return send(res, 200, { ok: true });
}
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);

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
      const body = await readBody(req);
      // with stream:true the answer goes out as lines of JSON: {"d":"text piece"} … then the final {"done":true,…}
      let started = false;
      const onText = body.stream ? t => {
        if (!started) { started = true; res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' }); }
        res.write(JSON.stringify({ d: t }) + '\n');
      } : null;
      const [code, obj] = await apiAi(req, body, onText);
      if (!started) return send(res, code, obj);
      return res.end(JSON.stringify(code === 200 ? { done: true, ...obj } : { ...obj, error: obj.error || 'upstream_error' }) + '\n');
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/room/')) return await roomApi(req, res, url);
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
        return send(res, 200, { day: db.day, callsToday: db.calls, spendToday: +db.spend.toFixed(3), spendTotal: +db.spendTotal.toFixed(3), starsUsd: +(db.payments.reduce((s, p) => s + (p.stars || 0), 0) * 0.013).toFixed(2), users: users.length, activeToday: users.filter(([, u]) => u.day === db.day && u.used).length, payments: db.payments.length, stars: db.payments.reduce((s, p) => s + (p.stars || 0), 0) });
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

server.listen(PORT, () => {
  console.log(`Grey Fang on :${PORT}`); setupBot();
  setInterval(() => remindLoop().catch(e => console.error('remind failed:', e.message)), 15 * 60000);
});
