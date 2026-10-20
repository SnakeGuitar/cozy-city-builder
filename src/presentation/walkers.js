// Walkers: little residents strolling the café's road network. Engine-neutral and deterministic for a given random
// source: they move along segment centre lines (so they follow curves), keep to a lane on either side, and at each
// node pick another main segment (turning back only at dead ends). A renderer draws the returned poses.
import { roadsOf, segmentPolyline, polylineLength, pointAt } from '../core/domain/roads.js';

export const MAX_WALKERS = 36;

/** @param rng () => [0, 1) — the visual random source (renderers may pass Math.random). */
export function createWalkers(rng) {
  const list = [];
  function spawn(state, main) {
    const seg = roadsOf(state).segments[main[Math.floor(rng() * main.length)]], L = polylineLength(segmentPolyline(state, seg));
    return { seg: seg.id, s: rng() * L, dir: rng() < .5 ? 1 : -1, speed: .35 + rng() * .25, lane: rng() < .5 ? -.27 : .27, rest: 0, phase: rng() * 6 };
  }
  function next(state, w, mainSet) {
    const r = roadsOf(state), seg = r.segments[w.seg], node = w.dir > 0 ? seg.endNodeId : seg.startNodeId;
    const options = Object.values(r.segments).filter(s => s.id !== seg.id && mainSet.has(s.id) && (s.startNodeId === node || s.endNodeId === node)).sort((a, b) => a.id - b.id);
    if (!options.length) { w.dir = -w.dir; return; } // dead end: turn around
    const n = options[Math.floor(rng() * options.length)];
    w.seg = n.id; w.dir = n.startNodeId === node ? 1 : -1; w.s = w.dir > 0 ? 0 : polylineLength(segmentPolyline(state, n));
    if (rng() < .08) w.rest = 1 + rng() * 3;
  }
  return {
    get count() { return list.length; },
    /**
     * Advances every walker by `dt` simulated seconds and returns their poses: [{ x, z, heading, step }].
     * `main` = ids of segments linked to the café; the crowd follows the population.
     */
    update(state, main, population, dt) {
      const r = roadsOf(state), mainSet = new Set(main), want = main.length ? Math.min(MAX_WALKERS, Math.ceil(population * .5)) : 0;
      while (list.length < want) list.push(spawn(state, main));
      list.length = Math.min(list.length, want);
      return list.map(w => {
        if (!r.segments[w.seg] || !mainSet.has(w.seg)) Object.assign(w, spawn(state, main));
        let pl = segmentPolyline(state, r.segments[w.seg]), L = polylineLength(pl);
        if (w.rest > 0) w.rest -= dt;
        else {
          w.s += w.dir * w.speed * dt; w.phase += dt * 12;
          for (let guard = 0; (w.s > L || w.s < 0) && guard < 8; guard++) {
            const over = w.s > L ? w.s - L : -w.s; next(state, w, mainSet);
            pl = segmentPolyline(state, r.segments[w.seg]); L = polylineLength(pl);
            w.s = w.dir > 0 ? Math.min(L, over) : Math.max(0, L - over);
          }
        }
        const p = pointAt(pl, w.s), width = r.segments[w.seg].width, lane = w.lane * Math.min(1, width) * w.dir;
        return { x: p.x - p.tz * lane, z: p.z + p.tx * lane, heading: Math.atan2(p.tx * w.dir, p.tz * w.dir), step: w.rest > 0 ? 0 : Math.abs(Math.sin(w.phase)), seg: w.seg };
      });
    },
  };
}
