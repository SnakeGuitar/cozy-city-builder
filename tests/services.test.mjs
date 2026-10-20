import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, centre, derive, cellOf } from './helpers.mjs';

// a street of identical homes south of the main road, a clinic (cap 50, range 7) at the west end
function town(population, extra = []) {
  const homes = []; for (let x = 6; x <= 17; x++) if (x !== 11) homes.push(['fr_trad', x, 14]);
  return makeState([...centre(), ...homes, ...extra], { population, employed: 0 });
}

test('coverage needs range: homes beyond the radius are not served', () => {
  const s = town(30, [['clinic', 5, 13]]);
  const d = derive(s), clinic = Object.values(d.byId).find(b => b.type === 'clinic');
  for (const id of clinic.served) assert.ok(cellOf(s, s.buildings[id]).x - 5 <= 7);
  const far = Object.values(d.byId).find(b => b.kind === 'house' && cellOf(s, s.buildings[b.id]).x === 17);
  assert.equal(far.svc.health, 0);
});

test('capacity limits attendance even inside the radius', () => {
  const s = town(66, [['clinic', 5, 13]]);
  const d = derive(s), clinic = Object.values(d.byId).find(b => b.type === 'clinic');
  // unstaffed clinic works at half capacity: 50 × 0.5 = 25
  assert.equal(clinic.capEff, 25);
  assert.ok(clinic.load <= clinic.capEff + 1e-9);
  const inRange = Object.values(d.byId).filter(b => b.kind === 'house' && b.occ > 0 && cellOf(s, s.buildings[b.id]).x - 5 <= 7);
  assert.ok(inRange.some(h => h.svc.health < 1), 'some homes in range get nothing: saturated');
  assert.equal(d.city.svc.health.got, clinic.load);
});

test('a disconnected service serves nobody', () => {
  const s = town(30, [['clinic', 21, 21]]);
  const clinic = Object.values(derive(s).byId).find(b => b.type === 'clinic');
  assert.equal(clinic.conn, false); assert.equal(clinic.load, 0); assert.deepEqual(clinic.served, []);
});
