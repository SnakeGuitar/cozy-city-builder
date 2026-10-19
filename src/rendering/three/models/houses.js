// Eight homes: four traditions × two eras.
import * as THREE from 'three';
import { C, M, windowMat, waterMat, lampMat, prismGeo } from '../art.js';
export const HOUSE_MODELS = {
  // ---- Japanese traditional: timber frame, plaster, deep tiled eaves, covered entry, small garden (2×2)
  jp_trad(k, v) {
    const wall = ['#efe6d2', '#e8dcc4'][v], roof = ['#59636b', '#6b5a4c'][v], W = M.wood(C.woodD), R = M.roof(roof);
    k.box(null, 1.94, .03, 1.94, M.paint('#e4dccb'));
    for (const [x, z, r] of [[.6, .55, .3], [-.65, -.85, .2], [.75, -.8, .18]]) k.cyl(null, r, r + .02, .012, M.grass(), x, .03, z, 16);
    // hedge, stone wall and a small roofed gate
    k.box(null, 1.86, .15, .08, M.leaf(C.leafD), 0, .03, -.92); k.box(null, .08, .15, 1.8, M.leaf(C.leafD), -.92, .03, 0); k.box(null, .08, .15, 1.8, M.leaf(C.leafD), .92, .03, 0);
    k.box(null, .72, .12, .07, M.stone('#cfc6b4'), -.56, .03, .92); k.box(null, .72, .12, .07, M.stone('#cfc6b4'), .56, .03, .92);
    for (const x of [-.13, .13]) k.box(null, .035, .3, .035, W, x, .03, .92);
    k.gable(null, 0, .33, .92, .38, .14, .06, R, W, .04);
    // main house
    const HX = -.05, HZ = -.3, WW = 1.35, D = .9;
    k.box(null, WW + .04, .1, D + .04, M.stone('#bdb4a3'), HX, .03, HZ);
    k.box(null, WW, .42, D, M.paint(wall), HX, .13, HZ);
    for (const sd of [0, 1, 2, 3]) {
      const f = k.face(null, HX, HZ, WW, D, sd), fw = sd % 2 ? D : WW, n = Math.round(fw / .26);
      for (let i = 0; i <= n; i++) k.box(f, .03, .42, .025, W, -fw / 2 + i * fw / n, .13, .012);
      k.box(f, fw, .03, .028, W, 0, .52, .014); k.box(f, fw, .025, .028, W, 0, .13, .014);
      for (let i = 0; i < n; i++) if ((i + sd) % 3 !== 2) k.box(f, fw / n - .05, .3, .01, M.shoji(), -fw / 2 + (i + .5) * fw / n, .18, .01);
    }
    k.box(null, WW, .04, .17, M.wood(C.wood), HX, .1, HZ + D / 2 + .085);
    for (const x of [-.6, -.2, .2, .55]) k.box(null, .025, .07, .025, W, HX + x, .03, HZ + D / 2 + .15);
    k.prism(null, WW + .44, D + .44, WW + .04, D + .04, .15, R, HX, .55, HZ);
    k.box(null, WW * .62, .36, D * .66, M.paint(wall), HX - .12, .6, HZ - .04);
    const uf = k.face(null, HX - .12, HZ - .04, WW * .62, D * .66, 0);
    for (const x of [-.3, -.1, .1, .3]) k.box(uf, .025, .36, .02, W, x, .6, .01);
    k.box(uf, .16, .14, .01, M.shoji(), -.2, .75, .01); k.box(uf, .16, .14, .01, M.shoji(), .2, .75, .01);
    k.prism(null, WW * .62 + .4, D * .66 + .4, WW * .25, 0, .3, R, HX - .12, .95, HZ - .04);
    k.box(null, WW * .25 + .08, .04, .05, M.paint(C.charcoal), HX - .12, 1.24, HZ - .04);
    // covered entrance (genkan)
    const gx = HX + .45, gz = HZ + D / 2 + .13;
    for (const x of [-.14, .14]) k.box(null, .03, .42, .03, W, gx + x, .13, gz + .1);
    k.gable(null, gx, .55, gz, .36, .32, .13, R, W, .05, true);
    const ff = k.face(null, HX, HZ, WW, D, 0); k.box(ff, .22, .33, .016, M.slat(C.wood), .45, .14, .02);
    // garden: maple, stone lantern, pond, stepping stones
    k.cyl(null, .02, .03, .3, W, .6, .03, .5, 6);
    for (const [x, y, z, r, c] of [[.6, .42, .5, .15, '#d2683e'], [.68, .36, .58, .1, '#e08a4a'], [.52, .38, .42, .11, '#c4553a']]) k.sph(null, r, M.leaf(c), x, y, z, 1, .8, 1, 10);
    const L = M.stone('#c9c1b1'); k.cyl(null, .045, .055, .04, L, .2, .03, .62, 8); k.box(null, .03, .12, .03, L, .2, .07, .62); k.box(null, .07, .06, .07, lampMat, .2, .19, .62); k.prism(null, .12, .12, 0, 0, .06, L, .2, .25, .62); k.mark(null, .2, .22, .62, 'glow');
    k.cyl(null, .24, .24, .012, waterMat, -.48, .04, .55, 18); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; k.sph(null, .035, M.dot('#a9a094'), -.48 + Math.cos(a) * .25, .05, .55 + Math.sin(a) * .25, 1, .6, 1, 6); }
    for (let i = 0; i < 4; i++) k.cyl(null, .06, .065, .015, L, 0 + (i % 2) * .08, .03, .82 - i * .14, 10);
    k.cyl(null, .02, .03, .18, W, -.75, .03, .2, 6); for (const [y, r] of [[.24, .12], [.32, .09], [.39, .06]]) k.sph(null, r, M.leaf(C.leafG), -.75, y, .2, 1.3, .35, 1.1, 10);
  },
  // ---- Japanese contemporary: compact stacked volumes, light and timber cladding, careful openings, parking (1×1)
  jp_cont(k, v) {
    const light = ['#f1eee8', '#e7e4dc'][v], timber = ['#c79d6c', '#a98a6a'][v], T = C.charcoal;
    k.box(null, .94, .02, .94, M.paint(C.concrete));
    k.box(null, .56, .42, .5, M.panel(light), -.13, .02, -.15);
    k.box(null, .5, .36, .58, M.wood(timber), -.09, .44, -.1);
    k.box(null, .52, .03, .6, M.paint('#e9e4da'), -.09, .8, -.1);
    const f = k.face(null, -.13, -.15, .56, .5, 0);
    k.door(f, .15, .12, .3, T, { trim: '#e9e4da', y: .02 });
    k.win(f, -.1, .28, .26, .07, { trim: T });
    const uf = k.face(null, -.09, -.1, .5, .58, 0);
    k.win(uf, .1, .56, .16, .16, { trim: T }); k.win(uf, -.15, .5, .05, .26, { trim: T });
    const us = k.face(null, -.09, -.1, .5, .58, 1); k.win(us, -.12, .52, .26, .08, { trim: T });
    const ls = k.face(null, -.13, -.15, .56, .5, 1); k.win(ls, .05, .14, .07, .18, { trim: T });
    k.box(null, .36, .012, .52, M.paint('#d8d2c6'), .28, .02, .2);
    k.car(null, .28, .02, .2, Math.PI / 2, [C.sky, C.lemonP][v], .28);
    k.cyl(null, .04, .03, .06, M.paint(C.charcoal), -.36, .02, .34, 10);
    k.sph(null, .07, M.leaf('#d2683e'), -.36, .17, .34, 1, .8, 1, 8); k.cyl(null, .008, .01, .1, M.wood(C.woodD), -.36, .06, .34, 5);
    k.box(null, .3, .04, .06, M.paint(C.concrete), -.12, .02, .2); k.bloom(null, -.12, .08, .2, .22, 4, [C.white, C.lemon]);
  },
  // ---- American traditional: clapboard, gable roof, deep porch, front yard and picket fence (2×2)
  us_trad(k, v) {
    const col = [C.white, '#b9cfdd', C.lemonP][v], R = M.roof('#6f6a66'), sh = ['#3f5a45', '#4f6684', '#6e9a33'][v];
    k.box(null, 1.94, .03, 1.94, M.grass());
    k.box(null, .18, .012, .76, M.paint('#ddd5c5'), -.1, .03, .58);
    const HZ = -.28, WW = 1.2, D = .72;
    k.box(null, WW + .04, .1, D + .04, M.wall(C.brick), 0, .03, HZ);
    k.box(null, WW, .82, D, M.siding(col), 0, .13, HZ);
    k.gable(null, 0, .95, HZ, WW, D, .4, R, M.siding(col), .08);
    k.chimney(.48, .95, HZ - .1, .5);
    const dm = k.g(null, -.3, 1.0, HZ + .15); k.box(dm, .16, .14, .14, M.siding(col)); k.gable(dm, 0, .14, 0, .16, .14, .08, R, M.siding(col), .02, true); k.win(k.face(dm, 0, 0, .16, .14, 0), 0, .03, .08, .09);
    // porch
    const pz = HZ + D / 2;
    k.box(null, WW + .04, .07, .32, M.wood('#b8a58c'), 0, .03, pz + .16);
    for (const x of [-.58, -.25, .1, .58]) k.cyl(null, .022, .022, .42, M.paint(C.white), x, .1, pz + .29, 10);
    k.m(null, new THREE.BoxGeometry(WW + .14, .03, .38), R, 0, .55, pz + .17, 0, .22);
    k.fence(null, .15, pz + .29, .55, pz + .29, C.white, .1); k.fence(null, -.55, pz + .29, -.3, pz + .29, C.white, .1);
    k.box(null, .26, .035, .08, M.wood('#b8a58c'), -.1, .03, pz + .35);
    const f = k.face(null, 0, HZ, WW, D, 0);
    k.door(f, -.1, .15, .3, ['#7d3b2f', C.navy, '#7d3b2f'][v], { y: .13, glass: true });
    for (const x of [-.42, .3]) k.win(f, x, .24, .16, .25, { shut: sh });
    for (const x of [-.42, -.1, .3]) k.win(f, x, .6, .15, .24, { shut: sh, flowers: x === -.1 });
    for (const sd of [1, 3]) { const s = k.face(null, 0, HZ, WW, D, sd); k.win(s, -.15, .24, .15, .24); k.win(s, .15, .6, .14, .22); }
    const b = k.face(null, 0, HZ, WW, D, 2); k.win(b, -.3, .24, .15, .24); k.win(b, .3, .6, .15, .22);
    // yard
    k.fence(null, -.93, .92, -.22, .92); k.fence(null, .02, .92, .93, .92); k.fence(null, -.93, .92, -.93, .1); k.fence(null, .93, .92, .93, .1);
    k.box(null, .015, .16, .015, M.wood(C.woodD), .16, .03, .86); k.box(null, .09, .05, .05, M.paint(C.navy), .16, .19, .86);
    k.cyl(null, .03, .05, .36, M.wood(C.woodD), .6, .03, .5, 8); for (const [x, y, z, r] of [[.6, .5, .5, .22], [.72, .44, .42, .15], [.5, .44, .6, .15]]) k.sph(null, r, M.leaf(C.leaf), x, y, z, 1, .9, 1, 12);
    for (const x of [-.5, .35]) k.bloom(null, x, .1, pz + .38, .3, 6, [C.lemon, C.pink, C.white]);
  },
  // ---- American contemporary: broad suburban volumes, garage, stone + panel cladding (2×2)
  us_cont(k, v) {
    const pan = ['#8fa3ad', '#a6a08f'][v], T = C.charcoal;
    k.box(null, 1.94, .03, 1.94, M.grass());
    k.box(null, .52, .012, 1.0, M.paint(C.concrete), .6, .03, .45);
    k.box(null, .16, .012, .6, M.paint(C.concrete), -.08, .03, .62);
    k.box(null, 1.05, .45, .75, M.stone('#c9bba4'), -.3, .03, -.3);
    k.box(null, 1.1, .42, .7, M.panel(pan), -.34, .48, -.34);
    k.m(null, new THREE.BoxGeometry(1.24, .04, .86), M.paint(T), -.34, .93, -.34, 0, -.07);
    k.box(null, .56, .4, .64, M.siding('#ebe5d8'), .6, .03, -.36);
    k.box(null, .62, .035, .7, M.paint(T), .6, .43, -.36);
    const g = k.face(null, .6, -.36, .56, .64, 0); k.box(g, .44, .3, .015, M.garage('#f1ede4'), 0, .03, .008); k.wallLamp(g, -.25, .3);
    const f = k.face(null, -.3, -.3, 1.05, .75, 0);
    k.win(f, -.22, .1, .44, .27, { trim: T });
    k.door(f, .3, .14, .33, C.wood, { y: .03, trim: T }); k.box(f, .3, .025, .2, M.paint(T), .3, .42, .1);
    const uf = k.face(null, -.34, -.34, 1.1, .7, 0); k.win(uf, -.25, .56, .34, .25, { trim: T }); k.win(uf, .25, .58, .18, .22, { trim: T });
    for (const sd of [1, 2, 3]) { const s = k.face(null, -.34, -.34, 1.1, .7, sd); k.win(s, 0, .58, .22, .22, { trim: T }); }
    const ls = k.face(null, -.3, -.3, 1.05, .75, 3); k.win(ls, 0, .12, .3, .24, { trim: T });
    k.car(null, .6, .03, .55, Math.PI / 2, ['#c9d6dc', '#e8e1cf'][v], .34);
    for (let i = 0; i < 5; i++) k.sph(null, .07, M.leaf(i % 2 ? C.leafD : C.leaf), -.75 + i * .16, .08, .22, 1.2, .8, 1, 8);
    k.citrus(null, -.6, .03, .65, 1.2, C.lime);
    k.lampPost(null, .25, .03, .85, .4);
  },
  // ---- Mexican traditional: coloured plaster, courtyard, wrought iron, clay tile, planting (2×2)
  mx_trad(k, v) {
    const col = ['#e8a24b', '#e07a95', '#d9643f'][v], col2 = ['#f0c27a', '#ef9fb3', '#e98a5f'][v], band = ['#a8553a', '#8e3b5c', '#8a3a24'][v];
    const Wl = M.wall(col), I = M.paint(C.iron), P = M.paint(C.ivory);
    k.box(null, 1.94, .03, 1.94, M.stone('#d8a07c'));
    k.box(null, 1.9, .62, .4, Wl, 0, .03, .74);
    k.box(null, .4, .62, 1.3, Wl, -.75, .03, -.19);
    k.box(null, .4, .4, .6, M.wall(col2), -.75, .65, -.55);
    k.box(null, .4, .62, 1.02, Wl, .75, .03, -.33);
    k.box(null, 1.1, .42, .08, Wl, 0, .03, -.9);
    for (const [w, d, x, y, z] of [[1.92, .42, 0, .65, .74], [.42, 1.32, -.75, .65, -.19], [.42, .62, -.75, 1.05, -.55]]) { k.box(null, w, .05, .04, P, x, y, z + d / 2 - .02); k.box(null, w, .05, .04, P, x, y, z - d / 2 + .02); k.box(null, .04, .05, d, P, x - w / 2 + .02, y, z); k.box(null, .04, .05, d, P, x + w / 2 - .02, y, z); }
    k.gable(null, .75, .65, -.33, .4, 1.02, .18, M.roof(C.clay), Wl, .05, true);
    for (const x of [-.6, -.1, .4]) k.m(null, new THREE.CylinderGeometry(.015, .015, .14, 6), M.paint(C.clay), x, .63, .99, 0, Math.PI / 2);
    const f = k.face(null, 0, .74, 1.9, .4, 0);
    k.box(f, 1.9, .1, .006, M.paint(band), 0, .03, .004);
    k.door(f, 0, .26, .36, C.woodD, { arch: true, trim: C.ivory, y: .03 });
    for (const x of [-.6, .58]) { k.win(f, x, .18, .2, .28, { trim: C.ivory }); for (let i = 0; i < 6; i++) k.box(f, .008, .32, .008, I, x - .1 + i * .04, .16, .055); k.box(f, .24, .01, .01, I, x, .47, .055); k.pot(f, x, .07, .08, .8, C.clay, [C.magenta, C.lemon]); }
    const r = k.face(null, .75, -.33, .4, 1.02, 1); for (const x of [-.25, .2]) { k.win(r, x, .2, .14, .24, { trim: C.ivory }); for (let i = 0; i < 4; i++) k.box(r, .007, .27, .007, I, x - .06 + i * .04, .18, .05); }
    const lu = k.face(null, -.75, -.55, .4, .6, 0); k.balcony(lu, 0, .7, .3, .1, { rail: C.iron }); k.win(lu, 0, .74, .12, .24, { trim: C.ivory });
    for (let i = 0; i < 18; i++) k.sph(null, .04 + (i % 3) * .01, M.leaf(i % 3 ? C.magenta : C.leafG), .55 + (i % 6) * .07, .58 - Math.floor(i / 6) * .12, .95, 1, .8, .7, 8);
    k.cyl(null, .16, .18, .1, M.stone('#e9e1d2'), 0, .03, -.05, 16); k.cyl(null, .14, .14, .01, waterMat, 0, .13, -.05, 16); k.cyl(null, .03, .04, .16, M.paint('#4f7fb8'), 0, .13, -.05, 8);
    k.citrus(null, -.3, .03, .3, 1.1, C.lemon);
    for (const z of [-.6, -.2, .25]) k.cyl(null, .018, .018, .5, P, -.5, .03, z, 8);
    k.box(null, .05, .03, 1.1, P, -.5, .53, -.18);
    for (const [x, z] of [[.4, .3], [.35, -.5], [-.25, -.65]]) k.pot(null, x, .03, z, 1.4, C.clay, [C.magenta, C.orange, C.lemon]);
  },
  // ---- Mexican contemporary: concrete and plaster volumes, flat roof, celosía, carport, integrated planting (1×1)
  mx_cont(k, v) {
    const side = ['#d9825b', '#c96f7c'][v], CO = M.panel(C.concrete);
    k.box(null, .94, .02, .94, M.paint('#d6cfc2'));
    k.box(null, .24, .84, .62, M.wall(side), -.3, .02, -.1);
    k.box(null, .62, .4, .62, CO, .08, .44, -.1);
    k.box(null, .6, .42, .3, M.paint('#e9e2d4'), .06, .02, -.25);
    k.box(null, .045, .42, .045, CO, .34, .02, .17);
    const uf = k.face(null, .08, -.1, .62, .62, 0);
    k.box(uf, .44, .3, .01, windowMat, .02, .49, .005);
    k.slats(uf, .02, .49, .48, .3, 11, M.wood('#b07a4c'), .03);
    const us = k.face(null, .08, -.1, .62, .62, 1); k.win(us, 0, .52, .3, .22, { trim: C.charcoal });
    const sf = k.face(null, -.3, -.1, .24, .62, 0); k.door(sf, 0, .13, .32, C.wood, { y: .02, trim: C.charcoal });
    k.box(null, .62, .05, .62, M.soil(), .08, .84, -.1);
    for (let i = 0; i < 10; i++) k.sph(null, .05 + (i % 3) * .015, M.leaf(i % 2 ? C.leafG : C.leaf), -.15 + (i % 5) * .11, .92, -.3 + Math.floor(i / 5) * .4, 1, .8, 1, 8);
    for (let i = 0; i < 6; i++) k.sph(null, .035, M.leaf(C.leafG), -.18 + i * .1, .82 - (i % 2) * .05, .22, 1, 1.4, .6, 8);
    k.car(null, .1, .02, .1, Math.PI / 2, ['#e8e1cf', C.navy][v], .27);
    k.cyl(null, .05, .04, .07, M.paint(C.clay), -.36, .02, .33, 10); for (let i = 0; i < 6; i++) k.m(null, new THREE.ConeGeometry(.015, .12, 4), M.leaf('#7f9f86'), -.36, .14, .33, i, .45, 0);
  },
  // ---- French contemporary: tall light volume, floor-to-ceiling glazing, simple balconies, zinc roof (1×1)
  fr_cont(k, v) {
    const wall = ['#f4efe6', '#ece6da'][v], T = '#8c8f8f', G = M.paint('#e7e1d6');
    k.box(null, .68, .05, .62, G);
    k.box(null, .54, .42, .48, M.panel('#d9d2c4'), 0, .05, -.04);
    k.box(null, .6, .84, .54, M.wall(wall), 0, .47, 0);
    k.prism(null, .62, .56, .4, .3, .26, M.panel(C.zinc), 0, 1.31, 0);
    k.box(null, .4, .02, .3, M.paint(C.zinc), 0, 1.57, 0);
    k.m(null, new THREE.BoxGeometry(.24, .14, .01), windowMat, 0, 1.43, .22, 0, -.42);
    const gf = k.face(null, 0, -.04, .54, .48, 0); k.door(gf, .15, .14, .32, C.wood, { trim: T, y: .05 }); k.win(gf, -.11, .1, .24, .3, { trim: T });
    const f = k.face(null, 0, 0, .6, .54, 0);
    for (const [y, bw] of [[.52, .52], [.92, .3]]) { k.win(f, -.14, y, .18, .32, { trim: T }); k.win(f, .14, y, .18, .32, { trim: T }); k.box(f, bw, .022, .1, G, bw < .5 ? .14 : 0, y - .04, .05); k.box(f, bw, .1, .006, windowMat, bw < .5 ? .14 : 0, y - .02, .1); }
    for (const sd of [1, 2, 3]) { const s = k.face(null, 0, 0, .6, .54, sd); k.win(s, 0, .55, .07, .3, { trim: T }); k.win(s, 0, .95, .07, .28, { trim: T }); }
    k.box(null, .5, .05, .07, M.paint(C.concrete), 0, .05, .34); k.bloom(null, 0, .12, .34, .4, 6, [C.white, C.lemon, C.lav]);
    if (v === 1) k.bike(null, -.25, 0, .42, .1, C.lime); else k.pot(null, -.28, 0, .4, 1.1, C.charcoal, [C.white, C.lemon]);
  },
};
