// Ambient life: walkers on the café's road network, smoke and dust puffs, drifting petals.
// Visual randomness (Math.random) is fine here: none of it reaches the game state.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C, T } from './art.js';
import { createWalkers } from '../../presentation/walkers.js';

const walkerMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const walkerGeos = [[C.lemonD, '#5b3e2c'], [C.teal, '#e0b066'], [C.limeD, '#3f2e24'], [C.navy, '#8a5a3a'], [C.pink, '#5b3e2c'], [C.clay, '#c7a46a']].map(([dress, hair]) => {
  const parts = [[new THREE.CylinderGeometry(.02, .036, .08, 8).translate(0, .05, 0), dress], [new THREE.SphereGeometry(.022, 8, 6).translate(0, .113, 0), C.skin], [new THREE.SphereGeometry(.024, 8, 6, 0, 6.3, 0, 1.4).translate(0, .118, -.003), hair], [new THREE.BoxGeometry(.03, .016, .016).translate(0, .008, 0), '#4a3a30']];
  return mergeGeometries(parts.map(([g, col]) => { g = g.toNonIndexed(); const c = new THREE.Color(col); const arr = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); g.deleteAttribute('uv'); return g; }));
});
const PUFF_MAX = 160, PETALS = 60;

/** `focus` is a Vector3 kept at the camera's point of interest (petals drift around it). */
export function createAmbient(scene, focus, groundAt = () => 0) {
  const walkers = [], puffs = [], walkerModel = createWalkers(Math.random);
  const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(.06, .04), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), PETALS);
  const pState = [], pcol = [C.white, '#fff4dc', C.leafL, C.leaf, C.lemon, C.lime].map(c => new THREE.Color(c));
  // what drifts through the air: petals (default), snowflakes or autumn leaves
  const WEATHER = { petals: { cols: pcol, drift: .35, fall: .12 }, snow: { cols: ['#ffffff', '#f4f8ff', '#e8f0fb'].map(c => new THREE.Color(c)), drift: .08, fall: .22 },
    leaves: { cols: ['#d9823f', '#c4553a', '#e7b04b', '#b8672e'].map(c => new THREE.Color(c)), drift: .3, fall: .16 } };
  let weather = WEATHER.petals;
  for (let i = 0; i < PETALS; i++) { pState.push({ p: new THREE.Vector3((Math.random() - .5) * 26, Math.random() * 4, (Math.random() - .5) * 26), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), sp: .5 + Math.random(), ph: Math.random() * 6 }); petals.setColorAt(i, pcol[i % pcol.length]); }
  scene.add(petals);
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);

  function puff(p, o = {}) {
    let q = puffs.find(q => !q.alive);
    if (!q) { if (puffs.length >= PUFF_MAX) return; q = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: T.puff(), transparent: true, depthWrite: false })) }; scene.add(q.s); puffs.push(q); }
    Object.assign(q, { alive: true, t: 0, life: o.life || 3.2, vx: o.vx ?? .06, vy: o.vy ?? .22, vz: o.vz ?? .02, s0: o.s0 || .1, grow: o.grow || .2, a: o.a || .5 });
    q.s.material.color.set(o.color || '#f2ebe0'); q.s.position.copy(p); q.s.visible = true;
  }
  function dust(pos, s) { for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; puff(pos.clone().add(new THREE.Vector3(Math.cos(a) * s * .5, .05, Math.sin(a) * s * .5)), { vx: Math.cos(a) * .5, vz: Math.sin(a) * .5, vy: .15, life: .8, s0: .15, grow: .4, a: .7, color: '#efe2c6' }); } }
  function confetti() { const c = focus.clone(); for (let i = 0; i < 26; i++) puff(c.clone().add(new THREE.Vector3((Math.random() - .5) * 4, 1 + Math.random() * 2, (Math.random() - .5) * 4)), { color: [C.lemon, C.lime, C.white, C.leaf][i % 4], vy: .3, vx: (Math.random() - .5) * .6, life: 1.6, s0: .12, grow: .1, a: .9 }); }

  /** Walkers follow the café's road graph (presentation/walkers.js); this only draws them. */
  function updateWalkers(sdt, population, roads, state) {
    const poses = walkerModel.update(state, roads.mainSegments, population, sdt);
    while (walkers.length < poses.length) { const m = new THREE.Mesh(walkerGeos[walkers.length % walkerGeos.length], walkerMat); m.castShadow = true; scene.add(m); walkers.push({ m }); }
    while (walkers.length > poses.length) scene.remove(walkers.pop().m);
    poses.forEach((p, i) => { const m = walkers[i].m; m.position.set(p.x, groundAt(p.x, p.z) + .035 + p.step * .012, p.z); m.rotation.y = p.heading; });
  }
  function updatePuffs(dt) {
    for (const q of puffs) { if (!q.alive) continue; q.t += dt; if (q.t > q.life) { q.alive = false; q.s.visible = false; continue; }
      q.s.position.x += q.vx * dt; q.s.position.y += q.vy * dt; q.s.position.z += q.vz * dt; const k = q.t / q.life;
      q.s.scale.setScalar(q.s0 + q.grow * q.t); q.s.material.opacity = q.a * Math.min(1, q.t * 4) * (1 - k); }
  }
  function updatePetals(dt, time) {
    for (let i = 0; i < PETALS; i++) { const s = pState[i];
      s.p.x += (weather.drift + Math.sin(time * .3 + s.ph) * .2) * dt * s.sp; s.p.z += .15 * dt * s.sp; s.p.y -= weather.fall * dt * s.sp; s.p.y += Math.sin(time * 2 + s.ph) * .004;
      s.r.x += dt * 2 * s.sp; s.r.y += dt * 1.3;
      const lx = s.p.x - focus.x, lz = s.p.z - focus.z;
      if (s.p.y < groundAt(s.p.x, s.p.z) || lx > 14 || lz > 14) s.p.set(focus.x - 13 + Math.random() * 10, 2 + Math.random() * 3, focus.z + (Math.random() - .5) * 26);
      _q.setFromEuler(s.r); _m4.compose(s.p, _q, _one); petals.setMatrixAt(i, _m4);
    }
    petals.instanceMatrix.needsUpdate = true;
  }
  /** 'petals' · 'snow' · 'leaves' — recolours what drifts through the air. */
  function setWeather(kind) { weather = WEATHER[kind] || WEATHER.petals; for (let i = 0; i < PETALS; i++) petals.setColorAt(i, weather.cols[i % weather.cols.length]); petals.instanceColor.needsUpdate = true; }
  return { puff, dust, confetti, setWeather, update(rdt, sdt, clock, population, roads, state) { updateWalkers(sdt, population, roads, state); updatePuffs(rdt); updatePetals(rdt, clock); } };
}
