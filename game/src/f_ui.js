
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
const describe = name => { const n = String(name).toLowerCase(), d = ITEM_DESC.find(([re]) => re.test(n)); return d ? d[1] : 'Ничего особенного на вид.'; };

function renderHeroBar(){
  const H = heroOf(), face = $('hb-face');
  if (!face) return;
  const pic = H && ART.portrait[S.hero];
  face.textContent = '';
  if (pic){ const im = document.createElement('img'); im.src = pic; im.alt = H.name; face.append(im); }
  else face.textContent = (H ? H.name : 'В')[0];
  $('hb-name').textContent = H ? H.name.split(' ')[0] : 'Воин';
  $('hb-sub').textContent = H ? H.title : 'свой герой';
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
    [['✋ Взять в руку', () => ask(`беру в руку ${item}`, true)], ['⚙ Использовать…', () => ask(`использую ${item} `)],
     ['👁 Осмотреть', null], ['🗑 Выбросить', () => ask(`выбрасываю ${item}`, true)]].forEach(([t, fn]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = t;
      // looking at your own things is free: no master, no dice
      b.addEventListener('click', () => { if (!fn){ info.textContent = `${item}${inHand}. ${describe(item)}`; return; } close(); fn(); }); acts.append(b);
    });
  };
  const n = Math.max(10, Math.ceil(S.inventory.length/5)*5);
  for (let i = 0; i < n; i++){
    const item = S.inventory[i], cell = document.createElement('button'); cell.type = 'button'; cell.className = 'cell';
    if (item){ cell.append(iconEl(item)); cell.title = item; cell.setAttribute('aria-label', item); cell.addEventListener('click', () => pick(item, cell)); }
    else cell.disabled = true;
    grid.append(cell);
  }
  info.textContent = 'Выбери предмет.';
  box.append(head, grid, info, acts); back.append(box); document.body.append(back);
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
$('hb-face').addEventListener('click', () => { if (root.classList.contains('app')) toggleSheet(true); else $('sheet').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('sheet-x').addEventListener('click', () => toggleSheet(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleSheet(false); });
$('cmd').addEventListener('focus', () => { root.classList.add('typing'); setTimeout(() => { $('journal').scrollTop = 1e9; }, 300); });
$('cmd').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('cmd')) root.classList.remove('typing'); }, 150));
document.querySelectorAll('#acts [data-act]').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.act;
  if (k === 'attack') ask(S.held && /меч/i.test(S.held) ? 'атакую мечом ближайшего врага' : 'атакую ближайшего врага', true);
  if (k === 'dodge') ask('ухожу в глухую защиту и уклоняюсь', true);
  if (k === 'hide') ask('пытаюсь спрятаться', true);
  if (k === 'talk') ask('говорю: «»');
  if (k === 'gm') ask('Мастер, ');
}));
