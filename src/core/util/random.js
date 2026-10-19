// Deterministic randomness. The simulation never calls Math.random: state carries `rngSeed`.
// nextRandom is a pure mulberry32 step: same seed in, same value and next seed out.
export function nextRandom(seed) {
  const a = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return { value: ((t ^ t >>> 14) >>> 0) / 4294967296, seed: a >>> 0 };
}
// Stateful generator for non-persistent uses (procedural art); same sequence as nextRandom.
export function mulberry32(seed) { let s = seed >>> 0; return () => { const r = nextRandom(s); s = r.seed; return r.value; }; }
export function hashString(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
