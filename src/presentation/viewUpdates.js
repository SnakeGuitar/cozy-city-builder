// Which view updates a batch of core events needs, engine-neutral. A renderer applies the plan; tests check it.
//   rebuild   — the whole world must be redrawn from the state (a new game or a load); the batch's other structural
//               events are already contained in that state and must not be applied again
//   ops       — per building, in order: add · remove · replace (moved / turned) · upgrade
//   roads, occupancy — the road network / the occupied-ground overlay need redrawing
//   confetti  — goals completed in this batch
export function planViewUpdates(events, state) {
  const plan = { rebuild: false, ops: [], roads: false, occupancy: false, confetti: 0, clearRoadHighlight: false };
  if (events.some(e => e.type === 'state_replaced')) {
    plan.rebuild = true; plan.confetti = events.filter(e => e.type === 'goal_completed').length;
    return plan;
  }
  for (const e of events) switch (e.type) {
    case 'building_placed': plan.occupancy = true; if (state.buildings[e.id]) plan.ops.push({ op: 'add', id: e.id }); break;
    case 'building_removed': plan.occupancy = true; plan.ops.push({ op: 'remove', id: e.id }); break;
    case 'building_moved': case 'building_rotated': plan.occupancy = true; if (state.buildings[e.id]) plan.ops.push({ op: 'replace', id: e.id, animate: e.type === 'building_moved' }); break;
    case 'building_upgraded': if (state.buildings[e.id]) plan.ops.push({ op: 'upgrade', id: e.id }); break;
    case 'road_built': case 'road_edited': case 'roads_replaced': plan.roads = true; break;
    case 'road_removed': plan.roads = true; plan.clearRoadHighlight = true; break;
    case 'goal_completed': plan.confetti++; break;
  }
  return plan;
}
