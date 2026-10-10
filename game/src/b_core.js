(() => {
'use strict';
const W = 240, H = 135;
const cv = document.getElementById('scr');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
const $ = id => document.getElementById(id);
const SAVE_KEY = 'grey-fang-save-v8', LEGACY_KEY = 'grey-fang-legacy-v1';

/* ---------- D&D 5e: fighter, level 1 ---------- */
const STATS = [['СИЛ','Сила'],['ЛОВ','Ловкость'],['ТЕЛ','Телосложение'],['ИНТ','Интеллект'],['МДР','Мудрость'],['ХАР','Харизма']];
const mod = v => Math.floor((v - 10)/2);
const fmtMod = m => (m >= 0 ? '+' : '') + m;
const PROF = 2;
const SKILLS = [ // [название, характеристика]
  ['Атлетика','СИЛ'],['Акробатика','ЛОВ'],['Ловкость рук','ЛОВ'],['Скрытность','ЛОВ'],
  ['Магия','ИНТ'],['История','ИНТ'],['Анализ','ИНТ'],['Природа','ИНТ'],['Религия','ИНТ'],
  ['Уход за животными','МДР'],['Проницательность','МДР'],['Медицина','МДР'],['Внимательность','МДР'],['Выживание','МДР'],
  ['Обман','ХАР'],['Запугивание','ХАР'],['Выступление','ХАР'],['Убеждение','ХАР'],
];
const FIGHTER_SKILLS = ['Атлетика','Внимательность','Запугивание','Выживание'];
const SAVE_PROF = ['СИЛ','ТЕЛ'];
const CONDITIONS = {
  poisoned:   { name:'Отравлен',   rule:'помеха на броски атаки и проверки характеристик' },
  frightened: { name:'Испуган',    rule:'помеха на проверки и атаки, пока источник страха виден; нельзя приближаться к нему' },
  blinded:    { name:'Ослеплён',   rule:'ничего не видит, проваливает проверки на зрение, помеха на атаки, атаки по нему с преимуществом' },
  prone:      { name:'Сбит с ног', rule:'помеха на атаки; встать — половина перемещения' },
  charmed:    { name:'Очарован',   rule:'не может атаковать очарователя, тот получает преимущество в общении' },
  restrained: { name:'Опутан',     rule:'скорость 0, помеха на атаки и спасброски ЛОВ' },
};
const condName = id => CONDITIONS[id]?.name || id;

/* ---------- places, enemies, companions ---------- */
const ORDER = ['clearing','cave','corridor','stairs','lair'];
const PLACES = {
  clearing: { name:'Поляна у пещеры', light:'dusk', about:'закат, трава и мох, грязная лужа с червяками, куст с ягодами, сосны с шишками, камни и ветки; чёрная пасть пещеры с каменными «зубами»' },
  cave:     { name:'Сырая пещера', light:'dark', about:'низкий каменный тоннель, сталактиты, лужи, светящиеся голубые грибы, под сводом спят летучие мыши; дальше проход в рукотворный коридор' },
  corridor: { name:'Древний коридор', light:'dark', about:'кирпичный коридор древних гномов; посередине нажимная плита ловушки (дротики из стен, яд, спасбросок ЛОВ 13); гоблины-дозорные; в конце — спуск' },
  stairs:   { name:'Лестница в склеп', light:'dark', about:'старая лестница вниз, настенный факел, красное знамя; здесь бродит Призрак Хранителя' },
  lair:     { name:'Логово Серого Зуба', light:'dim', about:'тронный зал: каменный трон, жаровни, красные знамёна с черепом; на троне вождь Серый Зуб, рядом орк-телохранитель Гром; сбоку сундук с сокровищем' },
};
const ENEMY_STATS = {
  bat:          { name:'Летучая мышь', hp:1,  ac:12, atk:0, dmg:'1' },
  goblin:       { name:'Гоблин',       hp:7,  ac:15, atk:4, dmg:'1d6+2' },
  ghost:        { name:'Призрак Хранителя', hp:10, ac:11, atk:3, dmg:'1d6 некротический, при попадании спасбросок МДР 12 или испуг' },
  goblin_chief: { name:'Серый Зуб',    hp:21, ac:15, atk:4, dmg:'1d6+2, две атаки' },
  orc:          { name:'Гром',         hp:15, ac:13, atk:5, dmg:'1d12+3' },
};
const ENEMIES = Object.keys(ENEMY_STATS);
const newEnemy = (type, extra = {}) => ({ type, name: ENEMY_STATS[type].name, hp: ENEMY_STATS[type].hp, ac: ENEMY_STATS[type].ac, state:'idle', hidden:false, ...extra });
const START_ENEMIES = {
  clearing: [],
  cave:     [newEnemy('bat', { name:'Стая летучих мышей', hp:3 })],
  corridor: [newEnemy('goblin', { name:'Гоблин-дозорный Хряп' }), newEnemy('goblin', { name:'Гоблин-дозорный Шмыг', state:'asleep' })],
  stairs:   [newEnemy('ghost', { hidden:true })],
  lair:     [newEnemy('goblin_chief'), newEnemy('orc')],
};
const COMPANIONS = {
  skrip: { name:'Скрип', place:'clearing', hp:7, ac:13, atk:4, dmg:[4, 2], weapon:'ржавый нож',
    look:'тощий гоблин лет тридцати (для гоблина — старик), бурая шапка из крысиной шкуры, на левой руке не хватает двух пальцев, глаза жёлтые и бегающие',
    bible:`Скрип — гоблин-изгой. Десять лет служил у Серого Зуба «чистильщиком блестяшек»: натирал его золото. Неделю назад попался на краже серебряной ложки; орк Гром откусил ему два пальца, и Скрипа выгнали из пещеры. Теперь он прячется в кустах у входа, грызёт сырую репу и ненавидит Грома.
ГОЛОС: говорит о себе в третьем лице («Скрип думает…», «Скрипу не нравится»), тараторит, хихикает «хе-хе», причитает «ой-ой-ой», ругается по-гоблински: «чтоб тебе в лужу сесть», «крысиная отрыжка». Льстит сильным, огрызается слабым. Всё ценное называет «блестяшки».
ХОЧЕТ: корону Серого Зуба (не золото — именно корону, «чтоб все кланялись»), чтобы Гром получил по заслугам, и есть.
БОИТСЯ: Грома, открытого огня у лица (обжёгся в детстве). Призраков не боится — считает их «скучными».
ЗНАЕТ (тайны, отдаёт только за блестяшку, еду или когда доверяет): в коридоре третья плита — ловушка, из «дырявых стен» летят отравленные дротики; дозорный Шмыг вечно спит, а Хряп глуповат и любит грибы; за троном Серого Зуба есть лаз к сундуку; Серый Зуб глух на левое ухо.
ВРЁТ по мелочам: при встрече говорит, что «просто шёл мимо, собирал шишки»; набивает цену своим знаниям.
НЕ ДЕЛАЕТ: не лезет первым в опасность; не сражается с Громом лицом к лицу; не принимает выдумки о себе — если игрок придумывает его прошлое («ты же сидел в тюрьме»), фыркает и поправляет («Тюрьма? У гоблинов нет тюрем, у гоблинов есть яма. И Скрип в яме не сидел!»).
ОТНОШЕНИЕ растёт от блестяшек, еды, защиты, насмешек над Громом; падает от угроз, огня у лица, жалости к Серому Зубу. Если отношение −4 и ниже и игрок у сундука — Скрип хватает корону и удирает.`,
    firstScene:'прячется в кустах ягодного куста у края поляны и подглядывает; если его заметят — юлит и врёт, что просто шёл мимо' },
  tina:  { name:'Тина Полынь', place:'cave', hp:9, ac:12, atk:3, dmg:[4, 1], weapon:'праща',
    look:'полуэльфийка двадцати шести лет: рыжая коса, веснушки, острые уши, зелёный плащ, кожаный фартук с кармашками, плетёная корзинка с грибами',
    bible:`Тина Полынь — травница из деревни Ясеневый Брод. В деревне лихорадка; лекарство варят из «волчьих свечек» — светящихся грибов, которые растут только в этой пещере. Ей нужно двадцать штук, собрала двенадцать. Ещё у неё пропал младший брат Ивар (19 лет): месяц назад ушёл сюда за «гоблинским золотом» и не вернулся. На шее у Тины медальон с пером — Ивар подарил его ей.
ГОЛОС: сдержанная, сухая ирония, говорит коротко и по делу, сравнивает людей с растениями («упрям как лопух», «колючий, как чертополох»). Не любит пустых обещаний и громких слов. С незнакомцами вежлива, но насторожена; не командует «стой, кто идёт» — скорее, не отрываясь от работы, бросает «не наступи на грибы».
ХОЧЕТ: собрать грибы и вернуться в деревню; узнать, что случилось с Иваром.
БОИТСЯ: нежити (в детстве видела упыря), темноты без огня.
УМЕЕТ: раз за отдых лечит травами 1d8+2; знает яды и противоядия (снимет отравление, если есть минута); различает травы и грибы.
ТАЙНА, которой она НЕ знает: Призрак Хранителя на лестнице — это Ивар. Если Тина увидит призрака и заговорит с ним, он узнает медальон и сможет упокоиться без боя.
НЕ ДЕЛАЕТ: не идёт в бой первой (стреляет из пращи из-за спины); не врёт о брате; не принимает выдумки о себе — спокойно поправляет.
ОТНОШЕНИЕ растёт от помощи с грибами, честности, бережного отношения к живому; падает от жестокости, лжи, мародёрства.`,
    firstScene:'сидит на корточках у стены пещеры, срезает ножом светящиеся грибы в корзинку и вполголоса считает их; игрока замечает не сразу' },
};
const FEATURES = ['rubble','web','bones','barrel','crate','door','torch','chains','puddle','crystals','roots'];
/* ---------- state ---------- */
function rollStats(){
  const d6 = () => 1 + Math.floor(Math.random()*6);
  let st, sum;
  do { st = {}; sum = 0; for (const [k] of STATS){ const r = [d6(),d6(),d6(),d6()].sort((a,b) => a-b); st[k] = r[1]+r[2]+r[3]; sum += st[k]; } }
  while (sum < 68 || st['СИЛ'] < 12);
  return st;
}
function newGame(){
  const stats = rollStats(), maxHp = 10 + mod(stats['ТЕЛ']);
  const places = {}; for (const p of ORDER) places[p] = { enemies: START_ENEMIES[p].map(e => ({ ...e })), visited: p === 'clearing' };
  return {
    stats, hp: maxHp, maxHp, ac: 16, gold: 0, hitDice: 1, secondWind: true, inspiration: false,
    inventory: ['длинный меч','кольчуга','факел','огниво','верёвка','краюха хлеба'],
    torchLit: false, held: 'длинный меч', left: null, itemArt: {},
    place: 'clearing', places, conditions: [], exhaustion: 0,
    party: Object.fromEntries(Object.entries(COMPANIONS).map(([id, c]) => [id, { met:false, joined:false, approval:0, hp:c.hp, alive:true, visible: id === 'tina', healUsed:false, talk:[] }])),
    zones: Object.fromEntries(ORDER.map(p => [p, { i:0, f: { cave:['crystals','roots'], corridor:['web','barrel'] }[p] || [], title:'' }])), turnsHere: 0, lastBanter: -9, combat: false,
    chronicle: [], history: [], journal: [], turn: 0, over: null, chestTaken: false, legacyFound: false,
  };
}
const INTRO = 'Закат. Ты стоишь на поляне перед чёрной пастью пещеры, похожей на пасть с каменными зубами. Говорят, внутри, в тронном зале под старым склепом, гоблинский вождь Серый Зуб стережёт сундук с золотом. Ты воин: на тебе кольчуга, на поясе длинный меч, в сумке факел и огниво. Где-то в кустах хрустнула ветка.';
let S;
try { const raw = localStorage.getItem(SAVE_KEY); S = raw ? JSON.parse(raw) : null; } catch(e){ S = null; }
const freshStart = !S || !S.places;
if (freshStart) S = newGame();
function save(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch(e){} }
let LEGACY = [];
try { LEGACY = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); } catch(e){ LEGACY = []; }
const saveLegacy = () => { try { localStorage.setItem(LEGACY_KEY, JSON.stringify(LEGACY.slice(-3))); } catch(e){} };

const here = () => S.places[S.place];
const placeInfo = () => PLACES[S.place];
const hasItem = re => S.inventory.some(i => re.test(i));
const hasCond = id => S.conditions.some(c => c.id === id);
const torchLit = () => S.torchLit && !!S.left && /факел/i.test(S.left) && hasItem(/факел/i);
const effLight = () => torchLit() ? 'torch' : placeInfo().light;
const skillBonus = name => { const sk = SKILLS.find(s => s[0] === name); if (!sk) return null; return mod(S.stats[sk[1]]) + (FIGHTER_SKILLS.includes(name) ? PROF : 0); };
const saveBonus = ab => mod(S.stats[ab]) + (SAVE_PROF.includes(ab) ? PROF : 0);
const attackBonus = () => mod(S.stats['СИЛ']) + PROF;
// disadvantage forced by conditions (5e)
function forcedDisadvantage(kind, ability){
  const why = [];
  if (hasCond('poisoned') && kind !== 'save') why.push('отравлен');
  if (hasCond('frightened') && kind !== 'save') why.push('испуган');
  if (hasCond('blinded') && kind === 'attack') why.push('ослеплён');
  if (hasCond('prone') && kind === 'attack') why.push('сбит с ног');
  if (hasCond('restrained') && (kind === 'attack' || (kind === 'save' && ability === 'ЛОВ'))) why.push('опутан');
  if (S.exhaustion >= 1 && kind === 'check') why.push('истощение');
  if (S.exhaustion >= 3 && kind !== 'check') why.push('истощение 3');
  return why;
}
