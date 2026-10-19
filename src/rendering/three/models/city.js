// Public services, neighbourhood commerce and light industry.
import * as THREE from 'three';
import { C, M, windowMat, waterMat, lampMat, prismGeo } from '../art.js';
export const CITY_MODELS = {
  school(k) {
    const Wl = M.wall('#dc9f72', true), R = M.roof(C.tealD), P = M.paint(C.ivory);
    k.box(null, 1.94, .03, 1.94, M.paint('#e2d6bf'));
    k.box(null, 1.62, .07, .64, M.stone('#cfc4ae'), 0, .03, -.48);
    k.box(null, 1.56, .8, .58, Wl, 0, .1, -.48);
    k.box(null, 1.6, .03, .62, P, 0, .5, -.48);
    k.gable(null, 0, .9, -.48, 1.56, .58, .3, R, Wl, .07);
    k.box(null, .42, .9, .1, Wl, 0, .1, -.15); k.gable(null, 0, 1.0, -.15, .42, .1, .22, R, Wl, .03, true);
    const cf = k.face(null, 0, -.15, .42, .1, 0); k.door(cf, 0, .2, .3, C.tealD, { arch: true, glass: true, y: .1 }); k.round(cf, 0, 1.08, .06); k.win(cf, 0, .6, .14, .22);
    k.box(null, .12, .12, .12, P, 0, 1.2, -.48); k.prism(null, .17, .17, 0, 0, .14, R, 0, 1.32, -.48); k.box(null, .04, .04, .13, M.paint(C.lemonD), 0, 1.24, -.48);
    const f = k.face(null, 0, -.48, 1.56, .58, 0);
    for (const x of [-.62, -.38, .38, .62]) { k.win(f, x, .2, .14, .24, { trim: C.ivory }); k.win(f, x, .6, .14, .22, { trim: C.ivory }); }
    for (const sd of [1, 3]) { const s = k.face(null, 0, -.48, 1.56, .58, sd); k.win(s, -.12, .2, .12, .22); k.win(s, .12, .6, .12, .2); }
    k.sign(f, -.2, .55, .02, 'pencil', .22, .11);
    // playground
    k.box(null, .4, .012, .3, M.paint('#e9d39a'), -.55, .03, .5);
    for (const x of [-.75, -.35]) { k.m(null, new THREE.BoxGeometry(.015, .3, .015), M.paint(C.lime), x, .17, .38, 0, .25); k.m(null, new THREE.BoxGeometry(.015, .3, .015), M.paint(C.lime), x, .17, .62, 0, -.25); }
    k.box(null, .42, .015, .015, M.paint(C.lime), -.55, .31, .5); for (const x of [-.65, -.45]) { k.box(null, .005, .2, .005, M.paint(C.iron), x, .1, .5); k.box(null, .06, .01, .03, M.paint(C.lemon), x, .1, .5); }
    k.box(null, .1, .2, .1, M.paint(C.lemon), .35, .03, .45); k.m(null, new THREE.BoxGeometry(.08, .01, .32), M.paint(C.lime), .35, .13, .64, 0, .55);
    k.cyl(null, .008, .008, .7, M.paint(C.iron), .75, .03, .7, 6); k.box(null, .005, .08, .13, M.paint(C.lemon), .75, .64, .76);
    k.citrus(null, -.15, .03, .75, 1.1, C.lemon); k.citrus(null, .7, .03, .2, 1, C.lime);
    k.fence(null, -.93, .93, .93, .93, C.white, .1);
  },
  clinic(k) {
    const P = M.paint(C.white), G = M.paint('#a8d08d');
    k.box(null, .9, .02, .9, M.paint(C.concrete));
    k.box(null, .66, .78, .54, M.wall(C.white), 0, .02, -.12);
    k.box(null, .68, .1, .56, G, 0, .02, -.12);
    k.box(null, .7, .05, .58, M.paint('#e6e1d6'), 0, .8, -.12);
    k.box(null, .06, .2, .02, M.paint(C.limeD), .2, .85, .13); k.box(null, .2, .06, .02, M.paint(C.limeD), .2, .92, .13);
    const f = k.face(null, 0, -.12, .66, .54, 0);
    k.door(f, -.12, .2, .3, '#cfe6d6', { glass: true, trim: C.limeD, y: .02 }); k.box(f, .42, .025, .24, M.paint(C.limeD), -.1, .38, .12);
    for (const x of [-.31, .09]) k.box(f, .02, .36, .02, M.paint(C.iron), x, .02, .23);
    k.win(f, .2, .14, .16, .2, { trim: C.limeD }); for (const x of [-.18, .1]) k.win(f, x, .5, .2, .18, { trim: C.limeD });
    k.sign(f, .2, .4, .02, 'cross', .14, .1);
    for (const sd of [1, 2, 3]) { const s = k.face(null, 0, -.12, .66, .54, sd); k.win(s, -.1, .16, .16, .18); k.win(s, .1, .5, .16, .18); }
    k.car(null, -.2, .02, .32, 0, C.white, .3); k.box(null, .1, .012, .152, M.paint(C.limeD), -.2, .09, .32);
    k.pot(null, .32, .02, .36, 1.2, C.terra, [C.white, C.lemon]);
  },
  fire(k) {
    const B = M.wall(C.brick, true);
    k.box(null, .94, .02, .94, M.paint(C.concrete));
    k.box(null, .62, .6, .56, B, -.08, .02, -.14);
    k.box(null, .66, .04, .6, M.paint(C.ivory), -.08, .62, -.14);
    k.box(null, .18, 1.12, .18, B, .3, .02, -.3); k.prism(null, .22, .22, 0, 0, .14, M.roof(C.charcoal), .3, 1.14, -.3);
    const tf = k.face(null, .3, -.3, .18, .18, 0); for (const y of [.5, .8]) k.win(tf, 0, y, .07, .12);
    const f = k.face(null, -.08, -.14, .62, .56, 0);
    for (const x of [-.15, .15]) { k.box(f, .24, .34, .015, M.garage('#c94a3f'), x, .02, .008); k.box(f, .28, .03, .03, M.paint(C.ivory), x, .36, .015); }
    k.sign(f, 0, .47, .02, 'flame', .2, .1); for (const x of [-.2, .2]) k.win(f, x, .44, .12, .1);
    for (const sd of [2, 3]) { const s = k.face(null, -.08, -.14, .62, .56, sd); k.win(s, 0, .2, .14, .18); }
    const tr = k.g(null, -.23, .02, .3); k.car(tr, 0, 0, 0, Math.PI / 2, '#c94a3f', .34); k.box(tr, .03, .02, .26, M.paint(C.zinc), 0, .17, 0);
    k.box(null, .02, .05, .02, M.paint(C.red), .32, .02, .32); k.cyl(null, .02, .02, .03, M.paint(C.red), .32, .07, .32, 8);
  },
  police(k) {
    const Wl = M.wall('#dfe3e4'), N = M.paint(C.navy);
    k.box(null, .94, .02, .94, M.paint(C.concrete));
    k.box(null, .66, .8, .54, Wl, 0, .02, -.12); k.box(null, .68, .1, .56, N, 0, .02, -.12);
    k.prism(null, .74, .62, .3, 0, .22, M.roof(C.slate), 0, .82, -.12);
    const f = k.face(null, 0, -.12, .66, .54, 0);
    k.door(f, 0, .16, .3, C.navy, { glass: true, y: .06 }); k.box(f, .3, .06, .1, M.paint(C.stone), 0, 0, .05);
    k.box(f, .05, .05, .05, lampMat, 0, .44, .04); k.mark(f, 0, .46, .07, 'glow');
    k.sign(f, 0, .55, .02, 'star', .2, .1);
    for (const x of [-.22, .22]) { k.win(f, x, .18, .14, .2); k.win(f, x, .54, .14, .2, { shut: C.navy }); }
    for (const sd of [1, 2, 3]) { const s = k.face(null, 0, -.12, .66, .54, sd); k.win(s, -.12, .2, .13, .2); k.win(s, .12, .55, .13, .2); }
    k.car(null, .22, .02, .33, 0, '#eef0f2', .28); k.box(null, .29, .015, .152, N, .22, .07, .33); k.box(null, .06, .02, .05, lampMat, .2, .18, .33);
    k.citrus(null, -.3, .02, .35, .9, C.lime);
  },
  library(k) {
    const S = M.stone('#e6dcc7'), P = M.paint(C.ivory);
    for (let i = 0; i < 3; i++) k.box(null, .86 - i * .06, .03, .9 - i * .05, M.paint(C.stone), 0, i * .03, 0);
    k.box(null, .66, .6, .48, S, 0, .09, -.14);
    k.gable(null, 0, .69, -.04, .72, .72, .2, M.roof(C.tealD), S, .04, true);
    for (const x of [-.27, -.09, .09, .27]) { k.cyl(null, .026, .03, .58, P, x, .09, .26, 12); k.box(null, .07, .02, .07, P, x, .66, .26); }
    k.box(null, .72, .05, .1, P, 0, .66, .26);
    const f = k.face(null, 0, -.14, .66, .48, 0); k.door(f, 0, .16, .32, C.tealD, { arch: true, glass: true, y: .09 }); k.sign(f, 0, .58, .02, 'book', .22, .08);
    for (const sd of [1, 3]) { const s = k.face(null, 0, -.14, .66, .48, sd); for (const x of [-.12, .12]) k.win(s, x, .2, .1, .32, { arch: true }); }
    k.bench(null, -.25, .09, .38, 0); k.pot(null, .32, .09, .38, 1, C.terra, [C.lemon, C.white]);
  },
  park(k) {
    const G = M.paint('#e7dcc3');
    k.box(null, 1.94, .03, 1.94, M.grass());
    k.cyl(null, .64, .64, .012, G, 0, .03, 0, 32); k.cyl(null, .48, .48, .016, M.grass(), 0, .03, 0, 32);
    k.box(null, .16, .012, .5, G, 0, .03, .75); k.box(null, .5, .012, .16, G, -.75, .03, 0);
    k.cyl(null, .22, .22, .04, M.wood(C.wood), 0, .03, 0, 6);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; k.cyl(null, .012, .012, .3, M.paint(C.ivory), Math.cos(a) * .19, .07, Math.sin(a) * .19, 6); }
    k.m(null, new THREE.ConeGeometry(.28, .18, 6), M.roof(C.limeD), 0, .46, 0); k.sph(null, .025, M.lemon(), 0, .57, 0, 1.2, 1, 1, 8);
    for (const [x, z, f] of [[-.72, -.72, C.lemon], [.72, -.7, C.lime], [.75, .55, C.lemon], [-.6, .7, C.lime]]) k.citrus(null, x, .03, z, 1.3, f);
    k.cyl(null, .03, .05, .4, M.wood(C.woodD), .3, .03, -.78, 8); for (const [x, y, z, r] of [[.3, .58, -.78, .24], [.45, .5, -.7, .16], [.18, .5, -.68, .16]]) k.sph(null, r, M.leaf(C.leafD), x, y, z, 1, .85, 1, 12);
    k.cyl(null, .22, .24, .012, waterMat, .55, .035, .15, 18); for (const [dx, dz] of [[0, 0], [.08, .06]]) { k.sph(null, .025, M.dot(C.white), .5 + dx, .06, .1 + dz, 1.3, 1, 1, 6); k.sph(null, .012, M.dot(C.white), .53 + dx, .085, .1 + dz, 1, 1, 1, 6); }
    k.bench(null, 0, .03, -.58, 0); k.bench(null, .58, .03, .62, -Math.PI / 4); k.lampPost(null, -.3, .03, .62, .5);
    for (const [x, z] of [[-.4, -.3], [.3, .35], [-.25, .35]]) k.bloom(null, x, .08, z, .12, 4, [C.lemon, C.white, C.pink]);
  },
  water(k) {
    const S = M.paint('#d6d0c4'), I = M.paint(C.zinc);
    k.box(null, 1.94, .03, 1.94, M.paint('#d9d3c6'));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.m(null, new THREE.BoxGeometry(.03, .72, .03), M.paint(C.tealD), -.4 + sx * .14, .39, -.35 + sz * .14, 0, sz * .12, -sx * .12);
    k.cyl(null, .3, .3, .32, M.paint(C.lemon), -.4, .72, -.35, 22); k.m(null, new THREE.ConeGeometry(.32, .14, 22), M.paint(C.tealD), -.4, 1.11, -.35);
    k.box(null, .005, .3, .03, M.paint(C.ivory), -.4 + .3 * Math.sin(Math.PI / 4), .73, -.35 + .3 * Math.cos(Math.PI / 4), Math.PI / 4);
    const tf = k.g(null, -.4, 0, -.35, Math.PI / 4); k.sign(tf, 0, .88, .305, 'lemon', .16, .16); k.sign(tf, 0, .78, .305, 'drop', .1, .08);
    for (const z of [.45, -.25]) { k.cyl(null, .3, .31, .14, S, .45, .03, z, 22); k.cyl(null, .27, .27, .01, waterMat, .45, .165, z, 22); }
    k.m(null, new THREE.CylinderGeometry(.03, .03, .7, 8), I, .45, .1, .1, 0, Math.PI / 2); k.m(null, new THREE.CylinderGeometry(.03, .03, .8, 8), I, 0, .1, -.3, 0, 0, Math.PI / 2);
    k.box(null, .36, .26, .3, M.wall(C.cream), -.45, .03, .5); k.gable(null, -.45, .29, .5, .36, .3, .12, M.roof(C.tealD), M.wall(C.cream), .04);
    const pf = k.face(null, -.45, .5, .36, .3, 0); k.door(pf, .06, .1, .2, C.tealD, { y: .03 });
    k.fence(null, -.93, .93, .93, .93, C.zinc, .14); k.fence(null, .93, .93, .93, -.93, C.zinc, .14);
  },
  power(k) {
    const I = M.paint(C.zinc), Gr = M.paint('#7f8f7a');
    k.box(null, 1.94, .03, 1.94, M.paint('#cfc9bb'));
    for (const x of [-.45, .05, .55]) { k.box(null, .26, .26, .2, Gr, x, .03, .25); for (let i = 0; i < 6; i++) k.box(null, .012, .2, .24, Gr, x - .11 + i * .044, .05, .25);
      for (const dx of [-.07, 0, .07]) { k.cyl(null, .012, .012, .12, M.paint(C.charcoal), x + dx, .29, .25, 6); for (let j = 0; j < 3; j++) k.cyl(null, .022, .022, .012, M.paint('#c98447'), x + dx, .31 + j * .03, .25, 8); } }
    for (const x of [-.7, .7]) k.box(null, .04, .9, .04, I, x, .03, -.35);
    k.box(null, 1.44, .04, .04, I, 0, .9, -.35); k.box(null, 1.44, .03, .03, I, 0, .7, -.35);
    for (const x of [-.45, .05, .55]) k.m(null, new THREE.CylinderGeometry(.004, .004, .65, 4), M.paint(C.charcoal), x, .62, -.05, 0, .95);
    k.box(null, .36, .3, .3, M.wall(C.cream), -.55, .03, -.68); k.box(null, .4, .03, .34, M.paint(C.charcoal), -.55, .33, -.68);
    const cf = k.face(null, -.55, -.68, .36, .3, 0); k.door(cf, .08, .1, .2, C.lemonD, { y: .03 }); k.sign(cf, -.08, .2, .02, 'bolt', .12, .08);
    for (let i = 0; i < 3; i++) k.m(null, new THREE.BoxGeometry(.3, .012, .2), M.paint(C.navy), .35 + (i % 2) * .0, .14, -.75 + i * 0, 0, -.5).position.set(.2 + i * .25, .14, -.7);
    k.fence(null, -.93, .93, .93, .93, C.zinc, .16); k.fence(null, -.93, .93, -.93, -.93, C.zinc, .16); k.fence(null, .93, .93, .93, -.93, C.zinc, .16);
  },
  waste(k) {
    const C2 = M.paint(C.concrete);
    k.box(null, 1.94, .03, 1.94, C2);
    for (const [x, z] of [[-.7, -.75], [.7, -.75], [-.7, -.1], [.7, -.1]]) k.box(null, .04, .45, .04, M.paint(C.limeD), x, .03, z);
    k.gable(null, 0, .48, -.42, 1.5, .78, .16, M.corrug(C.limeD), M.corrug(C.limeD), .06);
    k.box(null, .6, .22, .36, M.paint(C.orange), -.3, .03, -.45); k.box(null, .4, .18, .3, M.paint('#7f8f7a'), .4, .03, -.5);
    const bins = [C.lime, C.lemon, C.navy, C.woodD];
    bins.forEach((c, i) => { k.box(null, .14, .16, .14, M.paint(c), -.45 + i * .2, .03, .35); k.box(null, .15, .02, .15, M.paint(C.charcoal), -.45 + i * .2, .19, .35); });
    for (const [x, z] of [[.55, .4], [.75, .6]]) { k.sph(null, .16, M.paint(C.soil), x, .05, z, 1, .45, 1, 10); k.sph(null, .05, M.leaf(C.leaf), x, .12, z, 1, .5, 1, 6); }
    k.car(null, -.1, .03, .7, 0, C.lime, .34); k.box(null, .18, .12, .15, M.paint(C.limeD), -.17, .1, .7);
    const pf = k.g(null, 0, 0, .9); k.box(pf, .025, .26, .025, M.wood(C.woodD), .55, .03, 0); k.sign(pf, .55, .26, .01, 'recycle', .2, .12);
  },
  market(k) {
    const I = M.paint(C.tealD);
    k.box(null, 1.94, .03, 1.94, M.cobble());
    for (const x of [-.75, -.25, .25, .75]) for (const z of [-.6, .2]) k.cyl(null, .025, .03, .62, I, x, .03, z, 8);
    k.box(null, 1.6, .05, .9, M.wood(C.wood), 0, .64, -.2);
    k.gable(null, 0, .69, -.2, 1.6, .9, .32, M.roof(C.terra), M.wood(C.woodD), .1);
    k.box(null, .5, .14, .3, M.wood(C.woodD), 0, 1.0, -.2); k.gable(null, 0, 1.14, -.2, .5, .3, .1, M.roof(C.terra), M.wood(C.woodD), .04);
    const fr = [C.lemon, C.lime, C.orange, '#d2564b', C.leaf];
    for (let s = 0; s < 4; s++) { const x = -.6 + s * .4; k.box(null, .3, .14, .2, M.wood(C.wood), x, .03, -.15);
      for (let i = 0; i < 8; i++) k.sph(null, .025, M.lemon(fr[(s + i) % 5]), x - .1 + (i % 4) * .065, .2, -.2 + Math.floor(i / 4) * .08, 1.15, 1, 1, 6); }
    for (let s = 0; s < 3; s++) { const x = -.55 + s * .55; const af = k.g(null, x, 0, .45); k.box(af, .32, .12, .18, M.wood(C.wood), 0, .03, .0); for (let i = 0; i < 6; i++) k.sph(af, .025, M.lemon(fr[(s * 2 + i) % 5]), -.1 + (i % 3) * .1, .18, -.04 + Math.floor(i / 3) * .08, 1.15, 1, 1, 6);
      for (const sx of [-1, 1]) k.box(af, .012, .34, .012, M.paint(C.woodD), sx * .15, .03, .08); k.awning(af, 0, .37, .38, .16, s % 2 ? [C.lime, C.white] : [C.lemon, C.white], .3); }
    const f = k.g(null, 0, .55, .26); k.sign(f, 0, 0, 0, 'basket', .3, .14);
    for (let i = 0; i < 3; i++) k.box(null, .12, .07, .09, M.wood(C.wood), .7, .03 + i * .07, .75 - i * .02);
  },
  citruscafe(k) {
    k.box(null, .9, .02, .9, M.cobble());
    k.box(null, .56, .5, .46, M.wall(C.lemon), -.05, .02, -.14);
    k.box(null, .62, .05, .52, M.paint(C.ivory), -.05, .52, -.14);
    const f = k.face(null, -.05, -.14, .56, .46, 0);
    k.box(f, .3, .18, .01, windowMat, -.08, .22, .006); k.box(f, .36, .05, .1, M.wood(C.wood), -.08, .2, .05);
    for (let i = 0; i < 4; i++) { k.cyl(f, .018, .016, .05, M.paint(C.lemonP), -.2 + i * .08, .25, .06, 8); k.cyl(f, .014, .014, .03, M.paint(C.lemon), -.2 + i * .08, .255, .06, 8); }
    k.awning(f, -.05, .46, .54, .2, [C.lime, C.white]); k.door(f, .2, .12, .3, C.limeD, { glass: true, y: .02 });
    // the giant lemonade glass on the roof
    k.cyl(null, .1, .08, .26, M.paint('#f6efc9'), -.05, .57, -.14, 16); k.cyl(null, .085, .07, .18, M.paint(C.lemon), -.05, .58, -.14, 16);
    k.box(null, .012, .22, .012, M.paint(C.lime), .0, .74, -.14).rotation.z = -.3;
    k.cyl(null, .055, .055, .012, M.lemon(C.lime), .05, .82, -.14, 14).rotation.x = Math.PI / 2;
    k.table(null, -.25, .02, .34); k.table(null, .2, .02, .36);
    k.citrus(null, .36, .02, -.3, 1, C.lemon);
    for (const s of [-1, 1]) k.m(null, new THREE.BoxGeometry(.1, .15, .01), M.sign('glass'), .38, .09, .12 + s * .03, Math.PI / 2, s * .2);
  },
  workshop(k) {
    const Wd = M.wood('#9a6b45');
    k.box(null, .94, .02, .94, M.paint('#d8ccb4'));
    k.box(null, .6, .48, .56, Wd, -.05, .02, -.12);
    k.gable(null, -.05, .5, -.12, .6, .56, .3, M.roof('#6b5a4c'), Wd, .06, true);
    const f = k.face(null, -.05, -.12, .6, .56, 0);
    k.box(f, .3, .36, .016, M.slat(C.woodD), -.1, .02, .008); k.m(f, new THREE.BoxGeometry(.02, .42, .01), M.wood(C.wood), -.1, .2, .02, 0, 0, .7);
    k.box(f, .5, .012, .02, M.paint(C.iron), -.05, .4, .02); k.win(f, .18, .2, .1, .14); k.round(f, 0, .62, .05);
    k.box(f, .01, .01, .12, M.paint(C.iron), .26, .44, .06); k.sign(f, .26, .36, .12, 'saw', .16, .08, Math.PI / 2);
    k.cyl(null, .022, .022, .4, M.paint(C.charcoal), .12, .5, -.28, 8); k.mark(null, .12, .92, -.28, 'smoke');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) k.box(null, .5, .03, .05, M.wood(i % 2 ? '#c49a6c' : '#b58a5a'), -.06, .02 + i * .03, .33 + j * .07);
    for (const x of [.32, .4]) { k.m(null, new THREE.BoxGeometry(.012, .1, .012), M.wood(C.wood), x, .06, .3, 0, 0, .3); k.m(null, new THREE.BoxGeometry(.012, .1, .012), M.wood(C.wood), x, .06, .38, 0, 0, -.3); }
    k.box(null, .02, .012, .16, M.wood(C.wood), .36, .1, .34);
  },
  cannery(k) {
    const B = M.wall(C.brick, true);
    k.box(null, 1.94, .03, 1.94, M.paint(C.concrete));
    k.box(null, 1.5, .55, 1.0, B, -.12, .03, -.38);
    for (let i = 0; i < 3; i++) k.gable(null, -.62 + i * .5, .58, -.38, .5, 1.0, .2, M.roof(C.slate), B, .02, true);
    for (let i = 0; i < 3; i++) k.m(null, new THREE.BoxGeometry(.012, .1, .9), windowMat, -.74 + i * .5, .68, -.38, 0, 0, -1.1);
    k.cyl(null, .07, .09, 1.2, M.wall(C.brick), .68, .03, -.68, 14); k.cyl(null, .085, .085, .05, M.paint(C.charcoal), .68, 1.2, -.68, 14); k.mark(null, .68, 1.3, -.68, 'smoke');
    k.box(null, .9, .08, .25, M.paint(C.stone), -.3, .03, .25);
    const f = k.face(null, -.12, -.38, 1.5, 1.0, 0);
    for (const x of [-.48, -.08]) { k.box(f, .28, .3, .015, M.garage(C.lemonP), x, .11, .008); k.box(f, .32, .03, .03, M.paint(C.lemonD), x, .42, .015); }
    k.sign(f, .4, .35, .02, 'jar', .3, .15); k.win(f, .4, .12, .2, .16);
    for (let i = 0; i < 3; i++) { k.box(null, .14, .1, .12, M.wood(C.wood), .45 + (i % 2) * .16, .03 + Math.floor(i / 2) * .1, .4); for (let j = 0; j < 4; j++) k.cyl(null, .018, .018, .04, M.paint(j % 2 ? C.lemon : C.orange), .41 + (i % 2) * .16 + (j % 2) * .06, .13 + Math.floor(i / 2) * .1, .37 + Math.floor(j / 2) * .06, 8); }
    k.car(null, -.6, .03, .65, 0, C.white, .36); k.box(null, .22, .14, .15, M.paint(C.white), -.67, .1, .65); k.sign(null, -.67, .18, .73, 'lemon', .1, .08);
  },
  distribution(k) {
    const Wl = M.corrug('#c9cfc6');
    k.box(null, 1.94, .03, 1.94, M.paint(C.concrete));
    k.box(null, 1.6, .5, .95, Wl, 0, .03, -.4);
    k.gable(null, 0, .53, -.4, 1.6, .95, .14, M.corrug('#8fa08a'), Wl, .05);
    k.box(null, 1.5, .12, .22, M.paint(C.stone), 0, .03, .18);
    const f = k.face(null, 0, -.4, 1.6, .95, 0);
    for (const x of [-.5, 0, .5]) { k.box(f, .3, .32, .015, M.garage('#e8e2d0'), x, .15, .008); k.box(f, .34, .03, .03, M.paint(C.lemon), x, .47, .015); }
    k.sign(f, -.68, .4, .02, 'box', .16, .12);
    for (const x of [-.5, .3]) { k.car(null, x, .03, .55, Math.PI / 2, C.white, .36); k.box(null, .17, .16, .22, M.paint(C.lemonP), x, .1, .5); k.box(null, .172, .02, .222, M.paint(C.lime), x, .2, .5); }
    for (let i = 0; i < 3; i++) { k.box(null, .2, .03, .2, M.wood(C.wood), .75, .03, .4 + i * 0 - .2 + i * .25); k.box(null, .16, .12, .16, M.paint('#d8b98c'), .75, .06, .2 + i * .25); }
  },
};
