
/* =====================  GAME MASTER (Claude)  ===================== */
let sample = null, busy = false;
const RULES = `Ты — мастер настольной игры по правилам 5-й редакции (SRD 5.1) в текстовой игре «${ADV.title}» (тёмное фэнтези). Игрок — воин 1 уровня без магии. Он пишет действия свободным текстом; ты решаешь, что происходит, и отвечаешь ТОЛЬКО одним JSON-объектом.

ДУХ ИГРЫ
- Реагируй на любое действие, даже шуточное: у всего есть последствия. Мир живой: существа заняты своими делами, а не стоят и ждут игрока.
- Награждай выдумку: умное нестандартное решение — преимущество на проверку и, изредка, Вдохновение ("inspiration":"grant").
- "remember" — только по-настоящему важные факты, которые изменят будущее (пощадил врага, сломал механизм, обманул кого-то). Не чаще одного факта за несколько ходов; обычно пустой список.
- Никаких предметов из воздуха; используй только инвентарь. Находки — только правдоподобные для места.
- narration: 2–5 живых предложений по-русски, во втором лице, без markdown, без чисел хитов, без вариантов действий.

БОЙ И ПРАВИЛА 5e (числа — ТОЛЬКО из «МЕШКА КУБИКОВ»)
- Проверка ("check"): d20 + бонус навыка. Спасбросок ("save"). Атака оружием ("attack"): d20 + бонус атаки против КБ цели, обязательно укажи "target" — имя врага. СЛ по сложности действия: 5/10/15/20.
- d20 игрока: A; с преимуществом — большее из A и B; с помехой — меньшее.
- УРОН ОТ АТАК ОРУЖИЕМ, ХОД ВРАГОВ И ХОД СПУТНИКОВ СЧИТАЕТ ИГРА после твоего ответа и показывает отдельно. Ты описываешь только действие игрока и его исход (попал/промахнулся — по броску), НЕ описываешь ответные удары врагов и НЕ меняешь hp цели при атаке оружием.
- Убить, прогнать или усмирить врага без оружия можно только через успешную проверку в этом же ходу (запугивание, обман, огонь, хитрость). Воин не владеет магией: молитвы и «заклинания» сами по себе никого не убивают и не изгоняют.
- Бой идёт по очереди: игрок действует → спутники → враги. Враг, которого атаковали или который заметил игрока и настроен враждебно, получает state "angry".
- Состояния игрока (poisoned, frightened, blinded, prone, charmed, restrained) — "conditions_add"/"conditions_remove"; помеху от них игра добавит сама. Истощение — "exhaustion_delta".
- Второе дыхание воина — "second_wind": true. Отдых: "rest":"short" (в безопасности) или "long" (только в безопасном месте «${PLACES[ADV.safe].name}», без врагов).
- Вдохновение потрачено ("использую вдохновение") — "inspiration":"use".

ЧТО В РУКАХ
- "held" — правая рука (в начале там длинный меч), "held_left" — левая (в начале пустая). Меняй их ТОЛЬКО если игрок прямо достаёт, берёт, убирает, бросает или использует предмет. Иначе "keep". Факел, чтобы светить, держат в левой руке; щит — в левой.

ПРОВЕРКИ — В ДВА ШАГА
- Если исход действия зависит от удачи (скрытность, атака, прыжок, взлом, убеждение, ловушка…), НЕ описывай исход сразу. Ответь ТОЛЬКО {"pending":true,"check":{...}} — игра бросит кости и пришлёт ИТОГ ПРОВЕРКИ. Тогда опиши ход полностью по этому итогу, check = null.
- Провал всегда имеет последствия: при проваленной скрытности враги замечают игрока (state "angry"), при проваленном прыжке — урон или падение, и т.д. Пройти мимо бодрствующих врагов можно только успешной проверкой (Скрытность, Обман, Убеждение, Запугивание) или если они мертвы, сбежали, усмирены или спят.

СУЩЕСТВА — только ИЗМЕНЕНИЯ
- "enemies": список изменений существ в текущем месте: [{"name":"точное имя из состояния","state":"...","hidden":false,"hp":7}]. Указывай только тех, кто изменился. Удалять существ нельзя: убитые — "dead", сбежавшие — "fled", усмирённые — "pacified". Скрытых, которых игрок не заметил, не упоминай. Новое существо (редко) — {"new":true,"type":"...","name":"..."}.

МЕСТА И УЧАСТКИ
- Места и переходы (откуда → куда можно пойти): ${ORDER.map(p => `${p} «${PLACES[p].name}» → ${neighbours(p).join(', ')}`).join('; ')}. "move": id соседнего места — когда игрок уходит в него; в несоседнее место сразу попасть нельзя.
- Внутри места игрок может идти дальше/вглубь, осматривать боковые проходы. Тогда открой новый участок: "zone":{"advance":true,"title":"короткое название участка","features":[до 4 из: ${FEATURES.join(', ')}]} — и опиши его. Картинка рисуется из features, текст должен с ними совпадать. В пещере уместны crystals, roots, puddle, bones, rubble, web; в коридоре и на лестнице — torch, door, barrel, crate, chains, web, bones, rubble.

ПЕРСОНАЖИ (их досье в состоянии)
- Разговоры с персонажами ведёт отдельный «голос персонажа», не ты. НИКОГДА не пиши в narration прямую речь персонажей и не пересказывай их слова — только их действия, мимику, позу. Реплику можешь вложить в "dialogue" ТОЛЬКО в критический момент (начало боя, чья-то смерть, находка, связанная с их целью) — одна короткая, в характере. Обычно "dialogue": [].
- ВСЁ, ЧТО ЕСТЬ «НА КАРТИНКЕ» (список в состоянии), должно быть замечено в тексте, когда игрок впервые это видит: если в месте есть персонаж или существо, опиши, чем оно занято.
- Персонажи ведут себя естественно, по своему досье и сцене первой встречи: заняты делом, не здороваются как стражники, не соглашаются со всем подряд.
- "party": [{"id":"${Object.keys(COMPANIONS).join('|')}","visible":true,"met":true}] — когда игрок замечает персонажа или знакомится с ним. В отряд вступают только те, кому это позволяет досье, и только через разговор.

НАСЛЕДИЕ: кости погибшего ранее героя (если есть в состоянии) лежат в указанном месте; при осмотре — "legacy_found": true, можно отдать часть его вещей.

ФОРМАТ ОТВЕТА (строго JSON, без текста вокруг):
{"narration":"...","dialogue":[],"check":null или {"kind":"check|save|attack","skill":"навык или null","ability":"СИЛ|ЛОВ|ТЕЛ|ИНТ|МДР|ХАР","dc":13,"adv":"none|advantage|disadvantage","target":"имя или null"},"hp_delta":0,"gold_delta":0,"add_items":[],"remove_items":[],"torch":null|"lit"|"out","held":"keep","held_left":"keep","move":null,"zone":null,"enemies":[],"party":[],"conditions_add":[],"conditions_remove":[],"exhaustion_delta":0,"inspiration":null,"second_wind":false,"rest":null,"remember":[],"chest_taken":false,"legacy_found":false,"night_passes":false,"ending":null,"effect":null|"${EFFECTS.join('|')}","game_over":null|"win"|"death"}
ГЕРОЙ: если в состоянии у игрока есть имя, прошлое и особенность — это его персонаж. Обращайся к нему как к этому герою, пусть мир и персонажи реагируют на его прошлое, а особенность честно влияет на проверки (преимущество, сопротивление и т. п.).
ВЕЩИ: "add_items" — короткие названия по-русски в именительном падеже («ком грязи», «зелье лечения»).

${ADV.gm}

ЧУЖИЕ ФРАНШИЗЫ: сам никогда не вводи персонажей, названия и фирменные фразы из чужих игр, аниме, фильмов и книг — мир остаётся своим. Но если игрок сам приносит что-то оттуда (называет себя персонажем, вызывает знакомую способность, кричит фразу), подыгрывай свободно, с теми же именами, как это сделал бы живой мастер за столом; правила и кости при этом действуют как обычно.`;

const rollBag = () => { const d = n => 1 + Math.floor(Math.random()*n); return { A: d(20), B: d(20), E1: d(20), E2: d(20), d4: d(4), d6: d(6), d6b: d(6), d8: d(8), d8b: d(8), d10: d(10), d12: d(12) }; };
function buildPrompt(text, bag, ck){
  const pl = here(), idx = ORDER.indexOf(S.place);
  const st = {
    место: { id: S.place, ...placeInfo(), соседние: [ORDER[idx-1], ORDER[idx+1]].filter(Boolean) },
    существа_здесь: pl.enemies.map(e => ({ ...e, кб: ENEMY_STATS[e.type]?.ac, атака: '+' + (ENEMY_STATS[e.type]?.atk ?? 0), урон: ENEMY_STATS[e.type]?.dmg })),
    игрок: { ...(heroOf() ? { имя: heroOf().name, кто: `${heroOf().race}, ${heroOf().title}, ${heroOf().age} лет`, характер: heroOf().traits, прошлое: heroOf().past, особенность: heroOf().perk, навыки_с_мастерством: heroOf().skills } : {}), hp: S.hp, max_hp: S.maxHp, кб: S.ac, бонус_мастерства: PROF, характеристики: S.stats,
      модификаторы: Object.fromEntries(STATS.map(([k]) => [k, mod(S.stats[k])])),
      бонусы_навыков: Object.fromEntries(SKILLS.map(([n]) => [n, skillBonus(n)])),
      бонусы_спасбросков: Object.fromEntries(STATS.map(([k]) => [k, saveBonus(k)])), бонус_атаки_мечом: attackBonus(),
      состояния: S.conditions, истощение: S.exhaustion, вдохновение: S.inspiration, второе_дыхание_доступно: S.secondWind, кости_хитов: S.hitDice,
      инвентарь: S.inventory, в_правой_руке: S.held, в_левой_руке: S.left, факел_горит: torchLit(), золото: S.gold },
    участок: S.zones[S.place], ходов_в_этом_месте: S.turnsHere, идёт_бой: S.combat,
    на_картинке: [...here().enemies.filter(x => !x.hidden && !['dead','fled'].includes(x.state)).map(x => `${x.name} (${x.state})`),
      ...Object.entries(COMPANIONS).filter(([id, c]) => c.place === S.place && S.party[id].visible && !S.party[id].joined && S.party[id].alive).map(([id, c]) => `${c.name} — ${S.party[id].met ? 'знаком' : 'ещё не знаком: ' + c.firstScene}`),
      ...(S.zones[S.place]?.f || [])],
    руки: { правая: S.held, левая: S.left },
    персонажи: Object.fromEntries(Object.entries(COMPANIONS).map(([id, c]) => [id, { имя: c.name, где_живёт: c.place, внешность: c.look, досье: c.bible, первая_встреча: c.firstScene, в_отряде: S.party[id].joined, замечен: S.party[id].visible, знаком: S.party[id].met, отношение: S.party[id].approval, hp: S.party[id].hp, жив: S.party[id].alive }])),
    хроника_мира: S.chronicle, сундук_забран: S.chestTaken,
    погибшие_герои: LEGACY.map(l => ({ место: l.place, причина: l.cause, вещи: l.items, найден: S.legacyFound })),
    ход: S.turn, ночь: S.night || 0,
    ...(ADV.heroHooks && S.hero && ADV.heroHooks[S.hero] ? { личная_зацепка_героя: ADV.heroHooks[S.hero] } : {}),
  };
  const hist = S.history.slice(-8).map(h => `Игрок: ${h.p}\nМастер: ${h.n}${h.d ? '\nРеплики: ' + h.d : ''}`).join('\n\n') || '(начало игры) ' + INTRO;
  const forced = forcedDisadvantage('check');
  return `${RULES}\n\nСОСТОЯНИЕ (правда, его ведёт игра):\n${JSON.stringify(st)}\n\nПОСЛЕДНИЕ ХОДЫ:\n${hist}\n\nМЕШОК КУБИКОВ ЭТОГО ХОДА: ${JSON.stringify(bag)}${forced.length ? `\nНа проверки сейчас действует помеха (${forced.join(', ')}).` : ''}${ck ? `\n\nИТОГ ПРОВЕРКИ (кости уже брошены игрой, это окончательно): ${checkLine(ck)}. Теперь опиши ход ПОЛНОСТЬЮ по этому итогу, со всеми последствиями. В ответе "check": null, "pending": false.` : ''}\n\nДЕЙСТВИЕ ИГРОКА: «${text}»`;
}

const clampInt = (v, lo, hi) => { v = Math.round(Number(v) || 0); return Math.max(lo, Math.min(hi, v)); };
const cleanStr = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const itemName = x => cleanStr(typeof x === 'string' ? x : (x && typeof x === 'object') ? (x.name ?? x.title ?? x.item ?? '') : '', 28);
const STAT_RE = { 'СИЛ':/^сил|^str/i, 'ЛОВ':/^лов|^dex/i, 'ТЕЛ':/^тел|^вын|^con/i, 'ИНТ':/^инт|^int/i, 'МДР':/^мдр|^муд|^wis/i, 'ХАР':/^хар|^cha/i };
const normStat = s => { s = String(s ?? '').trim(); for (const k in STAT_RE) if (STAT_RE[k].test(s)) return k; return null; };
const mentions = (t, item) => item.toLowerCase().split(/\s+/).some(w => w.length >= 4 && t.includes(w.slice(0, Math.max(4, w.length - 2))));

function resolveCheck(c, bag, useInspiration){
  const kind = ['check','save','attack'].includes(c.kind) ? c.kind : 'check';
  const skill = SKILLS.find(s => s[0].toLowerCase() === String(c.skill || '').toLowerCase());
  const ability = kind === 'attack' ? 'СИЛ' : (skill ? skill[1] : normStat(c.ability) || 'ЛОВ');
  const bonus = kind === 'attack' ? attackBonus() : kind === 'save' ? saveBonus(ability) : skill ? skillBonus(skill[0]) : mod(S.stats[ability]);
  const forced = forcedDisadvantage(kind, ability);
  let adv = c.adv === 'advantage' || useInspiration, dis = c.adv === 'disadvantage' || forced.length > 0;
  if (adv && dis){ adv = dis = false; }
  const dice = (adv || dis) ? [bag.A, bag.B] : [bag.A];
  const keep = dice.length === 1 ? 0 : adv ? (bag.A >= bag.B ? 0 : 1) : (bag.A <= bag.B ? 0 : 1);
  const d = dice[keep], dc = clampInt(c.dc, 2, 30), total = d + bonus;
  const success = kind === 'attack' ? (d === 20 || (d !== 1 && total >= dc)) : total >= dc;
  return { kind, skill: skill ? skill[0] : null, ability, bonus, dice, keep, dc, total, success, adv, dis, forced, crit: kind === 'attack' && d === 20, target: cleanStr(c.target, 30) };
}
const checkLine = c => {
  const what = c.kind === 'attack' ? `Атака${c.target ? ' по ' + c.target : ''}` : c.kind === 'save' ? `Спасбросок ${c.ability}` : `${c.skill || c.ability}${c.skill ? ' (' + c.ability + ')' : ''}`;
  const mode = c.adv ? ', преимущество' : c.dis ? `, помеха${c.forced?.length ? ' (' + c.forced.join(', ') + ')' : ''}` : '';
  const dice = c.dice.length > 1 ? `[${c.dice.join(', ')}] → ${c.dice[c.keep]}` : `${c.dice[0]}`;
  return `${what}${mode}: d20 ${dice} ${fmtMod(c.bonus)} = ${c.total} против ${c.kind === 'attack' ? 'КБ' : 'СЛ'} ${c.dc}${c.crit ? ' — КРИТ!' : ''}: ${c.success ? 'успех' : 'провал'}`;
};

/* ---------- journal log the developer can read (artifact database) ---------- */
let DB = null;
function logTurn(entry){
  if (!DB) return;
  try { DB.collection('log').add({ at: Date.now(), turn: S.turn, place: S.place, zone: S.zones[S.place]?.i || 0, ...entry,
    state: JSON.stringify({ hp: S.hp, held: S.held, torch: torchLit(), conditions: S.conditions, enemies: here().enemies, party: S.party }).slice(0, 6000) }).catch(() => {}); } catch(e){}
}

/* ---------- what the right hand holds changes only on the player's word ---------- */
const HOLD_RE = /(дост|бер[уё]|возьм|взял|хвата|выним|обнаж|держ|подним|сжима|вооруж|готовлю)/;
const USE_RE = /(атак|бью|бить|удар|руб|кол[юи]|реж|маш|замах|сраж|напада|бросаю|брошу|кида|кину|швыр|мета|метн|ем |съе|пью|выпь|выпи|мажу|натира|поджиг|использ|втыка|ковыря|копа|отбива)/;
const DROP_RE = /(убира|убер|прячу|спрячу|клад[уё]|полож|вкладыва|в ножны|бросаю|брошу|кида|кину|швыр|выкид|отда|съе|ем |выпи|пью)/;
function guardHand(res, key, cur, t){
  if (res[key] === undefined || res[key] === 'keep') return;
  if (res[key] === null){
    const named = cur && (mentions(t, cur) || /(это|его|её|ее|меч|оружие|щит|факел)/.test(t));
    if (!(DROP_RE.test(t) && named)) res[key] = 'keep';
    return;
  }
  const want = cleanStr(res[key], 28), sword = /меч/i.test(want);
  const named = mentions(t, want) || (sword && /(меч|оружи|клинок|атак|бью|руб|удар|сраж|напада|бой)/.test(t)) || (/факел/i.test(want) && /(факел|свет|заж)/.test(t));
  if (!((HOLD_RE.test(t) || USE_RE.test(t) || /заж/.test(t)) && named)) res[key] = 'keep';
}
function setHand(key, val){
  const h = val ? cleanStr(val, 28) : null;
  if (!h){ S[key] = null; return; }
  const inv = S.inventory.find(i => i.toLowerCase() === h.toLowerCase()) || S.inventory.find(i => i.toLowerCase().includes(h.toLowerCase()) || h.toLowerCase().includes(i.toLowerCase()));
  if (!inv) return;
  const other = key === 'held' ? 'left' : 'held'; if (S[other] === inv) S[other] = null;
  S[key] = inv; if (!/меч|факел|щит/i.test(inv)) requestItemArt(inv);
}

/* ---------- creatures: the game owns who is here; the master only sends changes ---------- */
function patchEnemies(updates, canDefeat){
  const pl = here();
  for (const u of updates.slice(0, 6)){
    if (!u || typeof u !== 'object') continue;
    const nm = cleanStr(u.name, 30).toLowerCase();
    let e = pl.enemies.find(x => nm && x.name.toLowerCase() === nm) || pl.enemies.find(x => nm && (x.name.toLowerCase().includes(nm) || nm.includes(x.name.toLowerCase())))
         || (u.type && pl.enemies.find(x => x.type === u.type && !['dead','fled','pacified'].includes(x.state)));
    if (!e){ if (u.new && ENEMIES.includes(u.type) && pl.enemies.length < 5) pl.enemies.push(newEnemy(u.type, { name: cleanStr(u.name, 30) || ENEMY_STATS[u.type].name, state: 'idle' })); continue; }
    if (typeof u.hidden === 'boolean') e.hidden = u.hidden;
    const st = ['idle','angry','hurt','asleep','dead','fled','pacified'].includes(u.state) ? u.state : null;
    if (st && st !== e.state){
      if (['dead','fled','pacified'].includes(st) && !canDefeat) { /* refused: no successful check this turn */ }
      else e.state = st;
    }
    if (u.hp != null){ const hp = clampInt(u.hp, 0, 80); if (hp >= e.hp || canDefeat){ e.hp = hp; if (hp <= 0) e.state = 'dead'; } }
  }
}

/* ---------- combat: companions and enemies act after the player, dice rolled by the game ---------- */
const d = n => 1 + Math.floor(Math.random()*n);
function rollDmg(spec, crit){
  const m = /(\d+)d(\d+)(?:\s*\+\s*(\d+))?/.exec(spec || ''); if (!m) return parseInt(spec) || 1;
  let t = +(m[3] || 0); for (let i = 0; i < (+m[1])*(crit ? 2 : 1); i++) t += d(+m[2]); return t;
}
const activeFoes = () => here().enemies.filter(e => !e.hidden && ['angry','hurt'].includes(e.state));
function findTarget(name){
  const foes = here().enemies.filter(e => !e.hidden && !['dead','fled','pacified'].includes(e.state)), nm = (name || '').toLowerCase();
  return foes.find(e => nm && (e.name.toLowerCase().includes(nm) || nm.includes(e.name.toLowerCase()))) || foes.find(e => ['angry','hurt'].includes(e.state)) || foes[0];
}
function combatRound(check, bag, lines){
  // the player's weapon hit
  if (check && check.kind === 'attack'){
    const tgt = findTarget(check.target);
    if (tgt){
      here().enemies.filter(e => !e.hidden && e.state === 'idle').forEach(e => e.state = 'angry');
      if (tgt.state === 'asleep' || tgt.state === 'idle') tgt.state = 'angry';
      if (check.success){
        const dmg = Math.max(1, bag.d8 + (check.crit ? bag.d8b : 0) + weaponMod());
        tgt.hp = Math.max(0, tgt.hp - dmg); lines.push(`Твой удар: ${dmg} урона → ${tgt.name}${tgt.hp <= 0 ? ' — повержен' : ` (осталось ${tgt.hp})`}.`);
        if (tgt.hp <= 0) tgt.state = 'dead'; else tgt.state = 'hurt';
        addEffect('strike'); SFX.hit();
      }
    }
  }
  const foes = activeFoes(); S.combat = foes.length > 0;
  if (!foes.length) return;
  // companions in the party
  for (const [id, c] of Object.entries(COMPANIONS)){
    const p = S.party[id]; if (!p.joined || !p.alive || p.hp <= 0) continue;
    if (id === 'tina' && S.hp <= S.maxHp/2 && !p.healUsed){ const h = d(8) + 2; p.healUsed = true; S.hp = Math.min(S.maxHp, S.hp + h); lines.push(`Тина прикладывает к твоей ране кашицу из трав: +${h} здоровья.`); addEffect('heal'); continue; }
    const tgt = activeFoes()[0]; if (!tgt) break;
    const r = d(20), hit = r === 20 || (r !== 1 && r + c.atk >= tgt.ac);
    if (hit){ const dmg = d(c.dmg[0]) + c.dmg[1]; tgt.hp = Math.max(0, tgt.hp - dmg); if (tgt.hp <= 0) tgt.state = 'dead'; else tgt.state = 'hurt';
      lines.push(`${c.name} (${c.weapon}): ${r}+${c.atk} против КБ ${tgt.ac} — попадание, ${dmg} урона${tgt.hp <= 0 ? `, ${tgt.name} повержен` : ''}.`); }
    else lines.push(`${c.name} (${c.weapon}): ${r}+${c.atk} против КБ ${tgt.ac} — мимо.`);
  }
  // enemies
  for (const e of activeFoes().slice(0, 3)){
    const st = ENEMY_STATS[e.type];
    if ((e.type === 'goblin') && e.hp <= 2 && Math.random() < .5){ e.state = 'fled'; lines.push(`${e.name} визжит и удирает в темноту.`); continue; }
    for (let k = 0; k < (e.type === 'goblin_chief' ? 2 : 1); k++){
      const mates = Object.entries(COMPANIONS).filter(([id]) => S.party[id].joined && S.party[id].alive && S.party[id].hp > 0);
      const mate = mates.length && Math.random() < .25 ? mates[(Math.random()*mates.length)|0] : null;
      const adv = !mate && (hasCond('prone') || hasCond('blinded'));
      const r1 = d(20), r2 = d(20), r = adv ? Math.max(r1, r2) : r1, ac = mate ? mate[1].ac : S.ac;
      const hit = r === 20 || (r !== 1 && r + st.atk >= ac), who = mate ? mate[1].name : 'тебя';
      if (!hit){ lines.push(`${e.name} атакует ${who}: ${r}+${st.atk} против КБ ${ac} — мимо.`); continue; }
      const dmg = rollDmg(st.dmg, r === 20);
      if (mate){ const p = S.party[mate[0]]; p.hp = Math.max(0, p.hp - dmg); lines.push(`${e.name} бьёт ${who}: ${dmg} урона${p.hp <= 0 ? `. ${mate[1].name} падает без сознания!` : ''}.`); }
      else {
        S.hp = Math.max(0, S.hp - dmg); lines.push(`${e.name} атакует тебя: ${r}+${st.atk} против КБ ${ac} — попадание, ${dmg} урона.`); addEffect('blood'); SFX.hurt();
        if (e.type === 'ghost' && !hasCond('frightened')){ const sv = d(20) + saveBonus('МДР'); if (sv < 12){ S.conditions.push({ id: 'frightened', turns: 2 }); lines.push(`Ледяное касание. Спасбросок МДР ${sv} против 12 — ты испуган.`); } else lines.push(`Спасбросок МДР ${sv} против 12 — ты не поддаёшься страху.`); }
      }
      if (S.hp <= 0) return;
    }
  }
  S.combat = activeFoes().length > 0;
}

/* ---------- applying the master's answer ---------- */
const CRITICAL = { moved: false, fight: false, hurt: false };
function apply(res, text, bag, mode, preCheck){
  const t = text.toLowerCase();
  const narration = cleanStr(res.narration, 1400);
  const tags = [], lines = [];
  const useInsp = (res.inspiration === 'use' || (preCheck && preCheck.insp)) && S.inspiration;
  if (useInsp){ S.inspiration = false; tags.push(['Вдохновение потрачено', 'good']); }
  let check = preCheck || null;
  if (!check && res.check && typeof res.check === 'object' && res.check.dc != null){ check = resolveCheck(res.check, bag, useInsp); SFX.dice(); }
  if (res.inspiration === 'grant' && !S.inspiration){ S.inspiration = true; tags.push(['+ Вдохновение', 'good']); }
  const hpBefore = S.hp, wasCombat = S.combat;
  S.hp = clampInt(S.hp + clampInt(res.hp_delta, -12, 12), 0, S.maxHp);
  if (res.second_wind && S.secondWind){ S.secondWind = false; S.hp = Math.min(S.maxHp, S.hp + bag.d10 + 1); tags.push([`Второе дыхание: +${bag.d10 + 1}`, 'good']); addEffect('heal'); }
  if (res.rest === 'short' && !S.combat){ if (S.hitDice > 0){ S.hitDice--; S.hp = Math.min(S.maxHp, S.hp + Math.max(1, bag.d10 + mod(S.stats['ТЕЛ']))); } S.secondWind = true; tags.push(['Короткий отдых']); }
  if (res.rest === 'long' && !S.combat && S.place === ADV.safe){ S.hp = S.maxHp; S.hitDice = 1; S.secondWind = true; S.exhaustion = Math.max(0, S.exhaustion - 1); S.conditions = []; for (const [id, c] of Object.entries(COMPANIONS)){ S.party[id].hp = c.hp; S.party[id].healUsed = false; } tags.push(['Долгий отдых']); }
  S.gold = Math.max(0, S.gold + clampInt(res.gold_delta, -1000, 1000));
  if (Array.isArray(res.remove_items)) for (const it of res.remove_items.slice(0, 5)){
    const want = itemName(it).toLowerCase(); if (!want) continue;
    const i = S.inventory.findIndex(x => { const l = x.toLowerCase(); return l === want || l.includes(want) || want.includes(l); });
    if (i >= 0) S.inventory.splice(i, 1);
  }
  if (Array.isArray(res.add_items)) for (const it of res.add_items.slice(0, 5)){
    const n = itemName(it); if (n && S.inventory.length < 20 && !S.inventory.some(x => x.toLowerCase() === n.toLowerCase())){ S.inventory.push(n); tags.push([`+ ${n}`]); SFX.pickup(); }
  }
  guardHand(res, 'held', S.held, t); guardHand(res, 'held_left', S.left, t);
  if (res.held !== undefined && res.held !== 'keep') setHand('held', res.held);
  if (res.held_left !== undefined && res.held_left !== 'keep') setHand('left', res.held_left);
  const wantsLight = /(заж|подж|запал|разжиг)/.test(t) && /факел/.test(t);
  const lightIt = (res.torch === 'lit' || (res.torch == null && wantsLight && /(вспых|загора|пламя|огон)/i.test(narration))) && hasItem(/факел/i);
  if (lightIt){ if (!S.left || !/факел/i.test(S.left)) setHand('left', S.inventory.find(i => /факел/i.test(i))); if (!S.torchLit) SFX.torch(); S.torchLit = true; }
  if (res.torch === 'out') S.torchLit = false;
  if (S.held && !S.inventory.includes(S.held)) S.held = null;
  if (S.left && !S.inventory.includes(S.left)) S.left = null;
  if (!S.left || !/факел/i.test(S.left)) S.torchLit = false;
  if (check && check.kind === 'attack' && hasItem(/меч/i) && !S.held) S.held = S.inventory.find(i => /меч/i.test(i));
  // places and zones
  const mv = typeof res.move === 'string' ? res.move : res.move && res.move.view;
  CRITICAL.moved = false;
  const blockers = here().enemies.filter(x => !x.hidden && x.type !== 'bat' && !['dead','fled','pacified','asleep'].includes(x.state));
  const slipped = check && check.success && /Скрытн|Обман|Убежд|Запуг|Акробат|Атлет/.test(check.skill || '');
  if (check && !check.success && /Скрытн/.test(check.skill || '')) here().enemies.forEach(x => { if (!x.hidden && x.state === 'idle') x.state = 'angry'; });
  // awake enemies block the way into new places (going back where you came from is allowed)
  if (mv && S.places[mv] && !S.places[mv].visited && blockers.length && !slipped){ tags.push([`${blockers[0].name} не даёт пройти`]); blockers.forEach(x => { if (x.state === 'idle') x.state = 'angry'; }); res.move = null; }
  const mv2 = typeof res.move === 'string' ? res.move : res.move && res.move.view;
  if (mv2 && ORDER.includes(mv2) && mv2 !== S.place && neighbours(S.place).includes(mv2) && !(S.combat && !S.places[mv2].visited)){
    CRITICAL.moved = !S.places[mv2].visited; S.place = mv2; S.places[mv2].visited = true; S.turnsHere = 0; SFX.step(); tags.push([`→ ${PLACES[mv2].name}`]);
  }
  if (res.zone && res.zone.advance && ADV_ID === 'cave' && S.place !== 'lair' && S.place !== 'clearing'){
    const z = S.zones[S.place]; z.i++; z.f = (Array.isArray(res.zone.features) ? res.zone.features : []).filter(f => FEATURES.includes(f)).slice(0, 4); z.title = cleanStr(res.zone.title, 40); SFX.step();
    if (z.title) tags.push([z.title]);
  }
  // creatures (changes only; defeat needs a successful non-weapon check)
  const canDefeat = !!(check && check.success && check.kind !== 'attack');
  if (Array.isArray(res.enemies)) patchEnemies(res.enemies, canDefeat);
  if (Array.isArray(res.party)) for (const u of res.party){
    const st = S.party[u?.id]; if (!st) continue;
    if (u.met === true) st.met = true;
    if (u.visible === true) st.visible = true;
    if (u.joined === true && !st.joined && st.met && /(пойд|пошли|идём|идем|со мной|присоедин|вместе|помож)/.test(t)){ st.joined = true; tags.push([`${COMPANIONS[u.id].name} в отряде`, 'good']); }
  }
  // conditions
  if (Array.isArray(res.conditions_remove)) S.conditions = S.conditions.filter(c => { const gone = res.conditions_remove.includes(c.id); if (gone) tags.push([`снято: ${condName(c.id)}`, 'good']); return !gone; });
  if (Array.isArray(res.conditions_add)) for (const c of res.conditions_add.slice(0, 3)){
    const id = typeof c === 'string' ? c : c?.id; if (!CONDITIONS[id]) continue;
    S.conditions = S.conditions.filter(x => x.id !== id).concat([{ id, turns: c?.turns ? clampInt(c.turns, 1, 10) : 3 }]); tags.push([`состояние: ${condName(id)}`]);
  }
  const ex = clampInt(res.exhaustion_delta, -1, 1); if (ex){ S.exhaustion = Math.max(0, Math.min(6, S.exhaustion + ex)); tags.push([`истощение ${S.exhaustion}`]); }
  if (Array.isArray(res.remember)) for (const f of res.remember.slice(0, 1)){ const s = cleanStr(f, 160); if (s) S.chronicle.push(s); }
  if (S.chronicle.length > 30) S.chronicle.splice(0, S.chronicle.length - 30);
  if (res.chest_taken === true && S.place === 'lair' && !activeFoes().length) S.chestTaken = true;
  if (res.legacy_found === true) S.legacyFound = true;
  if (res.effect && !(check && check.kind === 'attack')){ addEffect(res.effect); if (FX_SOUND[res.effect]) SFX[FX_SOUND[res.effect]](); }
  // the fight: player's hit, then companions, then enemies
  combatRound(check, bag, lines);
  CRITICAL.fight = S.combat && !wasCombat; CRITICAL.hurt = S.hp < hpBefore;
  // Skrip peeks out by himself if nobody notices him
  S.turnsHere++;
  let peek = null;
  if (S.place === 'clearing' && !S.party.skrip.visible && S.turnsHere >= 3){ S.party.skrip.visible = true; peek = 'Ягодный куст шевелится, и из него высовывается тощий гоблин в бурой шапке. Он замирает с недогрызенной репой во рту.'; }
  // conditions tick
  S.conditions = S.conditions.map(c => c.turns ? { ...c, turns: c.turns - 1 } : c).filter(c => c.turns === null || c.turns > 0);
  if (S.hp <= 0 || S.exhaustion >= 6) res.game_over = 'death';
  // adventure clock and endings
  if (res.night_passes && !S.combat){ S.night = (S.night || 0) + 1; tags.push([`Ночь ${S.night}`]); S.journal.push({ who: 'sys', text: `Наступает ночь ${S.night}. Над водой снова звонит колокол.` }); }
  const ending = typeof res.ending === 'string' ? cleanStr(res.ending, 30) : null;
  if (ending) S.ending = ending;
  if (ADV_ID === 'cave' && res.game_over === 'win' && !S.chestTaken) res.game_over = null;
  if (ADV_ID !== 'cave' && res.game_over === 'win' && !S.ending) res.game_over = null;
  if (res.game_over === 'win' || res.game_over === 'death') S.over = res.game_over;
  if (S.hp !== hpBefore) tags.push([`${S.hp > hpBefore ? '+' : ''}${S.hp - hpBefore} здоровья`, S.hp > hpBefore ? 'good' : '']);
  // unsolicited companion lines only at critical moments, and rarely
  let dialogue = Array.isArray(res.dialogue) ? res.dialogue.filter(x => x && COMPANIONS[x.who] && x.text && (S.party[x.who].joined || (COMPANIONS[x.who].place === S.place && S.party[x.who].visible))) : [];
  const critical = CRITICAL.moved || CRITICAL.fight || (CRITICAL.hurt && S.hp <= S.maxHp/2) || res.chest_taken;
  dialogue = (critical || S.turn - S.lastBanter >= 6) ? dialogue.slice(0, 1).map(x => ({ id: x.who, text: cleanStr(x.text, 300) })) : [];
  if (dialogue.length) S.lastBanter = S.turn;
  // journal
  S.turn++;
  S.history.push({ p: text, n: narration + (lines.length ? ' [Бой: ' + lines.join(' ') + ']' : ''), d: dialogue.map(x => `${COMPANIONS[x.id].name}: ${x.text}`).join(' | ') }); if (S.history.length > 24) S.history.shift();
  if (narration || check) S.journal.push({ who: 'gm', text: narration, check, tags });
  if (peek) S.journal.push({ who: 'gm', text: peek });
  if (lines.length) S.journal.push({ who: 'combat', lines });
  dialogue.forEach(x => S.journal.push({ who: 'npc', id: x.id, text: x.text })); if (dialogue.length) SFX.talk();
  if (S.over === 'death'){
    S.journal.push({ who: 'sys', text: 'Ты погиб. Твои кости останутся здесь, и следующий искатель приключений их найдёт. Нажми «Новая игра».' });
    LEGACY.push({ place: S.place, cause: (lines.slice(-1)[0] || narration).slice(0, 160), items: S.inventory.filter(i => !/огнив|краюх/i.test(i)).slice(0, 4), turn: S.turn }); saveLegacy(); SFX.death();
  }
  if (S.over === 'win'){ S.journal.push({ who: 'sys', text: ADV_ID === 'cave' ? `Победа! Сокровище Серого Зуба твоё. Золото: ${S.gold}. Ходов: ${S.turn}.` : `Приключение окончено. Золото: ${S.gold}. Ходов: ${S.turn}. Нажми «Новая игра», чтобы сыграть ещё раз.` }); SFX.win(); }
  if (S.journal.length > 200) S.journal.splice(0, S.journal.length - 200);
  logTurn({ mode, player: text, raw: JSON.stringify(res).slice(0, 8000), combat: lines.join(' | ') });
  save(); renderAll();
}

/* ---------- questions to the master, out of character: no time passes ---------- */
const ASK_RE = /^\s*(мастер|гм|gm|дм|dm|ведущий)(?=[\s,:!.?\-—]|$)[\s,:!.\-—]*/i;
function askPrompt(q, bag, ck){
  const base = buildPrompt('(вопрос мастеру, не действие)', bag).split('\n\nДЕЙСТВИЕ ИГРОКА:')[0];
  return `${base}

СЕЙЧАС ИГРОК НЕ ДЕЙСТВУЕТ, А ЗАДАЁТ ВОПРОС ТЕБЕ КАК ВЕДУЩЕМУ (вне игры, время не идёт, враги не ходят).
Отвечай как опытный мастер настольной ролевой игры за столом: честно и по делу, только то, что персонаж может видеть, знать или понять отсюда. Можешь объяснить, как сработают правила и какие исходы возможны в общих чертах (например, кого заденет ловушка, если её задействовать). Не раскрывай скрытых врагов и чужие тайны без успешной проверки. Если ответ требует внимательности или знаний (Внимательность, Анализ, Природа, Магия, История, Проницательность…), ответь ТОЛЬКО {"pending":true,"check":{"kind":"check","skill":"...","ability":"...","dc":12}} — игра бросит кости и пришлёт итог.${ck ? `\nИТОГ ПРОВЕРКИ: ${checkLine(ck)}. Ответь с учётом этого итога.` : ''}
Ответ — JSON: {"answer":"2–5 предложений от лица мастера, можно на «ты»","remember":[]}

ВОПРОС ИГРОКА: «${q}»`;
}
/* ---------- talking to a character: a separate call in that character's own voice ---------- */
// how the player calls each character: the adventure may give a pattern, otherwise the stem of the first name
const NAME_RE = Object.fromEntries(Object.entries(COMPANIONS).map(([id, c]) => [id, c.call ? new RegExp(c.call, 'i') : { skrip: /скрип/i, tina: /тин[аеуыо]|полын/i }[id] || new RegExp(c.name.split(' ')[0].slice(0, Math.max(3, c.name.split(' ')[0].length - 1)), 'i')]));
const SPEECH_RE = /\?|[«"]|^\s*[-—]|^\s*(а |ну |ты |вы |эй|че|чё|что|как |кто|где|зачем|почему|откуда|расскаж|скажи|слушай|привет|здаров|давай|пошли|пойд|тогда|ладно|окей|ок |хорошо|да[ ,!.]|нет[ ,!.]|ого|спасибо|прости|извини|не бойся|успокойся|я не|я тебе|я хочу тебе|договорились|идёт|идет)/i;
const ACTION_RE = /(иду|захожу|вхожу|прохожу|атак|бью|ударю|убиваю|руб[лию]|осм[ао]тр|подбира|зажига|достаю|бросаю|крадусь|ищу|спускаюсь)/i;
function addressed(t){
  const low = t.toLowerCase();
  if (/(атак|бью|ударю|убиваю|руб[лию])/.test(low)) return null;
  const present = Object.keys(COMPANIONS).filter(id => { const p = S.party[id]; return p.alive && (p.joined || (COMPANIONS[id].place === S.place && p.visible)); });
  for (const id of present) if (NAME_RE[id].test(t)) return id;
  if (ACTION_RE.test(low) || !SPEECH_RE.test(t)) return null;
  const lastNpc = [...S.journal].reverse().find(x => x.who === 'npc' || x.who === 'you' || x.who === 'gm');
  if (lastNpc && lastNpc.who === 'npc' && present.includes(lastNpc.id)) return lastNpc.id;
  const met = present.filter(id => S.party[id].met || S.party[id].visible);
  return met.length === 1 ? met[0] : null;
}
const CHAR_EFFECTS = { tina: ['heal_player','cure_poison','pacify_ghost'], skrip: ['reveal_trap','reveal_passage','steal_crown'] };
function charPrompt(id, text){
  const c = COMPANIONS[id], p = S.party[id];
  const recent = S.history.slice(-4).map(h => `Игрок: ${h.p}\nПроисходило: ${h.n}`).join('\n');
  const talk = p.talk.slice(-10).map(x => `${x.who === 'you' ? 'Игрок' : c.name}: ${x.text}`).join('\n') || '(вы ещё не разговаривали)';
  const ghostHere = S.place === 'stairs' && here().enemies.some(e => e.type === 'ghost' && !e.hidden && !['dead','fled','pacified'].includes(e.state));
  return `Ты отыгрываешь персонажа ролевой игры. Ты — ${c.name}.
ВНЕШНОСТЬ: ${c.look}
ДОСЬЕ:
${c.bible}

СЕЙЧАС: место — «${placeInfo().name}» (${placeInfo().about}). ${p.joined ? 'Ты идёшь в отряде с игроком.' : p.met ? 'Ты уже знаком с игроком, но не в его отряде.' : 'Ты впервые разговариваешь с этим человеком. Ты был занят: ' + c.firstScene + '.'}
Твоё отношение к игроку: ${p.approval} (от −10 враждебно до +10 предан). Игрок — ${heroOf() ? `${heroOf().name}, ${heroOf().race}, ${heroOf().title}. ${heroOf().pitch} ${heroOf().rel[id] ? heroOf().rel[id].note : ''} Игрок` : 'воин'} в кольчуге с длинным мечом${torchLit() ? ' и горящим факелом' : ''}.${ghostHere ? ' Перед вами на лестнице висит Призрак Хранителя в капюшоне.' : ''}${S.combat ? ' Идёт бой!' : ''}
Что недавно происходило:
${recent || '(начало)'}
Ваш разговор до сих пор:
${talk}

КАК ОТВЕЧАТЬ:
- Говори живо, своим голосом из досье, 1–3 коротких фразы. Не повторяй уже сказанное. Можешь спрашивать, торговаться, отказывать, огрызаться, шутить, молчать в ответ на глупость.
- Ты не услужливый помощник. У тебя свои цели и страхи. Не соглашайся автоматически. Не принимай выдуманные игроком факты о тебе — поправляй их по досье.
- Тайны раскрывай только если доверяешь (отношение 3+) или получаешь выгоду.
- Вступаешь в отряд только если тебе это выгодно или ты доверяешь, и это прозвучало в разговоре.
- В "action" — короткая ремарка о том, что ты делаешь (третье лицо, без кавычек), или пусто.
- "effect" — только если это действительно произошло сейчас: ${(CHAR_EFFECTS[id] || []).join(', ')} или null.${id === 'tina' ? ' pacify_ghost — только если призрак перед тобой и ты с ним заговорила.' : ''}

Ответь ТОЛЬКО JSON: {"reply":"прямая речь","action":"","approval_delta":0,"join":null,"leave":null,"gives":null,"effect":null}

ИГРОК ГОВОРИТ ИЛИ ДЕЛАЕТ: «${text}»`;
}
function applyTalk(id, res, text){
  const c = COMPANIONS[id], p = S.party[id], tags = [];
  p.met = true; p.visible = true;
  const reply = cleanStr(res.reply, 500), action = cleanStr(res.action, 200);
  const ad = clampInt(res.approval_delta, -2, 2); if (ad){ p.approval = Math.max(-10, Math.min(10, p.approval + ad)); tags.push([`${c.name}: отношение ${fmtMod(ad)}`, ad > 0 ? 'good' : '']); }
  if (res.join === true && !p.joined){ p.joined = true; tags.push([`${c.name} в отряде`, 'good']); }
  if (res.leave === true && p.joined){ p.joined = false; tags.push([`${c.name} уходит из отряда`]); }
  const gift = itemName(res.gives); if (gift && !S.inventory.includes(gift)){ S.inventory.push(gift); tags.push([`+ ${gift}`]); SFX.pickup(); }
  const fx = (CHAR_EFFECTS[id] || []).includes(res.effect) ? res.effect : null;
  if (fx === 'heal_player' && !p.healUsed){ const h = d(8) + 2; p.healUsed = true; S.hp = Math.min(S.maxHp, S.hp + h); tags.push([`+${h} здоровья`, 'good']); addEffect('heal'); SFX.heal(); }
  if (fx === 'cure_poison' && hasCond('poisoned')){ S.conditions = S.conditions.filter(x => x.id !== 'poisoned'); tags.push(['снято: Отравлен', 'good']); }
  if (fx === 'pacify_ghost'){ const g = here().enemies.find(e => e.type === 'ghost' && !e.hidden && !['dead','fled','pacified'].includes(e.state)); if (g){ g.state = 'pacified'; S.combat = activeFoes().length > 0; S.chronicle.push('Тина узнала в призраке своего брата Ивара, и он упокоился.'); addEffect('magic'); SFX.magic(); tags.push(['Призрак упокоился', 'good']); } }
  if (fx === 'reveal_trap') S.chronicle.push('Скрип рассказал: третья плита в коридоре — ловушка с отравленными дротиками.');
  if (fx === 'reveal_passage') S.chronicle.push('Скрип рассказал о лазе за троном Серого Зуба, ведущем к сундуку.');
  p.talk.push({ who: 'you', text }, { who: id, text: reply }); if (p.talk.length > 24) p.talk.splice(0, p.talk.length - 24);
  S.turn++; S.turnsHere++;
  S.history.push({ p: text, n: `${c.name}${action ? ' (' + action + ')' : ''}: ${reply}` }); if (S.history.length > 24) S.history.shift();
  S.journal.push({ who: 'npc', id, text: reply, action, tags });
  SFX.talk();
  logTurn({ mode: 'talk:' + id, player: text, raw: JSON.stringify(res).slice(0, 4000) });
  save(); renderAll();
}

/* ---------- AI-drawn items for anything the library does not have ---------- */
const pendingArt = new Set();
async function requestItemArt(name){
  if (!sample || pendingArt.has(name) || (S.itemArt && S.itemArt[name]) || ITEM_ART.some(([re]) => re.test(name.toLowerCase()))) return;
  pendingArt.add(name);
  try {
    const res = await sample.json(`Нарисуй пиксельную иконку предмета «${name}» для тёмной фэнтези-игры, 12×12 пикселей. Ответь JSON {"rows":[ровно 12 строк по 12 символов]}. Символы: "." прозрачный, "0" чёрный, "1" тёмно-серый, "2" серый, "3" светло-серый, "4" почти белый, "5" тёмно-коричневый, "6" коричневый, "7" бежевый, "8" тёмно-красный, "9" красный, "a" оранжевый, "b" жёлтый, "c" тёмно-зелёный, "d" зелёный, "e" тёмно-синий, "f" голубой, "g" тёмно-фиолетовый, "h" фиолетовый. Предмет крупно по центру, узнаваемый силуэт, тени снизу-справа, блики сверху-слева, без фона.`, { modelTier: 'default', cache: { gcTime: 86400000 } });
    const rows = Array.isArray(res?.rows) ? res.rows.slice(0, 16).map(r => String(r).toLowerCase().replace(/[^.0-9a-h]/g, '.').slice(0, 16)) : null;
    if (rows && rows.some(r => /[0-9a-h]/.test(r))){ S.itemArt[name] = rows; save(); }
  } catch(e){} finally { pendingArt.delete(name); }
}

/* ---------- offline fallback: simple keyword engine so the page plays without Claude ---------- */
function cannedTalk(id, t){
  t = t.toLowerCase(); const p = S.party[id];
  if (/(пойд|присоедин|со мной|вместе)/.test(t)) return id === 'skrip'
    ? (p.approval >= 1 || /(корон|блестя|золот|еда|хлеб)/.test(t) ? { reply: 'Хе-хе. Скрип пойдёт. Но корона — Скрипу, и Гром — твой, не Скрипа!', join: true, approval_delta: 1 } : { reply: 'Ой-ой, просто так Скрип никуда не ходит. Что Скрипу с того?', approval_delta: 0 })
    : { reply: 'Вдвоём искать брата проще. Только грибы мне не топчи.', join: true, approval_delta: 1 };
  if (id === 'tina' && /(призрак|ивар|брат)/.test(t) && S.place === 'stairs') return { reply: 'Ивар?.. Это же его плащ. Ивар, это я, Тина. Медальон — видишь? Ты можешь идти домой.', action: 'снимает с шеи медальон с пером', effect: 'pacify_ghost', approval_delta: 1 };
  if (/(хлеб|краюх|ед[ауы])/.test(t) && id === 'skrip') return { reply: 'Хлебушек! Ладно, слушай: третья плита в коридоре — дырявые стены плюются иголками.', approval_delta: 2, effect: 'reveal_trap' };
  if (ADV_ID !== 'cave') return { reply: '…', action: 'молча смотрит на тебя: без ИИ-мастера персонажи не разговаривают', approval_delta: 0 };
  return id === 'skrip' ? { reply: 'Скрип ничего не знает. Скрип шёл мимо. Шишки собирал, вот.', action: 'прячет за спину недогрызенную репу' } : { reply: 'Не наступи на грибы. Если ищешь неприятности, они глубже.', action: 'не отрываясь срезает гриб' };
}
function offline(t, bag){
  t = t.toLowerCase();
  const pl = here(), alive = pl.enemies.filter(e => !e.hidden && !['dead','fled','pacified'].includes(e.state));
  const R = (narration, extra = {}) => Object.assign({ narration }, extra);
  const idx = ORDER.indexOf(S.place), next = ORDER[idx + 1], prev = ORDER[idx - 1];
  const compHere = Object.entries(COMPANIONS).filter(([id, c]) => c.place === S.place && S.party[id].alive && !S.party[id].joined);
  const talkTo = Object.entries(COMPANIONS).find(([id, c]) => t.includes(c.name.toLowerCase().slice(0, 4)));
  if (/брос.*факел/.test(t)) return hasItem(/факел/i) ? R('Ты швыряешь факел вперёд. Он гаснет в луже.', { remove_items: ['факел'], torch: 'out', effect: 'fire' }) : R('У тебя нет факела.');
  if (/туш/.test(t)) return R('Ты прижимаешь факел к камню. Шипение, дым, темнота.', { torch: 'out', effect: 'dust' });
  if (/факел|зажг|зажеч/.test(t) && !/(брос|кида|убира)/.test(t)) return hasItem(/факел/i) ? (torchLit() ? R('Факел и так горит.') : R('Ты берёшь факел в левую руку. Огниво высекает искру, промасленная тряпка вспыхивает.', { torch: 'lit', held_left: 'факел', effect: 'fire' })) : R('Факела нет.');
  if (/отдых|отдохн|привал/.test(t)) return alive.length ? R('Отдыхать рядом с врагами — плохая идея.') : R(S.place === 'clearing' ? 'Ты разводишь небольшой костёр и спишь до рассвета.' : 'Ты переводишь дух, прислонившись к стене.', { rest: S.place === 'clearing' ? 'long' : 'short' });
  if (/второе дыхание/.test(t)) return R('Ты стискиваешь зубы и находишь в себе силы.', { second_wind: true });
  if (/осм[ао]тр|смотр|огля|изуч|прислуш|ищу/.test(t)){
    const extra = {};
    if (S.place === 'clearing' && !S.party.skrip.visible) { extra.party = [{ id: 'skrip', visible: true, met: true }]; extra.dialogue = [{ who: 'skrip', text: 'Не бей! Скрип просто сидел в кустах. Скрип полезный, Скрип знает пещеру!' }]; extra.check = { kind: 'check', skill: 'Внимательность', dc: 10 }; }
    const hidden = pl.enemies.filter(e => e.hidden && e.state !== 'dead');
    if (hidden.length){ extra.enemies = pl.enemies.map(e => ({ ...e, hidden: false })); extra.check = { kind: 'check', skill: 'Внимательность', dc: 12 }; }
    const list = alive.map(e => e.name).concat(hidden.map(e => e.name));
    return R(`${placeInfo().name}: ${placeInfo().about}.${list.length ? ' Здесь: ' + list.join(', ') + '.' : ''}`, extra);
  }
  if (S.place === 'clearing'){
    const PICK = [[/камен|булыж/, 'камень'], [/трав|пучок/, 'пучок травы'], [/грязь|грязи|глин/, 'ком грязи'], [/палк|ветк|сук/, 'палка'], [/гриб/, 'гриб'], [/цвет/, 'цветок'], [/шишк/, 'шишка'], [/ягод/, 'ягоды'], [/лист/, 'лист'], [/мох/, 'мох'], [/червя|червь/, 'червяк'], [/вод/, 'горсть воды'], [/земл|песок/, 'горсть земли']];
    if (/(подбир|подним|рву|срыва|собира|набира|черпа|копа|нахож|лома|хвата|ловлю)/.test(t)){ const hit = PICK.find(([re]) => re.test(t)); if (hit) return R(`Ты подбираешь и кладёшь в сумку: ${hit[1]}.`, { add_items: [hit[1]] }); }
  }
  if (S.place === 'lair' && /(сундук|сокровищ)/.test(t) && /(откр|забира|бер|хвата)/.test(t)){
    if (alive.length) return R(`${alive[0].name} не даст тебе подойти к сундуку.`);
    return R('Крышка сундука поддаётся. Золото, камни и корона Серого Зуба — всё твоё!', { gold_delta: 300, add_items: ['корона Серого Зуба'], chest_taken: true, effect: 'sparkle', game_over: 'win' });
  }
  if (/(брос|кида|метн|швыр)/.test(t)){ const it = S.inventory.find(i => !/меч|факел|огнив|кольчуг/i.test(i) && mentions(t, i)); if (it){ const tgt = alive[0];
    return R(tgt ? `Ты швыряешь «${it}» в цель: ${tgt.name} отвлекается.` : `Ты бросаешь «${it}» вперёд.`, { remove_items: [it], held: null, effect: tgt ? 'strike' : 'dust' }); } }
  if (/(убираю|прячу).*(меч)/.test(t)) return R('Ты вкладываешь меч в ножны.', { held: null });
  if (/(достаю|беру|держу|вынимаю|обнажаю)/.test(t)){ if (/меч/.test(t)) return R('Ты обнажаешь длинный меч.', { held: 'длинный меч' }); const it = S.inventory.find(i => mentions(t, i)); if (it){ const lf = /лев/.test(t) || /щит/i.test(it); return R(`Ты берёшь в ${lf ? 'левую' : 'правую'} руку: ${it}.`, lf ? { held_left: it } : { held: it }); } }
  if (/атак|удар|бью|бить|руб|напада/.test(t)){
    const tgt = findTarget(''); if (!tgt) return R('Ты рубишь воздух. Никого.', { held: 'длинный меч' });
    const hit = bag.A === 20 || (bag.A !== 1 && bag.A + attackBonus() >= tgt.ac);
    return R(hit ? `Ты достаёшь врага клинком: ${tgt.name}.` : `Клинок проходит мимо: ${tgt.name} уворачивается.`, { held: 'длинный меч', check: { kind: 'attack', dc: tgt.ac, target: tgt.name } });
  }

  if (next && /(дальше|вперёд|вперед|вглубь|в пещеру|захож|вхож|спуска|вниз)/.test(t)){
    if (alive.some(e => e.state === 'angry')) return R(`${alive.find(e => e.state === 'angry').name} преграждает путь.`);
    if (S.place === 'stairs' && alive.some(e => e.type === 'ghost')) return R('Призрак Хранителя преграждает путь вниз.', { conditions_add: [{ id: 'frightened', turns: 2 }], effect: 'magic' });
    const pe = S.places[next].enemies.map(e => S.place === 'cave' && next === 'corridor' ? e : e);
    return R(`Ты идёшь дальше: ${PLACES[next].name}. ${PLACES[next].about}.`, { move: next, enemies: pe.map(e => next === 'stairs' && e.type === 'ghost' ? { ...e, hidden: false, state: 'angry' } : e) });
  }
  if (prev && /(назад|обратно|выхож|наружу|поднима)/.test(t)) return R(`Ты возвращаешься: ${PLACES[prev].name}.`, { move: prev, enemies: S.places[prev].enemies });
  if (/пукн|перд/.test(t)) return R('Звук гулко раскатывается под сводами. Где-то хихикнули.', { effect: 'smell' });
  if (/плю/.test(t)) return R('Ты сплёвываешь. Мир это запомнит.', { effect: 'spit', remember: ['Игрок плевался у входа'] });
  if (/крик|кричу|ору|эй/.test(t)) return R('Эхо катится вглубь и долго не стихает.', { effect: 'shout' });
  return R('Без ИИ-мастера игра понимает только простые действия: осмотреться, факел, подобрать, достать, бросить, атаковать, идти дальше или назад, позвать спутника, отдохнуть.');
}

/* =====================  UI  ===================== */
function renderHud(){
  $('locname').textContent = placeInfo().name;
  const h = $('hearts'); h.textContent = '';
  for (let i = 0; i < S.maxHp; i++){ const d = document.createElement('span'); d.className = 'heart' + (i < S.hp ? '' : ' empty'); h.append(d); }
  h.setAttribute('aria-label', `${S.hp} из ${S.maxHp}`);
  $('ac').textContent = S.ac; $('gold').textContent = S.gold;
  const insp = $('insp'); insp.className = 'badge' + (S.inspiration ? ' on' : ''); insp.firstChild.textContent = S.inspiration ? 'есть' : '—';
  const wind = $('wind'); wind.className = 'badge' + (S.secondWind ? ' on' : ''); wind.firstChild.textContent = S.secondWind ? 'готово' : 'потрачено';
  const lastStat = [...S.journal].reverse().find(e => e.check)?.check?.ability;
  const st = $('stats'); st.textContent = '';
  for (const [k, full] of STATS){
    const b = document.createElement('div'); b.className = 'stat-box' + (k === lastStat ? ' hit' : ''); b.title = full + (SAVE_PROF.includes(k) ? ' (спасбросок с мастерством)' : '');
    const kk = document.createElement('span'); kk.className = 'k'; kk.textContent = k;
    const v = document.createElement('span'); v.className = 'v'; v.textContent = S.stats[k];
    const m = document.createElement('span'); m.className = 'm'; m.textContent = fmtMod(mod(S.stats[k]));
    b.append(kk, v, m); st.append(b);
  }
  const conds = $('conds'); conds.textContent = '';
  const condList = S.conditions.map(c => [`${condName(c.id)}${c.turns ? ' (' + c.turns + ')' : ''}`, CONDITIONS[c.id].rule]);
  if (S.exhaustion) condList.push([`Истощение ${S.exhaustion}`, 'уровни 1–6; на 6 смерть']);
  if (!condList.length) condList.push(['нет', '']);
  condList.forEach(([t, rule]) => { const li = document.createElement('li'); li.textContent = t; li.title = rule; if (rule) li.className = 'cond'; conds.append(li); });
  const inv = $('inv'); inv.textContent = '';
  S.inventory.forEach(it => { const li = document.createElement('li'); li.textContent = it;
    if (torchLit() && /факел/i.test(it)){ li.className = 'lit'; li.textContent = it + ' (горит)'; }
    if (S.held === it){ li.className = 'held'; li.textContent = it + ' (в руке)'; }
    inv.append(li); });
  const party = $('party'); party.textContent = '';
  const known = Object.entries(COMPANIONS).filter(([id]) => S.party[id].joined);
  if (!known.length){ const s = document.createElement('span'); s.className = 'mode'; s.textContent = 'ты один'; party.append(s); }
  known.forEach(([id, c]) => {
    const p = S.party[id], el = document.createElement('div'); el.className = 'mate';
    const im = document.createElement('img'); im.src = portrait(id); im.alt = '';
    const tx = document.createElement('div'); const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = c.name;
    const sub = document.createElement('div'); sub.className = 'sub';
    sub.textContent = `${p.hp > 0 ? p.hp + '/' + c.hp + ' хп' : 'без сознания'} · КБ ${c.ac} · отношение ${fmtMod(p.approval)}`;
    tx.append(nm, sub); el.append(im, tx); party.append(el);
  });
  const hb = $('hero'); if (hb){ const H = heroOf(); hb.textContent = ''; const b = document.createElement('b'); b.textContent = H ? H.name : 'Безымянный воин'; const sp = document.createElement('span'); sp.textContent = H ? ` — ${H.race}, ${H.title}. ${H.perk}` : ' — свой герой, характеристики выпали на костях.'; hb.append(b, sp); }
  const sk = $('skills'); if (sk.dataset.hero !== String(S.hero)){ sk.textContent = ''; sk.dataset.hero = String(S.hero); } if (!sk.childElementCount) SKILLS.forEach(([n, ab]) => { const li = document.createElement('li'); li.className = 'skill' + (profSkills().includes(n) ? ' pro' : ''); li.textContent = `${n} ${fmtMod(skillBonus(n))}`; li.title = ab; sk.append(li); });
}
function renderJournal(){
  const j = $('journal'); j.textContent = '';
  for (const e of S.journal){
    if (e.who === 'npc'){
      const d = document.createElement('div'); d.className = 'say';
      const im = document.createElement('img'); im.src = portrait(e.id); im.alt = '';
      const box = document.createElement('div'); const who = document.createElement('div'); who.className = 'who'; who.textContent = COMPANIONS[e.id].name;
      box.append(who);
      if (e.action){ const ac = document.createElement('div'); ac.className = 'act'; ac.textContent = e.action; box.append(ac); }
      if (e.text){ const tx = document.createElement('div'); tx.className = 'txt'; tx.textContent = `«${e.text}»`; box.append(tx); }
      if (e.tags && e.tags.length){ const tg = document.createElement('div'); tg.className = 'tags'; e.tags.forEach(([t, k]) => { const s = document.createElement('span'); s.className = 'tag' + (k ? ' ' + k : ''); s.textContent = t; tg.append(s); }); box.append(tg); }
      d.append(im, box); j.append(d); continue;
    }
    if (e.who === 'ooc'){
      const d = document.createElement('div'); d.className = 'entry ooc';
      const h = document.createElement('div'); h.className = 'who'; h.textContent = 'Мастер (вне игры)'; d.append(h);
      if (e.check){ const c = document.createElement('div'); c.className = 'roll ' + (e.check.success ? 'ok' : 'fail'); c.textContent = checkLine(e.check); d.append(c); }
      d.append(document.createTextNode(e.text)); j.append(d); continue;
    }
    if (e.who === 'combat'){
      const d = document.createElement('div'); d.className = 'entry combat';
      e.lines.forEach(l => { const r = document.createElement('div'); r.textContent = l; d.append(r); }); j.append(d); continue;
    }
    if (e.who === 'gm' && !e.text && !e.check) continue;
    const d = document.createElement('div'); d.className = 'entry ' + e.who;
    if (e.check){ const c = document.createElement('div'); c.className = 'roll ' + (e.check.success ? 'ok' : 'fail'); c.textContent = checkLine(e.check); d.append(c, document.createElement('br')); }
    if (e.text) d.append(document.createTextNode(e.text));
    if (e.tags && e.tags.length){ const tg = document.createElement('div'); tg.className = 'tags'; e.tags.forEach(([t, k]) => { const s = document.createElement('span'); s.className = 'tag' + (k ? ' ' + k : ''); s.textContent = t; tg.append(s); }); d.append(tg); }
    j.append(d);
  }
  j.scrollTop = j.scrollHeight;
}
function renderAll(){ renderHud(); renderJournal(); }

const ERR = { not_granted:'Ты не разрешил странице обращаться к Claude, поэтому включён упрощённый режим.', sampling_disabled:'ИИ-мастер сейчас недоступен, поэтому включён упрощённый режим.', rate_limited:'Слишком много ходов подряд. Подожди немного и повтори.', session_expired:'Перезапусти игру.', refused:'Мастер отказался описывать это действие. Попробуй иначе.', invalid_json:'Мастер ответил неразборчиво. Повтори ход.', upstream_error:'Связь с мастером прервалась. Повтори ход.', limit_reached:'Мастер отдыхает: ходы на сегодня кончились. Завтра будут новые, или можно продолжить за звёзды.', busy_today:'Мастер устал: сегодня у костра слишком много героев. Бесплатная игра вернётся завтра, а за звёзды можно продолжить сейчас.', fair_use:'На сегодня мастер выдохся: даже безлимит отдыхает до завтра. Возвращайся завтра!', invalid_request:'Мастер не понял запрос. Повтори ход.' };
async function act(text){
  text = cleanStr(text, 240); if (!text || busy) return;

  if (S.over){ S.journal.push({ who: 'sys', text: 'Игра окончена. Нажми «Новая игра» вверху.' }); renderJournal(); return; }
  busy = true; $('go').disabled = true; $('cmd').value = '';
  S.journal.push({ who: 'you', text }); renderJournal();
  const bag = rollBag();
  const think = document.createElement('div'); think.className = 'entry thinking'; think.textContent = 'Мастер бросает кости и думает…'; $('journal').append(think); $('journal').scrollTop = 1e9;
  try {
    const tier = { modelTier: $('tier').value, cache: false };
    const who = ASK_RE.test(text) ? null : addressed(text);
    if (ASK_RE.test(text)){
      const q = text.replace(ASK_RE, '');
      let res = sample ? await sample.json(askPrompt(q, bag), tier) : { answer: 'Без ИИ-мастера я не могу отвечать на вопросы.' };
      let ck = null;
      if (sample && res && res.check && res.check.dc != null && !res.answer){ ck = resolveCheck(res.check, bag, false); SFX.dice(); res = await sample.json(askPrompt(q, bag, ck), tier); }
      think.remove();
      S.journal.push({ who: 'ooc', text: cleanStr(res && res.answer, 1200) || 'Мастер задумался и ничего не ответил. Спроси иначе.', check: ck });
      if (res && Array.isArray(res.remember) && res.remember[0]) S.chronicle.push(cleanStr(res.remember[0], 160));
      S.history.push({ p: 'Вопрос мастеру: ' + q, n: 'Мастер: ' + cleanStr(res && res.answer, 400) }); if (S.history.length > 24) S.history.shift();
      logTurn({ mode: 'ask', player: text, raw: JSON.stringify(res).slice(0, 4000) }); save(); renderAll();
    } else if (who){
      const res = sample ? await sample.json(charPrompt(who, text), tier) : cannedTalk(who, text);
      if (!res || typeof res !== 'object') throw { code: 'invalid_json' };
      think.remove(); applyTalk(who, res, text);
    } else {
      let res;
      if (sample){
        res = await sample.json(buildPrompt(text, bag), tier); if (!res || typeof res !== 'object') throw { code: 'invalid_json' };
        if (res.check && res.check.dc != null && (res.pending || !res.narration)){
          const insp = res.inspiration === 'use' && S.inspiration;
          const ck = resolveCheck(res.check, bag, insp); ck.insp = insp; SFX.dice();
          think.textContent = `${checkLine(ck)} — мастер описывает исход…`;
          const res2 = await sample.json(buildPrompt(text, bag, ck), tier); if (!res2 || typeof res2 !== 'object') throw { code: 'invalid_json' };
          if (insp) res2.inspiration = 'use';
          think.remove(); apply(res2, text, bag, 'gm2', ck);
        } else { think.remove(); apply(res, text, bag, 'gm'); }
      } else { res = offline(text, bag); think.remove(); apply(res, text, bag, 'offline'); }
    }
  } catch(e){
    think.remove();
    const code = e && e.code;
    if (['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed'].includes(code)){ sample = null; setMode(); }
    S.journal.pop(); S.journal.push({ who: 'sys', text: ERR[code] || 'Что-то пошло не так. Повтори ход.' });
    if ((code === 'limit_reached' || code === 'busy_today') && window.Platform) window.Platform.paywall(code);
    if (!code) console.error(e);
    logTurn({ mode: 'error', player: text, raw: String(code || e && e.message || e).slice(0, 500) });
    $('cmd').value = text; renderJournal();
  } finally { busy = false; $('go').disabled = false; if (!document.documentElement.classList.contains('app')) $('cmd').focus({ preventScroll: true }); }  // on phones the keyboard stays closed after a turn
}
function setMode(){
  const m = $('mode');
  if (sample){ m.className = 'mode'; m.textContent = 'Мастер на связи. Пиши что угодно — он бросит кости по правилам 5e и рассчитает последствия.'; $('tier').disabled = false; }
  else { m.className = 'mode off'; m.textContent = 'Мастер недоступен, включён упрощённый режим: работают только простые команды.'; $('tier').disabled = true; }
}
function restart(){ chooseHero(startGame); }
function startGame(heroId){
  S = newGame(heroId); parts = []; diceShow = null;
  const H = heroOf(), line = STATS.map(([k]) => `${k} ${S.stats[k]}`).join(', ');
  S.journal.push({ who: 'sys', text: H ? `Ты — ${H.name}, ${H.race}, ${H.title}. ${line}. Здоровье ${S.maxHp}, класс брони ${S.ac}.` : `Свой герой. Кости брошены (4d6, лучшие три): ${line}. Здоровье ${S.maxHp}, класс брони ${S.ac}.` });
  if (LEGACY.length) S.journal.push({ who: 'sys', text: `В этом мире уже погибали герои (${LEGACY.length}). Их кости где-то здесь.` });
  S.journal.push({ who: 'gm', text: INTRO.replace('Ты воин:', H ? `Ты — ${H.name}:` : 'Ты воин:') + (H && ADV_ID === 'cave' ? ' ' + H.intro : '') });
  save(); renderAll();
}
/* ---------- hero choice at the start of every game ---------- */
function chooseHero(done){
  if (document.querySelector('.hero-back')) return;
  const back = document.createElement('div'); back.className = 'hero-back';
  const box = document.createElement('div'); box.className = 'hero-pick'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Выбор героя');
  // adventure first: switching it starts that adventure from scratch
  const advRow = document.createElement('div'); advRow.className = 'adv-pick';
  Object.entries(ADVENTURES).sort(([a], [b]) => (a === 'cave') - (b === 'cave')).forEach(([id, A]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'adv-card' + (id === ADV_ID ? ' on' : '');
    const t = document.createElement('b'); t.textContent = A.title + (id === 'cave' ? ' (пробная)' : ''); const d = document.createElement('span'); d.textContent = A.pitch;
    b.append(t, d); b.setAttribute('aria-pressed', String(id === ADV_ID));
    b.addEventListener('click', () => { if (id === ADV_ID) return; try { localStorage.setItem(ADV_KEY, id); } catch(e){} location.reload(); });
    advRow.append(b);
  });
  const h0 = document.createElement('h2'); h0.textContent = 'Приключение'; box.append(h0, advRow);
  const h = document.createElement('h2'); h.textContent = 'Герой'; box.append(h);
  const opts = [...Object.entries(HEROES), ['custom', { name: 'Свой герой', title: 'случайный воин', race: '', pitch: 'Характеристики выпадут на костях. Без прошлого: историю напишешь сам.', stats: null, skills: FIGHTER_SKILLS }]];
  opts.forEach(([id, H]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hero-card';
    const nm = document.createElement('b'); nm.textContent = H.name;
    const tt = document.createElement('i'); tt.textContent = [H.race, H.title].filter(Boolean).join(', ');
    const pt = document.createElement('span'); pt.textContent = H.pitch;
    const st = document.createElement('small'); st.textContent = H.stats ? STATS.map(([k]) => `${k} ${H.stats[k]}`).join(' · ') : 'СИЛ ? · ЛОВ ? · ТЕЛ ? · ИНТ ? · МДР ? · ХАР ?';
    const sk = document.createElement('small'); sk.textContent = 'Навыки: ' + H.skills.join(', ');
    b.append(nm, tt, pt, st, sk);
    b.addEventListener('click', () => { back.remove(); done(id === 'custom' ? null : id); });
    box.append(b);
  });
  back.append(box); document.body.append(back);
  box.querySelector('button').focus();
}
/*__UI__*/
{ const h1 = document.querySelector('h1'); if (h1){ const w = ADV.title.split(' '); h1.textContent = w.slice(0, -1).join(' ') + ' '; const sp = document.createElement('span'); sp.textContent = w.slice(-1)[0]; h1.append(sp); } document.title = ADV.title; }
$('form').addEventListener('submit', e => { e.preventDefault(); act($('cmd').value); });
$('restart').addEventListener('click', restart);
$('sound').addEventListener('click', () => setSound(!AU.on));
$('music').addEventListener('click', () => setMusic(!MU.on));
if (freshStart){ renderAll(); restart(); } else renderAll();
requestAnimationFrame(frame);
(async () => { try { sample = window.claude ? await window.claude.use('sample') : null; } catch(e){ sample = null; } setMode(); })();
(async () => { try { DB = window.claude ? await window.claude.use('db') : null; } catch(e){ DB = null; } })();
})();
