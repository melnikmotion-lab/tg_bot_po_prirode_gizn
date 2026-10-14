
/* =====================  PIXEL RENDERER (240x135, fixed ramps, ordered dither)  ===================== */
const HANDS = __HANDS__;
// Painted art (ChatGPT, pixelized to the game palette). Places with a picture use it instead of the code-drawn scene.
const ART = __ART__;
const ARTIMG = { scene: {}, sprite: {} };
for (const k of Object.keys(ART.scene)){ const im = new Image(); im.src = ART.scene[k]; ARTIMG.scene[k] = im; }
for (const k of Object.keys(ART.sprite)){ const im = new Image(); im.src = ART.sprite[k]; ARTIMG.sprite[k] = im; }
const artData = {};
function artSceneData(place){
  if (artData[place]) return artData[place];
  const im = ARTIMG.scene[place]; if (!im || !im.complete || !im.naturalWidth) return null;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.drawImage(im, 0, 0, W, H); return (artData[place] = x.getImageData(0, 0, W, H).data);
}
// What the hero holds is shown in the hero bar, not drawn over the picture.
const SHOW_HANDS = false;
const ART_SPOT = { clearing: { goblin: [168, 120], companion: [96, 122] } };
const loadImg = src => { const im = new Image(); im.src = src; return im; };
const HAND = { lit: HANDS.torch_lit.map(loadImg), unlit: loadImg(HANDS.torch_unlit), fist: loadImg(HANDS.fist), fistL: loadImg(HANDS.fist_left) };
const hexc = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const BAYER = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v => (v+.5)/16);
const RAMP = {};
Object.entries({
  stone:['#120e1c','#211a33','#342a4d','#4d3f69','#6b5a86','#9483aa'],
  mortar:['#0a0812','#120e1c','#1c1629','#2a2140','#3a2f55','#4d3f69'],
  floor:['#120d0b','#261b15','#3d2b20','#59402d','#7a5a3e','#a07a52'],
  riser:['#08060a','#140f0c','#22190f','#33251a','#4a3626','#5e4632'],
  ceil:['#06050b','#0e0b16','#16112a','#1f1838','#2a2140','#342a4d'],
  dark:['#04030a','#07060e','#0b0914','#100c1a','#14101f','#181326'],
  banner:['#1a0608','#3a0c10','#5e1418','#86202a','#a83038','#c84a4a'],
  ghost:['#0f2140','#1d3456','#2f5c8f','#4f86c6','#86bce8','#c4e6ff','#ffffff'],
  steel:['#0e0d14','#1e1d27','#33323f','#4c4b5a','#6b6a7c','#908fa2','#bdbccc','#e6e6f0'],
  gold:['#2a1c06','#5a400e','#8e6a1c','#c49a30','#ecd06a'],
  wood:['#1e1008','#3a2010','#5a3418','#7a4a22','#9a6430'],
  flame:['#5a1206','#9a2208','#d8420e','#ff7a1a','#ffae2e','#ffde5a','#fff6c8'],
  sky:['#0e0820','#1e1040','#36185e','#5a2476','#8a3478','#c0506c','#ec8a6a'],
  mount:['#100c22','#1a1434','#261e48','#33285a','#40336c'],
  pine:['#05080e','#0a1216','#101c1e','#182824','#22362c'],
  cliff:['#14101c','#241c2e','#362a40','#4a3c54','#5e4e68','#7a6884'],
  grass:['#0c140c','#14240f','#1f3614','#2c4a1a','#3c6022','#527a2c','#6e9638'],
  dirt:['#1a120c','#2e2016','#463222','#5e4430','#7a5a40','#987452'],
  mud:['#120c08','#22160e','#342216','#463020','#5a3e2a','#6e4e36'],
  puddle:['#0a0e16','#141c2a','#22304a','#3a4e6e','#6a84a8','#a8c0e0'],
  bark:['#0a0604','#1a100a','#2a1a10','#3a2616','#4c321e'],
  bush:['#08120a','#102012','#1a301a','#264424','#345a2e'],
}).forEach(([k, v]) => RAMP[k] = v.map(hexc));
const OUTLINE = hexc('#07060b');
const img = ctx.createImageData(W, H), buf = img.data;
function px(x, y, rgb){ x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y*W + x)*4; buf[i] = rgb[0]; buf[i+1] = rgb[1]; buf[i+2] = rgb[2]; buf[i+3] = 255; }
function shade(ramp, l, x, y){ const r = RAMP[ramp]; const v = Math.max(0, Math.min(.999, l))*(r.length-1); const i = v|0; return r[Math.min(r.length-1, (v-i) > BAYER[(y&3)*4 + (x&3)] ? i+1 : i)]; }
let SEED = 0;
const hash = (x, y) => { let h = (x*374761393 + y*668265263 + SEED*1013904223) | 0; h = (h ^ (h >>> 13))*1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0)/4294967295; };
const lerp = (a, b, t) => a + (b - a)*t;
const clamp01 = v => Math.max(0, Math.min(1, v));
function vnoise(x, y){ const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy);
  return lerp(lerp(hash(xi, yi), hash(xi+1, yi), sx), lerp(hash(xi, yi+1), hash(xi+1, yi+1), sx), sy); }

/* ---------- scenes: per-pixel ramp (R), base light (B), light response (K), static lights (SL) ---------- */
function newScene(names){ return { names, R: new Uint8Array(W*H), B: new Float32Array(W*H), K: new Float32Array(W*H), SL: new Float32Array(W*H), special: new Map(), lights: [], flames: [], spots: [] }; }
function bakeLights(sc){
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++){ let s = 0; for (const l of sc.lights) s += l.i*Math.max(0, 1 - Math.hypot(x - l.x, (y - l.y)*1.15)/l.r); sc.SL[i] = s; }
  return sc;
}
function buildClearing(){
  const sc = newScene(['sky','mount','pine','cliff','dark','grass','dirt','mud','puddle','bark','bush']);
  let seed = 11; const rnd = () => (seed = (seed*16807) % 2147483647)/2147483647;
  const pines = (n, hmin, hmax) => Array.from({length:n}, () => ({ x: rnd()*W, h: hmin + rnd()*(hmax-hmin), w: 6 + rnd()*6 }));
  const back = pines(34, 10, 22), front = pines(16, 18, 34);
  const pineH = (list, x) => { let best = 0; for (const t of list){ const d = Math.abs(x - t.x)/t.w; if (d < 1) best = Math.max(best, t.h*Math.floor((1-d)*5)/5); } return best; };
  const cliffTop = x => 28 + 6*Math.sin(x*.07) + 3*Math.sin(x*.21 + 1) + Math.abs(x - 182)*.35;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = y*W + x; let r = 0, l = 0, k = .5;
    const gY = 74 + 2*Math.sin(x*.05), inCliff = x > 128 && x < 236 && y > cliffTop(x) && y < 92;
    const mdx = (x - 182)/22, mdy = (y - 84)/20, inMouth = mdx*mdx + mdy*mdy < 1 && y < 88;
    const teeth = inMouth && y < 70 + (x % 6 < 3 ? 6 - Math.abs(x % 6 - 1.5)*2 : 0);
    if (inCliff && !inMouth || teeth){ r = 3; l = .55 - (y - 30)/90 + (hash(x>>1, y>>1) - .5)*.25 + (x < 150 ? .1 : 0); }
    else if (inMouth){ r = 4; l = .15 - (y - 64)/120; }
    else if (y >= gY){
      const pl = lerp(96, 172, (135 - y)/51), pr = lerp(156, 192, (135 - y)/51), t = (y - gY)/(H - gY);
      if (y > 84 && x > pl && x < pr){ r = 6; l = .35 + t*.35 + (hash(x, y) - .5)*.3; if (hash(x>>1, y>>1) > .93) l += .3; }
      else { r = 5; l = .3 + t*.4 + (hash(x, y>>1) - .5)*.35; if (hash(x, y) > .9) l += .25; }
      const pdx = (x - 74)/24, pdy = (y - 112)/6;
      if (pdx*pdx + pdy*pdy < 1){ r = 7; l = .4 + (hash(x, y) - .5)*.3; const wx = (x - 74)/15, wy = (y - 112)/3.4; if (wx*wx + wy*wy < 1){ r = 8; l = .45 + (y < 111 ? .25 : 0); } }
      const bdx = (x - 64)/16, bdy = (y - 86)/11;
      if (bdx*bdx + bdy*bdy < 1 && y < 95){ r = 10; l = .35 + (1 - bdy)*.2 + (hash(x, y) - .5)*.35; if (hash(x*3, y*7) > .9) sc.special.set(i, hash(x, y) > .5 ? '#b02a2a' : '#5e1414'); }
      if (r === 5 && hash(x*5, y*3) > .985) sc.special.set(i, ['#ffd04a','#d6d4e0','#b02a2a'][(hash(x, y)*3)|0]);
    } else {
      const fp = pineH(front, x), bp = pineH(back, x), mh = 48 + 6*Math.sin(x*.05) + 4*Math.sin(x*.13 + 1);
      if (y > 78 - fp && fp > 0){ r = 2; l = .12 + (hash(x, y) - .5)*.1; }
      else if (y > 70 - bp && bp > 0){ r = 2; l = .3 + (hash(x, y) - .5)*.12; }
      else if (y > mh){ r = 1; l = .45 - (y - mh)/40; k = .1; }
      else { r = 0; l = y/62; k = .05; if (y < 26 && hash(x, y) > .992) sc.special.set(i, '#efe6ff'); }
    }
    if (x < 13 + Math.sin(y*.05)*2 || x > 229 - Math.sin(y*.04)*2){ r = 9; l = .3 + (hash(x, y>>2) - .5)*.4 + (x < 6 || x > 234 ? -.15 : 0); }
    sc.R[i] = r; sc.B[i] = clamp01(l); sc.K[i] = k;
  }
  sc.tufts = Array.from({length: 46}, (_, k) => ({ x: 18 + (((k*7919) % 1000)/1000*200)|0, y: 84 + (((k*104729) % 1000)/1000*48)|0, h: 2 + ((k*31) % 5) })).filter(t => !(t.x > 50 && t.x < 98 && t.y > 104 && t.y < 120));
  sc.spots = [[70, 102], [120, 108], [170, 106]];
  sc.outdoor = true;
  return bakeLights(sc);
}
function buildHall(kind){ // 'stairs' | 'corridor'
  const sc = newScene(['dark','stone','mortar','floor','ceil','banner','floor','riser']);
  const F = [[0,0,1,1],[.2,.16,.8,.86],[.33,.28,.67,.74],[.41,.36,.59,.64]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const nx = (x+.5)/W, ny = (y+.5)/H, i = y*W + x; let seg = -1;
    for (let s = 0; s < 3; s++){ const o = F[s], n = F[s+1]; if (nx >= o[0] && nx <= o[2] && ny >= o[1] && ny <= o[3] && !(nx > n[0] && nx < n[2] && ny > n[1] && ny < n[3])){ seg = s; break; } }
    let mat = 0, depth = 3;
    if (seg < 0){ if (kind === 'stairs' && ny > .5){ const r = ((ny - .5)/.14*6) % 1; mat = r < .4 ? 7 : 6; depth = 3.1 + (ny - .5)*4; } }
    else {
      const o = F[seg], n = F[seg+1];
      const tl = (nx-o[0])/(n[0]-o[0]), tr = (o[2]-nx)/(o[2]-n[2]), tt = (ny-o[1])/(n[1]-o[1]), tb = (o[3]-ny)/(o[3]-n[3]);
      const m = Math.min(tl, tr, tt, tb); depth = seg + m;
      if (m === tb){
        const u = (nx-.5)/(.5-.5*(1-m)) + .5;
        if (seg === 2 && kind === 'stairs'){ const r = (m*7) % 1; mat = r < .38 ? 7 : 6; }
        else { const rows = 4, fr = (m*rows) % 1, fc = ((u*(8-seg*2)) + (Math.floor(m*rows) % 2)*.5) % 1; mat = (fr < .12 || fc < .06) ? 2 : 3;
          if (kind === 'corridor' && seg === 1 && m > .3 && m < .62 && Math.abs(u - .5) < .09) mat = (fr < .12 || Math.abs(u - .5) > .08) ? 2 : 1; }   // pressure plate
      } else if (m === tt) mat = 4;
      else {
        const left = m === tl, t = left ? tl : tr;
        const top = o[1] + (n[1]-o[1])*t, bot = o[3] + (n[3]-o[3])*t, v = (ny - top)/(bot - top);
        const row = Math.floor(v*9), fr = (v*9) % 1, fc = ((m*3) + (row % 2)*.5) % 1;
        mat = (fr < .14 || fc < .07) ? 2 : 1;
        if (kind === 'stairs' && !left && seg === 0 && m > .25 && m < .55 && v > .12 && v < .6) mat = 5;
        if (kind === 'corridor' && seg === 1 && Math.abs(v - .48) < .03 && (Math.floor(m*14) % 3 === 0)) sc.special.set(i, '#04030a');   // dart holes
      }
    }
    sc.R[i] = mat; sc.B[i] = .04; sc.K[i] = (1 - Math.min(depth, 3.4)*.26)*(mat === 2 ? .75 : mat === 7 ? .55 : 1);
  }
  if (kind === 'stairs'){ sc.lights.push({ x: W*.07, y: H*.36, r: W*.2, i: .55 }); sc.flames.push({ x: (W*.07)|0, y: (H*.36)|0, s: 1, sconce: true }); }
  sc.spots = kind === 'corridor' ? [[96, 104], [146, 100], [120, 110]] : [[120, 92], [84, 110], [156, 110]];
  return bakeLights(sc);
}
function buildCave(){
  const sc = newScene(['dark','cliff','mud','puddle']);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = y*W + x, dx = (x - 120)/120, dy = (y - 58)/68, ang = Math.atan2(dy, dx);
    const ring = Math.hypot(dx, dy*1.25) + .06*Math.sin(ang*5 + 1) + .04*Math.sin(ang*11) + (vnoise(x/9, y/9) - .5)*.08;
    let r = 1, b = .05, k = clamp01((ring - .2)*1.5);
    if (ring < .2){ r = 0; b = .02; k = .15; }
    else if (dy > .12 && Math.abs(dx) < dy*1.9){ r = 2; b = .05 + (hash(x, y) - .5)*.06; if (vnoise(x/14, y/4) > .66) { r = 3; b = .08; } }
    else { b = .06 + (vnoise(x/6, y/6) - .5)*.1 + (Math.sin(ang*7 + ring*22) > .82 ? .05 : 0); k *= .8 + .4*hash(x>>1, y>>1); }
    // stalactites
    if (dy < -.05){ const c = x >> 2, len = hash(c, 7)*30*clamp01(-dy*2), cx = c*4 + 2; if ((y - 0) < len*(1 - Math.abs(x - cx)/2.5) && hash(c, 3) > .45){ r = 1; b = .08; k = .8; } }
    sc.R[i] = r; sc.B[i] = clamp01(b); sc.K[i] = k;
  }
  for (const [mx, my] of [[40, 120], [58, 112], [186, 116], [204, 124], [160, 98]]){
    for (let k = 0; k < 3; k++) sc.special.set((my - k)*W + mx, '#c8d8e0');
    for (let k = -2; k <= 2; k++){ sc.special.set((my - 3)*W + mx + k, '#6fe8ff'); if (Math.abs(k) < 2) sc.special.set((my - 4)*W + mx + k, '#c8fbff'); }
    sc.lights.push({ x: mx, y: my - 3, r: 22, i: .3 });
  }
  sc.spots = [[120, 52], [96, 44], [146, 46]];
  sc.companionSpot = [178, 114];
  return bakeLights(sc);
}
function buildLair(){
  const sc = newScene(['dark','stone','mortar','floor','ceil','banner','cliff','gold','steel']);
  const BX0 = 44, BY0 = 20, BX1 = 196, BY1 = 84;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = y*W + x; let r = 0, b = .04, k = 1;
    const leftTop = x*BY0/BX0, leftBot = H - x*(H - BY1)/BX0, rx = W - x, rightTop = rx*BY0/(W - BX1), rightBot = H - rx*(H - BY1)/(W - BX1);
    if (x >= BX0 && x <= BX1 && y >= BY0 && y <= BY1){ const row = Math.floor((y - BY0)/5), bx = (x - BX0 + (row % 2)*5) % 10; r = ((y - BY0) % 5 === 0 || bx === 0) ? 2 : 1; k = .85; }
    else if (x < BX0 && y > leftTop && y < leftBot){ const t = x/BX0, v = (y - leftTop)/(leftBot - leftTop), row = Math.floor(v*11); r = ((v*11) % 1 < .15 || ((t*4 + (row % 2)*.5) % 1) < .08) ? 2 : 1; k = .6 + t*.3; }
    else if (x > BX1 && y > rightTop && y < rightBot){ const t = rx/(W - BX1), v = (y - rightTop)/(rightBot - rightTop), row = Math.floor(v*11); r = ((v*11) % 1 < .15 || ((t*4 + (row % 2)*.5) % 1) < .08) ? 2 : 1; k = .6 + t*.3; }
    else if (y < BY0 + 1 || y < Math.min(leftTop, rightTop)){ r = 4; k = .4; }
    else { const t = (y - BY1)/(H - BY1), xl = lerp(BX0, 0, t), xr = lerp(BX1, W, t), u = (x - xl)/(xr - xl), rows = Math.floor(Math.pow(t, .7)*7);
      r = ((Math.pow(t, .7)*7) % 1 < .14 || ((u*9 + (rows % 2)*.5) % 1) < .07) ? 2 : 3; k = .7 + t*.4;
      if (hash(x, y) > .993) sc.special.set(i, '#bdbccc'); }
    // throne
    if (x >= 106 && x <= 134 && y >= 62 && y <= 88){ r = 6; b = .08 + (x < 110 || y < 64 ? .08 : 0); }
    if (x >= 110 && x <= 130 && y >= 34 && y < 62 && !(y < 38 && (x % 5) > 2)){ r = 6; b = .07 + (x < 113 ? .06 : 0); }
    if (x >= 110 && x <= 130 && y >= 64 && y <= 69){ r = 5; b = .1; }
    // banners
    for (const bx of [58, 168]) if (x >= bx && x <= bx + 14 && y >= 26 && y <= 62 + ((x - bx) % 4 === 0 ? 3 : 0)){ r = 5; b = .06; k = .9;
      const sx = x - bx - 7, sy = y - 38; if ((sx*sx + sy*sy < 10 && !(sy === 0 && Math.abs(sx) === 1)) || (sy > 3 && sy < 6 && Math.abs(sx) < 2)) sc.special.set(i, '#d6d4e0'); }
    // braziers
    for (const bx of [52, 188]){ if (Math.abs(x - bx) <= 5 && y >= 80 && y <= 83){ r = 8; b = .3; } if (Math.abs(x - bx) <= 1 && y > 83 && y < 100){ r = 8; b = .15; } }
    sc.R[i] = r; sc.B[i] = clamp01(b); sc.K[i] = k;
  }
  for (const bx of [52, 188]){ sc.lights.push({ x: bx, y: 74, r: 110, i: .62 }); sc.flames.push({ x: bx, y: 79, s: 2 }); }
  sc.spots = [[120, 74], [84, 112], [168, 112]];
  sc.typeSpot = { goblin_chief: [120, 74], orc: [84, 112] };
  sc.chestSpot = [158, 104];
  return bakeLights(sc);
}
const SCENES = {};
const FEATURE_SLOTS = { floor: [[62, 122], [184, 120], [120, 98], [90, 112], [156, 108]], wall: [[30, 70], [210, 70]], ceil: [[92, 0], [150, 0], [60, 0]] };
const FEATURE_KIND = { rubble:'floor', bones:'floor', barrel:'floor', crate:'floor', puddle:'floor', crystals:'floor', door:'wall', torch:'wall', chains:'ceil', roots:'ceil', web:'web' };
function placeFeatures(sc, feats){
  const used = { floor: 0, wall: 0, ceil: 0 }; sc.feats = [];
  for (const f of feats){
    const kind = FEATURE_KIND[f]; if (!kind) continue;
    if (kind === 'web'){ sc.feats.push({ f, x: 0, y: 0 }); continue; }
    const slot = FEATURE_SLOTS[kind][used[kind]++]; if (!slot) continue;
    sc.feats.push({ f, x: slot[0], y: slot[1] });
    if (f === 'torch'){ sc.lights.push({ x: slot[0], y: slot[1] - 18, r: 80, i: .55 }); sc.flames.push({ x: slot[0], y: slot[1] - 14, s: 1, sconce: true }); }
    if (f === 'puddle') for (let y = -5; y <= 5; y++) for (let x = -20; x <= 20; x++){ if ((x/20)**2 + (y/5)**2 < 1){ const i = (slot[1] + y)*W + slot[0] + x; if (i > 0 && i < W*H){ sc.R[i] = sc.names.indexOf('floor') >= 0 ? sc.names.indexOf('floor') : 0; sc.B[i] = .02; sc.special.set(i, (x + y*3) % 7 === 0 ? '#3a4e6e' : '#141c2a'); } } }
  }
}
// Neutral stand-in for a place that has no painted picture yet: sky and ground outdoors, dark walls indoors. Never a cave by mistake.
function buildPlaceholder(info){
  const sc = newScene(info.outdoor ? ['sky','mount','dirt','pine'] : ['dark','stone','floor','mortar']);
  const hz = 78;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = y*W + x;
    if (y < hz){ sc.R[i] = info.outdoor ? (y > hz - 10 - 6*Math.sin(x*.05) ? 1 : 0) : 1; sc.B[i] = info.outdoor ? y/hz*.6 : .12 + (hash(x>>2, y>>2) - .5)*.08; sc.K[i] = info.outdoor ? .1 : 1; }
    else { sc.R[i] = 2; sc.B[i] = .1 + (y - hz)/(H - hz)*.25 + (hash(x, y) - .5)*.1; sc.K[i] = 1; }
  }
  sc.spots = [[84, 124], [156, 124], [120, 118]]; sc.outdoor = !!info.outdoor;
  return sc;
}
function sceneOf(p){
  const z = S.zones[p] || { i: 0, f: [] }, key = `${p}:${z.i}:${(z.f || []).join(',')}`;
  if (SCENES[key]) return SCENES[key];
  SEED = p === 'lair' || p === 'clearing' ? 0 : z.i*17 + 3;
  const sc = ADV_ID !== 'cave' ? buildPlaceholder(PLACES[p] || {}) : p === 'clearing' ? buildClearing() : p === 'cave' ? buildCave() : p === 'lair' ? buildLair() : buildHall(p === 'stairs' && z.i > 0 ? 'stairs' : p);
  placeFeatures(sc, z.f || []); bakeLights(sc); SEED = 0;
  return SCENES[key] = sc;
}

/* ---------- sprites: 16-colour maps, auto outline + bevel ---------- */
const PAL = {'0':'#0e0b14','1':'#2b2836','2':'#4f4c5e','3':'#8a879a','4':'#d6d4e0','5':'#3a2212','6':'#6e4424','7':'#b0844e','8':'#5e1414','9':'#b02a2a','a':'#ff7a1a','b':'#ffd04a','c':'#24401e','d':'#4f8a34','e':'#1e3a66','f':'#7fb8f0','g':'#3e1a5a','h':'#7a3a9a','i':'#8aa45a','j':'#d8a07a','k':'#8a4a2a','l':'#3a5a2a','m':'#e0702a','n':'#9a3a14'};
const SPRITES = {
  goblin: ['......dddd......','.....diiiid.....','d...diiiiiid...d','dd.diibiibiid.dd','.ddii0ii0iiidd..','..ddiiiiiiidd...','....di4i4i4d....','.....ddddd......','....56666665....','...d56777765d...','..dd56677665dd3.','..d.56666665.d3.','..d.55666655.d3.','....5566665..0..','....55.55.55....','....dd....dd....','....dd....dd....','...ddd....ddd...'],
  goblin_chief: ['.....b.bb.b.....4.','.....bbbbbb....444','......iiii.....404','.....iiiiii.....7.','i...iibiibii...i7.','ii.iii0ii0iii.ii7.','.iiiiiiiiiiiiii.7.','...iii4i4i4ii...7.','....iiiiiiii....7.','...hhhhhhhhhh..i7.','..hhhgghhgghhhii7.','.ihhhhhbbhhhhh..7.','.i.hhhhhhhhhh...7.','...hhhhhhhhhh...7.','...hhhgghhhhh...7.','..hhhhhhhhhhhh..7.','..hhhhh..hhhhh..7.','....ii....ii......','...iii....iii.....'],
  orc: ['.......dddddd.......','......dddddddd......','.....dd0dddd0dd.....','.....ddbddddbdd.....','.....dddddddddd.....','.....d4dddddd4d.....','......d400004d......','.......dddddd.......','...2222222222222....','..d2323333333232d...','.ddd2333333333dddd..','.ddd.333333333.ddd..','.dd..2333333332.dd33','.dd..5555bb5555.dd343','.dd..5555555555.dd343','.cc..2222222222.cc.6.','.....2222222222....6.','.....5555..5555....6.','.....dddd..dddd......','.....dddd..dddd......','.....5555..5555......','....55555..55555.....'],
  bat: ['1..................1','11......1..1......11','111....111111....111','11111.11b11b11.11111','.111111111111111111.','..1111111111111111..','...11..111111..11...','........1111........','.........11.........'],
  skrip: ['.....kkkkkk.....','....kkkkkkkk....','d..kiiiiiiiik..d','dd.kiibiibiik.dd','.ddii0ii0iiidd..','..ddiiiiiiidd...','....di4ii4id....','.....ddddd......','....llllllll....','...dl6666666ld..','..dd.666666.dd..','..d..667766..d..','.....666666.....','.....55..55.....','.....dd..dd.....','....ddd..ddd....'],
  tina: ['......nnnnnn......','....nnmmmmmmnn....','...nmmmmmmmmmmn...','...nmmjjjjjjmmn...','.j.nmjjjjjjjjmn.j.','.jjnmj0jjjj0jmnjj.','..jnmjjjjjjjjmnj..','...nmjjj99jjjmn...','...nm.jjjjjj.mn...','...nn..llll..nn...','...nn.llllll.nn...','....llllllllllll..','...llllll77llllll.','..jlllll7777lllllj','..j.llll7777llll.j','..j.llll7777llll66','....llll7777lll666','....lllllllllll666','....llllllllllll..','.....llllllllll...','.....55......55...','.....55......55...','....555......555..'],
  chest: ['..55555555..','.5666666665.','566b6666b665','555555555555','bbbbbbbbbbbb','56666bb66665','56666b766665','566666666665','bbbbbbbbbbbb','555555555555'],
  skull: ['..3444443..','.344444443.','34444444443','34004440043','34004440043','34444044443','.344444443.','..34343434.'],
  bones: ['.33.......33','34433333343.','.33.......33'],
  shield: ['.....555555.....','...5566666655...','..566777777665..','.56677777777665.','.56777722777765.','5667772332777665','5677723443277765','5677723443277765','5667772332777665','.56777722777765.','.56677777777665.','..566777777665..','...5566666655...','.....555555.....'],
  rubble: ['.....22.....','...22332....','..2333432...','.223332332..','22332223322.','233322333221','122221222211'],
  barrel: ['.666666.','65777756','66666666','22222222','65777756','66666666','22222222','65777756','.666666.'],
  crate: ['7777777777','7666666667','7676666767','7667667667','7666776667','7667667667','7676666767','7666666667','7777777777'],
  door: ['..555555..','.56666665.','5666666665','5676666765','5666666665','5666666665','5676666765','5666666665','56666b6665','5666666665','5676666765','5666666665','5666666665','5555555555'],
  chains: ['.3.','3.3','.3.','3.3','.3.','3.3','.3.','3.3','.3.','3.3','.3.','3.3','.2.','222'],
  crystals: ['...f....','..f4f..f','..fff.f4','.f4ff.ff','.ffff.ff','fff4ffff','eeeeeeee'],
  roots: ['6..6.6.6','6.6..6.6','.66.6.6.','..6.6..6','..6..6..','..6.....'],
};
const SCALE = { goblin:2, goblin_chief:2, orc:2, bat:1, skrip:2, tina:2, chest:2, skull:1, bones:1, rubble:2, barrel:2, crate:2, door:2, chains:2, crystals:2, roots:2 };
const sprCache = new Map();
function spriteCanvas(rows){
  const key = rows.join('|'); if (sprCache.has(key)) return sprCache.get(key);
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2; const g = c.getContext('2d');
  const at = (x, y) => (y >= 0 && y < h && x >= 0 && x < rows[y].length && PAL[rows[y][x]]) ? rows[y][x] : null;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++){
    const ch = at(x, y);
    if (!ch){ if (at(x+1,y) || at(x-1,y) || at(x,y+1) || at(x,y-1)){ g.fillStyle = '#07060b'; g.fillRect(x+1, y+1, 1, 1); } continue; }
    let [r, gg, b] = hexc(PAL[ch]);
    if (!at(x, y-1)) { r += (255-r)*.22; gg += (255-gg)*.22; b += (255-b)*.22; }
    else if (!at(x, y+1) || !at(x+1, y)) { r *= .72; gg *= .72; b *= .72; }
    g.fillStyle = `rgb(${r|0},${gg|0},${b|0})`; g.fillRect(x+1, y+1, 1, 1);
  }
  sprCache.set(key, c); return c;
}
const portraitCache = {};
function portrait(id){
  if (portraitCache[id]) return portraitCache[id];
  if (ART.portrait && ART.portrait[id]) return portraitCache[id] = ART.portrait[id];
  if (!SPRITES[id]){ // no art yet: the first letter of the name
    const c = document.createElement('canvas'); c.width = 20; c.height = 20; const g = c.getContext('2d');
    g.fillStyle = '#1d1834'; g.fillRect(0, 0, 20, 20); g.fillStyle = '#ecdfc6'; g.font = '600 13px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(((COMPANIONS[id] && COMPANIONS[id].name) || id)[0], 10, 11); return portraitCache[id] = c.toDataURL();
  }
  const rows = SPRITES[id].slice(0, 9), c0 = spriteCanvas(rows);
  const c = document.createElement('canvas'); c.width = 20; c.height = 20; const g = c.getContext('2d');
  g.fillStyle = '#1d1834'; g.fillRect(0, 0, 20, 20); g.drawImage(c0, ((20 - c0.width)/2)|0, 20 - c0.height);
  return portraitCache[id] = c.toDataURL();
}

/* ---------- items in the right hand ---------- */
const ITEM_ART = [
  [/трав|сено|пучок|стебел|осок/, ['..d...d..d..','..d..dd.dd..','.dd..d..d..d','.d.dd.dd.dd.','dd.d..d..d.d','.dcd.cd.dcd.','..cdcdcdcd..','...ccdcdc...','....5665....','...566665...']],
  [/грязь|грязи|глин|ком /, ['....5555....','..55666655..','.5666776665.','566676666665','566666667665','.5566666655.','...555555...','..5....5....']],
  [/палк|ветк|сук|хворост|прут/, ['..........6.','.........67.','........675.','.......675..','......675...','....67675...','...675.5....','..675.......','.675........','675.........','75..........']],
  [/цвет|ромаш|одуван|колокольч/, ['...9..9....','..999999...','.99bbb99...','..9bbb9....','..99999....','....d......','...dd.dd...','....d.d....','....dd.....','....d......']],
  [/шишк/, ['....55....','...5675...','..567765..','..576675..','.56766765.','.57677675.','..576765..','..567765..','...5765...','....55....']],
  [/ягод|черник|малин|брусник|земляник/, ['....d.....','...dcd....','..9.d.9...','.98989898.','.98e8e898.','..989898..','...8989...','....88....']],
  [/лист/, ['........dd','......ddcd','....dddcd.','..ddddcdd.','.dddcddd..','ddcdddd...','dcddd.....','5dd.......','5.........']],
  [/мох|лишай/, ['..dcd.dc..','.dcdcdcdc.','dcdcdcdcdc','cdcdcdcdcd','dcdcdcdcdc','.c5c5c5c5.']],
  [/червь|червяк|личинк/, ['......99..','.....9889.','..99.98...','.9889.9...','.9..98....']],
  [/вод|роса|лужи/, ['....f.....','...fff....','..ff4ff...','.fffffff..','.ffeffff..','..fffff...']],
  [/земл|песок|почв|пыль/, ['...7777...','..776677..','.76767667.','7766676677','.77777777.']],
  [/камен|булыж|галь|огнив|кремен/, ['....1111....','..11222211..','.1223332221.','.1233443321.','122333333221','122233332221','112222222211','.1112222111.','...111111...']],
  [/кост|ребр|берцов/, ['.33......33.','3443....3443','344433334443','.3444444443.','.3444444443.','344433334443','3443....3443','.33......33.']],
  [/ключ/, ['..bbb.......','.b777b......','.b7..7bbbbbb','.b7..7777b7b','.b777b...b.b','..bbb.......']],
  [/зель|склян|флакон|бутыл|эликсир/, ['....55....','....66....','...3443...','..39ff93..','.3999b993.','.39999993.','.38999983.','..388883..','...3333...']],
  [/монет|золот/, ['...bbbb...','..b7bbbb..','.b7bb77bb.','.b7b7bb7b.','.bbb7bb7b.','.bbbb77bb.','..bbbbbb..','...7777...']],
  [/кинжал|нож/, ['..........4','.........43','........43.','.......43..','......43...','..b..43....','...b43.....','...6b......','..6..b.....','.6.........','5..........']],
  [/свеч/, ['....b.....','...bab....','...aba....','....1.....','...444....','...443....','...443....','...443....','..34443...','..22222...']],
  [/череп/, SPRITES.skull],
  [/гриб/, ['...9999....','.99b99b99..','9999999999.','99b999b999.','.99999999..','....44.....','....43.....','....43.....','...4443....']],
  [/хлеб|краюх|лепёш|лепеш/, ['..777777...','.76666667..','7666776667.','7676666767.','76666666667','.666666666.','..5555555..']],
  [/верёв|верев|канат/, ['..666666..','.67777776.','6766666676','6767777676','6767667676','6766776676','.67777776.','..666666..']],
  [/щит/, ['.....555555.....','...5566666655...','..566777777665..','.56677777777665.','.56777722777765.','5667772332777665','5677723443277765','5677723443277765','5667772332777665','.56777722777765.','.56677777777665.','..566777777665..','...5566666655...','.....555555.....']],
  [/корон/, ['.b..b..b..b.','.bb.bb.bb.bb','.bbbbbbbbbbb','.b9bbfbb9bb.','.bbbbbbbbbb.','.7777777777.']],
];
const SACK = ['....66....','...6556...','..666666..','.67777776.','6777777776','6777777776','.67777776.','..666666..'];
function heldArt(name){
  const low = name.toLowerCase(), lib = ITEM_ART.find(([re]) => re.test(low));
  return lib ? lib[1] : (S.itemArt && S.itemArt[name]) || SACK;
}

/* ---------- ghost: procedural hooded wraith ---------- */
function drawGhost(e, fi, cx0){
  const ph = fi*2*Math.PI/3, Hh = 62, top = 26 + Math.round(Math.sin(ph)*1.5);
  const hurt = e.state === 'hurt' && fi !== 1;
  for (let y = top; y < top + Hh; y++){
    const v = (y - top)/Hh, cx = cx0 + 2.5*Math.sin(ph + v*3)*v;
    let hw;
    if (v < .3){ const dy = (v - .19)/.19; hw = dy < 1 ? 12.5*Math.sqrt(Math.max(0, 1 - dy*dy)) : 0; if (v > .19) hw = Math.max(hw, 11); }
    else hw = 10 + 15*Math.min(1, (v - .3)/.6) + 1.4*Math.sin(v*11 + ph);
    for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++){
      const d = (x + .5 - cx)/Math.max(1, hw);
      if (Math.abs(d) > 1) continue;
      if (v > .84 && (v - .84) > .16*(.5 + .5*Math.sin((x - cx0)*.75 + ph*2))) continue;
      if (v > .58 && BAYER[(y&3)*4 + (x&3)] < (v - .58)*1.5) continue;
      const fy = top + Hh*.21, fdx = (x + .5 - cx)/6.5, fdy = (y + .5 - fy)/7.5;
      if (v < .32 && fdx*fdx + fdy*fdy < 1){
        const eye = Math.abs(y - (fy|0)) < 1 && (Math.abs(x - (cx - 3)) < 1.5 || Math.abs(x - (cx + 3)) < 1.5);
        px(x, y, eye ? hexc(hurt ? '#ffffff' : '#ffe066') : RAMP.ghost[0]); continue;
      }
      let l = .78 - v*.3 - Math.max(0, d)*.3 + Math.max(0, -d)*.12 + .1*Math.sin((x - cx)*.9 + v*5 + ph);
      if (Math.abs(d) > .86) l -= .18;
      px(x, y, hurt ? RAMP.ghost[6] : shade('ghost', l, x, y));
    }
  }
}

/* ---------- sword ---------- */
const LEFT_X = -4, HAND_Y = H - 116 + 14, RIGHT_X = W - 60;
function drawSword(lightAt){
  const bx = 211, by = HAND_Y + 72, tx = 158, ty = 16, L = Math.hypot(tx - bx, ty - by), ux = (tx - bx)/L, uy = (ty - by)/L;
  for (let y = Math.min(by, ty) - 12; y <= Math.max(by, ty) + 14; y++) for (let x = Math.min(bx, tx) - 12; x <= Math.max(bx, tx) + 12; x++){
    const rx = x + .5 - bx, ry = y + .5 - by, a = rx*ux + ry*uy, d = -rx*uy + ry*ux, lit = .55 + .45*lightAt(x, y);
    const wB = 4.3*Math.min(1, (L - a)/(L*.14));
    if (a > 1.5 && a < L && Math.abs(d) < wB + 1){ if (Math.abs(d) >= wB){ px(x, y, OUTLINE); continue; } px(x, y, shade('steel', (Math.abs(d) < .6 ? .95 : d < 0 ? .78 : .42)*lit, x, y)); continue; }
    if (a >= -1.5 && a <= 1.5 && Math.abs(d) < 10){ px(x, y, Math.abs(d) > 9 || Math.abs(a) > 1 ? OUTLINE : shade('gold', (a < 0 ? .85 : .5)*lit, x, y)); continue; }
    if (a < -1.5 && a > -14 && Math.abs(d) < 2.2) px(x, y, Math.abs(d) > 1.5 ? OUTLINE : shade('wood', .55*lit, x, y));
  }
}

/* ---------- particles ---------- */
let parts = [], shakeUntil = 0, shakeAmp = 0;
const EFFECTS = ['fire','magic','strike','blood','smell','shout','splash','spit','sparkle','dust','heal'];
function addEffect(type){
  if (!EFFECTS.includes(type)) return;
  const R = Math.random, now = performance.now(), add = (n, f) => { for (let i = 0; i < n; i++) parts.push(Object.assign({ life: 0 }, f(i))); };
  switch (type){
    case 'fire': add(30, () => ({ x: 30 + R()*14, y: 50 + R()*10, vx: (R()-.5)*.4, vy: -.6 - R()*.8, max: 900 + R()*500, col: RAMP.flame[3 + (R()*4|0)] })); break;
    case 'magic': add(36, i => { const a = i/36*Math.PI*2; return { x: 120 + Math.cos(a)*22, y: 55 + Math.sin(a)*22, vx: -Math.sin(a)*.8, vy: Math.cos(a)*.8 - .1, max: 1000, col: R() < .5 ? RAMP.ghost[5] : RAMP.ghost[6] }; }); break;
    case 'heal': add(28, () => ({ x: 70 + R()*100, y: 120 + R()*10, vx: 0, vy: -.5 - R()*.6, max: 1200, col: hexc(R() < .5 ? '#7fbf5a' : '#d6f0a0') })); break;
    case 'strike': add(26, () => { const a = R()*Math.PI*2, s = .8 + R()*1.8; return { x: 120, y: 70, vx: Math.cos(a)*s, vy: Math.sin(a)*s, max: 450 + R()*300, col: R() < .5 ? hexc('#fff6c8') : hexc('#ffd04a') }; }); shakeUntil = now + 250; shakeAmp = 3; break;
    case 'blood': add(16, () => ({ x: 115 + R()*10, y: 66, vx: (R()-.5)*1.2, vy: -R()*1.2, g: .08, max: 900, col: hexc(R() < .5 ? '#86202a' : '#5e1414') })); shakeUntil = now + 200; shakeAmp = 2; break;
    case 'smell': add(22, () => ({ x: 90 + R()*60, y: 128 + R()*6, vx: (R()-.5)*.25, vy: -.25 - R()*.3, max: 1600, col: hexc(R() < .5 ? '#4f8a34' : '#24401e'), big: 1 })); break;
    case 'shout': add(30, () => ({ x: R()*W, y: R()*10, vx: 0, vy: .5 + R()*.6, max: 1200, col: hexc('#6b5a86') })); shakeUntil = now + 400; shakeAmp = 2; break;
    case 'splash': add(18, () => ({ x: 110 + R()*20, y: 120, vx: (R()-.5)*1.4, vy: -1 - R()*1.5, g: .09, max: 800, col: hexc('#7fb8f0') })); break;
    case 'spit': add(6, i => ({ x: 120 + i, y: 132, vx: .1, vy: -1.6 - i*.05, g: .05, max: 900, col: hexc('#d6f0ff') })); break;
    case 'sparkle': add(16, () => ({ x: 30 + R()*180, y: 20 + R()*90, vx: 0, vy: 0, max: 800 + R()*600, col: hexc('#ffd04a'), blink: 1 })); break;
    case 'dust': add(40, () => ({ x: R()*W, y: R()*20, vx: (R()-.5)*.2, vy: .4 + R()*.5, max: 1500, col: hexc('#4d3f69') })); break;
  }
}
function drawParticles(dt){
  parts = parts.filter(p => (p.life += dt) < p.max);
  for (const p of parts){
    const k = dt/16; p.vy += (p.g || 0)*k; p.x += p.vx*k; p.y += p.vy*k;
    if (p.blink && (p.life/120|0) % 2) continue;
    if (p.life/p.max > .7 && BAYER[((p.y|0)&3)*4 + ((p.x|0)&3)] < (p.life/p.max - .7)*3) continue;
    px(p.x, p.y, p.col); if (p.big){ px(p.x+1, p.y, p.col); px(p.x, p.y+1, p.col); }
  }
}

/* ---------- dice on screen (pixel d20) ---------- */
const DIGITS = ['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001010010010','111101111101111','111101111001111'];
function drawNumber(n, x, y, col){ String(n).split('').forEach((ch, k) => { const d = DIGITS[+ch]; for (let j = 0; j < 15; j++) if (d[j] === '1') px(x + k*4 + j % 3, y + (j/3|0), col); }); }
function drawD20(cx, cy, n, state){ // state: 'roll' | 'keep-ok' | 'keep-fail' | 'drop'
  const col = state === 'drop' ? hexc('#4f4c5e') : state === 'keep-ok' ? hexc('#7fbf5a') : state === 'keep-fail' ? hexc('#d4483a') : hexc('#ecd06a');
  const fill = state === 'drop' ? hexc('#141126') : hexc('#241c3e');
  for (let y = -8; y <= 8; y++){ const hw = 8 - Math.max(0, Math.abs(y) - 3)*.9; for (let x = -Math.round(hw); x <= Math.round(hw); x++){ const edge = Math.abs(x) >= Math.round(hw) - .5 || Math.abs(y) === 8; px(cx + x, cy + y, edge ? col : fill); } }
  const s = String(n), w = s.length*4 - 1; drawNumber(n, cx - (w >> 1), cy - 2, state === 'drop' ? hexc('#8a879a') : hexc('#ffffff'));
}
let diceShow = null;
function drawDice(t){
  if (!diceShow) return;
  const age = t - diceShow.t0; if (age > 2600){ diceShow = null; return; }
  const rolling = age < 600, r = diceShow;
  r.dice.forEach((v, k) => {
    const x = W - 14 - (r.dice.length - 1 - k)*20, y = 13;
    if (rolling) drawD20(x, y, 1 + (Math.random()*20|0), 'roll');
    else drawD20(x, y, v, k === r.keep ? (r.success ? 'keep-ok' : 'keep-fail') : 'drop');
  });
}

/* ---------- condition overlays ---------- */
const overlayCache = {};
function condOverlay(kind){
  if (overlayCache[kind]) return overlayCache[kind];
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const col = { poisoned:'#3f7a2a', frightened:'#5e1418', charmed:'#b0407a', restrained:'#4a2a6a', blinded:'#000000' }[kind];
  g.fillStyle = col;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const d = Math.min(x, y, W - 1 - x, H - 1 - y), bay = BAYER[(y&3)*4 + (x&3)];
    const cover = kind === 'blinded' ? .9 - .25*clamp01(1 - Math.hypot(x - W/2, y - H/2)/60) : clamp01(1 - d/16)*.75;
    if (bay < cover) g.fillRect(x, y, 1, 1);
  }
  return overlayCache[kind] = c;
}

/* ---------- frame ---------- */
let lastT = 0;
function render(t, dt){
  const fi = Math.floor(t/333) % 3, sc = sceneOf(S.place), flick = [1, .92, 1.06][fi];
  const lit = torchLit(), tx = SHOW_HANDS ? LEFT_X + 34 : W/2, ty = SHOW_HANDS ? HAND_Y + 30 : H - 6;  // without hands the light comes from the hero, bottom centre
  const torchAt = (x, y) => lit ? Math.max(0, 1 - Math.hypot(x - tx, (y - ty)*1.25)/(W*.78))**1.25*[1, .9, 1.06][fi] : 0;
  const lightAt = (x, y) => { x |= 0; y |= 0; const i = Math.max(0, Math.min(W*H - 1, y*W + x)); return Math.min(1.2, sc.B[i] + sc.K[i]*(torchAt(x, y) + sc.SL[i]*flick)) + (sc.outdoor ? .55 : 0); };
  const art = artSceneData(S.place);
  if (art){
    // painted scene: in a dark place almost nothing is visible without fire; the torch lights a circle around the hero
    const light = placeInfo().light, amb = light === 'dark' ? .06 : light === 'dim' ? .45 : .82, gain = light === 'dark' ? 1.6 : .55;
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++){
      const L = torchAt(x, y), k = amb + L*gain, j = i*4;
      buf[j] = Math.min(255, art[j]*k + L*26); buf[j+1] = Math.min(255, art[j+1]*k + L*10); buf[j+2] = Math.min(255, art[j+2]*k); buf[j+3] = 255;
    }
  } else for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++){
    const sp = sc.special.get(i); if (sp){ px(x, y, hexc(sp)); continue; }
    px(x, y, shade(sc.names[sc.R[i]], sc.B[i] + sc.K[i]*(torchAt(x, y)*(sc.outdoor ? .5 : 1.05) + sc.SL[i]*flick), x, y));
  }
  if (!art && sc.tufts) for (const tf of sc.tufts) for (let k = 0; k < tf.h; k++){ px(tf.x, tf.y - k, shade('grass', .55 + k*.06 + torchAt(tf.x, tf.y)*.4, tf.x, tf.y - k)); }
  const FL = [['..2..','.232.','.343.','23432','34543','.454.','.353.','..2..'],['.2...','.32..','.343.','23442','34543','.454.','.353.','..2..'],['...2.','..23.','.343.','24432','34543','.454.','.353.','..2..']];
  if (!art) for (const f of sc.flames){
    if (f.sconce) for (let k = 0; k < 6; k++) px(f.x, f.y + 4 + k, RAMP.steel[2]);
    FL[fi].forEach((row, j) => { for (let k = 0; k < row.length; k++) if (row[k] !== '.') for (let a = 0; a < f.s; a++) for (let b = 0; b < f.s; b++) px(f.x - 2*f.s + k*f.s + b, f.y - 8*f.s + j*f.s + a, RAMP.flame[+row[k]]); });
  }
  const pl = here(), vis = pl.enemies.filter(e => !e.hidden && e.state !== 'dead' && e.state !== 'fled');
  vis.filter(e => e.type === 'ghost' && e.state !== 'pacified').forEach(e => drawGhost(e, fi, 120));
  if (!art) for (const ft of sc.feats || []) if (ft.f === 'web'){ const c = RAMP.steel[4]; for (let k = 0; k < 5; k++){ const a = k*Math.PI/10; for (let r = 0; r < 34; r++) if (BAYER[(r&3)*4 + (k&3)] < .7) px(Math.cos(a)*r, Math.sin(a)*r, c); } for (const r of [10, 19, 28]) for (let a = 0; a < Math.PI/2; a += .04) if (BAYER[((a*40)|0)&15] < .6) px(Math.cos(a)*r, Math.sin(a)*r, RAMP.steel[3]); }
  const holding = S.held, sword = holding && /меч/i.test(holding) && hasItem(/меч/i);
  if (SHOW_HANDS && sword) drawSword((x, y) => Math.min(1, torchAt(x, y)*1.6 + sc.SL[(y|0)*W + (x|0)]*1.2 + (sc.outdoor ? .5 : 0)));
  drawParticles(dt);
  ctx.putImageData(img, 0, 0);
  // sprites (characters, chest, legacy bones) — lit by the scene light at their feet
  const drawSpr = (rows, x, y, s, extra = {}) => {
    const c = spriteCanvas(rows), b = clamp01(.12 + lightAt(x, y - 4)*1.25);
    ctx.filter = extra.flash ? 'brightness(2.6)' : `brightness(${b.toFixed(2)})`;
    ctx.globalAlpha = extra.alpha ?? 1;
    ctx.drawImage(c, Math.round(x - c.width*s/2), Math.round(y - c.height*s), c.width*s, c.height*s);
    ctx.filter = 'none'; ctx.globalAlpha = 1;
  };
  const drawArt = (im, x, y, extra = {}) => {
    const lt = placeInfo().light, b = Math.min(1.25, (lt === 'dark' ? .08 : lt === 'dim' ? .5 : .98) + torchAt(x, y - 20)*(lt === 'dark' ? 1.6 : .5));
    ctx.filter = extra.flash ? 'brightness(2.6)' : `brightness(${b.toFixed(2)})`; ctx.globalAlpha = extra.alpha ?? 1;
    ctx.drawImage(im, Math.round(x - im.width/2), Math.round(y - im.height));
    ctx.filter = 'none'; ctx.globalAlpha = 1;
  };
  const artSpr = k => { const im = ARTIMG.sprite[k]; return im && im.complete && im.naturalWidth ? im : null; };
  if (!art) for (const ft of sc.feats || []) if (SPRITES[ft.f]){ const s = SCALE[ft.f] || 2, c = spriteCanvas(SPRITES[ft.f]);
    if (FEATURE_KIND[ft.f] === 'ceil') drawSpr(SPRITES[ft.f], ft.x, c.height*s, s); else if (ft.f === 'bones'){ drawSpr(SPRITES.skull, ft.x - 8, ft.y, 1); drawSpr(SPRITES.bones, ft.x + 6, ft.y + 2, 1); } else drawSpr(SPRITES[ft.f], ft.x, ft.y, s); }
  if (S.place === 'lair' && !S.chestTaken) drawSpr(SPRITES.chest, sc.chestSpot[0], sc.chestSpot[1], 2);
  const legacy = LEGACY.find(l => l.place === S.place);
  if (legacy && !S.legacyFound){ drawSpr(SPRITES.skull, 92, 126, 1); drawSpr(SPRITES.bones, 104, 128, 1); }
  let slot = 0;
  vis.filter(e => e.type !== 'ghost' && (SPRITES[e.type] || artSpr(e.type))).forEach((e, k) => {
    const spot = (sc.typeSpot && sc.typeSpot[e.type]) || sc.spots[slot++ % sc.spots.length];
    if (e.type === 'bat'){ for (let b = 0; b < Math.max(1, Math.min(3, e.hp)); b++) drawSpr(SPRITES.bat, spot[0] - 24 + b*24, spot[1] + (fi + b) % 2*2 - b % 2*6, 1); return; }
    const bob = e.state === 'asleep' ? 0 : [0, 1, 0][fi];
    const pic = artSpr(e.type);
    if (pic){ const at = (ART_SPOT[S.place] && ART_SPOT[S.place][e.type]) || spot; drawArt(pic, at[0] + k*26, at[1] + bob, { flash: e.state === 'hurt' && fi !== 1, alpha: e.state === 'asleep' ? .85 : 1 }); return; }
    drawSpr(SPRITES[e.type], spot[0], spot[1] + bob, SCALE[e.type], { flash: e.state === 'hurt' && fi !== 1, alpha: e.state === 'asleep' ? .85 : 1 });
    if (e.state === 'asleep' && fi !== 2){ ctx.fillStyle = '#b39cff'; const zx = spot[0] + 10 + fi*3, zy = spot[1] - 40 - fi*4; ctx.fillRect(zx, zy, 3, 1); ctx.fillRect(zx + 1, zy + 1, 1, 1); ctx.fillRect(zx, zy + 2, 3, 1); }
  });
  for (const [id, c] of Object.entries(COMPANIONS)){
    const st = S.party[id]; if (st.joined || !st.alive || !st.visible || c.place !== S.place) continue;
    const spot = sc.companionSpot || [182, 112];
    const pic = artSpr(id) || (id === 'skrip' ? artSpr('goblin') : null);
    if (pic){ const at = (ART_SPOT[S.place] && ART_SPOT[S.place].companion) || spot; drawArt(pic, at[0], at[1] + [0, 1, 0][fi]); continue; }
    if (SPRITES[id]) drawSpr(SPRITES[id], spot[0], spot[1] + [0, 1, 0][fi], 2);
  }
  const ready = im => im.complete && im.naturalWidth;
  const inHand = (item, x, big) => { const c = spriteCanvas(heldArt(item)), s = 2; ctx.drawImage(c, x + 34 - c.width*s/2, HAND_Y + (big ? 100 : 72) - c.height*s, c.width*s, c.height*s); };
  // right hand: shown only while it holds something
  if (SHOW_HANDS && holding && S.inventory.includes(holding)){
    if (!sword && !/щит/i.test(holding)) inHand(holding, RIGHT_X);
    if (ready(HAND.fist)) ctx.drawImage(HAND.fist, RIGHT_X, HAND_Y);
    if (/щит/i.test(holding)) inHand(holding, RIGHT_X, true);
  }
  // left hand: shown only while it holds something (torch, shield, any item)
  const left = S.left && S.inventory.includes(S.left) ? S.left : null;
  if (SHOW_HANDS && left){
    if (/факел/i.test(left)){ const im = lit ? HAND.lit[fi] : HAND.unlit; if (ready(im)) ctx.drawImage(im, LEFT_X, HAND_Y); }
    else { if (!/щит/i.test(left)) inHand(left, LEFT_X); if (ready(HAND.fistL)) ctx.drawImage(HAND.fistL, LEFT_X, HAND_Y); if (/щит/i.test(left)) inHand(left, LEFT_X, true); }
  }
  for (const c of S.conditions) if (['poisoned','frightened','charmed','restrained','blinded'].includes(c.id)) ctx.drawImage(condOverlay(c.id), 0, 0);
  // camera: shake, fear tremble, lying on the ground, exhaustion
  let tr = '';
  const fear = hasCond('frightened');
  if (t < shakeUntil || fear){ const a = t < shakeUntil ? shakeAmp : 1; tr += `translate(${((Math.random()-.5)*a*2).toFixed(1)}px,${((Math.random()-.5)*a*2).toFixed(1)}px) `; }
  if (hasCond('prone')) tr += 'rotate(-7deg) scale(1.14) translateY(4%)';
  cv.style.transform = tr;
  cv.style.filter = S.exhaustion ? `saturate(${1 - S.exhaustion*.16}) brightness(${1 - S.exhaustion*.06})` : '';
}
function frame(t){ requestAnimationFrame(frame); if (t - lastT < 40) return; const dt = Math.min(100, t - lastT); lastT = t; render(t, dt); }
