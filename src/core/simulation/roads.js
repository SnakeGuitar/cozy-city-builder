// Road network: which parts of the road graph reach the landmark café, and which buildings come close enough to them.
// Pieces are segments (their sampled centre lines) and nodes (their pads). Pieces joined by segments form components;
// a component is a "main road" when the café's footprint lies within ROAD_ACCESS of one of its pieces' edges.
// A building is connected when its footprint lies within ROAD_ACCESS of a main piece's edge.
// For grid towns (road cells one unit wide) this reproduces the original rule exactly: a building is connected when it
// shares an edge with a road cell linked to the café (an edge neighbour is 0.5 from the cell centre, a corner 0.71).
import { LANDMARK } from '../config/catalog.js';
import { ROAD_ACCESS } from '../config/world.js';
import { footprintObb } from '../domain/space.js';
import { obbAabb, pointObbDistance, segmentObbDistance } from '../domain/geometry.js';
import { roadsOf, segmentPolyline, nodeRadius, roadPiecesIn } from '../domain/roads.js';

/** Road pieces ('s<id>' / 'n<id>') whose edge lies within ROAD_ACCESS of a building's footprint. */
export function piecesNear(state, b, keep = () => true) {
  const r = roadsOf(state), o = footprintObb(b.type, b.position, b.rotation), a = obbAabb(o), m = ROAD_ACCESS + 1e-9, out = [];
  for (const key of roadPiecesIn(state, { minX: a.minX - m, maxX: a.maxX + m, minZ: a.minZ - m, maxZ: a.maxZ + m })) {
    if (!keep(key)) continue;
    const id = +key.slice(1);
    if (key[0] === 's') {
      const seg = r.segments[id], pl = segmentPolyline(state, seg), reach = seg.width / 2 + m;
      for (let i = 1; i < pl.length; i++) if (segmentObbDistance(o, pl[i - 1], pl[i]) <= reach) { out.push(key); break; }
    } else if (pointObbDistance(o, r.nodes[id].position.x, r.nodes[id].position.z) <= nodeRadius(state, id) + m) out.push(key);
  }
  return out;
}

/** @returns {{ mainNodes:number[], mainSegments:number[], connected:Record<number,boolean> }} */
export function computeRoadNetwork(state, things) {
  const r = roadsOf(state), parent = new Map();
  const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  for (const id of Object.keys(r.nodes)) parent.set('n' + id, 'n' + id);
  for (const s of Object.values(r.segments)) { parent.set('s' + s.id, 's' + s.id); union('s' + s.id, 'n' + s.startNodeId); union('s' + s.id, 'n' + s.endNodeId); }
  const cafe = things.find(b => b.type === LANDMARK), mainRoots = new Set();
  if (cafe) for (const key of piecesNear(state, cafe)) mainRoots.add(find(key));
  const isMain = key => mainRoots.has(find(key));
  const mainNodes = Object.keys(r.nodes).map(Number).filter(id => isMain('n' + id)).sort((a, b) => a - b);
  const mainSegments = Object.keys(r.segments).map(Number).filter(id => isMain('s' + id)).sort((a, b) => a - b);
  const connected = {};
  for (const b of things) connected[b.id] = b.type === LANDMARK ? mainNodes.length > 0 : mainRoots.size > 0 && piecesNear(state, b, isMain).length > 0;
  return { mainNodes, mainSegments, connected };
}
