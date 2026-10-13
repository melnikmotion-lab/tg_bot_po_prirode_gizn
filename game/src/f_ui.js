
/* ---------- new interface: hero bar with hands and bag, action buttons, dice ---------- */
const ICON_RULES = [[/меч/, 'longsword'], [/факел/, 'torch'], [/вер[её]вк/, 'rope'], [/хлеб|краюх|еда/, 'bread'], [/огнив/, 'flint'], [/свист/, 'whistle'],
  [/ключ/, 'key'], [/зель|эликсир|настой/, 'potion'], [/щит/, 'shield'], [/кинжал|нож/, 'dagger'], [/золот|монет/, 'gold'], [/свит|карт[аы]/, 'scroll'],
  [/фонар/, 'lantern'], [/меш|сумк|кошел|кисет/, 'bag'], [/гриб|свечк/, 'mushroom'], [/кост|череп|зуб/, 'bone']];
const iconFor = name => {
  const n = String(name || '').toLowerCase(), hit = ICON_RULES.find(([re]) => re.test(n));
  if (hit) return ART.icon[hit[1]];
  const rows = (S.itemArt && S.itemArt[name]) || null;
  if (rows){ try { return spriteCanvas(rows).toDataURL(); } catch(e){} }
  return null;
};
const iconEl = (name, cls) => {
  const src = iconFor(name), d = document.createElement('span'); d.className = cls || 'ico';
  if (src){ const im = document.createElement('img'); im.src = src; im.alt = ''; d.append(im); }
  else d.textContent = String(name || '?').slice(0, 1).toUpperCase();
  return d;
};
const ask = (text, send) => {
  const c = $('cmd'); c.value = text;
  if (send){ act(text); return; }
  c.focus(); const p = text.indexOf('»'); c.setSelectionRange(p >= 0 ? p : text.length, p >= 0 ? p : text.length);
};

const ITEM_DESC = [[/меч/, 'Длинный меч: хорошая сталь, рукоять обмотана кожей. Урон 1d8.'], [/кольчуг/, 'Кольчуга: тяжёлая, звенит при ходьбе, но держит удар. Класс брони 16.'],
  [/факел/, 'Факел: тряпка в смоле на палке. Горит около часа.'], [/огнив/, 'Огниво и кремень: высечь искру и зажечь факел.'], [/вер[её]вк/, 'Пеньковая верёвка, метров пятнадцать. Выдержит человека в кольчуге.'],
  [/краюх|хлеб/, 'Краюха чёрного хлеба. Подсохла, но съедобна.'], [/свист/, 'Медный свисток стражника. Слышно далеко.'], [/карт/, 'Крапленая колода: на рубашке еле заметные метки.'],
  [/пиво|фляг/, 'Фляга крепкого дварфийского пива.'], [/ключ/, 'Тяжёлый железный ключ.'], [/зель/, 'Зелье в стеклянном пузырьке.'], [/гриб/, 'Светящийся гриб. Тина знает, на что он годится.']];
const HOLDABLE = /меч|кинжал|нож|топор|дубин|булав|копь|посох|лук|праща|щит|факел|фонар|кирк|молот|палк|камень/i, LEFT_HAND = /щит|факел|фонар/i, WORN = /кольчуг|доспех|плащ/i;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const describe = name => { const n = String(name).toLowerCase(), d = ITEM_DESC.find(([re]) => re.test(n)); return d ? d[1] : `${name[0].toUpperCase()}${name.slice(1)}: ничего особенного на вид.`; };

function renderHeroBar(){
  const H = heroOf(), face = $('hb-face');
  if (!face) return;
  const pic = H && ART.portrait[S.hero];
  face.textContent = '';
  if (pic){ const im = document.createElement('img'); im.src = pic; im.alt = H.name; face.append(im); }
  else face.textContent = (H ? H.name : 'В')[0];
  $('hb-name').textContent = H ? H.name.split(' ')[0] : 'Воин';
  $('hb-sub').textContent = 'Лист героя ›';
  $('hb-hp').style.width = `${Math.round(100*S.hp/S.maxHp)}%`;
  $('hb-hpt').textContent = `${S.hp}/${S.maxHp}`;
  const slot = (el, item, side) => {
    el.textContent = '';
    if (item && S.inventory.includes(item)) el.append(iconEl(item));
    el.title = item ? `${side}: ${item}` : `${side}: пусто`;
    el.setAttribute('aria-label', el.title);
  };
  slot($('slot-r'), S.held, 'правая рука'); slot($('slot-l'), S.left, 'левая рука');
  $('bagn').textContent = S.inventory.length;
  const bb = $('bagbtn'); if (!bb.querySelector('img')){ const im = document.createElement('img'); im.src = ART.icon.bag; im.alt = ''; bb.prepend(im); }
}

function openBag(){
  if (document.querySelector('.bag-back')) return;
  const back = document.createElement('div'); back.className = 'bag-back';
  const box = document.createElement('div'); box.className = 'bag'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Сумка');
  const head = document.createElement('div'); head.className = 'bag-head';
  const h = document.createElement('b'); h.textContent = 'Сумка';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'bag-x'; x.textContent = '✕'; x.setAttribute('aria-label', 'Закрыть');
  head.append(h, x);
  const grid = document.createElement('div'); grid.className = 'bag-grid';
  const info = document.createElement('div'); info.className = 'bag-info';
  const acts = document.createElement('div'); acts.className = 'bag-acts';
  const close = () => back.remove();
  let sel = null;
  const pick = (item, cell) => {
    sel = item; grid.querySelectorAll('.cell').forEach(c => c.classList.toggle('sel', c === cell));
    const inHand = item === S.held ? ' (в правой руке)' : item === S.left ? ' (в левой руке)' : '';
    info.textContent = item + inHand;
    acts.textContent = '';
    const side = S.held === item ? 'held' : S.left === item ? 'left' : null;
    const list = [];
    if (side) list.push(['📥 Убрать в сумку', () => invAct(`убираю ${item} в сумку`, `${cap(item)} — в сумке.`, () => setHand(side, null))]);
    else if (HOLDABLE.test(item)) list.push(['✋ Взять в руку', () => invAct(`беру в руку ${item}`, `Ты берёшь в руку: ${item}.`, () => setHand(LEFT_HAND.test(item) ? 'left' : 'held', item))]);
    if (/огнив/i.test(item) && hasItem(/факел/i) && !torchLit()) list.push(['🔥 Зажечь факел', () => invAct('зажигаю факел огнивом', 'Искра, другая — и факел занимается огнём.', () => { setHand('left', S.inventory.find(i => /факел/i.test(i))); S.torchLit = true; SFX.torch(); })]);
    if (/факел/i.test(item) && torchLit()) list.push(['💨 Погасить', () => invAct('гашу факел', 'Ты гасишь факел. Темнота подступает ближе.', () => { S.torchLit = false; })]);
    list.push(['⚙ Использовать…', () => { close(); ask(`использую ${item} `); }]);
    list.push(['👁 Осмотреть', () => { info.textContent = describe(item) + inHand; }]);
    if (!WORN.test(item)) list.push(['🗑 Выбросить', () => invAct(`выбрасываю ${item}`, `Ты бросаешь на землю: ${item}.`, () => {
      if (S.held === item) S.held = null; if (S.left === item){ S.left = null; if (/факел/i.test(item)) S.torchLit = false; }
      S.inventory.splice(S.inventory.indexOf(item), 1); (here().ground ||= []).push(item); })]);
    list.forEach(([t, fn]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.addEventListener('click', fn); acts.append(b); });
  };
  // Things done with your own bag are instant and free: no master, no dice. The master still learns about them from the history.
  const invAct = (said, told, change) => {
    if (busy || S.over) return;
    change(); S.journal.push({ who: 'sys', text: told });
    S.history.push({ p: said, n: told }); if (S.history.length > 24) S.history.shift();
    save(); renderAll(); close();
  };
  const n = Math.max(10, Math.ceil(S.inventory.length/5)*5);
  for (let i = 0; i < n; i++){
    const item = S.inventory[i], cell = document.createElement('button'); cell.type = 'button'; cell.className = 'cell';
    if (item){ cell.append(iconEl(item)); cell.title = item; cell.setAttribute('aria-label', item); cell.addEventListener('click', () => pick(item, cell)); }
    else cell.disabled = true;
    grid.append(cell);
  }
  info.textContent = 'Выбери предмет.';
  const ground = here().ground || [];
  const gWrap = document.createElement('div'); gWrap.className = 'bag-ground';
  if (ground.length){
    const gh = document.createElement('b'); gh.textContent = 'На земле'; gWrap.append(gh);
    ground.forEach((g, gi) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ground-item'; b.append(iconEl(g)); b.append(document.createTextNode(` ${g} — подобрать`));
      b.addEventListener('click', () => invAct(`подбираю ${g}`, `Ты подбираешь: ${g}.`, () => { ground.splice(gi, 1); S.inventory.push(g); })); gWrap.append(b); });
  }
  box.append(head, grid, info, acts, gWrap); back.append(box); document.body.append(back);
  x.addEventListener('click', close); back.addEventListener('click', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', function esc(e){ if (e.key === 'Escape'){ close(); document.removeEventListener('keydown', esc); } });
  x.focus();
}

/* d20 over the picture: green success, red failure, yellow natural 20, blue natural 1 */
let diceTimer = null;
function showDice(ck){
  const box = $('dice'); if (!box || !ck || !ck.dice) return;
  const d = ck.dice[ck.keep ?? 0], kind = d === 20 ? 'crit' : d === 1 ? 'fumble' : ck.success ? 'ok' : 'fail';
  const what = ck.kind === 'attack' ? 'Атака' : ck.kind === 'save' ? `Спасбросок ${ck.ability}` : (ck.skill || ck.ability);
  const word = { crit: 'КРИТ!', fumble: 'ПРОВАЛ!', ok: 'успех', fail: 'провал' }[kind];
  clearInterval(diceTimer); box.className = 'dice roll'; box.innerHTML = '<span class="d"></span><span class="t"></span>';
  const dEl = box.querySelector('.d'), tEl = box.querySelector('.t'); tEl.textContent = what;
  let n = 0;
  diceTimer = setInterval(() => {
    if (++n < 9){ dEl.textContent = 1 + Math.floor(Math.random()*20); return; }
    clearInterval(diceTimer); dEl.textContent = d; box.className = `dice ${kind}`;
    tEl.textContent = `${what}: ${ck.total} против ${ck.dc} — ${word}`;
    diceTimer = setTimeout(() => { box.className = 'dice'; }, 2200);
  }, 70);
}
/* «Говорить»: choose who to talk to among those who are here, the line is then typed after their name */
function pickTalk(btn){
  document.querySelector('.talk-pick')?.remove();
  const here = Object.entries(COMPANIONS).filter(([id, c]) => S.party[id].alive && (S.party[id].joined || (S.party[id].visible && c.place === S.place)));
  const box = document.createElement('div'); box.className = 'talk-pick';
  const add = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', () => { box.remove(); fn(); }); box.append(b); };
  here.forEach(([id, c]) => { const n = c.short || c.name.split(' ')[0]; add(n, () => ask(`${n}, `)); });
  add(here.length ? 'Кому-то ещё…' : 'Сказать вслух…', () => ask('говорю: «»'));
  btn.closest('.acts').append(box);
  setTimeout(() => document.addEventListener('click', function off(e){ if (!box.contains(e.target)){ box.remove(); document.removeEventListener('click', off); } }), 0);
}
const baseResolve = resolveCheck;
resolveCheck = (...a) => { const r = baseResolve(...a); showDice(r); return r; };
const baseHud = renderHud;
renderHud = () => { baseHud(); renderHeroBar(); };

$('bagbtn').addEventListener('click', openBag);
$('slot-r').addEventListener('click', openBag);
$('slot-l').addEventListener('click', openBag);
/* compact app layout for phones and Telegram: the hero sheet opens from the portrait, the picture shrinks while typing */
const root = document.documentElement;
const fitApp = () => root.classList.toggle('app', innerWidth < 940 || !!(window.Telegram && Telegram.WebApp && Telegram.WebApp.initData));
fitApp(); addEventListener('resize', fitApp);
// iPhone keeps the page full height under the keyboard: size the app to the part of the screen that is actually visible
const vv = window.visualViewport;
const fitHeight = () => { const h = vv ? vv.height : innerHeight; root.style.setProperty('--app-h', `${Math.round(h)}px`); if (root.classList.contains('typing')) scrollTo(0, 0); };
fitHeight(); if (vv){ vv.addEventListener('resize', fitHeight); vv.addEventListener('scroll', fitHeight); }
// the attribution stays reachable in the app layout: a copy lives at the bottom of the hero sheet
{ const lg = document.querySelector('.wrap > .legal'); if (lg) $('sheet').append(lg.cloneNode(true)); }
const toggleSheet = on => { root.classList.toggle('sheet-open', on); if (on) $('sheet-x').focus(); };
$('hb-sub').addEventListener('click', () => $('hb-face').click());
$('hb-face').addEventListener('click', () => { if (root.classList.contains('app')) toggleSheet(true); else $('sheet').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('sheet-x').addEventListener('click', () => toggleSheet(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleSheet(false); });
// after sending, the keyboard closes and the full view comes back
$('form').addEventListener('submit', () => { $('cmd').blur(); root.classList.remove('typing'); }, true);
/* settings (sound, music, new game) live behind one ⚙ button in the app layout */
{ const tools = document.querySelector('.tools'), gear = document.createElement('button');
  gear.type = 'button'; gear.className = 'btn gear'; gear.textContent = '⚙'; gear.setAttribute('aria-label', 'Настройки'); tools.append(gear);
  gear.addEventListener('click', e => { e.stopPropagation(); root.classList.toggle('menu-open'); });
  document.addEventListener('click', e => { if (!tools.contains(e.target) || e.target.id === 'restart') root.classList.remove('menu-open'); }); }
const endTyping = () => { $('cmd').blur(); root.classList.remove('typing'); };
document.querySelector('.view').addEventListener('click', () => { if (root.classList.contains('typing')) endTyping(); });
if (vv) vv.addEventListener('resize', () => { if (root.classList.contains('typing') && vv.height > screen.height*.75) endTyping(); });
$('cmd').addEventListener('focus', () => { root.classList.add('typing'); setTimeout(() => { $('journal').scrollTop = 1e9; }, 300); });
$('cmd').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('cmd')) root.classList.remove('typing'); }, 150));
document.querySelectorAll('#acts [data-act]').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.act;
  if (k === 'attack') ask(S.held && /меч/i.test(S.held) ? 'атакую мечом ближайшего врага' : 'атакую ближайшего врага', true);
  if (k === 'dodge') ask('уклоняюсь (действие «Уклонение»)', true);
  if (k === 'hide') ask('пытаюсь спрятаться', true);
  if (k === 'talk') pickTalk(b);
  if (k === 'gm') ask('Мастер, ');
}));
