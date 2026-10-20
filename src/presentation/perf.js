// Performance statistics, engine-neutral: a rolling window of frame times plus named sections (simulation, render,
// rebuilds …). The platform feeds it timings; anything may read the summary (the F3 overlay, benchmarks, tests).
export function createPerfStats(size = 240) {
  const frames = new Float64Array(size); let n = 0, head = 0;
  const sections = new Map(); // name → { last, total, count, max }
  const counters = {};
  return {
    /** One whole frame took `ms`. */
    frame(ms) { frames[head] = ms; head = (head + 1) % size; n = Math.min(size, n + 1); },
    /** A named piece of work took `ms` (e.g. 'sim', 'render', 'rebuild.roads'). */
    section(name, ms) { let s = sections.get(name); if (!s) sections.set(name, s = { last: 0, total: 0, count: 0, max: 0 }); s.last = ms; s.total += ms; s.count++; s.max = Math.max(s.max, ms); },
    /** Times a function as a section and returns its result. */
    time(name, fn, now) { const t0 = now(); const r = fn(); this.section(name, now() - t0); return r; },
    /** Latest values of counters (draw calls, triangles, geometries …). */
    count(values) { Object.assign(counters, values); },
    summary() {
      const list = Array.from(frames.subarray(0, n)).sort((a, b) => a - b), q = p => (list.length ? list[Math.min(list.length - 1, Math.floor(p * list.length))] : 0);
      const avg = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
      return { frames: list.length, fps: avg ? 1000 / avg : 0, avg, p50: q(.5), p95: q(.95), max: list.length ? list.at(-1) : 0,
        sections: Object.fromEntries([...sections].map(([k, s]) => [k, { last: s.last, avg: s.total / s.count, max: s.max, count: s.count }])), counters: { ...counters } };
    },
    reset() { n = 0; head = 0; sections.clear(); },
  };
}
