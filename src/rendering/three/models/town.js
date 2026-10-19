// Town models: the landmark café, shops, green spaces and small details (front faces +z, footprint centred).
import * as THREE from 'three';
import { C, M, windowMat, waterMat } from '../art.js';

export const TOWN_MODELS = {
  fr_trad(k, v) {
    const up = [C.cream, '#f3e3cf', '#e8e1d2'][v], gc = ['#d9ccb0', '#d3c3a6', '#ddd2bc'][v], rc = [C.slate, '#6f7f86', C.zinc][v], sh = [C.sage, C.lemonD, C.tealD][v];
    const W = .62, D = .56, y0 = .06, H1 = .44, H = 1.3, yt = y0 + H + .05;
    k.box(null, .7, y0, .64, M.paint(C.stone));
    k.box(null, W + .02, H1, D + .02, M.stone(gc), 0, y0, 0);
    k.box(null, W, H - H1, D, M.wall(up, true), 0, y0 + H1, 0);
    k.box(null, W + .05, .04, D + .05, M.paint(C.ivory), 0, y0 + H1, 0);
    k.box(null, W + .03, .022, D + .03, M.paint(C.ivory), 0, y0 + .88, 0);
    k.box(null, W + .07, .05, D + .07, M.paint(C.ivory), 0, y0 + H, 0);
    k.prism(null, W + .03, D + .03, W - .18, D - .2, .3, M.roof(rc), 0, yt, 0);
    k.box(null, W - .18, .02, D - .2, M.paint(C.stoneD), 0, yt + .3, 0);
    const dm = k.g(null, 0, yt + .04, D / 2 - .1);
    k.box(dm, .17, .15, .14, M.wall(up), 0, 0, 0); k.gable(dm, 0, .15, 0, .17, .14, .09, M.roof(rc), M.wall(up), .025, true);
    const df = k.face(dm, 0, 0, .17, .14, 0); k.win(df, 0, .03, .09, .1);
    k.chimney(-.2, yt + .1, -.14, .3); k.chimney(.21, yt + .1, -.12, .26);
    const f = k.face(null, 0, 0, W, D, 0);
    k.door(f, .16, .16, .31, C.tealD, { glass: true, trim: C.ivory });
    k.win(f, -.13, .15, .2, .22, { flowers: true });
    k.balcony(f, 0, .55, .58, .12, { flowers: true });
    k.win(f, -.13, .6, .15, .29, {}); k.win(f, .14, .6, .15, .29, {});
    k.win(f, -.13, 1.02, .14, .22, { shut: sh }); k.win(f, .14, 1.02, .14, .22, { shut: sh });
    for (const sd of [1, 2, 3]) { const s = k.face(null, 0, 0, W, D, sd); k.win(s, 0, .16, .16, .2, sd === 1 ? { flowers: true } : {}); k.win(s, -.11, .62, .13, .25, { shut: sh }); k.win(s, .11, .62, .13, .25, { shut: sh }); k.win(s, 0, 1.03, .13, .2); }
    if (v === 0) k.bike(null, -.2, 0, .41, .15, C.teal); else k.cat(null, -.22, 0, .4, -.5, '#8d8a8f');
    k.pot(null, .32, 0, .36, 1.1, C.terra, [C.lemon, C.white]);
  },
  cafe(k) {
    k.box(null, 1.94, .03, 1.94, M.cobble());
    const y0 = .03, yg = y0 + .05;
    const TX = -.32, TZ = -.22, TW = .92, TD = .9;
    k.box(null, TW + .05, .05, TD + .05, M.paint(C.stoneD), TX, y0, TZ);
    k.box(null, TW, .52, TD, M.wall(C.leafG), TX, yg, TZ);
    k.box(null, TW + .05, .1, TD + .05, M.wall(C.lemon), TX, yg + .52, TZ);
    k.box(null, TW, 1.02, TD, M.wall(C.cream, true), TX, yg + .62, TZ);
    const ytop = yg + 1.64;
    k.box(null, TW + .08, .06, TD + .08, M.paint(C.ivory), TX, ytop, TZ);
    k.box(null, TW + .02, .02, TD + .02, M.paint(C.stoneD), TX, ytop + .06, TZ);
    // rooftop railing
    const yr = ytop + .08, RI = M.paint(C.ivory);
    for (const [w, d, x, z] of [[TW, .015, TX, TZ + TD / 2 - .01], [TW, .015, TX, TZ - TD / 2 + .01], [.015, TD, TX - TW / 2 + .01, TZ], [.015, TD, TX + TW / 2 - .01, TZ]]) k.box(null, w, .015, d, RI, x, yr + .13, z);
    for (let i = 0; i <= 12; i++) { const u = -TW / 2 + .01 + i * (TW - .02) / 12; k.box(null, .012, .13, .012, RI, TX + u, yr, TZ + TD / 2 - .01); k.box(null, .012, .13, .012, RI, TX + u, yr, TZ - TD / 2 + .01); k.box(null, .012, .13, .012, RI, TX - TW / 2 + .01, yr, TZ + u * TD / TW); k.box(null, .012, .13, .012, RI, TX + TW / 2 - .01, yr, TZ + u * TD / TW); }
    // the giant lemon
    k.sph(null, .27, M.lemon(), TX, yr + .3, TZ, 1.35, 1, 1, 22);
    for (const sx of [-1, 1]) k.m(null, new THREE.ConeGeometry(.07, .12, 12), M.lemon(), TX + sx * .39, yr + .3, TZ, 0, 0, -sx * Math.PI / 2);
    for (const [lx, lz, a] of [[-.05, .12, .4], [.08, -.05, -.5], [-.12, -.08, 2.2]]) k.sph(null, .1, M.leaf(C.leafG), TX + lx, yr + .58, TZ + lz, 1.4, .22, .55, 8).rotation.y = a;
    k.cyl(null, .015, .02, .08, M.wood(C.woodD), TX, yr + .55, TZ, 6);
    k.sph(null, .028, M.dot('#7a5a44'), TX + .3, yr + .16, TZ + .41, 1.3, 1, 1, 8); k.sph(null, .017, M.dot('#7a5a44'), TX + .33, yr + .19, TZ + .41, 1, 1, 1, 6);
    // tower front
    const f = k.face(null, TX, TZ, TW, TD, 0);
    k.win(f, -.15, yg + .07, .44, .33, { trim: C.ivory });
    for (const [dx, dy] of [[-.28, .3], [-.18, .2], [-.05, .29], [.02, .16], [-.32, .14]]) k.m(f, new THREE.CylinderGeometry(.022, .022, .006, 10), M.dot(C.lemon), -.15 + dx + .15, yg + .07 + dy - .02, .022, 0, Math.PI / 2);
    k.door(f, .28, .18, .38, C.tealD, { glass: true, y: yg });
    k.awning(f, 0, yg + .5, TW + .03, .3, [C.butter, C.white], .45);
    k.box(f, .5, .085, .02, M.sign('glass'), -.04, yg + .527, .04);
    k.win(f, -.17, yg + .72, .22, .36, { arch: true, trim: C.teal });
    k.win(f, .24, yg + .76, .17, .24, { flowers: true, awn: [C.lime, C.white] });
    k.win(f, .24, yg + 1.27, .17, .24, { shut: C.teal }); k.win(f, -.17, yg + 1.3, .16, .22, { shut: C.teal, flowers: true });
    k.basket(f, -.43, yg + .96, .08); k.basket(f, .43, yg + .96, .08);
    const l = k.face(null, TX, TZ, TW, TD, 3);
    k.win(l, 0, yg + .08, .3, .3, {}); k.win(l, -.2, yg + .76, .16, .26, { shut: C.teal }); k.win(l, .2, yg + .76, .16, .26, { shut: C.teal, flowers: true }); k.win(l, 0, yg + 1.27, .16, .24, { flowers: true }); k.awning(l, 0, yg + .44, .4, .14, [C.lime, C.white]);
    const bk = k.face(null, TX, TZ, TW, TD, 2); k.win(bk, -.2, yg + .1, .18, .26); k.win(bk, .2, yg + .76, .16, .26); k.win(bk, -.2, yg + .76, .16, .26); k.win(bk, 0, yg + 1.27, .16, .24);
    const rt = k.face(null, TX, TZ, TW, TD, 1); k.win(rt, .1, yg + 1.27, .16, .24, { shut: C.teal });
    // annex
    const AX = .52, AZ = -.26, AW = .76, AD = .84;
    k.box(null, AW + .04, .05, AD + .04, M.paint(C.stoneD), AX, y0, AZ);
    k.box(null, AW, .5, AD, M.wall(C.sage), AX, yg, AZ);
    k.box(null, AW + .05, .05, AD + .05, M.paint(C.ivory), AX, yg + .5, AZ);
    k.box(null, AW, .5, AD, M.wall(C.lemonP, true), AX, yg + .55, AZ);
    k.box(null, AW + .06, .04, AD + .06, M.paint(C.ivory), AX, yg + 1.05, AZ);
    k.prism(null, AW + .1, AD + .1, AW - .34, 0, .3, M.roof(C.terra), AX, yg + 1.09, AZ);
    k.chimney(AX + .2, yg + 1.12, AZ - .22, .32);
    const af = k.face(null, AX, AZ, AW, AD, 0);
    k.door(af, -.2, .16, .33, C.butter, { glass: true, y: yg });
    k.win(af, .14, yg + .1, .28, .24, { flowers: true });
    k.awning(af, .14, yg + .41, .36, .16, [C.butter, C.white]);
    k.balcony(af, 0, yg + .57, .62, .14, { flowers: true });
    k.win(af, -.15, yg + .62, .14, .3, { trim: C.teal }); k.win(af, .15, yg + .62, .14, .3, { trim: C.teal });
    k.awning(af, 0, yg + 1.02, .68, .18, [C.butter, C.white], .4);
    const ar = k.face(null, AX, AZ, AW, AD, 1);
    k.win(ar, -.15, yg + .1, .26, .24, { flowers: true }); k.win(ar, -.2, yg + .64, .15, .24, { shut: C.sage }); k.win(ar, .2, yg + .64, .15, .24, { shut: C.sage }); k.win(ar, .22, yg + .1, .14, .24);
    k.box(ar, .01, .01, .16, M.paint(C.iron), .32, yg + .78, .08); k.box(ar, .2, .11, .015, M.sign('lemon'), .32, yg + .64, .14, Math.PI / 2);
    const ab = k.face(null, AX, AZ, AW, AD, 2); k.win(ab, 0, yg + .1, .2, .24); k.win(ab, 0, yg + .64, .15, .24);
    // terrace life
    k.table(null, -.6, y0, .55); k.table(null, -.15, y0, .62);
    k.m(null, new THREE.BoxGeometry(.11, .17, .012), M.paint(C.woodD), .2, y0 + .08, .52, 0, -.2); k.m(null, new THREE.BoxGeometry(.11, .17, .012), M.paint(C.woodD), .2, y0 + .08, .44, 0, .2);
    k.m(null, new THREE.BoxGeometry(.085, .1, .004), M.sign('lemon'), .2, y0 + .09, .535, 0, -.2);
    k.lampPost(null, .84, y0, .74);
    k.pot(null, -.86, y0, .32, 1.4); k.pot(null, -.86, y0, .82, 1.1, C.teal, [C.white, C.butter]); k.pot(null, .2, y0, .26, 1); k.pot(null, .88, y0, .24, 1.2, C.teal, [C.pink, C.white]);
    k.box(null, .13, .06, .09, M.wood(C.wood), .52, y0, .42); for (let i = 0; i < 7; i++) k.sph(null, .02, M.lemon(i % 3 ? C.lemon : C.lime), .47 + (i % 4) * .03, y0 + .07, .4 + Math.floor(i / 4) * .035, 1.2, 1, 1, 6);
    k.cat(null, .0, y0, .36, -.4, C.orange);
    k.bench(null, .55, y0, .66, 0);
  },
  bakery(k) {
    const W = .6, D = .58, y0 = .06, H = .9, yt = y0 + H;
    k.box(null, .68, y0, .66, M.paint(C.stone));
    k.box(null, W, H, D, M.wall(C.butter, true), 0, y0, 0);
    k.box(null, W + .04, .03, D + .04, M.paint(C.ivory), 0, yt - .03, 0);
    k.gable(null, 0, yt, 0, W, D, .36, M.roof(C.terra), M.wall(C.butter), .07, true);
    k.chimney(-.17, yt + .04, -.12, .44);
    const f = k.face(null, 0, 0, W, D, 0);
    k.box(f, W + .02, .46, .03, M.wood(C.woodD), 0, y0, .015);
    const sf = k.g(f, 0, 0, .03);
    k.win(sf, -.11, y0 + .08, .27, .26, { trim: C.butter });
    for (let i = 0; i < 3; i++) k.m(sf, new THREE.CapsuleGeometry(.018, .05, 3, 8), M.paint('#cf8f4e'), -.19 + i * .08, y0 + .1, .03, 0, 0, Math.PI / 2);
    k.door(sf, .19, .14, .32, C.leafG, { glass: true });
    k.awning(f, 0, y0 + .48, W + .06, .2, [C.lemon, C.white]);
    k.box(f, .3, .07, .015, M.sign('bread'), 0, y0 + .5, .035);
    k.win(f, -.14, .66, .14, .22, { shut: C.limeD, flowers: true }); k.win(f, .14, .66, .14, .22, { shut: C.limeD, flowers: true });
    k.round(f, 0, yt + .13, .055);
    // pretzel sign on a bracket
    k.box(f, .012, .012, .17, M.paint(C.iron), W / 2 - .03, .78, .085);
    const pz = k.m(f, new THREE.TorusKnotGeometry(.035, .01, 40, 6, 2, 3), M.paint('#c98447'), W / 2 - .03, .7, .16, Math.PI / 2); pz.userData.noEdge = true;
    for (const sd of [1, 2, 3]) { const s = k.face(null, 0, 0, W, D, sd); k.win(s, 0, .16, .16, .22); k.win(s, 0, .66, .15, .22, { shut: C.limeD }); }
    // bread basket, flour sacks
    k.cyl(null, .07, .06, .06, M.wood(C.wood), -.24, 0, .42, 12);
    for (let i = 0; i < 3; i++) k.m(null, new THREE.CapsuleGeometry(.016, .1, 3, 8), M.paint('#d9a05e'), -.24 + (i - 1) * .025, .1, .42, 0, .5 + i * .1, .3);
    k.sph(null, .05, M.paint(C.white), .26, .045, .4, 1, .9, .8, 10); k.sph(null, .045, M.paint(C.white), .32, .04, .34, 1, .9, .8, 10);
  },
  florist(k) {
    const W = .5, D = .54, X = -.1, y0 = .06, H = .86;
    k.box(null, .7, y0, .64, M.paint(C.stone));
    k.box(null, W, .42, D, M.wall(C.sage), X, y0, 0);
    k.box(null, W, .44, D, M.wall(C.cream, true), X, y0 + .42, 0);
    k.box(null, W + .04, .03, D + .04, M.paint(C.ivory), X, y0 + .42, 0);
    k.box(null, W + .06, .06, D + .06, M.paint(C.ivory), X, y0 + H, 0);
    for (const [px, pz] of [[-.17, -.15], [0, -.17], [.05, .12], [-.2, .14]]) k.pot(null, X + px, y0 + H + .06, pz, 1.1, C.terra, [C.pink, C.white, C.lav]);
    k.sph(null, .09, M.leaf(C.leafD), X + .1, y0 + H + .12, -.12, 1, .8, 1, 10);
    // little glasshouse on the side
    const GX = .3;
    k.box(null, .3, .08, .44, M.paint(C.stone), GX, 0, 0);
    k.box(null, .26, .3, .4, windowMat, GX, .08, 0);
    for (const [x, z] of [[-.13, -.2], [.13, -.2], [-.13, .2], [.13, .2], [0, .2], [.13, 0]]) k.box(null, .018, .3, .018, M.paint(C.ivory), GX + x, .08, z);
    k.box(null, .29, .02, .43, M.paint(C.ivory), GX, .38, 0);
    k.gable(null, GX, .4, 0, .28, .42, .13, windowMat, windowMat, .015, true);
    for (let i = 0; i < 4; i++) k.sph(null, .04, M.leaf(i % 2 ? C.leaf : C.leafD), GX - .06 + i * .04, .2, -.08 + (i % 2) * .1, 1, 1.4, 1, 8);
    const f = k.face(null, X, 0, W, D, 0);
    k.door(f, .12, .14, .3, C.tealD, { glass: true, arch: true });
    k.win(f, -.1, .14, .2, .22, { flowers: true, cols: [C.lav, C.pink, C.white] });
    k.awning(f, 0, .47, W + .04, .16, [C.teal, C.white]);
    k.win(f, -.1, .6, .14, .22, { shut: C.pink, flowers: true }); k.win(f, .12, .6, .14, .22, { shut: C.pink });
    k.box(f, .012, .012, .16, M.paint(C.iron), -W / 2 + .03, .72, .08); k.box(f, .16, .1, .015, M.sign('flower'), -W / 2 + .03, .6, .15, Math.PI / 2);
    for (const sd of [2, 3]) { const s = k.face(null, X, 0, W, D, sd); k.win(s, 0, .16, .15, .2); k.win(s, 0, .6, .14, .22, { shut: C.pink }); }
    // tiered flower stand
    const pal = [[C.red, C.pink], [C.butter, C.white], [C.lav, C.pink], [C.orange, C.butter], [C.white, C.pink]];
    for (let t = 0; t < 2; t++) { k.box(null, .42, .06 + t * .07, .09, M.wood(C.wood), -.1, 0, .43 - t * .08);
      for (let i = 0; i < 4; i++) { const bx = -.26 + i * .105, by = .06 + t * .07, bz = .43 - t * .08; k.cyl(null, .027, .022, .045, M.paint(C.tealD), bx, by, bz, 10); k.bloom(null, bx, by + .07, bz, .04, 4, pal[(i + t * 2) % 5], .016); } }
    k.pot(null, .34, 0, .38, 1.2, C.terra, [C.red, C.white]);
  },
  jam(k) {
    const W = .62, D = .56, y0 = .06, H = .88, yt = y0 + H, B = M.wood('#7d5a3c');
    k.box(null, .7, y0, .64, M.paint(C.stone));
    k.box(null, W, H, D, M.wall(C.ivory, true), 0, y0, 0);
    k.gable(null, 0, yt, 0, W, D, .46, M.roof(C.terra), M.wall(C.ivory), .07);
    k.chimney(.18, yt + .1, -.12, .36);
    for (const sd of [0, 1, 2, 3]) {
      const fw = sd % 2 ? D : W, s = k.face(null, 0, 0, W, D, sd);
      for (const u of [-fw / 2 + .015, fw / 2 - .015]) k.box(s, .03, H, .02, B, u, y0, .01);
      k.box(s, fw, .03, .02, B, 0, y0 + .44, .01); k.box(s, fw, .03, .02, B, 0, yt - .03, .01);
      if (sd === 0) { for (const [u, rz] of [[-.24, .75], [.24, -.75], [-.03, .75], [.03, -.75]]) k.m(s, new THREE.BoxGeometry(.022, .26, .016), B, u, y0 + .62, .012, 0, 0, rz); }
      else k.win(s, 0, .6, .14, .22, { shut: C.limeD });
      if (sd) k.win(s, 0, .16, .15, .2);
    }
    const f = k.face(null, 0, 0, W, D, 0);
    k.win(f, -.1, .14, .28, .23, { trim: C.lemonD });
    k.box(f, .32, .015, .06, M.wood(C.wood), -.1, .12, .05);
    const jc = [C.lemon, C.orange, C.lime, C.ochre, C.lemonD];
    for (let i = 0; i < 5; i++) { k.cyl(f, .018, .018, .04, M.paint(jc[i]), -.22 + i * .06, .135, .05, 10); k.cyl(f, .021, .021, .012, M.gingham(), -.22 + i * .06, .175, .05, 10); }
    k.door(f, .2, .14, .31, C.limeD, { glass: true });
    k.awning(f, -.03, .47, W - .02, .16, [C.lime, C.white]);
    k.win(f, -.14, .6, .12, .2, { flowers: true }); k.win(f, .14, .6, .12, .2, { flowers: true });
    k.round(f, 0, yt + .16, .06, C.lemonD);
    // jam-jar signpost and barrel
    k.box(null, .025, .32, .025, M.wood(C.woodD), -.3, 0, .4);
    k.cyl(null, .07, .07, .13, M.paint(C.orange), -.3, .3, .4, 16); k.cyl(null, .08, .08, .03, M.gingham(), -.3, .43, .4, 16); k.cyl(null, .072, .072, .05, M.paint(C.ivory), -.3, .34, .4, 16);
    k.cyl(null, .065, .06, .14, M.wood(C.wood), .3, 0, .4, 12); for (let i = 0; i < 5; i++) k.sph(null, .022, M.lemon(), .28 + (i % 3) * .025, .15, .38 + Math.floor(i / 3) * .03, 1.2, 1, 1, 6);
  },
  orchard(k) {
    k.box(null, 1.94, .03, 1.94, M.grass());
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { if (i === 0 && j === 0) continue; const x = -.7 + i * .47, z = -.7 + j * .45; k.cyl(null, .13, .14, .012, M.soil(), x, .03, z, 12); k.citrus(null, x, .03, z, 1.15, (i + j) % 2 ? C.lime : C.lemon); }
    // tool shed, ladder, crates
    k.box(null, .34, .3, .34, M.wood(C.wood), -.68, .03, -.68);
    k.gable(null, -.68, .33, -.68, .34, .34, .16, M.roof(C.limeD), M.wood(C.wood), .05);
    const sf = k.face(null, -.68, -.68, .34, .34, 0); k.door(sf, 0, .12, .22, C.lemonD, { y: .03 });
    for (let i = 0; i < 3; i++) { k.box(null, .12, .06, .09, M.wood(C.wood), -.2 + i * .15, .03, .82); for (let j = 0; j < 4; j++) k.sph(null, .02, M.lemon(i === 1 ? C.lime : C.lemon), -.23 + i * .15 + (j % 2) * .05, .1, .8 + Math.floor(j / 2) * .04, 1.2, 1, 1, 6); }
    k.m(null, new THREE.BoxGeometry(.012, .42, .012), M.wood(C.wood), .25, .2, .1, 0, 0, .25); k.m(null, new THREE.BoxGeometry(.012, .42, .012), M.wood(C.wood), .25, .2, .17, 0, 0, .25);
    k.box(null, .025, .3, .025, M.wood(C.woodD), .55, .03, .86); k.sign(null, .55, .27, .875, 'lemon', .22, .12);
  },
  garden(k) {
    k.box(null, 1.94, .03, 1.94, M.grass());
    const G = M.paint('#ebe1c9');
    k.box(null, .24, .012, 1.94, G, 0, .03, 0); k.box(null, 1.94, .012, .24, G, 0, .03, 0);
    const pals = [[C.red, C.pink, C.white], [C.lav, C.white, C.pink], [C.butter, C.orange, C.white], [C.pink, C.red, C.lav]];
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
      const cx = sx * .52, cz = sz * .52;
      k.box(null, .6, .06, .6, M.paint(C.stone), cx, .03, cz); k.box(null, .52, .065, .52, M.soil(), cx, .03, cz);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) k.bloom(null, cx - .17 + a * .17, .13, cz - .17 + b * .17, .08, 3, pals[i], .02);
    });
    k.cyl(null, .2, .21, .07, M.paint(C.stone), 0, .03, 0, 18); k.cyl(null, .17, .17, .072, M.soil(), 0, .03, 0, 18);
    k.citrus(null, 0, .1, 0, 1.1, C.lemon);
    // rose pergola over the front path
    const P = M.paint(C.ivory);
    for (const x of [-.16, .16]) for (const z of [.72, .9]) k.box(null, .03, .48, .03, P, x, .03, z);
    for (const x of [-.16, .16]) k.box(null, .035, .03, .3, P, x, .51, .81);
    for (let i = 0; i < 4; i++) k.box(null, .42, .02, .025, P, 0, .54, .7 + i * .07);
    const rose = [C.pink, C.red, C.white];
    for (let i = 0; i < 16; i++) { const a = i / 15; const onTop = i % 3 === 0; k.sph(null, .028, M.dot(rose[i % 3]), onTop ? -.18 + a * .36 : (i % 2 ? -.17 : .17), onTop ? .57 : .12 + a * .4, .72 + (i % 4) * .055, 1, 1, 1, 6); k.sph(null, .035, M.leaf(C.leafD), i % 2 ? -.18 : .18, .1 + a * .42, .8, 1, 1.2, 1, 6); }
    k.box(null, 1.8, .15, .12, M.leaf(C.leafD), 0, .03, -.88);
    for (let i = 0; i < 9; i++) k.sph(null, .08, M.leaf(i % 2 ? C.leaf : C.leafD), -.8 + i * .2, .19, -.88, 1.3, .7, .9, 8);
    k.bench(null, -.82, .03, 0, Math.PI / 2); k.bench(null, .82, .03, 0, -Math.PI / 2);
  },
  plaza(k) {
    k.box(null, 1.94, .05, 1.94, M.cobble());
    const S = M.paint(C.stone);
    k.cyl(null, .5, .53, .14, S, 0, .05, 0, 26); k.cyl(null, .45, .45, .01, waterMat, 0, .17, 0, 26);
    k.cyl(null, .07, .1, .28, S, 0, .17, 0, 12); k.cyl(null, .22, .1, .07, S, 0, .44, 0, 18); k.cyl(null, .19, .19, .01, waterMat, 0, .5, 0, 18);
    k.cyl(null, .03, .05, .12, S, 0, .5, 0, 10);
    k.sph(null, .06, M.lemon(), 0, .67, 0, 1.3, 1, 1, 12);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = sx * .74, z = sz * .74; k.box(null, .26, .16, .26, S, x, .05, z); k.box(null, .22, .02, .22, M.soil(), x, .2, z); k.sph(null, .12, M.leaf(C.leaf), x, .33, z, 1, 1, 1, 12); k.bloom(null, x, .23, z + .1, .16, 4, [C.red, C.white, C.pink], .018); }
    k.bench(null, 0, .05, .76, Math.PI); k.bench(null, 0, .05, -.76, 0); k.bench(null, .76, .05, 0, -Math.PI / 2); k.bench(null, -.76, .05, 0, Math.PI / 2);
    k.lampPost(null, .42, .05, .74, .5); k.lampPost(null, -.42, .05, -.74, .5);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + .3; k.sph(null, .03, M.dot(i % 2 ? '#e7dcc3' : C.white), Math.cos(a) * .36, .09, Math.sin(a) * .36, 1, .5, 1, 6); }
  },
  tree(k, v) {
    k.cyl(null, .3, .32, .012, M.grass(), 0, 0, 0, 16);
    const s = k.g(null, 0, .28, 0); s.userData.sub = 'sway';
    if (v === 1) {
      k.cyl(null, .02, .035, .22, M.wood(C.woodD), 0, 0, 0, 8);
      k.sph(s, .14, M.leaf(C.sageD), 0, .34, 0, 1, 2.4, 1, 12); k.sph(s, .1, M.leaf(C.leafD), .06, .2, .05, 1, 1.8, 1, 10); k.sph(s, .09, M.leaf(C.leaf), -.05, .26, -.04, 1, 2, 1, 10);
    } else {
      const lime = v === 2, fruit = lime ? C.lime : C.lemon;
      k.cyl(null, .024, .042, .34, M.wood(C.woodD), 0, 0, 0, 8);
      k.m(null, new THREE.CylinderGeometry(.01, .016, .14, 6), M.wood(C.woodD), .05, .3, 0, 0, 0, -.7);
      const mats = lime ? [M.leaf(C.leafG), M.leaf(C.leafD), M.leaf(C.leaf)] : [M.leaf(C.leaf), M.leaf(C.leafD), M.leaf(C.leafL)];
      const blobs = [[0, .2, 0, .2], [.13, .11, .06, .14], [-.12, .13, -.05, .15], [.03, .32, -.03, .14], [-.06, .06, .13, .12], [.08, .22, -.11, .12], [-.1, .27, .06, .11]];
      blobs.forEach((b, i) => k.sph(s, b[3], mats[i % 3], b[0], b[1], b[2], 1, .9, 1, 12));
      for (let i = 0; i < 14; i++) { const b = blobs[i % blobs.length], a = i * 2.39; k.sph(s, .026, M.lemon(fruit), b[0] + Math.cos(a) * b[3] * .95, b[1] + Math.sin(i) * b[3] * .5, b[2] + Math.sin(a) * b[3] * .95, 1, 1.25, 1, 6); }
      for (let i = 0; i < 6; i++) { const b = blobs[i], a = i * 1.7 + 1; k.sph(s, .014, M.dot(C.white), b[0] + Math.cos(a) * b[3], b[1] + b[3] * .5, b[2] + Math.sin(a) * b[3], 1, 1, 1, 5); }
      for (let i = 0; i < 3; i++) k.sph(null, .022, M.lemon(fruit), (k.r() - .5) * .4, .02, (k.r() - .5) * .4, 1.2, .9, 1, 6);
    }
    for (let i = 0; i < 3; i++) k.sph(null, .025, M.dot(C.stoneD), .18 - i * .05, .01, .16 + i * .03, 1, .5, 1, 6);
  },
  flowerbed(k, v) {
    const pal = [[C.lemon, C.white, C.pink], [C.lav, C.white, C.butter], [C.orange, C.lemon, C.white]][v];
    k.box(null, .7, .06, .7, M.paint(C.stone)); k.box(null, .62, .065, .62, M.soil());
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) k.bloom(null, -.22 + a * .147, .13, -.22 + b * .147, .08, 3, [pal[(a + b) % 3], pal[(a + 2 * b + 1) % 3]], .022);
    const P = M.paint(C.ivory);
    for (let u = -.32; u <= .33; u += .08) k.box(null, .018, .1, .018, P, u, 0, .4);
    k.box(null, .68, .014, .01, P, 0, .06, .4);
    k.sph(null, .015, M.dot(C.butter), .2, .25, .1, 1.6, .4, .6, 6);
  },
  bench(k, v) {
    k.box(null, .6, .015, .44, M.paint('#ebe1c9'), 0, 0, -.02);
    k.bench(null, 0, .015, 0);
    k.pot(null, .25, .015, -.12, 1.1, C.terra, [C.red, C.pink]);
    k.sph(null, .07, M.leaf(C.leafD), -.26, .06, -.14, 1, .8, 1, 10);
    if (v === 1) k.cat(null, -.05, .1, 0, .2, '#8d8a8f');
  },
  lamp(k) {
    k.cyl(null, .12, .13, .02, M.paint(C.stone), 0, 0, 0, 14);
    k.lampPost(null, 0, .02, 0, .66);
    k.pot(null, -.12, .02, .12, .9, C.terra, [C.red, C.white]);
    k.box(null, .02, .17, .02, M.paint(C.iron), .2, 0, .15); k.box(null, .08, .06, .06, M.paint(C.red), .2, .17, .15); k.m(null, new THREE.CylinderGeometry(.03, .03, .08, 10, 1, false, 0, Math.PI), M.paint(C.red), .2, .23, .15, 0, 0, Math.PI / 2);
  },
};
