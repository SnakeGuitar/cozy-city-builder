// Urban housing typologies: building forms (compact, narrow terraced, walk-up, apartment block, courtyard block)
// rather than national styles. The seed variant picks palette and details; the tier grows the building in place
// (extensions, extra floors, roof gardens) without leaving its lot.
import * as THREE from 'three';
import { C, M, windowMat } from '../art.js';

const PAL = [
  { wall: '#f2e6cf', roof: '#b5523f', door: '#5e8a8a', trim: C.ivory },
  { wall: '#dde6d6', roof: '#5b6b7a', door: '#c7703f', trim: C.white },
  { wall: '#f3d9c4', roof: '#7c5a46', door: '#4f6684', trim: '#fbf3e6' },
  { wall: '#e9d7a8', roof: '#8a4b3c', door: '#6f8b5c', trim: C.ivory },
  { wall: '#d9c6d6', roof: '#58606b', door: '#a5333b', trim: C.white },
];
const pal = v => PAL[v % PAL.length];

/** A pergola with climbing leaves on a flat roof at height y. */
function pergola(k, x, y, z, w, d) {
  const W = M.wood(C.wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(null, .02, .16, .02, W, x + sx * (w / 2 - .02), y, z + sz * (d / 2 - .02));
  for (let i = 0; i < 4; i++) k.box(null, w, .015, .02, W, x, y + .16, z - d / 2 + .04 + i * (d - .08) / 3);
  for (let i = 0; i < 5; i++) k.sph(null, .045, M.leaf(i % 2 ? C.leafG : C.leaf), x - w / 2 + .05 + i * (w - .1) / 4, y + .18, z + (i % 2 ? .05 : -.05), 1.4, .45, 1, 8);
}
/** Solar panels tilted toward the sun on a flat roof. */
function solar(k, x, y, z, n, w = .14) {
  for (let i = 0; i < n; i++) { const g = k.g(null, x - (n - 1) * w * .55 + i * w * 1.1, y, z); k.box(g, .012, .05, .012, M.paint(C.iron), 0, 0, -.03); k.m(g, new THREE.BoxGeometry(w, .012, .11), M.panel('#3f5873'), 0, .06, 0, 0, -.45); }
}
/** Planters along a roof edge. */
function planters(k, x0, x1, y, z) { for (let x = x0; x <= x1 + 1e-6; x += .12) { k.box(null, .09, .04, .07, M.wood(C.woodD), x, y, z); k.bloom(null, x, y + .06, z, .07, 3, [C.red, C.white, C.lemon], .014); } }

export const URBAN_MODELS = {
  // ---- compact cottage: one storey under a steep roof, porch and front garden (1×1)
  cottage(k, v, tier = 1) {
    const P = pal(v), X = -.06, Z = -.13, W = .5, D = .42, H = .34, WL = M.wall(P.wall), R = M.roof(P.roof);
    k.box(null, .94, .02, .94, M.grass());
    for (let i = 0; i < 4; i++) k.cyl(null, .045, .05, .012, M.stone('#d6cdb8'), X - .1 + (i % 2) * .03, .02, .4 - i * .1, 8);
    k.box(null, W + .04, .05, D + .04, M.stone('#cdbfa5'), X, .02, Z);
    k.box(null, W, H, D, WL, X, .06, Z);
    k.gable(null, X, .06 + H, Z, W, D, .3, R, WL, .07);
    k.chimney(X + .15, .06 + H, Z - .1, .32, v === 1 ? C.stoneD : C.brick);
    const f = k.face(null, X, Z, W, D, 0);
    k.door(f, -.11, .12, .24, P.door, { y: .06, trim: P.trim });
    k.win(f, .12, .14, .14, .14, { trim: P.trim, shut: P.door, flowers: true });
    for (const x of [-.18, -.04]) k.box(f, .02, .26, .02, M.wood(C.woodD), x, .06, .13);
    k.box(f, .2, .02, .16, M.roof(P.roof), -.11, .32, .08);
    for (const sd of [1, 3]) { const s = k.face(null, X, Z, W, D, sd); k.win(s, 0, .14, .12, .14, { trim: P.trim }); k.round(s, 0, .5, .045, P.trim); }
    k.bench(null, X + .12, .02, .2, 0);
    k.fence(null, -.44, .44, -.2, .44, C.white, .1); k.fence(null, .02, .44, .44, .44, C.white, .1);
    if (v % 2) { k.box(null, .3, .03, .22, M.soil(), .25, .02, .22); for (let i = 0; i < 6; i++) k.sph(null, .032, M.leaf(i % 2 ? C.lime : C.leafG), .15 + (i % 3) * .1, .07, .15 + Math.floor(i / 3) * .12, 1, .7, 1, 7); }
    else { k.bloom(null, .26, .05, .25, .24, 7, [C.pink, C.white, C.lav, C.butter]); k.citrus(null, .32, .02, -.32, .9, C.lemon); }
    if (tier >= 2) { // a lean-to extension with its own window
      k.box(null, .2, .26, .3, WL, X + W / 2 + .1, .06, Z - .04);
      k.m(null, new THREE.BoxGeometry(.24, .025, .36), R, X + W / 2 + .1, .35, Z - .04, 0, 0, -.28);
      const e = k.face(null, X + W / 2 + .1, Z - .04, .2, .3, 0); k.win(e, 0, .12, .1, .12, { trim: P.trim });
    }
    if (tier >= 3) { // dormers and a glass sunroom
      const dg = k.face(null, X, Z, W, D, 0);
      for (const x of [-.12, .12]) { k.box(dg, .1, .1, .1, WL, x, .43, -.08); k.win(dg, x, .44, .06, .07, { trim: P.trim }); k.prism(dg, .13, .13, 0, .13, .06, R, x, .53, -.08); }
      k.box(null, .18, .2, .2, windowMat, X - W / 2 - .1, .06, Z + .05); k.box(null, .2, .015, .22, M.paint(P.trim), X - W / 2 - .1, .26, Z + .05);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(null, .015, .2, .015, M.paint(P.trim), X - W / 2 - .1 + sx * .09, .06, Z + .05 + sz * .1);
    }
  },
  // ---- narrow terraced houses: two slim three-storey fronts sharing a party wall, stoops and cornices (1×1)
  row_house(k, v, tier = 1) {
    const cols = ['#c9715c', '#e7c98f', '#8fb0a8', '#d9a0a6', '#b8b2a0', '#e4dccb'];
    k.box(null, .94, .02, .94, M.paint('#d8cfbd'));
    k.box(null, .94, .03, .22, M.stone('#d5ccb9'), 0, .02, .36);
    const floors = 3 + (tier >= 3 ? 1 : 0), fh = .3;
    for (let u = 0; u < 2; u++) {
      const x = -.22 + u * .44, col = cols[(v + u * 3) % cols.length], WL = M.wall(col, u === (v % 2)), H = .06 + floors * fh, Z = -.1, D = .6, trim = u ? C.ivory : C.white;
      k.box(null, .43, H, D, WL, x, .02, Z);
      k.box(null, .45, .04, D + .02, M.paint(trim), x, .02 + H, Z);
      const f = k.face(null, x, Z, .43, D, 0);
      for (let i = 0; i < 3; i++) k.box(f, .14, .03, .05 + i * .05, M.stone('#cfc4ae'), u ? .1 : -.1, .02 + i * .03, 0); // stoop
      k.door(f, u ? .1 : -.1, .1, .26, [C.navy, C.redD, C.tealD, C.leafG][(v + u) % 4], { y: .11, trim, arch: !!((v + u) % 2) });
      k.win(f, u ? -.08 : .08, .14, .14, .2, { trim });
      for (let fl = 1; fl < floors; fl++) for (const wx of [-.09, .09]) k.win(f, wx, .1 + fl * fh, .12, .2, { trim, flowers: fl === 1 && (v + u) % 2 === 0 });
      k.box(f, .43, .025, .03, M.paint(trim), 0, .05 + fh, .015);
      if (!(tier >= 2) && (v % 2)) k.prism(null, .45, D + .02, .3, D - .2, .14, M.roof(C.slate), x, .06 + H, Z); // mansard
      for (const sd of u ? [1] : [3]) { const s = k.face(null, x, Z, .43, D, sd); for (let fl = 0; fl < floors; fl++) k.win(s, 0, .12 + fl * fh, .08, .16, { trim }); }
    }
    k.lampPost(null, .4, .02, .4, .5);
    if (tier >= 2) { const y = .1 + floors * fh; planters(k, -.36, .36, y, .14); pergola(k, -.15, y, -.18, .3, .3); }
    if (tier >= 3) solar(k, .2, .1 + floors * fh, -.25, 2, .13);
  },
  // ---- corner walk-up: a four-storey building with a glazed ground floor and corner balconies (1×1)
  walkup(k, v, tier = 1) {
    const P = pal(v + 1), col = ['#d98c6c', '#e0cba0', '#a9bcb6'][v % 3], WL = M.wall(col, v % 3 === 0), X = -.04, Z = -.06, W = .78, D = .7, fh = .27;
    const floors = 4 + (tier >= 2 ? 1 : 0), H = .12 + floors * fh;
    k.box(null, .94, .02, .94, M.paint('#d6cfc2'));
    k.box(null, W, .32, D, M.paint('#e9e2d4'), X, .02, Z);
    k.box(null, W, H - .32, D, WL, X, .34, Z);
    k.box(null, W + .04, .04, D + .04, M.paint(P.trim), X, .02 + H, Z);
    k.box(null, W + .02, .03, D + .02, M.paint(P.trim), X, .33, Z);
    for (const sd of [0, 1]) {
      const f = k.face(null, X, Z, W, D, sd), fw = sd ? D : W;
      k.box(f, fw - .1, .22, .012, windowMat, 0, .06, .008);
      for (let i = 0; i < 4; i++) k.box(f, .02, .24, .02, M.paint(C.charcoal), -fw / 2 + .05 + i * (fw - .1) / 3, .05, .015);
      if (!sd) { k.door(f, -.24, .12, .24, C.charcoal, { y: .04, glass: true, trim: C.charcoal }); k.awning(f, .1, .3, .44, .14, [P.door, C.white]); }
      for (let fl = 1; fl < floors; fl++) for (let i = 0; i < 3; i++) {
        const x = -fw / 2 + .14 + i * (fw - .28) / 2, y = .1 + fl * fh;
        k.win(f, x, y, .12, .18, { trim: P.trim });
        if (i === 2 && fl % 2 === 0) k.balcony(f, x, y - .05, .2, .1, { flowers: true });
      }
    }
    for (const sd of [2, 3]) { const s = k.face(null, X, Z, W, D, sd); for (let fl = 1; fl < floors; fl++) for (const x of [-.18, .18]) k.win(s, x, .1 + fl * fh, .1, .16); }
    k.bike(null, .3, .02, .38, .3, P.door); k.pot(null, -.38, .02, .36, 1.1, C.terra, [C.red, C.white]);
    if (tier >= 3) { pergola(k, X - .15, .06 + H, Z, .34, .4); solar(k, X + .22, .06 + H, Z - .1, 2, .12); planters(k, X - .3, X + .3, .06 + H, Z + .3); }
  },
  // ---- apartment block: an L of balconied flats around a planted yard (2×2)
  apartments(k, v, tier = 1) {
    const col = ['#efe2c6', '#e4b99a', '#c9d3c3'][v % 3], acc = [C.terra, C.tealD, C.ochre][v % 3], WL = M.wall(col), fh = .26;
    const floors = 4 + (tier >= 2 ? 1 : 0) + (tier >= 3 ? 1 : 0), H = .1 + floors * fh;
    k.box(null, 1.94, .03, 1.94, M.paint('#ddd5c3'));
    k.box(null, 1.0, .02, .95, M.grass(), .4, .03, .42);
    const wings = [[0, -.62, 1.8, .6], [-.62, .36, .56, 1.0]];
    for (const [x, z, w, d] of wings) {
      k.box(null, w, H, d, WL, x, .03, z);
      k.box(null, w + .04, .04, d + .04, M.paint(C.ivory), x, .03 + H, z);
      k.box(null, w + .02, .1, d + .02, M.stone('#cdbfa5'), x, .03, z);
    }
    const back = k.face(null, 0, -.62, 1.8, .6, 0), side = k.face(null, -.62, .36, .56, 1.0, 1);
    for (let fl = 0; fl < floors; fl++) {
      const y = .14 + fl * fh;
      for (let i = 0; i < 6; i++) { const x = -.75 + i * .3; if (fl === 0 && x < -.3) continue; k.win(back, x, y, .14, .18, { trim: C.ivory }); if (fl > 0 && i % 2 === 1) k.balcony(back, x, y - .05, .24, .12, { rail: acc, flowers: (i + fl + v) % 3 === 0 }); }
      for (let i = 0; i < 3; i++) { const x = -.32 + i * .32; if (fl === 0 && i === 1) continue; k.win(side, x, y, .14, .18, { trim: C.ivory }); if (fl > 0 && i !== 1) k.balcony(side, x, y - .05, .24, .12, { rail: acc, flowers: (i + fl) % 2 === 0 }); }
    }
    k.door(side, 0, .16, .26, acc, { y: .13, glass: true });
    k.box(side, .3, .02, .14, M.paint(acc), 0, .42, .07);
    for (const sd of [2, 3]) { const s = k.face(null, 0, -.62, 1.8, .6, sd); for (let fl = 0; fl < floors; fl++) for (const x of sd === 2 ? [-.6, -.2, .2, .6] : [-.15, .15]) k.win(s, x, .14 + fl * fh, .12, .16); }
    const s3 = k.face(null, -.62, .36, .56, 1.0, 3); for (let fl = 0; fl < floors; fl++) for (const x of [-.3, .3]) k.win(s3, x, .14 + fl * fh, .12, .16);
    // the yard: trees, a bench, bike stands and a play corner
    k.citrus(null, .25, .05, .2, 1.2, C.lemon); k.citrus(null, .75, .05, .7, 1.1, C.lime);
    k.bench(null, .55, .05, .2, -Math.PI / 2); k.lampPost(null, .1, .05, .78, .5);
    for (let i = 0; i < 3; i++) k.bike(null, -.2 + i * .1, .03, .86, Math.PI / 2, [acc, C.lime, C.navy][i]);
    k.box(null, .28, .015, .28, M.paint('#e9d39a'), .72, .05, .1);
    if (tier >= 3) { const y = .03 + H + .04; k.box(null, 1.6, .03, .45, M.grass(), .05, y, -.62); for (let i = 0; i < 9; i++) k.sph(null, .05, M.leaf(i % 2 ? C.leafG : C.leaf), -.6 + i * .16, y + .05, -.62 + (i % 3 - 1) * .12, 1, .7, 1, 8); solar(k, -.62, y, .4, 3, .13); }
  },
  // ---- courtyard block: two-storey wings around a shared garden with a fountain, entered through an arch (2×2)
  courtyard(k, v, tier = 1) {
    const P = pal(v + 2), col = ['#f0dcc0', '#e2c4a8', '#e8e0cc'][v % 3], WL = M.wall(col, true), R = M.roof(P.roof), fh = .27;
    k.box(null, 1.94, .03, 1.94, M.paint('#e1d6bf'));
    k.box(null, .9, .02, .9, M.grass(), 0, .03, 0);
    const T = .45, wings = [[0, -.72, 1.9, T, 0], [0, .72, 1.9, T, 0], [-.72, 0, T, .99, 1], [.72, 0, T, .99, 1]];
    wings.forEach(([x, z, w, d], i) => {
      const fl = 2 + (tier >= 2 && i === 0 ? 1 : 0), H = .06 + fl * fh;
      k.box(null, w, H, d, WL, x, .03, z);
      k.prism(null, w + .1, d + .1, Math.max(.05, w - .4), Math.max(.05, d - .4), .22, R, x, .03 + H, z);
    });
    // windows on the outer faces, arch in the front wing
    const front = k.face(null, 0, .72, 1.9, T, 0);
    for (const x of [-.75, -.45, .45, .75]) { k.win(front, x, .12, .13, .18, { trim: P.trim, shut: P.door }); k.win(front, x, .4, .13, .18, { trim: P.trim, flowers: true }); }
    k.box(front, .3, .3, .02, M.paint('#5a4636'), 0, .03, -.005);
    k.m(front, new THREE.CylinderGeometry(.15, .15, .02, 14, 1, false, Math.PI / 2, Math.PI), M.paint('#5a4636'), 0, .33, -.005, 0, Math.PI / 2);
    k.round(front, 0, .5, .05, P.trim);
    for (const sd of [1, 3]) { const s = k.face(null, sd === 1 ? .72 : -.72, 0, T, .99, sd); for (const x of [-.3, 0, .3]) { k.win(s, x, .12, .12, .18, { trim: P.trim }); k.win(s, x, .4, .12, .18, { trim: P.trim, shut: P.door }); } }
    const back = k.face(null, 0, -.72, 1.9, T, 2); for (let i = 0; i < 6; i++) k.win(back, -.75 + i * .3, .4, .12, .18, { trim: P.trim });
    // the garden
    k.cyl(null, .16, .18, .06, M.stone('#d6cdb8'), 0, .03, 0, 18); k.cyl(null, .14, .14, .01, M.paint(C.water), 0, .09, 0, 18); k.cyl(null, .02, .03, .12, M.stone('#d6cdb8'), 0, .09, 0, 8);
    for (const [x, z] of [[-.3, -.3], [.3, .28]]) k.citrus(null, x, .05, z, 1, C.lemon);
    for (const [x, z] of [[.3, -.28], [-.3, .3]]) k.bloom(null, x, .08, z, .16, 5, [C.pink, C.white, C.lav]);
    k.bench(null, -.2, .05, .02, Math.PI / 2);
    if (tier >= 2) { const g = k.face(null, 0, -.72, 1.9, T, 0); for (let i = 0; i < 5; i++) k.balcony(g, -.6 + i * .3, .32, .2, .08, { flowers: i % 2 === 0 }); }
    if (tier >= 3) { pergola(k, .05, .05, -.28, .34, .22); k.box(null, .3, .3, .3, WL, .72, .03 + .06 + 2 * fh, -.72); k.prism(null, .36, .36, 0, 0, .14, R, .72, .03 + .36 + 2 * fh, -.72); const tf = k.face(null, .72, -.72, .3, .3, 0); k.win(tf, 0, .7, .1, .14, { trim: P.trim }); }
  },
};
