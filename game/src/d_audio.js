
/* =====================  SOUND: everything synthesised with WebAudio, no files  ===================== */
const AU = { ctx: null, on: false, master: null, noise: null, bed: [], bedPlace: null, timer: null, nextDrum: 0 };
function audioInit(){
  if (AU.ctx) return true;
  const A = window.AudioContext || window.webkitAudioContext; if (!A) return false;
  try {
    AU.ctx = new A(); AU.master = AU.ctx.createGain(); AU.master.gain.value = .55; AU.master.connect(AU.ctx.destination);
    const len = AU.ctx.sampleRate*2, b = AU.ctx.createBuffer(1, len, AU.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random()*2 - 1;
    AU.noise = b; return true;
  } catch(e){ AU.ctx = null; return false; }
}
function tone({ f = 440, type = 'sine', dur = .2, vol = .2, attack = .004, to = null, when = 0 }){
  if (!AU.on) return; const c = AU.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(AU.master); o.start(t); o.stop(t + dur + .05);
}
function noise({ dur = .1, vol = .2, type = 'bandpass', f = 1000, q = 1, when = 0, attack = .002 }){
  if (!AU.on) return; const c = AU.ctx, t = c.currentTime + when, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = AU.noise; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(fl).connect(g).connect(AU.master); s.start(t, Math.random()); s.stop(t + dur + .05);
}
const SFX = {
  dice(){ for (let i = 0; i < 6; i++) noise({ dur: .03, vol: .25, f: 2500 + Math.random()*1500, q: 4, when: i*.07 + Math.random()*.03 }); },
  hit(){ noise({ dur: .18, vol: .45, type: 'lowpass', f: 900 }); tone({ f: 90, to: 40, dur: .25, vol: .5 }); },
  magic(){ tone({ f: 300, to: 1400, dur: .7, vol: .12, type: 'triangle' }); tone({ f: 900, to: 2400, dur: .6, vol: .05, when: .1 }); },
  heal(){ [523, 659, 784].forEach((f, i) => tone({ f, dur: .3, vol: .12, type: 'triangle', when: i*.09 })); },
  pickup(){ tone({ f: 660, dur: .08, vol: .12, type: 'square' }); tone({ f: 990, dur: .1, vol: .1, type: 'square', when: .07 }); },
  step(){ tone({ f: 70, to: 45, dur: .12, vol: .3 }); tone({ f: 65, to: 40, dur: .12, vol: .25, when: .28 }); },
  hurt(){ tone({ f: 320, to: 110, dur: .3, vol: .18, type: 'square' }); },
  torch(){ noise({ dur: .5, vol: .25, type: 'bandpass', f: 600, q: .7, attack: .05 }); },
  shout(){ noise({ dur: .4, vol: .2, type: 'bandpass', f: 500, q: 2 }); },
  win(){ [392, 494, 587, 784, 988].forEach((f, i) => tone({ f, dur: .35, vol: .14, type: 'square', when: i*.12 })); },
  death(){ tone({ f: 220, to: 55, dur: 1.6, vol: .2, type: 'sawtooth' }); },
  talk(){ for (let i = 0; i < 4; i++) tone({ f: 380 + Math.random()*160, dur: .05, vol: .06, type: 'square', when: i*.06 }); },
};
const FX_SOUND = { fire: 'torch', magic: 'magic', strike: 'hit', blood: 'hurt', shout: 'shout', heal: 'heal', sparkle: 'pickup', dust: 'step' };
function bedFor(place){
  // continuous layer per place: wind outside, low drone inside
  AU.bed.forEach(n => { try { n.stop(); } catch(e){} }); AU.bed = []; AU.bedPlace = place;
  if (!AU.on) return;
  const c = AU.ctx;
  const drone = (f, v) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.value = v; o.connect(g).connect(AU.master); o.start(); AU.bed.push(o); };
  if (place === 'clearing'){
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    s.buffer = AU.noise; s.loop = true; fl.type = 'bandpass'; fl.frequency.value = 450; fl.Q.value = .6; g.gain.value = .05;
    lfo.frequency.value = .12; lg.gain.value = 250; lfo.connect(lg).connect(fl.frequency);
    s.connect(fl).connect(g).connect(AU.master); s.start(); lfo.start(); AU.bed.push(s, lfo);
  } else {
    drone({ cave: 55, corridor: 49, stairs: 46, lair: 41 }[place] || 50, .035);
    drone(({ cave: 55, corridor: 49, stairs: 46, lair: 41 }[place] || 50)*1.5, .012);
  }
}
function ambientTick(){
  if (!AU.on) return;
  if (AU.bedPlace !== S.place) bedFor(S.place);
  const R = Math.random(), p = S.place;
  if (p === 'clearing' && R < .22) for (let i = 0; i < 3; i++) tone({ f: 4300 + Math.random()*300, dur: .03, vol: .03, when: i*.05 });
  if (p === 'cave' && R < .05){ const f = 900 + Math.random()*700; tone({ f, to: f*.6, dur: .18, vol: .08 }); tone({ f, to: f*.6, dur: .18, vol: .03, when: .22 }); }
  if (p === 'corridor' && R < .012) noise({ dur: .25, vol: .08, type: 'lowpass', f: 300 });
  if (p === 'stairs' && R < .035 && here().enemies.some(e => e.type === 'ghost' && e.state !== 'dead' && e.state !== 'fled')) noise({ dur: 1.4, vol: .05, type: 'bandpass', f: 1500 + Math.random()*600, q: 6, attack: .5 });
  if (p === 'lair'){ const now = AU.ctx.currentTime; if (now > AU.nextDrum){ tone({ f: 62, to: 40, dur: .3, vol: .3 }); if (Math.random() < .3) tone({ f: 62, to: 40, dur: .3, vol: .22, when: .18 }); AU.nextDrum = now + .9; } if (R < .25) noise({ dur: .02, vol: .05, f: 3000, q: 3 }); }
  if (torchLit() && R < .18) noise({ dur: .015 + Math.random()*.02, vol: .05, f: 2500 + Math.random()*2000, q: 2 });
}
function setSound(on){
  if (on && !audioInit()) return;
  AU.on = on; if (AU.ctx && on) AU.ctx.resume().catch(() => {});
  if (on){ bedFor(S.place); if (!AU.timer) AU.timer = setInterval(ambientTick, 100); }
  else { AU.bed.forEach(n => { try { n.stop(); } catch(e){} }); AU.bed = []; AU.bedPlace = null; }
  $('sound').setAttribute('aria-pressed', String(on)); $('sound').textContent = 'Звук: ' + (on ? 'вкл' : 'выкл');
  try { localStorage.setItem('grey-fang-sound', on ? '1' : '0'); } catch(e){}
}

/* ---------- music: a small chiptune sequencer, one theme per place ---------- */
const SONGS = {
  // root (midi), scale, chord roots per bar (scale degrees), tempo, mood
  clearing: { root: 57, scale: [0,2,3,5,7,8,10], prog: [0,5,3,4, 0,5,6,4], bpm: 76, lead: .05, arp: .025, bass: .07 },
  cave:     { root: 50, scale: [0,2,3,5,7,8,10], prog: [0,0,5,4, 0,3,5,4], bpm: 58, lead: .035, arp: .03, bass: .06, sparse: true },
  corridor: { root: 52, scale: [0,1,3,5,7,8,10], prog: [0,1,0,6, 0,1,3,1], bpm: 68, lead: .04, arp: .02, bass: .07 },
  stairs:   { root: 48, scale: [0,1,3,4,6,7,9,10], prog: [0,0,1,0, 3,2,1,0], bpm: 50, lead: .035, arp: .03, bass: .05, sparse: true },
  lair:     { root: 45, scale: [0,2,3,5,7,8,10], prog: [0,0,5,5, 3,3,4,4], bpm: 100, lead: .05, arp: .02, bass: .09, drums: true },
};
const MU = { on: false, timer: null, next: 0, step: 0, place: null, out: null };
const mtof = m => 440*Math.pow(2, (m - 69)/12);
function note(m, t, dur, vol, type, cutoff){
  const c = AU.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = type; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.value = cutoff || 2400;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(f).connect(g).connect(MU.out); o.start(t); o.stop(t + dur + .05);
}
function musicTick(){
  if (!MU.on || !AU.ctx) return;
  if (MU.place !== S.place){ MU.place = S.place; MU.step = 0; MU.next = AU.ctx.currentTime + .1; }
  const song = SONGS[S.place] || SONGS.clearing, eighth = 60/song.bpm/2, sc = song.scale, deg = i => song.root + sc[((i % sc.length) + sc.length) % sc.length] + 12*Math.floor(i/sc.length);
  while (MU.next < AU.ctx.currentTime + .35){
    const t = MU.next, step = MU.step, bar = Math.floor(step/8) % song.prog.length, pos = step % 8, chord = song.prog[bar];
    if (pos === 0 || pos === 4) note(deg(chord) - 12, t, eighth*3.6, song.bass, 'triangle', 900);
    if (!song.sparse || pos % 2 === 0) note(deg(chord + [0, 2, 4, 2][pos % 4]) + 12, t, eighth*.9, song.arp, 'square', 1600);
    const r = hash(step % (song.prog.length*8), 77);                      // the same melody every loop
    if ((pos === 0 || pos === 3 || pos === 6) && r > (song.sparse ? .55 : .3)) note(deg(chord + [0, 2, 4, 6, 7][(r*5)|0]) + 12, t, eighth*(pos === 6 ? 2 : 2.8), song.lead, 'sawtooth', 1300);
    if (song.drums){ if (pos % 4 === 0){ const o = AU.ctx.createOscillator(), g = AU.ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + .15); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.0001, t + .2); o.connect(g).connect(MU.out); o.start(t); o.stop(t + .25); }
      if (pos % 4 === 2){ const s = AU.ctx.createBufferSource(), f = AU.ctx.createBiquadFilter(), g = AU.ctx.createGain(); s.buffer = AU.noise; f.type = 'highpass'; f.frequency.value = 5000; g.gain.setValueAtTime(.04, t); g.gain.exponentialRampToValueAtTime(.0001, t + .05); s.connect(f).connect(g).connect(MU.out); s.start(t, Math.random()); s.stop(t + .06); } }
    MU.step++; MU.next += eighth;
  }
}
function setMusic(on){
  if (on && !audioInit()) return;
  MU.on = on;
  if (on){ AU.ctx.resume().catch(() => {}); if (!MU.out){ MU.out = AU.ctx.createGain(); MU.out.gain.value = .8; MU.out.connect(AU.ctx.destination); } MU.place = null; if (!MU.timer) MU.timer = setInterval(musicTick, 90); }
  $('music').setAttribute('aria-pressed', String(on)); $('music').textContent = 'Музыка: ' + (on ? 'вкл' : 'выкл');
  try { localStorage.setItem('grey-fang-music', on ? '1' : '0'); } catch(e){}
}
