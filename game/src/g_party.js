/* =====================  PLAYING TOGETHER: up to four heroes in one game  ===================== */
// One member's page (the host) runs the engine and talks to the master; everyone sends actions through the
// server room and gets the shared state back. S.heroes keeps every hero; useHero(pid) loads one into S,
// storeHero() writes it back, so the single-hero code (checks, items, hands, damage) works for each in turn.
const HERO_FIELDS = ['hero','name','player','stats','hp','maxHp','ac','gold','hitDice','secondWind','inspiration','inventory','torchLit','held','left','itemArt','conditions','exhaustion','down','saves','dead','dodging','overkill'];
const ROOM_KEY = 'grey-fang-room';
const ROOM = { code: null, me: null, host: null, view: null, queue: [], done: new Set(), acked: [], typing: {}, chat: [], online: false, unread: 0, seenJournal: 0 };
const partyOn = () => !!(ROOM.code && S && S.mode === 'party');
const amHost = () => partyOn() && ROOM.host === ROOM.me;
function useHero(pid){ const h = S.heroes && S.heroes[pid]; if (!h) return; for (const f of HERO_FIELDS) S[f] = h[f]; S.cur = pid; }
function storeHero(){ const h = S.heroes && S.heroes[S.cur]; if (!h) return; for (const f of HERO_FIELDS) h[f] = S[f]; }
const hname = pid => (S.heroes && S.heroes[pid] ? S.heroes[pid].name : '?');
const living = () => S.order.filter(p => !S.heroes[p].dead);
const standing = () => S.order.filter(p => !S.heroes[p].dead && !S.heroes[p].down);
function viewMine(){ if (S && S.heroes) useHero(S.heroes[ROOM.me] ? ROOM.me : S.order[0]); }

/* ---------- talking to the server room ---------- */
async function roomCall(path, body){
  let r, j = null;
  try { r = await fetch('/api/room/' + path, { method: 'POST', headers: window.Platform.headers(), body: JSON.stringify(body) }); } catch(e){ throw { code: 'upstream_error' }; }
  try { j = await r.json(); } catch(e){}
  if (!r.ok || !j || j.error) throw { code: (j && j.error) || 'upstream_error' };
  return j;
}
// in Telegram the name comes from the account; on the site we ask once
function playerName(){
  if (window.Platform.telegram) return '';
  let n = ''; try { n = localStorage.getItem('gf-name') || ''; } catch(e){}
  if (!n){ n = (prompt('Как тебя зовут? Это имя увидят друзья.') || '').trim().slice(0, 24) || 'Игрок'; try { localStorage.setItem('gf-name', n); } catch(e){} }
  return n;
}
const roomSend = (type, extra) => roomCall('send', { code: ROOM.code, type, ...extra });
async function roomListen(){
  while (ROOM.code){
    try {
      const r = await fetch('/api/room/stream', { method: 'POST', headers: window.Platform.headers(), body: JSON.stringify({ code: ROOM.code }) });
      if (r.status === 404 || r.status === 403){ roomLeave('Комната закрыта или ты в ней не состоишь.'); return; }
      ROOM.online = true; partyRender();
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;){
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n')) >= 0){ const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()){ try { onRoomEvent(JSON.parse(line)); } catch(e){ console.error(e); } } }
      }
    } catch(e){}
    ROOM.online = false; partyRender();
    await new Promise(r => setTimeout(r, 2000));
  }
}
function onRoomEvent(ev){
  const d = ev.data;
  if (ev.type === 'hello'){
    ROOM.me = d.you; ROOM.queue = (d.queue || []).map(a => ({ ...a, seen: Date.now() })); ROOM.chat = d.chat || [];
    setRoom(d.room);
    if (d.state) takeState(d.state, true); else showLobby();
    return;
  }
  if (ev.type === 'room'){ setRoom(d); return; }
  if (ev.type === 'state'){
    if (d.room) setRoom(d.room);
    const ack = new Set(d.ack || []); ROOM.queue = ROOM.queue.filter(a => !ack.has(a.id));
    if (!(amHost() && S.heroes)) takeState(d.state); else partyRender();
    return;
  }
  if (ev.type === 'act'){ if (!ROOM.queue.some(a => a.id === d.id)) ROOM.queue.push({ ...d, seen: Date.now() }); delete ROOM.typing[d.pid]; partyRender(); return; }
  if (ev.type === 'chat'){ ROOM.chat.push(d); if (ROOM.chat.length > 60) ROOM.chat.shift(); if (!document.querySelector('.table-panel.open') && d.pid !== ROOM.me) ROOM.unread++; renderTable(); return; }
  if (ev.type === 'typing'){ ROOM.typing[d.pid] = Date.now(); partyRender(); return; }
}
function setRoom(v){
  ROOM.view = v; const was = ROOM.host; ROOM.host = v.host;
  if (v.adv && v.adv !== ADV_ID){ try { localStorage.setItem(ADV_KEY, v.adv); } catch(e){} location.reload(); return; }
  if (document.querySelector('.lobby-back')) showLobby();
  if (ROOM.host === ROOM.me && was !== ROOM.me) hostWake();
  partyRender();
}
function takeState(st, first){
  const before = S && S.journal ? S.journal.length : 0;
  S = st; viewMine();
  document.querySelector('.lobby-back')?.remove(); document.querySelector('.hero-back')?.remove();
  renderAll(); partyRender();
  // the dice of the newest roll spin for everyone, not only on the host's screen
  if (!first && S.journal.length > before){ const last = [...S.journal].reverse().find(e => e.checks && e.checks.length); const idx = S.journal.lastIndexOf(last); if (last && idx >= before) showDice(last.checks[last.checks.length - 1]); }
}
async function roomEnter(code){
  ROOM.code = code;
  try { const j = await roomCall('join', { code, name: playerName() }); ROOM.me = j.pid; try { localStorage.setItem(ROOM_KEY, code); } catch(e){} }
  catch(e){
    ROOM.code = null; try { localStorage.removeItem(ROOM_KEY); } catch(_){}
    const why = { room_not_found: 'такой комнаты нет', room_full: 'в отряде уже четверо', room_started: 'отряд уже начал игру без тебя' }[e.code] || 'нет связи с сервером';
    S.journal.push({ who: 'sys', text: `Не получилось войти в отряд: ${why}.` }); renderAll(); if (freshStart) restart();
    return;
  }
  roomListen();
}
async function roomCreate(){
  try { const j = await roomCall('create', { adv: ADV_ID, name: playerName() }); ROOM.code = j.code; ROOM.me = j.pid; try { localStorage.setItem(ROOM_KEY, j.code); } catch(e){} showLobby(); roomListen(); }
  catch(e){ alert('Не получилось создать комнату. Проверь связь и попробуй ещё раз.'); }
}
function roomLeave(note){
  try { localStorage.removeItem(ROOM_KEY); } catch(e){}
  ROOM.code = null;
  if (note) alert(note);
  location.href = location.pathname + (location.search.replace(/[?&]room=[^&]*/, '').replace(/^&/, '?') || '');
}
const inviteLink = () => {
  const bot = window.Platform.config().bot;
  return window.Platform.telegram && bot ? `https://t.me/${bot}?start=room_${ROOM.code}` : `${location.origin}${location.pathname}?room=${ROOM.code}`;
};

/* ---------- lobby: invite, pick heroes, the host starts ---------- */
function showLobby(){
  let back = document.querySelector('.lobby-back');
  if (!back){ document.querySelector('.hero-back')?.remove(); back = document.createElement('div'); back.className = 'hero-back lobby-back'; document.body.append(back); }
  back.textContent = '';
  const box = document.createElement('div'); box.className = 'hero-pick lobby'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Отряд');
  const v = ROOM.view;
  const h = document.createElement('h2'); h.textContent = v ? `Отряд · комната ${v.code}` : 'Отряд'; box.append(h);
  if (!v){ const p = document.createElement('p'); p.textContent = 'Подключаюсь…'; box.append(p); back.append(box); return; }
  const adv = document.createElement('p'); adv.className = 'lobby-adv'; adv.textContent = `Приключение: ${ADVENTURES[v.adv] ? ADVENTURES[v.adv].title : v.adv}. До четырёх героев, конец у всех один.`; box.append(adv);
  const inv = document.createElement('div'); inv.className = 'lobby-inv';
  const share = document.createElement('button'); share.type = 'button'; share.className = 'btn'; share.textContent = '📨 Позвать друзей';
  share.addEventListener('click', () => window.Platform.share(inviteLink(), `Пойдём со мной в «${ADV.title}»? Комната ${ROOM.code}`));
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn'; copy.textContent = '📋 Скопировать ссылку';
  copy.addEventListener('click', () => { navigator.clipboard?.writeText(inviteLink()).then(() => { copy.textContent = '✓ Скопировано'; }).catch(() => prompt('Ссылка для друзей:', inviteLink())); });
  inv.append(share, copy); box.append(inv);
  const ul = document.createElement('ul'); ul.className = 'lobby-members';
  v.members.forEach(m => {
    const li = document.createElement('li'); const H = HEROES[m.hero];
    li.textContent = `${m.online ? '🟢' : '⚪'} ${m.name}${m.pid === ROOM.me ? ' (ты)' : ''} — ${m.hero ? (H ? H.name : 'свой герой') : 'выбирает героя…'}${m.pid === v.host ? ' · ведущий' : ''}`;
    ul.append(li);
  });
  box.append(ul);
  const hh = document.createElement('h2'); hh.textContent = 'Твой герой'; box.append(hh);
  const mine = v.members.find(m => m.pid === ROOM.me);
  [...Object.entries(HEROES), ['custom', { name: 'Свой герой', title: 'случайный воин', race: '', pitch: 'Характеристики выпадут на костях.' }]].forEach(([id, H]) => {
    const taken = id !== 'custom' && v.members.some(m => m.hero === id && m.pid !== ROOM.me);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hero-card' + (mine && mine.hero === id ? ' on' : ''); b.disabled = taken;
    const nm = document.createElement('b'); nm.textContent = H.name + (taken ? ' — занят' : mine && mine.hero === id ? ' ✓' : '');
    const tt = document.createElement('i'); tt.textContent = [H.race, H.title].filter(Boolean).join(', ');
    const pt = document.createElement('span'); pt.textContent = H.pitch;
    b.append(nm, tt, pt);
    b.addEventListener('click', () => roomSend('pick', { hero: id }).catch(e => alert(e.code === 'hero_taken' ? 'Этого героя уже взяли.' : 'Нет связи.')));
    box.append(b);
  });
  if (ROOM.me === v.host){
    const row = document.createElement('label'); row.className = 'lobby-timer'; row.textContent = 'Время на ход в бою: ';
    const sel = document.createElement('select'); [30, 60, 90, 120].forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s < 60 ? `${s} секунд` : s === 60 ? '1 минута' : s === 90 ? '1,5 минуты' : '2 минуты'; if (s === v.timer) o.selected = true; sel.append(o); });
    sel.addEventListener('change', () => roomSend('timer', { sec: +sel.value }).catch(() => {}));
    row.append(sel); box.append(row);
    const ready = v.members.every(m => m.hero);
    const go = document.createElement('button'); go.type = 'button'; go.className = 'btn lobby-go'; go.disabled = !ready;
    go.textContent = ready ? `⚔ Начать (${v.members.length} ${v.members.length === 1 ? 'герой' : v.members.length < 5 ? 'героя' : 'героев'})` : 'Ждём, пока все выберут героев';
    go.addEventListener('click', partyStart); box.append(go);
  } else { const p = document.createElement('p'); p.textContent = 'Ведущий начнёт игру, когда все выберут героев.'; box.append(p); }
  const out = document.createElement('button'); out.type = 'button'; out.className = 'btn hero-cancel'; out.textContent = 'Выйти из отряда';
  out.addEventListener('click', () => roomLeave()); box.append(out);
  back.append(box);
}
async function partyStart(){
  const v = ROOM.view; if (!v || !v.members.every(m => m.hero)) return;
  const base = newGame(null);
  Object.assign(base, { mode: 'party', heroes: {}, order: [], timer: v.timer, round: null, thinking: false });
  for (const m of v.members){
    const id = m.hero === 'custom' ? null : m.hero, g = newGame(id), h = {};
    for (const f of HERO_FIELDS) h[f] = g[f];
    Object.assign(h, { name: id ? HEROES[id].name.split(' ')[0] : m.name, player: m.name, down: false, saves: null, dead: false, dodging: false, overkill: 0 });
    base.heroes[m.pid] = h; base.order.push(m.pid);
  }
  base.journal.push({ who: 'sys', text: `Отряд: ${base.order.map(p => `${base.heroes[p].name} (${base.heroes[p].player})`).join(', ')}. Пишите, что делаете, — мастер подождёт, пока все скажут, и ответит всем сразу. В бою ходят по очереди.` });
  base.journal.push({ who: 'gm', text: INTRO });
  S = base; viewMine();
  try { await roomSend('start', { state: S }); } catch(e){ alert('Не получилось начать игру. Проверь связь.'); return; }
  document.querySelector('.lobby-back')?.remove(); renderAll();
}

/* ---------- the host keeps the shared state on the server ---------- */
let pushTimer = null;
function partySave(){ if (!amHost()) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushState, 120); }
function pushState(){
  if (!amHost()) return;
  const ack = ROOM.acked.splice(0);
  roomSend('state', { state: S, ack }).catch(() => { ROOM.acked.push(...ack); });
}
const doneAct = a => { if (a && a.id != null){ ROOM.done.add(a.id); ROOM.acked.push(a.id); } };

/* ---------- what a player does goes to the room ---------- */
function partySubmit(text){
  const me = S.heroes[ROOM.me];
  const note = t => { S.journal.push({ who: 'sys', text: t, local: true }); renderJournal(); };
  if (!me || me.dead) return note('Твой герой погиб. Можно смотреть и писать друзьям за столом (🍺).');
  if (me.down) return note('Ты без сознания. Товарищи могут тебя поднять: зелье, перевязка (Медицина).');
  if (S.over) return note('Игра окончена.');
  // whose turn it is in a fight is decided by the host: this screen may be a moment behind
  $('cmd').value = '';
  roomSend('act', { text }).catch(e => { note(ERR[e.code] || 'Не отправилось. Повтори.'); $('cmd').value = text; });
}
const partyBag = (item, label) => roomSend('act', { kind: 'bag', item, label }).catch(() => {});
let typingAt = 0;
document.getElementById('cmd').addEventListener('input', () => { if (partyOn() && Date.now() - typingAt > 2500){ typingAt = Date.now(); roomSend('typing').catch(() => {}); } });

/* ---------- the host's loop: when to ask the master ---------- */
let hostTimer = null;
function hostWake(){ if (!hostTimer) hostTimer = setInterval(() => { hostTick().catch(e => console.error(e)); }, 400); }
async function hostTick(){
  if (!amHost() || !S.heroes || busy || S.over || !sample) return;
  const q = ROOM.queue.filter(a => !ROOM.done.has(a.id));
  const bagAct = q.find(a => a.kind === 'bag'); if (bagAct) return hostBag(bagAct);
  if (S.round){
    const cur = S.round.order[S.round.i], h = S.heroes[cur];
    const early = q.filter(a => a.pid !== cur);
    if (early.length){ early.forEach(a => { doneAct(a); S.journal.push({ who: 'sys', text: `${hname(a.pid)}, сейчас ход ${hname(cur)} — твоё действие не принято.` }); }); save(); renderAll(); }
    if (!h || h.dead || h.down){ const lines = []; if (h && h.down) deathSave(cur, lines); nextTurn(lines); if (lines.length) S.journal.push({ who: 'combat', lines }); viewMine(); save(); renderAll(); return; }
    const mine = q.find(a => a.pid === cur);
    if (mine) return runTurn([mine]);
    if (Date.now() > S.round.deadline) return runTurn([{ id: null, pid: cur, text: 'уклоняюсь (действие «Уклонение»)', auto: true }]);
    return;
  }
  const acts = q.filter(a => a.kind === 'act');
  const lost = acts.filter(a => !S.heroes[a.pid] || S.heroes[a.pid].dead || S.heroes[a.pid].down);
  if (lost.length){ lost.forEach(doneAct); save(); }
  const live = acts.filter(a => !lost.includes(a)); if (!live.length) return;
  // a word to a character or a question to the master goes alone and at once
  const one = live.find(a => { useHero(a.pid); return ASK_RE.test(a.text) || addressed(a.text); }); viewMine();
  if (one) return runSolo(one);
  // otherwise wait until everyone has spoken, or 6 seconds of quiet, or 15 seconds in all
  const now = Date.now(), first = Math.min(...live.map(a => a.seen)), last = Math.max(...live.map(a => a.seen), ...Object.entries(ROOM.typing).filter(([p]) => S.heroes[p]).map(([, t]) => t));
  const everyone = standing().every(p => live.some(a => a.pid === p));
  if (everyone || now - last > 6000 || now - first > 15000) return runTurn(live.slice(0, 8));
}
function hostBag(a){
  doneAct(a); useHero(a.pid);
  const list = bagActions(a.item, (said, told, change) => { change(); S.journal.push({ who: 'sys', text: `${S.name}: ${told}` }); S.history.push({ p: `${S.name}: ${said}`, n: told }); if (S.history.length > 24) S.history.shift(); });
  const hit = list.find(([t]) => t === a.label); if (hit) hit[1]();
  storeHero(); viewMine(); save(); renderAll();
}
async function runSolo(a){
  busy = true; doneAct(a); S.thinking = true;
  useHero(a.pid); S.journal.push({ who: 'you', by: a.pid, text: a.text }); storeHero(); viewMine(); save(); renderAll();
  const tier = { modelTier: $('tier').value, cache: false };
  try {
    window.Platform.newTurn(); useHero(a.pid);
    if (ASK_RE.test(a.text)){
      const q = a.text.replace(ASK_RE, '');
      const res = await sample.json(askPrompt(q, rollBag()), tier);
      S.journal.push({ who: 'ooc', text: cleanStr(res && res.answer, 1200) || 'Мастер задумался и ничего не ответил.' });
      S.history.push({ p: `${S.name} спрашивает мастера: ${q}`, n: 'Мастер: ' + cleanStr(res && res.answer, 400) }); if (S.history.length > 24) S.history.shift();
    } else {
      const who = addressed(a.text);
      const res = await sample.json(charPrompt(who, `${S.name}: ${a.text}`), tier);
      if (!res || typeof res !== 'object') throw { code: 'invalid_json' };
      applyTalk(who, res, a.text);  // works on this hero (S still holds a.pid)
    }
    storeHero();
  } catch(e){ S.journal.push({ who: 'sys', text: ERR[e && e.code] || 'Мастер не ответил. Повторите.' }); if (e && (e.code === 'limit_reached' || e.code === 'busy_today') && window.Platform) window.Platform.paywall(e.code); }
  finally { S.thinking = false; busy = false; viewMine(); save(); renderAll(); }
}
async function runTurn(acts){
  busy = true; acts.forEach(doneAct); S.thinking = true;
  const inRound = !!S.round;
  acts.forEach(a => S.journal.push(a.auto ? { who: 'sys', text: `${hname(a.pid)} не успевает решить и уходит в оборону.` } : { who: 'you', by: a.pid, text: a.text }));
  save(); renderAll();
  const tier = { modelTier: $('tier').value, cache: false };
  try {
    window.Platform.newTurn();
    const bags = Object.fromEntries(acts.map(a => [a.pid, rollBag()]));
    let res = await sample.json(partyPrompt(acts, bags), tier);
    if (!res || typeof res !== 'object') throw { code: 'invalid_json' };
    const cks = {}; let wrong = false;
    for (const a of acts){
      const r = res.heroes && res.heroes[a.pid];
      if (r && r.check && typeof r.check === 'object' && r.check.dc != null){
        useHero(a.pid); const ins = r.inspiration === 'use' && S.inspiration;
        const ck = resolveCheck(r.check, bags[a.pid], ins); ck.insp = ins; ck.who = a.pid; cks[a.pid] = ck;
        if (typeof r.check_success === 'boolean' && r.check_success !== ck.success) wrong = true;
      }
    }
    viewMine();
    if (wrong){ const res2 = await sample.json(partyPrompt(acts, bags, cks), tier); if (res2 && typeof res2 === 'object') res = res2; }
    applyParty(res, acts, bags, cks);
    const lines = [];
    if (!S.over && inRound && S.round) nextTurn(lines);
    if (!S.over && !S.round) living().filter(p => S.heroes[p].down && !(S.heroes[p].saves && S.heroes[p].saves.stable)).forEach(p => deathSave(p, lines));
    if (!S.over && !standing().length) S.over = 'death';
    if (lines.length) S.journal.push({ who: 'combat', lines });
    if (S.over === 'death') S.journal.push({ who: 'sys', text: 'Весь отряд пал. Приключение окончено.' });
  } catch(e){
    S.journal.push({ who: 'sys', text: ERR[e && e.code] || 'Мастер не ответил. Повторите ход.' });
    if (e && (e.code === 'limit_reached' || e.code === 'busy_today') && window.Platform) window.Platform.paywall(e.code);
    if (!(e && e.code)) console.error(e);
  } finally { S.thinking = false; busy = false; viewMine(); save(); renderAll(); }
}

/* ---------- the master sees the whole party ---------- */
const PARTY_RULES = `ИГРА КОМПАНИЕЙ. Героев несколько (до четырёх), за каждым — свой живой игрок. Все герои в одном месте и ходят вместе.
- Тебе приходят ДЕЙСТВИЯ ИГРОКОВ: одно или несколько, сделанных в одно время. Опиши всё ОДНОЙ сценой в "narration": называй героев по именам, у каждого действия — заметный итог. Не решай за героя того, что его игрок не делал, и не пиши за героев реплик.
- Всё, что случилось с одним героем, пиши в "heroes" под его id: {"p1":{"check":null,"check_success":null,"hp_delta":0,"gold_delta":0,"add_items":[],"remove_items":[],"held":"keep","held_left":"keep","torch":null,"conditions_add":[],"conditions_remove":[],"exhaustion_delta":0,"inspiration":null,"second_wind":false,"rest":null,"stabilized":false}}. Указывай только тех, с кем что-то случилось. Кости у каждого героя свои — в его мешке (A, B, d6…). Проверку делает тот, кто действует; если двое делают одно дело, проверку делает один, а помощь второго даёт преимущество.
- Общее — на верхнем уровне: "move" (только если идут все; кто-то против — остаётесь), "enemies", "party", "dialogue", "remember", "night_passes", "ending", "effect".
- Герой с hp 0 лежит без сознания и ничего не делает. Его поднимает лечение от товарища (у лежащего "hp_delta" > 0) или успешная проверка Медицины товарища (СЛ 10) — тогда у лежащего "stabilized": true.
- Добыча достаётся тому, кто её нашёл или взял; делить — дело игроков.
- В бою ходят по очереди: тебе приходит действие одного героя. Удары врагов считает игра.
ОТВЕТ КОМПАНИИ (строго JSON): {"narration":"...","heroes":{},"move":null,"enemies":[],"party":[],"dialogue":[],"remember":[],"night_passes":false,"ending":null,"effect":null}`;
function partyPrompt(acts, bags, cks){
  const pl = here();
  const team = Object.fromEntries(S.order.map(pid => {
    useHero(pid); const H = heroOf();
    return [pid, { имя: S.name, игрок: S.player, кто: H ? `${H.race}, ${H.title}. ${H.perk}` : 'свой герой, воин', hp: `${S.hp}/${S.maxHp}`, кб: S.ac,
      ...(S.dead ? { погиб: true } : S.down ? { без_сознания: true } : {}),
      бонусы: SKILLS.map(([n]) => `${n} ${fmtMod(skillBonus(n))}`).join(', ') + `; атака ${fmtMod(attackBonus())}; спасброски ` + STATS.map(([k]) => `${k} ${fmtMod(saveBonus(k))}`).join(' '),
      инвентарь: S.inventory, руки: [S.held, S.left].filter(Boolean), факел_горит: torchLit(), золото: S.gold, ...(S.conditions.length ? { состояния: S.conditions } : {}),
      ...(ADV.heroHooks && S.hero && ADV.heroHooks[S.hero] ? { зацепка: ADV.heroHooks[S.hero] } : {}) }];
  }));
  viewMine();
  const st = {
    место: { id: S.place, ...placeInfo(), соседние: neighbours(S.place) },
    существа_здесь: pl.enemies.map(e => ({ ...e, кб: ENEMY_STATS[e.type]?.ac, атака: '+' + (ENEMY_STATS[e.type]?.atk ?? 0), урон: ENEMY_STATS[e.type]?.dmg })),
    отряд: team,
    на_картинке: [...pl.enemies.filter(x => !x.hidden && !['dead','fled'].includes(x.state)).map(x => `${x.name} (${x.state})`),
      ...Object.entries(COMPANIONS).filter(([id, c]) => c.place === S.place && S.party[id].visible && S.party[id].alive).map(([id, c]) => `${c.name} — ${S.party[id].met ? 'знаком' : 'ещё не знаком: ' + c.firstScene}`)],
    персонажи: Object.fromEntries(Object.entries(COMPANIONS).map(([id, c]) => { const p = S.party[id]; return [id, [!p.alive ? 'мёртв' : p.visible ? 'замечен' : 'не встречен', p.met ? 'знаком' : '', p.approval ? `отношение ${fmtMod(p.approval)}` : ''].filter(Boolean).join(', ')]; })),
    хроника_мира: S.chronicle, ход: S.turn, ночь: S.night || 0, идёт_бой: S.combat,
    ...(S.round ? { бой: { раунд: S.round.n, очередь: S.round.order.map(hname) } } : {}),
  };
  const hist = S.history.slice(-5).map(h => `Игроки: ${h.p}\nМастер: ${h.n}${h.d ? '\nРеплики: ' + h.d : ''}`).join('\n\n') || '(начало игры) ' + INTRO;
  const results = cks && Object.keys(cks).length ? `\n\nИТОГИ ПРОВЕРОК (посчитаны игрой, это окончательно): ${Object.values(cks).map(c => `${hname(c.who)} — ${checkLine(c)}`).join('; ')}. Опиши ход ПОЛНОСТЬЮ по этим итогам.` : '';
  return `${RULES}\n\n${PARTY_RULES}\n\nСОСТОЯНИЕ (правда, его ведёт игра):\n${JSON.stringify(st)}\n\nПОСЛЕДНИЕ ХОДЫ:\n${hist}\n\nМЕШКИ КУБИКОВ (у каждого героя свой): ${JSON.stringify(bags)}${results}\n\nДЕЙСТВИЯ ИГРОКОВ:\n${acts.map(a => `[${a.pid}] ${hname(a.pid)}: «${a.text}»`).join('\n')}`;
}
function applyParty(res, acts, bags, cks){
  const narration = cleanStr(res.narration, 1600), tags = [], lines = [];
  const texts = acts.map(a => a.text.toLowerCase()).join(' | ');
  const R = res.heroes && typeof res.heroes === 'object' ? res.heroes : {};
  const pids = [...new Set([...acts.map(a => a.pid), ...Object.keys(R)])].filter(p => S.heroes[p] && !S.heroes[p].dead);
  const checks = [];
  for (const pid of pids){
    useHero(pid);
    const r0 = R[pid] && typeof R[pid] === 'object' ? R[pid] : {}, a = acts.find(x => x.pid === pid), my = [], hp0 = S.hp;
    // a fallen hero only takes healing and first aid
    const r = S.down ? { hp_delta: Math.max(0, +r0.hp_delta || 0), add_items: [], remove_items: r0.remove_items } : r0;
    const ck = applyHero(r, a ? a.text.toLowerCase() : '', narration, bags[pid] || rollBag(), cks[pid] || null, my);
    if (ck){ ck.who = pid; checks.push(ck); }
    S.dodging = !!(a && /уклоня|уклонени/.test(a.text.toLowerCase()) && !(ck && ck.kind === 'attack'));
    if (S.down && S.hp > 0){ S.down = false; S.saves = null; my.push(['приходит в себя', 'good']); }
    else if (S.down && r0.stabilized === true && !(S.saves && S.saves.stable)){ S.saves = { ok: 3, bad: 0, stable: true }; my.push(['кровь остановлена', 'good']); }
    if (S.hp !== hp0) my.push([`${S.hp > hp0 ? '+' : ''}${S.hp - hp0} здоровья`, S.hp > hp0 ? 'good' : '']);
    if (ck && ck.kind === 'attack') combatRound(ck, bags[pid], lines, { noFoes: true });
    if (S.hp <= 0 && !S.down && !S.dead){ S.overkill = 0; knockDown(lines); }
    storeHero();
    my.forEach(([t, k]) => tags.push([`${S.name}: ${t}`, k]));
  }
  // the world sees everyone's things at once (gates and endings ask "does anyone carry the comb?")
  viewMine(); const mineInv = S.inventory; S.inventory = S.order.flatMap(p => S.heroes[p].inventory);
  const fresh = applyWorld(res, texts, checks, tags);
  applyClock(res, tags);
  S.inventory = mineInv; storeHero();
  S.combat = activeFoes().length > 0;
  if (S.combat && !S.round) startRound(lines);
  if (!S.combat && S.round) endCombat(lines);
  const whoId = w => COMPANIONS[w] ? w : Object.keys(COMPANIONS).find(id => w && (NAME_RE[id].test(String(w)) || String(w).toLowerCase() === COMPANIONS[id].name.toLowerCase()));
  const dialogue = Array.isArray(res.dialogue) ? res.dialogue.map(x => x && { who: whoId(x.who || x.id || x.name), text: x.text || x.line }).filter(x => x && x.who && x.text && S.party[x.who].alive && COMPANIONS[x.who].place === S.place && S.party[x.who].visible).slice(0, 1).map(x => ({ id: x.who, text: cleanStr(x.text, 300) })) : [];
  S.turn++; S.turnsHere++;
  S.history.push({ p: acts.map(a => `${hname(a.pid)}: ${a.text}`).join(' | '), n: narration + (lines.length ? ' [Бой: ' + lines.join(' ') + ']' : ''), d: dialogue.map(x => `${COMPANIONS[x.id].name}: ${x.text}`).join(' | ') }); if (S.history.length > 24) S.history.shift();
  if (narration || checks.length) S.journal.push({ who: 'gm', text: narration, checks: checks.map(c => ({ ...c, line: `${hname(c.who)} — ${checkLine(c)}` })), tags });
  if (lines.length) S.journal.push({ who: 'combat', lines });
  dialogue.forEach(x => S.journal.push({ who: 'npc', id: x.id, text: x.text })); if (dialogue.length) SFX.talk();
  if (S.over === 'win' || S.over === 'lose'){ const E = ADV.endings && ADV.endings[S.ending]; if (E) S.journal.push({ who: 'sys', text: `Концовка для всего отряда: «${E.title}». ${E.text} Ходов: ${S.turn}.` }); S.over === 'win' ? SFX.win() : SFX.death(); }
  if (S.journal.length > 200) S.journal.splice(0, S.journal.length - 200);
  logTurn({ mode: 'party', player: acts.map(a => `${a.pid}: ${a.text}`).join(' | '), raw: JSON.stringify(res).slice(0, 8000), combat: lines.join(' | ') });
}

/* ---------- falling, dying and getting up ---------- */
function knockDown(lines){
  if ((S.overkill || 0) >= S.maxHp){ S.hp = 0; S.dead = true; S.down = false; lines.push(`${S.name} погибает на месте.`); return; }
  S.hp = 0; S.down = true; S.saves = { ok: 0, bad: 0 }; lines.push(`${S.name} падает без сознания. Поднимите его: лечение или перевязка (Медицина).`);
}
function deathSave(pid, lines){
  useHero(pid);
  if (!S.down || (S.saves && S.saves.stable)){ storeHero(); return; }
  S.saves ||= { ok: 0, bad: 0 };
  const r = d(20);
  if (r === 20){ S.hp = 1; S.down = false; S.saves = null; lines.push(`${S.name}: спасбросок от смерти — 20! Встаёт с 1 здоровьем.`); storeHero(); return; }
  if (r === 1) S.saves.bad += 2; else if (r >= 10) S.saves.ok++; else S.saves.bad++;
  if (S.saves.bad >= 3){ S.dead = true; S.down = false; lines.push(`${S.name}: спасбросок от смерти ${r}. ${S.name} умирает.`); }
  else if (S.saves.ok >= 3){ S.saves.stable = true; lines.push(`${S.name}: спасбросок от смерти ${r}. Кровь остановилась, но ${S.name} без сознания.`); }
  else lines.push(`${S.name}: спасбросок от смерти ${r} — ${r >= 10 ? 'успех' : 'провал'} (успехов ${S.saves.ok}, провалов ${S.saves.bad}).`);
  storeHero();
}

/* ---------- combat: heroes in initiative order with a timer, the foes after everyone ---------- */
function startRound(lines){
  const ini = standing().map(p => { useHero(p); return [p, d(20) + mod(S.stats['ЛОВ'])]; }).sort((a, b) => b[1] - a[1]);
  viewMine();
  S.round = { n: 1, order: ini.map(x => x[0]), i: 0, deadline: Date.now() + (S.timer || 60) * 1000 };
  lines.push(`Бой! Порядок ходов: ${ini.map(([p, v]) => `${hname(p)} (${v})`).join(', ')}, враги — после всех. Ходит ${hname(S.round.order[0])}.`);
}
function nextTurn(lines){
  if (!S.round) return;
  if (!activeFoes().length){ endCombat(lines); return; }
  S.round.i++;
  while (S.round.i < S.round.order.length && S.heroes[S.round.order[S.round.i]].dead) S.round.i++;
  if (S.round.i >= S.round.order.length){
    foesAct(lines);
    if (S.over) return;
    if (!activeFoes().length){ endCombat(lines); return; }
    S.round.n++; S.round.order = S.round.order.filter(p => !S.heroes[p].dead); S.round.i = 0;
    S.order.forEach(p => { S.heroes[p].dodging = false; });
    if (!S.round.order.length){ S.over = 'death'; return; }
  }
  S.round.deadline = Date.now() + (S.timer || 60) * 1000;
  lines.push(`Ходит ${hname(S.round.order[S.round.i])}.`);
}
function endCombat(lines){
  S.round = null; S.combat = false; lines.push('Бой окончен.');
  for (const p of S.order){ const h = S.heroes[p]; if (h.down && h.saves && h.saves.stable){ h.down = false; h.hp = 1; h.saves = null; lines.push(`${h.name} приходит в себя с 1 здоровьем.`); } }
}
function foesAct(lines){
  for (const e of activeFoes().slice(0, 4)){
    const st = ENEMY_STATS[e.type]; if (!st) continue;
    const ups = standing(), downs = living().filter(p => S.heroes[p].down);
    const tgt = ups.length ? ups[(Math.random() * ups.length) | 0] : downs[0]; if (!tgt) break;
    useHero(tgt);
    let adv = hasCond('prone') || hasCond('blinded') || S.down, dis = S.dodging && !S.down;
    if (adv && dis) adv = dis = false;
    const r1 = d(20), r2 = d(20), r = adv ? Math.max(r1, r2) : dis ? Math.min(r1, r2) : r1;
    const hit = r === 20 || (r !== 1 && r + st.atk >= S.ac);
    if (!hit){ lines.push(`${e.name} → ${S.name}${dis ? ' (уклоняется)' : ''}: ${r}+${st.atk} против КБ ${S.ac} — мимо.`); storeHero(); continue; }
    if (S.down){
      S.saves.bad += r === 20 ? 2 : 1; S.saves.stable = false;
      lines.push(`${e.name} → ${S.name} (лежит без сознания): провал спасброска от смерти.`);
      if (S.saves.bad >= 3){ S.dead = true; S.down = false; lines.push(`${S.name} умирает.`); }
      storeHero(); continue;
    }
    const dmg = rollDmg(st.dmg, r === 20), before = S.hp;
    S.hp = Math.max(0, S.hp - dmg); S.overkill = S.hp <= 0 ? dmg - before : 0;
    lines.push(`${e.name} → ${S.name}: ${r}+${st.atk} против КБ ${S.ac} — попадание, ${dmg} урона.`); addEffect('blood'); SFX.hurt();
    if (S.hp <= 0) knockDown(lines);
    storeHero();
  }
  viewMine();
  if (!standing().length) S.over = 'death';
}

/* ---------- what everyone sees: whose turn, who is typing, what waits for the master ---------- */
const pbar = document.createElement('div'); pbar.className = 'pbar'; pbar.hidden = true;
$('form').before(pbar);
setInterval(() => { if (partyOn()) partyRender(); }, 1000);
function partyRender(){
  renderTable();
  if (!partyOn()){ pbar.hidden = true; document.documentElement.classList.remove('in-party'); return; }
  document.documentElement.classList.add('in-party');
  pbar.hidden = false;
  const me = S.heroes[ROOM.me], parts = [];
  if (!ROOM.online) parts.push('⚠ нет связи, переподключаюсь…');
  if (S.over) parts.push('Игра окончена.');
  else if (me && me.dead) parts.push('Твой герой погиб — смотри и пиши за столом 🍺');
  else if (me && me.down) parts.push('Ты без сознания — ждёшь помощи товарищей');
  if (!S.over && S.round){
    const cur = S.round.order[S.round.i], left = Math.max(0, Math.ceil((S.round.deadline - Date.now()) / 1000));
    parts.push(cur === ROOM.me ? `⚔ Твой ход! ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `⚔ Ход: ${hname(cur)} · ${left} с`);
  }
  if (S.thinking) parts.push('Мастер думает…');
  const typing = Object.entries(ROOM.typing).filter(([p, t]) => p !== ROOM.me && Date.now() - t < 4000 && S.heroes[p]).map(([p]) => hname(p));
  if (typing.length) parts.push(`${typing.join(', ')} ${typing.length > 1 ? 'пишут' : 'пишет'}…`);
  const waiting = ROOM.queue.filter(a => a.kind === 'act' && !ROOM.done.has(a.id));
  if (waiting.length && !S.thinking) parts.push(`ждут мастера: ${[...new Set(waiting.map(a => hname(a.pid)))].join(', ')}`);
  if (!S.over && !S.round && !S.thinking && !waiting.length && !typing.length && me && !me.dead && !me.down) parts.push('Пишите, что делаете — мастер ответит всем сразу');
  pbar.textContent = parts.join(' · ');
  pbar.classList.toggle('mine', !!(S.round && S.round.order[S.round.i] === ROOM.me));
  const host = ROOM.view && ROOM.view.members.find(m => m.pid === ROOM.host);
  pbar.title = `Комната ${ROOM.code}${host ? ` · ведущий: ${host.name}` : ''}`;
  renderPending();
}
function renderPending(){
  const j = $('journal'); j.querySelectorAll('.entry.pending').forEach(e => e.remove());
  ROOM.queue.filter(a => a.kind === 'act' && !ROOM.done.has(a.id)).forEach(a => { const d = document.createElement('div'); d.className = 'entry you pending'; d.textContent = `${hname(a.pid)}: ${a.text} ⏳`; j.append(d); });
}
const baseRenderJournal = renderJournal;
renderJournal = () => { baseRenderJournal(); if (partyOn()) renderPending(); };

/* ---------- «Стол»: the players' own chat, the master does not read it ---------- */
const tableBtn = document.createElement('button'); tableBtn.type = 'button'; tableBtn.className = 'btn table-btn'; tableBtn.textContent = '🍺'; tableBtn.title = 'Стол: чат игроков, мастер не слышит'; tableBtn.setAttribute('aria-label', 'Стол'); tableBtn.hidden = true;
$('form').prepend(tableBtn);
const tablePanel = document.createElement('div'); tablePanel.className = 'table-panel';
tablePanel.innerHTML = '<div class="table-head"><b>Стол</b><span>игроки болтают, мастер не слышит</span><button type="button" class="bag-x" aria-label="Закрыть">✕</button></div><div class="table-log"></div><form class="table-form"><input maxlength="300" placeholder="Сказать друзьям…" aria-label="Сообщение за столом"><button class="btn" type="submit">➤</button></form>';
document.body.append(tablePanel);
tableBtn.addEventListener('click', () => { tablePanel.classList.toggle('open'); ROOM.unread = 0; renderTable(); if (tablePanel.classList.contains('open')) tablePanel.querySelector('input').focus(); });
tablePanel.querySelector('.bag-x').addEventListener('click', () => tablePanel.classList.remove('open'));
tablePanel.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const inp = tablePanel.querySelector('input'), t = inp.value.trim(); if (!t) return; inp.value = ''; roomSend('chat', { text: t }).catch(() => { inp.value = t; }); });
function renderTable(){
  tableBtn.hidden = !ROOM.code;
  tableBtn.textContent = ROOM.unread ? `🍺${ROOM.unread}` : '🍺';
  const log = tablePanel.querySelector('.table-log');
  if (!tablePanel.classList.contains('open') && log.childElementCount === ROOM.chat.length && log.childElementCount) return;
  log.textContent = '';
  ROOM.chat.forEach(c => { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = (S.heroes && S.heroes[c.pid] ? `${S.heroes[c.pid].name} (${c.name})` : c.name) + ': '; d.append(b, document.createTextNode(c.text)); log.append(d); });
  log.scrollTop = log.scrollHeight;
}

/* ---------- way in: «Играть вместе», an invite link, or the room we were in ---------- */
{
  const fromUrl = new URLSearchParams(location.search).get('room');
  const fromTg = (/^room_([A-Z0-9]{5})$/i.exec((window.Platform && window.Platform.startParam) || '') || [])[1];
  let kept = null; try { kept = localStorage.getItem(ROOM_KEY); } catch(e){}
  const code = String(fromUrl || fromTg || kept || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (window.Platform && code.length === 5){ ROOM.code = code; window.Platform.ready.then(() => roomEnter(code)); }
}
// for tests and support: read-only access to the game state from the browser console
window.__gf = { state: () => S, room: ROOM };
