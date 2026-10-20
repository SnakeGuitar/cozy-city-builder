// Optional snapping for free placement: grid steps, rotation steps, roads and neighbouring buildings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { snapPosition, snapAngle, snapToRoad, snapToBuildings, canPlace, insertBuilding, obbOverlap, obbFor, computeDerived, CMD } from '../src/core/index.js';
import { makeState, centre, createGame } from './helpers.mjs';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-3, `${msg}: ${a} vs ${b}`);

test('position and rotation steps', () => {
  assert.deepEqual(snapPosition({ x: 1.26, z: -3.74 }), { x: 1.5, z: -3.5 });
  assert.deepEqual(snapPosition({ x: 1.26, z: -3.74 }, 1), { x: 1, z: -4 });
  close(snapAngle(.4, Math.PI / 12), Math.PI / 12 * 2, '15°'); close(snapAngle(.4, Math.PI / 4), Math.PI / 4, '45°'); assert.equal(snapAngle(.4, Math.PI / 2), 0);
  assert.equal(snapAngle(-.1, Math.PI / 2), 0); close(snapAngle(-Math.PI / 4 - .1, Math.PI / 4), 7 * Math.PI / 4, 'negative angles wrap');
});

test('road snap: faces the street and stands at its edge, keeping its place along it', () => {
  const s = makeState([...centre()]); // road cells y = 13 → world z from 1 to 2
  const p = snapToRoad(s, 'fr_trad', { position: { x: .3, z: 3.1 }, rotation: .7 });
  assert.ok(p, 'a road is close');
  close(p.rotation, Math.PI, 'front faces −z, toward the road'); close(p.position.x, .3, 'along the road'); close(p.position.z, 2.5, 'front edge on the road edge');
  assert.equal(canPlace(s, 'fr_trad', p.position, p.rotation), null);
  // the snapped building is connected
  insertBuilding(s, 'fr_trad', p, 1);
  const d = computeDerived(s); assert.ok(Object.values(d.byId).find(r => r.type === 'fr_trad').conn);
  const north = snapToRoad(s, 'jp_trad', { position: { x: -3.2, z: -.4 }, rotation: 2 });
  close(north.rotation, 0, 'from the other side the front faces +z'); close(north.position.z, 1 - 1, 'a 2×2 lot reaches the edge at z = 1');
  assert.equal(snapToRoad(s, 'fr_trad', { position: { x: 0, z: 9 }, rotation: 0 }), null, 'nothing near');
});

test('building snap: square up with the neighbour and sit flush against it', () => {
  const s = makeState();
  insertBuilding(s, 'jp_trad', { position: { x: 0, z: 0 }, rotation: .4 }, 1);
  const raw = { position: { x: 1.5 * Math.cos(.4) + .05, z: -1.5 * Math.sin(.4) + .1 }, rotation: .9 }; // near its right side, slightly askew
  const p = snapToBuildings(s, 'fr_trad', raw);
  assert.ok(p && p.neighbour);
  close(p.rotation, .4, 'same frame as the neighbour');
  assert.equal(canPlace(s, 'fr_trad', p.position, p.rotation), null, 'flush, not overlapping');
  const nudged = { x: p.position.x - .01 * Math.cos(.4), z: p.position.z + .01 * Math.sin(.4) };
  assert.ok(obbOverlap(obbFor('fr_trad', nudged, p.rotation), obbFor('jp_trad', { x: 0, z: 0 }, .4)), 'any closer would overlap');
  assert.equal(snapToBuildings(s, 'fr_trad', { position: { x: 6, z: 6 }, rotation: 0 }), null);
});

test('snapped poses go through the commands unchanged', () => {
  const g = createGame({ state: makeState([...centre()], { coins: 5000 }) }), s = g.getSnapshot().state;
  const p = snapToRoad(s, 'bakery', { position: { x: 3.4, z: 2.9 }, rotation: 0 });
  const res = g.dispatch({ type: CMD.Place, buildingType: 'bakery', position: p.position, rotation: p.rotation, autoFace: false });
  assert.ok(res.ok, res.reason);
  assert.deepEqual(g.getSnapshot().state.buildings[res.id].position, p.position);
  assert.ok(g.getSnapshot().derived.byId[res.id].conn);
});

test('placement preferences are saved with the game and normalised on load', async () => {
  const { normalizePlacement, DEFAULT_PLACEMENT } = await import('../src/ui/interaction.js');
  assert.deepEqual(normalizePlacement(), { ...DEFAULT_PLACEMENT });
  assert.deepEqual(normalizePlacement({ mode: 'free', snapGrid: 1, snapRoad: false, step: 45, roadShape: 'l' }), { mode: 'free', snapGrid: true, snapRoad: false, snapBuild: true, step: 45, roadShape: 'l' });
  assert.deepEqual(normalizePlacement({ mode: 'diagonal', step: 7, roadShape: 'spiral' }), { ...DEFAULT_PLACEMENT }, 'unknown values fall back');
});
