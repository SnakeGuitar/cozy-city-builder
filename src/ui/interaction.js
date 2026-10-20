// Tools and selection: turns pointer/keyboard intents into core commands and previews.
// Owns only presentation state (current tool, hover, selection, placement preferences); game rules stay in core/.
//
// Placement has two modes over the same world state:
//   grid — the cursor picks a cell, rotation turns in quarter steps (or faces the road by itself);
//   free — the cursor gives a continuous ground point, rotation turns by a configurable step, and optional snaps
//          (grid steps, road edge, neighbouring building) come from core/domain/snap.js.
// On touch, a tap in free mode only moves the preview; the placement bar's ✓ confirms it.
import { DEFS, isRoadType, LANDMARK } from '../core/config/catalog.js';
import { canPlace, autoFace, tileToPose } from '../core/domain/space.js';
import { quarterToAngle, angleToQuarter, normAngle } from '../core/domain/geometry.js';
import { snapPosition, snapAngle, snapToRoad, snapToBuildings } from '../core/domain/snap.js';
import { statsOf } from '../core/domain/state.js';
import { CMD, peekSeed, refundFor, costFor, canAfford, roadCostFor } from '../core/commands/commands.js';
import { planRoad, roadPieceAt } from '../core/domain/roadPlan.js';
import { roadsOf } from '../core/domain/roads.js';
import { simplifyPath } from '../presentation/input/path.js';
import { $ } from './dom/dom.js';
import { t } from './dom/i18n.js';

/** Placement preferences (saved with each game's UI data). */
export const DEFAULT_PLACEMENT = Object.freeze({ mode: 'grid', snapGrid: false, snapRoad: true, snapBuild: true, step: 15 });
export function normalizePlacement(p = {}) {
  return { mode: p.mode === 'free' ? 'free' : 'grid', snapGrid: !!p.snapGrid, snapRoad: p.snapRoad !== false, snapBuild: p.snapBuild !== false,
    step: [5, 15, 45, 90].includes(p.step) ? p.step : DEFAULT_PLACEMENT.step };
}

export function createInteraction({ game, view, onChange, placement = () => DEFAULT_PLACEMENT }) {
  let draft = null, pendingRoad = null; // road drawing: the dragged path, and (touch) a plan waiting for ✓
  let tool = { kind: 'select' }, selected = 0, hover = null, pending = null, mouse = { x: 0, y: 0, in: false }, confirmDemo = false, upgradeOpen = false, time = 0;
  const tip = $('tip');
  const snap = () => game.getSnapshot();
  const building = () => tool.kind === 'build' || tool.kind === 'move';
  const prefs = () => placement();
  /** Free placement applies to buildings; streets of the grid tool always follow cells. */
  const freeMode = () => prefs().mode === 'free' && building() && !isRoadType(tool.type);
  /** Street tool in free mode: draw roads by dragging instead of painting cells. */
  const drawMode = () => prefs().mode === 'free' && tool.kind === 'build' && isRoadType(tool.type);
  const roadRequest = path => ({ points: simplifyPath(prefs().snapGrid ? path.map(p => snapPosition(p, .5)) : path), style: tool.type });
  function showRoadPlan(req, at) {
    const { state } = snap(), plan = planRoad(state, req), cost = plan.cost !== undefined ? roadCostFor(state, plan) : 0;
    const why = plan.ok ? (!canAffordRoad(state, cost) ? 'notEnough' : null) : plan.reason;
    view.overlays.roadPlan(plan, !why);
    if (at) { tip.hidden = false; tip.innerHTML = `${t('n_' + tool.type)} · ${plan.length ? `${plan.length.toFixed(1)} m · ` : ''}${cost ? `${cost} <svg class="ico" style="display:inline;width:13px;height:13px;vertical-align:-2px" viewBox="0 0 20 20"><use href="#i-coin"/></svg>` : t('free')}${why ? ` · <span class="bad">${t(why)}</span>` : ''}<br><span style="font-weight:600;opacity:.7">${t('roadsDraw')}</span>`;
      const tx = Math.min(at.x + 16, innerWidth - tip.offsetWidth - 8); tip.style.transform = `translate(${tx}px,${at.y + 18}px)`; }
    return { plan, why };
  }
  const canAffordRoad = (state, cost) => game.rules().unlimitedMoney || state.coins >= cost;
  function buildRoad(req) { const res = game.dispatch({ type: CMD.BuildRoad, ...req }); view.overlays.hideRoadPlan(); return res.ok; }
  const stepRad = () => prefs().step * Math.PI / 180;

  /** Pose of the current tool on grid cell (x, y): quarter turn chosen by hand (R) or facing the road. */
  function gridPose(type, x, y) {
    const state = snap().state;
    if (isRoadType(type)) return tileToPose(state, type, x, y, 0);
    const r = tool.manualR ? tool.r : angleToQuarter(autoFace(state, type, tileToPose(state, type, x, y, tool.r).position, quarterToAngle(tool.r)));
    return tileToPose(state, type, x, y, r);
  }
  /** Pose of the current tool for a free ground point, after the snaps that are switched on. */
  function freePose(type, ground) {
    const state = snap().state, p = prefs(), ignore = tool.kind === 'move' ? tool.id : 0;
    let pose = { position: p.snapGrid ? snapPosition(ground, .5) : { x: ground.x, z: ground.z }, rotation: tool.rot }, snapped = null;
    if (p.snapRoad) { const r = snapToRoad(state, type, pose); if (r && !canPlace(state, type, r.position, r.rotation, ignore)) { pose = r; snapped = 'road'; } }
    if (!snapped && p.snapBuild) { const b = snapToBuildings(state, type, pose, .6, ignore); if (b && !canPlace(state, type, b.position, b.rotation, ignore)) { pose = b; snapped = 'building'; } }
    return { position: pose.position, rotation: pose.rotation, snapped };
  }
  /** The pose under a screen point for the current tool, or null off the ground. */
  function poseAt(x, y) {
    if (freeMode()) { const g = view.groundAt(x, y); return g ? freePose(tool.type, g) : null; }
    const tile = view.tileAt(x, y, isRoadType(tool.type) ? 1 : DEFS[tool.type].s); return tile ? gridPose(tool.type, tile.x, tile.y) : null;
  }

  function setTool(next) {
    if (tool.kind === 'move' && next.kind !== 'move') view.setBuildingHidden(tool.id, false);
    tool = { r: 0, rot: 0, manualR: false, ...next }; confirmDemo = false; pending = null; draft = null; pendingRoad = null; view.overlays.hideRoadPlan();
    view.overlays.clearGhost(); view.overlays.hideFootprint(); tip.hidden = true;
    view.overlays.setBuildMode(building() || tool.kind === 'demolish');
    if (!selected) view.overlays.hideRange();
    updateHover(); onChange('tool');
  }
  function select(id) {
    selected = id || 0; confirmDemo = false; upgradeOpen = false; view.selectBuilding(selected);
    const b = selected && snap().state.buildings[selected];
    if (b) view.overlays.range(b.type, b.position, b.rotation, statsOf(b).r); else view.overlays.hideRange();
    onChange('selection');
  }
  function place(pose) {
    if (!pose) return false;
    if (tool.kind === 'move') {
      const id = tool.id, res = game.dispatch({ type: CMD.Move, id, position: pose.position, rotation: pose.rotation, autoFace: false });
      if (res.ok) { setTool({ kind: 'select' }); select(id); }
      return res.ok;
    }
    const res = game.dispatch({ type: CMD.Place, buildingType: tool.type, position: pose.position, rotation: pose.rotation, autoFace: false });
    if (res.ok) { pending = null; if (DEFS[tool.type].unique) setTool({ kind: 'select' }); else onChange('tool'); }
    return res.ok;
  }
  function demolish(id) { const res = game.dispatch({ type: CMD.Demolish, id }); if (res.ok && selected === id) select(0); return res.ok; }

  /** Draws the ghost, footprint, range and tooltip for a pose. */
  function preview(pose, at) {
    const { state } = snap(), d = DEFS[tool.type];
    const moving = tool.kind === 'move' && state.buildings[tool.id];
    const seed = moving ? moving.seed : peekSeed(state);
    const why = canPlace(state, tool.type, pose.position, pose.rotation, moving ? tool.id : 0) || (tool.kind === 'build' && !canAfford(state, tool.type) ? 'notEnough' : null);
    const cost = costFor(state, tool.type);
    view.overlays.ghost(tool.type, view.variantOf(tool.type, seed), pose.position, pose.rotation, !why, time, moving ? moving.tier : 1);
    view.overlays.footprint(tool.type, pose.position, pose.rotation, !why); view.overlays.range(tool.type, pose.position, pose.rotation, moving ? statsOf(moving).r : 0);
    if (!at) return why;
    const hint = isRoadType(tool.type) ? t('roadsHint') : freeMode() ? t(tool.kind === 'move' ? 'movingFree' : 'placingFree') : t(tool.kind === 'move' ? 'moving' : 'placing');
    const snapTag = pose.snapped ? ` · <span class="ok">${t('snapped_' + pose.snapped)}</span>` : '';
    tip.hidden = false;
    tip.innerHTML = `${t('n_' + tool.type)} ${tool.kind === 'build' ? `· ${cost ? cost : t('free')} <svg class="ico" style="display:inline;width:13px;height:13px;vertical-align:-2px" viewBox="0 0 20 20"><use href="#i-coin"/></svg>${d.upkeep ? ` · −${d.upkeep}${t('perMin')}` : ''}` : ''}${why ? ` · <span class="bad">${t(why)}</span>` : snapTag}<br><span style="font-weight:600;opacity:.7">${hint}</span>`;
    return why;
  }
  function updateHover() {
    view.overlays.hideFootprint(); tip.hidden = true; if (tool.kind !== 'demolish') view.overlays.roadHighlight(null, null);
    if (building() && pending) { preview(pending, false); return; } // touch: the preview stays where it was tapped
    if (drawMode()) { view.overlays.hideGhost(); if (pendingRoad) showRoadPlan(pendingRoad, null); else if (draft) showRoadPlan(roadRequest(draft), mouse.in ? mouse : null); else if (mouse.in) { tip.hidden = false; tip.innerHTML = `${t('n_' + tool.type)}<br><span style="font-weight:600;opacity:.7">${t('roadsDraw')}</span>`; const tx = Math.min(mouse.x + 16, innerWidth - tip.offsetWidth - 8); tip.style.transform = `translate(${tx}px,${mouse.y + 18}px)`; } return; }
    if (!mouse.in) { view.overlays.hideGhost(); return; }
    const { state } = snap();
    if (building()) { const pose = poseAt(mouse.x, mouse.y); if (!pose) return; hover = pose; preview(pose, true); }
    else if (tool.kind === 'demolish') {
      const id = view.pickBuilding(mouse.x, mouse.y, state), b = id && state.buildings[id], g = !b && view.groundAt(mouse.x, mouse.y), piece = g && roadPieceAt(state, g.x, g.z);
      tip.hidden = false;
      view.overlays.roadHighlight(state, piece || null);
      if (piece) {
        const seg = piece.segmentId && roadsOf(state).segments[piece.segmentId], node = piece.nodeId && roadsOf(state).nodes[piece.nodeId];
        const back = game.rules().refundsEnabled ? Math.floor((seg ? seg.paid : node?.paid || 0) / 2) : 0;
        tip.innerHTML = `${t('demolish')}: ${t('n_' + (seg ? seg.style : node.style || 'road'))}${back ? ` · +${back}` : ''}`;
      }
      else if (b) { view.overlays.footprint(b.type, b.position, b.rotation, false); tip.innerHTML = b.type === LANDMARK ? `<span class="bad">${t('cafeHeart')}</span>` : `${t('demolish')}: ${t('n_' + b.type)}${refundFor(state, b) ? ` · +${refundFor(state, b)}` : ''}`; }
      else tip.innerHTML = t('demolishMode');
    }
    if (!tip.hidden) { const tx = Math.min(mouse.x + 16, innerWidth - tip.offsetWidth - 8); tip.style.transform = `translate(${tx}px,${mouse.y + 18}px)`; }
  }

  return {
    get tool() { return tool; }, get selected() { return selected; }, get confirmDemo() { return confirmDemo; }, get upgradeOpen() { return upgradeOpen; },
    get pending() { return pending || pendingRoad; }, get freeMode() { return freeMode(); }, get drawMode() { return drawMode(); },
    /** Opens or closes the upgrade preview of the selected building. */
    toggleUpgrade(open = !upgradeOpen) { upgradeOpen = !!selected && open; confirmDemo = false; onChange('selection'); },
    /** Confirms the previewed upgrade. The core validates it (money, tier) and answers with an event. */
    confirmUpgrade() { if (!selected) return false; const res = game.dispatch({ type: CMD.Upgrade, id: selected }); if (res.ok) { upgradeOpen = false; onChange('selection'); } return res.ok; },
    setTool, select, updateHover,
    frame(dt) { time += dt; if (building()) updateHover(); if (selected && !snap().state.buildings[selected]) select(0); },
    pointerMove(x, y) { mouse = { x, y, in: true }; updateHover(); },
    pointerLeave() { mouse.in = false; updateHover(); },
    /** Left-button press: roads and demolition paint while dragging. Returns true if the press starts painting. */
    startsPainting() { return (tool.kind === 'build' && isRoadType(tool.type)) || tool.kind === 'demolish'; },
    paint(x, y, dragging) {
      const { state } = snap();
      if (drawMode()) { // drawing a road: collect the dragged path and preview the plan
        const g = view.groundAt(x, y); if (!g) return;
        if (!draft || !dragging && draft.length > 1) { draft = [g]; pendingRoad = null; }
        else if (Math.hypot(g.x - draft.at(-1).x, g.z - draft.at(-1).z) > .2) draft.push(g);
        mouse = { x, y, in: true }; updateHover(); return;
      }
      if (tool.kind === 'build') { const tile = view.tileAt(x, y); if (tile) place(gridPose(tool.type, tile.x, tile.y)); }
      else if (tool.kind === 'demolish' && dragging) { const g = view.groundAt(x, y), piece = g && roadPieceAt(state, g.x, g.z); if (piece) game.dispatch({ type: CMD.DemolishRoad, ...piece }); }
    },
    /** The drag ended: build the drawn road (mouse) or keep it for ✓ (touch). */
    paintEnd(x, y, touch = false) {
      if (!drawMode() || !draft) return;
      const g = view.groundAt(x, y); if (g && Math.hypot(g.x - draft.at(-1).x, g.z - draft.at(-1).z) > .05) draft.push(g);
      const req = draft.length > 1 ? roadRequest(draft) : null; draft = null;
      if (!req) { view.overlays.hideRoadPlan(); return; }
      if (touch) { pendingRoad = req; onChange('tool'); updateHover(); return; }
      buildRoad(req); updateHover();
    },
    click(x, y, wasPainting, touch = false) {
      const { state } = snap();
      if (building()) {
        if (drawMode()) return;                                                              // roads are drawn by dragging
        if (isRoadType(tool.type)) { if (!wasPainting) this.paint(x, y, false); return; }   // a tap places one tile
        const pose = poseAt(x, y); if (!pose) return;
        if (touch && freeMode()) { pending = pose; onChange('tool'); updateHover(); return; } // touch: move the preview, confirm with ✓
        place(pose);
      }
      else if (tool.kind === 'demolish') {
        const id = view.pickBuilding(x, y, state); if (id) { demolish(id); return; }
        const g = view.groundAt(x, y), piece = g && roadPieceAt(state, g.x, g.z); if (piece) game.dispatch({ type: CMD.DemolishRoad, ...piece });
      }
      else if (!wasPainting) { const id = view.pickBuilding(x, y, state); select(id && !isRoadType(state.buildings[id].type) ? id : 0); }
    },
    /** Places the pending (touch) preview. */
    confirmPending() { if (pendingRoad) { const ok = buildRoad(pendingRoad); pendingRoad = null; onChange('tool'); return ok; } if (pending && building()) return place(pending); return false; },
    /** Escape / right click: drop a road being drawn or a pending preview, then the tool, then the selection. False when there was nothing to cancel. */
    cancel() { if (draft || pendingRoad) { draft = null; pendingRoad = null; view.overlays.hideRoadPlan(); onChange('tool'); updateHover(); return true; } if (pending) { pending = null; onChange('tool'); updateHover(); return true; } if (tool.kind !== 'select') { setTool({ kind: 'select' }); return true; } if (selected) { select(0); return true; } return false; },
    startMove(id) {
      const b = snap().state.buildings[id]; if (!b) return;
      select(0); setTool({ kind: 'move', id, type: b.type, r: angleToQuarter(b.rotation), rot: b.rotation, manualR: true }); view.setBuildingHidden(id, true);
    },
    /** R (dir 1) / Shift+R (dir −1): turn the tool by a quarter (grid) or by the chosen step (free); otherwise turn the selection. */
    rotate(dir = 1) {
      if (building()) {
        if (freeMode()) { tool.rot = snapAngle(tool.rot + dir * stepRad(), stepRad()); if (pending) pending = { ...pending, rotation: tool.rot, snapped: null }; }
        else { tool.r = (((tool.manualR || !hover ? tool.r : angleToQuarter(hover.rotation)) + dir) % 4 + 4) % 4; tool.manualR = true; }
        updateHover(); onChange('tool');
      }
      else if (selected) { const b = snap().state.buildings[selected]; game.dispatch({ type: CMD.Rotate, id: selected, by: prefs().mode === 'free' ? dir * stepRad() : dir * Math.PI / 2 }); if (b) select(selected); }
    },
    /** Continuous turning (Ctrl + wheel) in free mode. */
    rotateBy(rad) { if (!freeMode()) return false; tool.rot = normAngle(tool.rot + rad); if (pending) pending = { ...pending, rotation: tool.rot, snapped: null }; updateHover(); return true; },
    /** The player switched grid ⇄ free (or a snap): redraw the preview. */
    placementChanged() { if (tool.kind === 'move' || tool.kind === 'build') { if (prefs().mode === 'free' && hover) tool.rot = hover.rotation; pending = null; } updateHover(); onChange('tool'); },
    armDemolish() { if (selected) { confirmDemo = true; onChange('selection'); } },
    demolishSelected() { if (!selected) return; if (!confirmDemo) { confirmDemo = true; onChange('selection'); } else demolish(selected); },
    buildType(type) { if (tool.kind === 'build' && tool.type === type) return setTool({ kind: 'select' }); select(0); setTool({ kind: 'build', type }); },
  };
}
