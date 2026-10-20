// Neighbourhood shops and small, low-impact industry. Each model takes the seed variant and the tier: higher tiers
// add floors, terraces, sheds or machinery inside the same lot.
import * as THREE from 'three';
import { C, M, windowMat, lampMat } from '../art.js';

const crates = (k, x, z, n, fruit = [C.lemon, C.lime, C.orange, '#d2564b']) => {
  for (let i = 0; i < n; i++) { const cx = x + (i % 3) * .11, cz = z + Math.floor(i / 3) * .1; k.box(null, .1, .05, .08, M.wood(C.wood), cx, .02, cz); for (let j = 0; j < 4; j++) k.sph(null, .018, M.lemon(fruit[(i + j) % fruit.length]), cx - .025 + (j % 2) * .05, .08, cz - .02 + Math.floor(j / 2) * .04, 1, 1, 1, 6); }
};
const books = (k, f, x, y, w, rows = 2) => {
  const cols = [C.red, C.navy, C.lemon, C.teal, C.terra, C.lav, C.leafG];
  for (let r = 0; r < rows; r++) for (let i = 0; i < Math.floor(w / .022); i++) k.box(f, .016, .05 + (i % 3) * .01, .03, M.paint(cols[(i * 3 + r) % cols.length]), x - w / 2 + .011 + i * .022, y + r * .08, .02);
};
const pallets = (k, x, z, n) => { for (let i = 0; i < n; i++) { const px = x + (i % 2) * .22, pz = z + Math.floor(i / 2) * .2; k.box(null, .18, .03, .16, M.wood(C.wood), px, .03, pz); k.box(null, .15, .1 + (i % 3) * .04, .13, M.paint(['#d8b98c', '#e8dcc0', '#c9a57a'][i % 3]), px, .06, pz); } };

export const TRADE_MODELS = {
  // ---------------------------------------------------------------- shops
  corner_store(k, v, tier = 1) {
    const wall = ['#e7c98f', '#a9c3b5', '#e5b1a0'][v % 3], acc = [C.leafG, C.terra, C.navy][v % 3], WL = M.wall(wall, true), X = -.02, Z = -.1, W = .7, D = .58;
    const H = tier >= 2 ? .9 : .62;
    k.box(null, .94, .02, .94, M.paint('#d8cfbd'));
    k.box(null, W, H, D, WL, X, .02, Z);
    k.box(null, W + .04, .04, D + .04, M.paint(C.ivory), X, .02 + H, Z);
    const f = k.face(null, X, Z, W, D, 0);
    k.box(f, .5, .26, .012, windowMat, -.06, .08, .008); k.box(f, .52, .02, .03, M.paint(acc), -.06, .34, .015);
    k.door(f, .26, .12, .28, acc, { y: .04, glass: true });
    k.awning(f, 0, .4, W + .04, .2, [acc, C.white]); k.box(f, .3, .07, .015, M.sign('basket'), -.06, .46, .03);
    for (let fl = 1; fl < (tier >= 2 ? 3 : 2); fl++) for (const x of [-.2, .15]) k.win(f, x, .26 + fl * .28 - .2, .12, .16, { trim: C.ivory, flowers: fl === 1 });
    const s = k.face(null, X, Z, W, D, 1); k.win(s, 0, .12, .2, .16); k.box(s, .3, .06, .015, M.sign('basket'), 0, .38, .02);
    crates(k, -.34, .26, 6);
    k.cyl(null, .02, .02, .08, M.paint(C.iron), .32, .02, .34, 6); k.box(null, .12, .1, .02, M.sign('lemon'), .32, .1, .34);
    if (tier >= 3) { crates(k, .06, .3, 3, [C.leaf, C.lime, C.butter]); k.box(null, .3, .2, .3, WL, X + .2, .02 + H, Z - .1); k.gable(null, X + .2, .22 + H, Z - .1, .3, .3, .12, M.roof(C.terra), WL, .03); }
  },
  tea_house(k, v, tier = 1) {
    const acc = [C.tealD, C.limeD, '#8a5a3a'][v % 3], wood = M.wood(['#a7744d', '#8f6a4c', '#b98d62'][v % 3]), X = -.04, Z = -.12, W = .62, D = .52;
    k.box(null, .94, .02, .94, M.stone('#d6cdb8'));
    k.box(null, W, .5, D, M.wall('#efe4cc'), X, .02, Z);
    k.box(null, W + .02, .5, .04, wood, X, .02, Z + D / 2 - .015);
    k.gable(null, X, .52, Z, W, D, .24, M.roof(acc), M.wall('#efe4cc'), .08);
    const f = k.face(null, X, Z, W, D, 0);
    k.win(f, -.14, .12, .24, .22, { trim: C.ivory }); for (let i = 0; i < 5; i++) { k.cyl(f, .016, .016, .04, M.paint([C.red, C.lemon, C.teal, C.lav, C.terra][i]), -.23 + i * .045, .16, .04, 8); k.cyl(f, .016, .016, .04, M.paint([C.lime, C.pink, C.navy, C.butter, C.leaf][i]), -.23 + i * .045, .24, .04, 8); }
    k.box(f, .3, .015, .06, M.wood(C.woodD), -.14, .2, .03);
    k.door(f, .17, .13, .3, acc, { y: .04, glass: true, trim: C.ivory });
    k.sign(f, .0, .43, .04, 'teapot', .22, .1);
    // a climbing plant up the corner and a small terrace
    for (let i = 0; i < 6; i++) k.sph(f, .03, M.leaf(C.leafG), .29, .08 + i * .07, .02, 1, 1.2, .6, 6);
    k.table(null, -.22, .02, .32); if (tier >= 2) k.table(null, .18, .02, .32);
    k.pot(null, .38, .02, .38, 1, C.terra, [C.white, C.lemon]);
    if (tier >= 2) { k.box(null, .2, .32, .32, wood, X + .4, .02, Z); k.m(null, new THREE.BoxGeometry(.24, .02, .36), M.roof(acc), X + .4, .36, Z, 0, 0, -.3); }
    if (tier >= 3) { const g = k.g(null, X, .52, Z); k.box(g, .3, .22, .3, M.wall('#efe4cc'), 0, .1, -.05); k.gable(g, 0, .32, -.05, .3, .3, .12, M.roof(acc), M.wall('#efe4cc'), .05, true); const uf = k.face(g, 0, -.05, .3, .3, 0); k.win(uf, 0, .14, .14, .12); k.box(null, .52, .02, .02, M.paint(C.iron), -.05, .44, .44); for (let i = 0; i < 6; i++) k.sph(null, .015, lampMat, -.3 + i * .1, .42 - (i % 2) * .02, .44, 1, 1, 1, 6); }
  },
  bookshop(k, v, tier = 1) {
    const col = ['#4f6684', '#7a3b3b', '#3e7770'][v % 3], WL = M.wall(['#ece2ce', '#e4d3bc', '#d8dccf'][v % 3]), X = 0, Z = -.12, W = .66, D = .56, floors = tier >= 2 ? 3 : 2, H = .06 + floors * .3;
    k.box(null, .94, .02, .94, M.paint('#d8cfbd'));
    k.box(null, W, H, D, WL, X, .02, Z);
    k.box(null, W + .04, .04, D + .04, M.paint(col), X, .02 + H, Z);
    if (tier < 3) k.prism(null, W + .04, D + .04, W - .2, D - .3, .16, M.roof(C.slate), X, .06 + H, Z);
    const f = k.face(null, X, Z, W, D, 0);
    k.box(f, W, .32, .03, M.paint(col), 0, .02, .015);
    // the bay window full of books
    k.box(f, .36, .24, .1, windowMat, -.1, .06, .07); k.box(f, .38, .02, .12, M.paint(C.ivory), -.1, .3, .07); k.box(f, .38, .02, .12, M.paint(C.ivory), -.1, .05, .07);
    books(k, f, -.1, .08, .32, 2);
    k.door(f, .22, .12, .26, col, { y: .04, glass: true, trim: C.ivory });
    k.sign(f, -.1, .38, .04, 'book', .26, .09);
    for (let fl = 1; fl < floors; fl++) for (const x of [-.18, .18]) k.win(f, x, .1 + fl * .3, .14, .2, { trim: C.ivory, shut: fl === 1 ? col : null });
    for (const sd of [1, 3]) { const s = k.face(null, X, Z, W, D, sd); for (let fl = 0; fl < floors; fl++) k.win(s, 0, .1 + fl * .3, .1, .18); }
    for (let i = 0; i < 2; i++) { k.box(null, .14, .1, .1, M.wood(C.wood), -.25 + i * .18, .02, .32); books(k, null, -.25 + i * .18, .12, .12, 1); }
    k.bench(null, .28, .02, .34, 0);
    if (tier >= 3) { const y = .06 + H; k.box(null, .5, .02, .4, M.wood(C.wood), X, y, Z); k.table(null, -.1, y, Z); k.pot(null, .2, y, Z + .1, 1); k.box(null, .5, .015, .015, M.paint(C.iron), X, y + .12, Z + .2); }
  },
  craft_shop(k, v, tier = 1) {
    const roof = [C.terra, C.tealD, C.slate][v % 3], wood = M.wood('#9a6b45'), X = -.02, Z = -.1, W = .7, D = .56;
    k.box(null, .94, .02, .94, M.cobble());
    k.box(null, W, .48, D, M.wall('#e6d2b5', true), X, .02, Z);
    k.gable(null, X, .5, Z, W, D, .26, M.roof(roof), M.wall('#e6d2b5'), .1, true);
    const f = k.face(null, X, Z, W, D, 0);
    // a wide open front: folding doors pushed aside, a workbench and shelves of goods inside
    k.box(f, .5, .34, .012, M.paint('#5a4636'), -.04, .02, .004);
    for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) k.m(f, new THREE.BoxGeometry(.06, .34, .012), M.slat(C.wood), -.04 + sx * (.29 + i * .045), .19, .05 + i * .02, sx * .9);
    k.box(f, .36, .03, .12, wood, -.04, .12, .07); for (const x of [-.18, .1]) k.box(f, .02, .12, .02, wood, x, .02, .1);
    const goods = [C.terra, C.teal, C.ochre, C.lav, C.clay];
    for (let i = 0; i < 5; i++) k.cyl(f, .02, .015, .05 + (i % 2) * .02, M.paint(goods[i]), -.18 + i * .07, .15, .07, 10);
    for (let i = 0; i < 4; i++) k.box(f, .06, .05, .01, M.paint(goods[(i + 2) % 5]), -.16 + i * .08, .27, .02);
    k.sign(f, -.04, .4, .03, 'vase', .2, .1);
    k.win(k.face(null, X, Z, W, D, 1), 0, .14, .16, .18); k.win(k.face(null, X, Z, W, D, 3), 0, .14, .16, .18);
    k.cyl(null, .07, .08, .1, M.paint(C.terra), -.3, .02, .32, 12); k.cyl(null, .05, .05, .14, M.paint(C.teal), -.18, .02, .36, 12);
    k.box(null, .2, .08, .14, M.wood(C.woodD), .26, .02, .32); k.basket(null, .26, .1, .32);
    if (tier >= 2) { k.box(null, .9, .015, .2, M.stripe(C.terra, C.ivory), 0, .42, .32); for (const x of [-.4, .4]) k.box(null, .02, .4, .02, wood, x, .02, .42); }
    if (tier >= 3) { k.box(null, .22, .3, .3, M.wall('#e6d2b5', true), X + .24, .76, Z - .02); k.m(null, new THREE.ConeGeometry(.04, .14, 8), M.paint(C.brick), X + .24, 1.12, Z - .02); k.mark(null, X + .24, 1.2, Z - .02, 'smoke'); }
  },
  restaurant(k, v, tier = 1) {
    const wall = ['#e8d2b0', '#d9a88a', '#e4e0d2'][v % 3], acc = [C.redD, C.leafG, C.navy][v % 3], WL = M.wall(wall, true), floors = tier >= 2 ? 2 : 1, H = .1 + floors * .34;
    k.box(null, 1.94, .03, 1.94, M.cobble());
    k.box(null, 1.5, H, .9, WL, -.1, .03, -.42);
    k.box(null, 1.54, .04, .94, M.paint(C.ivory), -.1, .03 + H, -.42);
    k.gable(null, -.1, .07 + H, -.42, 1.5, .9, .3, M.roof(C.terra), WL, .08);
    const f = k.face(null, -.1, -.42, 1.5, .9, 0);
    for (const x of [-.55, -.2, .4]) k.win(f, x, .1, .24, .3, { arch: true, trim: C.ivory });
    k.door(f, .1, .16, .32, acc, { y: .06, glass: true, arch: true });
    k.box(f, .5, .1, .015, M.sign('fork'), -.38, .5, .02);
    if (floors > 1) for (const x of [-.55, -.2, .1, .4]) k.win(f, x, .5, .16, .22, { trim: C.ivory, flowers: true, shut: acc });
    for (const sd of [1, 3]) { const s = k.face(null, -.1, -.42, 1.5, .9, sd); for (const x of [-.2, .2]) for (let fl = 0; fl < floors; fl++) k.win(s, x, .12 + fl * .34, .14, .22); }
    // terrace: pergola with string lights, tables and parasols
    const W = M.wood(C.wood);
    for (const x of [-.85, -.1, .65]) for (const z of [.15, .85]) k.box(null, .03, .5, .03, W, x, .03, z);
    for (const z of [.15, .85]) k.box(null, 1.55, .03, .03, W, -.1, .53, z);
    for (let i = 0; i < 6; i++) k.box(null, .03, .02, .74, W, -.85 + i * .3, .56, .5);
    for (let i = 0; i < 14; i++) k.sph(null, .014, lampMat, -.85 + i * .115, .5 - Math.sin(i / 13 * Math.PI) * .05, .85, 1, 1, 1, 6);
    k.mark(null, -.1, .45, .85, 'glow');
    for (const [x, z] of [[-.6, .35], [-.15, .62], [.35, .38]]) k.table(null, x, .03, z);
    for (let i = 0; i < 5; i++) k.sph(null, .05, M.leaf(i % 2 ? C.leafG : C.leaf), -.85, .55, .2 + i * .15, 1, .6, 1, 8);
    k.pot(null, .82, .03, .85, 1.3, C.terra, [C.red, C.white]); k.pot(null, .82, .03, .2, 1.3, C.terra, [C.lemon, C.white]);
    k.chimney(.4, .07 + H, -.6, .38, C.brick);
    if (tier >= 3) { for (const [x, z] of [[.6, .6], [-.4, .25]]) { k.cyl(null, .008, .008, .38, M.paint(C.iron), x, .03, z, 6); k.m(null, new THREE.ConeGeometry(.2, .08, 10), M.stripe(acc, C.ivory), x, .45, z); } k.box(null, .4, .3, .3, WL, .82, .03, -.5); k.m(null, new THREE.BoxGeometry(.44, .02, .34), M.roof(C.terra), .82, .34, -.5, 0, 0, -.25); }
  },
  covered_market(k, v, tier = 1) {
    const iron = M.paint([C.tealD, '#4f6684', '#6b5a4c'][v % 3]), glass = windowMat;
    k.box(null, 1.94, .03, 1.94, M.cobble());
    const L = tier >= 2 ? 1.7 : 1.5, R0 = .62;
    // an iron-and-glass hall: arched roof over columns
    for (let i = 0; i <= 5; i++) { const z = -L / 2 + i * L / 5; for (const sx of [-1, 1]) k.cyl(null, .025, .03, .5, iron, sx * R0, .03, z, 8);
      const arch = k.m(null, new THREE.TorusGeometry(R0, .02, 5, 20, Math.PI), iron, 0, .53, z); arch.userData.noEdge = true; }
    k.m(null, new THREE.CylinderGeometry(R0, R0, L, 20, 1, true, -Math.PI / 2, Math.PI), glass, 0, .53, 0, 0, Math.PI / 2);
    k.m(null, new THREE.CylinderGeometry(R0 + .01, R0 + .01, L * .98, 20, 1, true, -Math.PI / 2 + .9, Math.PI - 1.8), M.corrug('#c9cfc6'), 0, .53, 0, 0, Math.PI / 2);
    for (const sx of [-1, 1]) k.box(null, .04, .04, L, iron, sx * R0, .5, 0);
    // gable ends with a clock
    const fe = k.g(null, 0, 0, L / 2);
    k.m(fe, new THREE.CircleGeometry(R0, 20, 0, Math.PI), glass, 0, .53, 0); k.cyl(fe, .08, .08, .02, M.paint(C.ivory), 0, .82, .01, 16).rotation.x = Math.PI / 2;
    k.box(fe, .006, .06, .006, M.paint(C.ink), 0, .82, .025); k.sign(fe, 0, .62, .02, 'basket', .3, .12);
    // stalls in rows
    const fr = [C.lemon, C.lime, C.orange, '#d2564b', C.leaf, C.butter];
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const z = -L / 2 + .25 + i * (L - .5) / 3, x = sx * .34;
      k.box(null, .22, .12, .26, M.wood(C.wood), x, .03, z); for (let j = 0; j < 6; j++) k.sph(null, .025, M.lemon(fr[(i + j) % 6]), x - .06 + (j % 2) * .12, .17, z - .08 + Math.floor(j / 2) * .08, 1.1, 1, 1, 6);
      k.box(null, .24, .02, .28, M.stripe(fr[i % 6], C.white), x, .32, z); }
    k.bench(null, -.86, .03, .7, Math.PI / 2); k.lampPost(null, .86, .03, .86, .5);
    if (tier >= 3) { k.box(null, .3, .6, .3, M.wall('#e8dcc4', true), .78, .03, -.78); k.prism(null, .36, .36, 0, 0, .2, M.roof(C.terra), .78, .63, -.78); const tf = k.face(null, .78, -.78, .3, .3, 0); k.win(tf, 0, .3, .1, .16); k.round(tf, 0, .54, .04); crates(k, -.9, -.9, 6); }
  },
  // ---------------------------------------------------------------- industry
  textile(k, v, tier = 1) {
    const B = M.wall([C.brick, '#c98f6c', '#b9705a'][v % 3], true), cloth = [C.magenta, C.teal, C.lemon, C.navy, C.terra, C.lav];
    k.box(null, 1.94, .03, 1.94, M.paint(C.concrete));
    const n = tier >= 3 ? 4 : 3;
    k.box(null, .4 * n + .1, .5, 1.0, B, -.3 + .2 * (n - 3), .03, -.4);
    for (let i = 0; i < n; i++) { const x = -.75 + i * .4; // sawtooth roof with north lights
      k.m(null, new THREE.BoxGeometry(.4, .02, .55), M.roof(C.slate), x, .66, -.4, 0, Math.PI / 2, -.5); }
    for (let i = 0; i < n; i++) k.box(null, .015, .22, 1.0, windowMat, -.56 + i * .4, .53, -.4);
    const f = k.face(null, -.3 + .2 * (n - 3), -.4, .4 * n + .1, 1.0, 0);
    for (let i = 0; i < n; i++) k.win(f, -.2 * (n - 1) + i * .4, .12, .22, .26, { trim: C.ivory });
    k.door(f, .2 * (n - 1) - .02, .2, .32, C.tealD, { y: .03 });
    k.sign(f, 0, .42, .02, 'spool', .26, .1);
    // drying lines with coloured cloth
    const W = M.wood(C.woodD);
    for (const x of [-.15, .85]) for (const z of [.25, .85]) k.box(null, .025, .45, .025, W, x, .03, z);
    for (const z of [.25, .85]) for (let i = 0; i < 4; i++) k.box(null, .2, .22, .006, M.paint(cloth[(i + (z > .5 ? 2 : 0) + v) % 6]), -.03 + i * .24, .22, z);
    if (tier >= 2) { k.cyl(null, .06, .08, .9, B, .82, .03, -.75, 12); k.mark(null, .82, 1.0, -.75, 'smoke'); pallets(k, .4, -.05, 2); }
  },
  sawmill(k, v, tier = 1) {
    const W = M.wood(['#9a6b45', '#8f6a4c', '#a7744d'][v % 3]), logs = M.wood('#8b5e40');
    k.box(null, 1.94, .03, 1.94, M.paint('#cdb894'));
    // an open shed on posts over the saw bench
    for (const x of [-.85, -.25, .35]) for (const z of [-.85, -.1]) k.box(null, .04, .5, .04, W, x, .03, z);
    k.gable(null, -.25, .53, -.48, 1.3, .9, .2, M.corrug('#8f8a7f'), W, .08);
    k.box(null, .8, .1, .16, W, -.3, .03, -.48); k.cyl(null, .12, .12, .012, M.paint(C.zinc), -.2, .2, -.48, 18).rotation.x = Math.PI / 2;
    k.m(null, new THREE.CylinderGeometry(.06, .06, .7, 10), logs, -.5, .2, -.48, 0, 0, Math.PI / 2);
    k.box(null, .5, .5, .6, M.wall('#d9c4a0'), .65, .03, -.6); k.gable(null, .65, .53, -.6, .5, .6, .2, M.roof(C.slate), W, .05, true);
    const of = k.face(null, .65, -.6, .5, .6, 0); k.door(of, 0, .14, .26, C.leafG, { y: .03 }); k.sign(of, 0, .38, .02, 'log', .22, .1);
    // log pile and stacked planks
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) k.m(null, new THREE.CylinderGeometry(.06, .06, .7, 10), logs, -.55 + (i + r * .5) * .13, .09 + r * .1, .45, 0, Math.PI / 2, Math.PI / 2);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) k.box(null, .55, .03, .06, M.wood(i % 2 ? '#d6b184' : '#c49a6c'), .45, .03 + i * .035, .35 + j * .09);
    k.cyl(null, .08, .1, .03, M.paint(C.soil), .2, .03, .05, 10);
    if (tier >= 2) { k.box(null, .03, .7, .03, M.paint(C.lemonD), .85, .03, .1); k.box(null, .5, .03, .03, M.paint(C.lemonD), .62, .72, .1); k.box(null, .005, .3, .005, M.paint(C.iron), .42, .42, .1); }
    if (tier >= 3) { k.car(null, -.2, .03, .82, 0, C.leafG, .36); for (let i = 0; i < 3; i++) k.m(null, new THREE.CylinderGeometry(.04, .04, .3, 8), logs, -.2, .18, .76 + i * .05 - .05, 0, 0, Math.PI / 2); }
  },
  pottery(k, v, tier = 1) {
    const B = M.wall([C.brick, '#c47a5c', '#b5806a'][v % 3], true), glaze = [C.teal, C.terra, C.ochre, C.lav, C.navy];
    k.box(null, 1.94, .03, 1.94, M.paint('#d8c3a3'));
    k.box(null, 1.1, .5, .7, B, -.3, .03, -.5); k.gable(null, -.3, .53, -.5, 1.1, .7, .24, M.roof(C.terra), B, .07);
    const f = k.face(null, -.3, -.5, 1.1, .7, 0); k.door(f, -.25, .2, .3, C.woodD, { y: .03, arch: true }); for (const x of [.1, .35]) k.win(f, x, .14, .14, .2, { trim: C.ivory }); k.sign(f, -.25, .4, .02, 'vase', .2, .1);
    // the bottle kiln
    const kiln = (x, z, s) => { k.m(null, new THREE.CylinderGeometry(.12 * s, .26 * s, .7 * s, 16), B, x, .03 + .35 * s, z); k.cyl(null, .1 * s, .12 * s, .25 * s, B, x, .03 + .7 * s, z, 12); k.mark(null, x, .03 + .98 * s, z, 'smoke'); };
    kiln(.62, -.55, 1); if (tier >= 3) kiln(.55, .1, .75);
    // pots drying on boards
    for (let r = 0; r < 2; r++) { k.box(null, .7, .02, .14, M.wood(C.wood), -.35, .12 + r * .14, .32); for (const x of [-.7, 0]) k.box(null, .02, .26, .02, M.wood(C.woodD), x, .03, .32);
      for (let i = 0; i < 7; i++) k.cyl(null, .028, .02, .05 + (i % 2) * .02, M.paint(r ? glaze[(i + v) % 5] : '#c79a74'), -.64 + i * .1, .14 + r * .14, .32, 10); }
    k.cyl(null, .12, .14, .08, M.paint('#b98863'), -.7, .03, .78, 14);
    if (tier >= 2) { k.box(null, .5, .3, .4, B, -.6, .03, .7 - .25); k.m(null, new THREE.BoxGeometry(.54, .02, .44), M.roof(C.terra), -.6, .35, .45, 0, 0, -.2); pallets(k, .2, .65, 2); }
  },
  warehouse(k, v, tier = 1) {
    const Wl = M.corrug(['#c9cfc6', '#d9cdb4', '#b9c4cf'][v % 3]), acc = [C.lemon, C.terra, C.teal][v % 3], L = tier >= 2 ? 1.8 : 1.5;
    k.box(null, 1.94, .03, 1.94, M.paint(C.concrete));
    k.box(null, L, .6, 1.0, Wl, -(1.8 - L) / 2, .03, -.42);
    k.m(null, new THREE.CylinderGeometry(.55, .55, L, 16, 1, false, -Math.PI / 2 + .55, Math.PI - 1.1), M.corrug('#8f9a8a'), -(1.8 - L) / 2, .4, -.42, 0, Math.PI / 2);
    k.box(null, L, .12, .28, M.paint(C.stone), -(1.8 - L) / 2, .03, .22);
    const f = k.face(null, -(1.8 - L) / 2, -.42, L, 1.0, 0);
    const docks = tier >= 2 ? 4 : 3; for (let i = 0; i < docks; i++) { const x = -L / 2 + .25 + i * (L - .5) / (docks - 1); k.box(f, .26, .3, .015, M.garage('#e8e2d0'), x, .15, .008); k.box(f, .3, .03, .03, M.paint(acc), x, .46, .015); k.box(f, .3, .02, .14, M.paint(C.charcoal), x, .5, .07); }
    k.sign(f, 0, .54, .02, 'box', .2, .1);
    pallets(k, .55, .55, 4); pallets(k, -.85, .55, 2);
    k.car(null, -.3, .03, .62, Math.PI / 2, C.white, .4); k.box(null, .19, .19, .25, M.paint(acc), -.3, .1, .56);
    if (tier >= 3) { solar(k, -(1.8 - L) / 2, .98, -.55, 6); }
    function solar(kk, x, y, z, n) { for (let i = 0; i < n; i++) kk.m(null, new THREE.BoxGeometry(.2, .012, .14), M.panel('#3f5873'), x - (n - 1) * .12 + i * .24, y, z, 0, -.3); }
  },
  food_plant(k, v, tier = 1) {
    const Wl = M.panel(['#eef0ea', '#f2ead8', '#e4ece6'][v % 3]), acc = [C.lime, C.lemon, C.orange][v % 3];
    k.box(null, 1.94, .03, 1.94, M.paint(C.concrete));
    k.box(null, 1.2, .55, .8, Wl, -.3, .03, -.48); k.box(null, 1.24, .04, .84, M.paint(acc), -.3, .58, -.48);
    const f = k.face(null, -.3, -.48, 1.2, .8, 0);
    for (const x of [-.4, 0, .4]) k.box(f, .24, .12, .012, windowMat, x, .36, .008);
    k.box(f, .3, .3, .015, M.garage('#e8e2d0'), -.3, .03, .008); k.door(f, .3, .14, .28, C.leafG, { y: .03, glass: true });
    k.sign(f, .05, .2, .02, 'basket', .22, .1);
    // silos and a conveyor
    const silos = tier >= 2 ? 3 : 2;
    for (let i = 0; i < silos; i++) { const x = .55 + (i % 2) * .26, z = -.75 + Math.floor(i / 2) * .3 + (i === 2 ? .2 : 0); k.cyl(null, .12, .12, .8, M.paint('#dfe3e4'), x, .2, z, 16); k.m(null, new THREE.ConeGeometry(.12, .1, 16), M.paint(acc), x, 1.05, z); for (const sx of [-1, 1]) k.box(null, .02, .2, .02, M.paint(C.zinc), x + sx * .08, .03, z); }
    k.m(null, new THREE.BoxGeometry(.6, .03, .08), M.paint(C.zinc), .35, .55, -.2, 0, 0, .55);
    crates(k, -.8, .3, 6, [C.lemon, C.lime, C.orange, C.leaf]); crates(k, -.35, .3, 3);
    k.car(null, .45, .03, .55, Math.PI / 2, C.white, .4); k.box(null, .19, .19, .25, M.paint(acc), .45, .1, .49);
    if (tier >= 3) { k.box(null, .6, .4, .5, Wl, -.55, .62, -.55); k.box(null, .62, .03, .52, M.paint(acc), -.55, 1.02, -.55); const uf = k.face(null, -.55, -.55, .6, .5, 0); k.box(uf, .4, .14, .012, windowMat, 0, .8, .008); }
  },
  studio(k, v, tier = 1) {
    const wood = M.wood(['#b98d62', '#a7744d', '#c9a57a'][v % 3]), acc = [C.lime, C.teal, C.magenta][v % 3], floors = tier >= 2 ? 2 : 1, H = .05 + floors * .34;
    k.box(null, .94, .02, .94, M.paint('#dcd6c8'));
    k.box(null, .74, H, .56, windowMat, -.02, .03, -.12);
    k.box(null, .76, .04, .58, M.paint(C.white), -.02, .02 + H, -.12);
    for (let fl = 0; fl < floors; fl++) k.box(null, .76, .03, .58, M.paint(C.white), -.02, .03 + fl * .34, -.12);
    const f = k.face(null, -.02, -.12, .74, .56, 0);
    for (let i = 0; i < 12; i++) k.box(f, .022, H - .06, .03, wood, -.33 + i * .06, .06, .03); // timber louvres
    k.door(f, .22, .14, .28, acc, { y: .04, glass: true, trim: C.white }); k.sign(f, -.12, .3, .05, 'chip', .16, .08);
    // a green roof, solar panels and bikes
    const y = .06 + H; k.box(null, .7, .03, .52, M.grass(), -.02, y, -.12);
    for (let i = 0; i < 6; i++) k.sph(null, .035, M.leaf(i % 2 ? C.leafG : C.lime), -.3 + i * .11, y + .04, -.2 + (i % 2) * .15, 1, .6, 1, 7);
    if (tier >= 3) for (let i = 0; i < 3; i++) k.m(null, new THREE.BoxGeometry(.18, .012, .13), M.panel('#3f5873'), -.22 + i * .2, y + .1, .02, 0, -.4);
    for (let i = 0; i < 3; i++) k.bike(null, -.32 + i * .1, .02, .36, Math.PI / 2, [acc, C.lemon, C.navy][i]);
    k.citrus(null, .32, .02, .32, .9, C.lime);
  },
};
