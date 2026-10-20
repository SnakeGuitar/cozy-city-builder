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
import { CMD, peekSeed, refundFor, costFor, roadCostFor, blueprintPriceFor, canAffordCoins, blueprintBlocker } from '../core/commands/commands.js';
import { getBlueprint, entranceOf } from '../core/domain/blueprint.js';
import { FACE_ANGLE } from '../core/config/modules.js';
import { planTrace, roadPieceAt, checkCurve } from '../core/domain/roadPlan.js';
import { traceReachesCafe } from '../core/simulation/roads.js';
import { roadsOf, segmentControl, curvePoints, polylineLength, segmentPolyline, pointAt } from '../core/domain/roads.js';
import { simplifyPath } from '../presentation/input/path.js';
import { $ } from './dom/dom.js';
import { t } from './dom/i18n.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Placement preferences (saved with each game's UI data). */
export const ROAD_SHAPES = Object.freeze(['straight', 'l', 'curve']);
export const DEFAULT_PLACEMENT = Object.freeze({ mode: 'grid', snapGrid: false, snapRoad: true, snapBuild: true, step: 15, roadShape: 'straight' });
export function normalizePlacement(p = {}) {
  return { mode: p.mode === 'free' ? 'free' : 'grid', snapGrid: !!p.snapGrid, snapRoad: p.snapRoad !== false, snapBuild: p.snapBuild !== false,
    step: [5, 15, 45, 90].includes(p.step) ? p.step : DEFAULT_PLACEMENT.step, roadShape: ROAD_SHAPES.includes(p.roadShape) ? p.roadShape : DEFAULT_PLACEMENT.roadShape };
}

export function createInteraction({ game, view, onChange, placement = () => DEFAULT_PLACEMENT }) {
  let draft = null, pendingRoad = null; // road drawing: the dragged path, and (touch) a plan waiting for ✓
  // a selected road piece ({ segmentId } | { nodeId }); while editing its curve, `handle` is the control point being dragged
  let road = null, editing = false, handle = -1, activeHandle = -1, handleDrag = null;
  let tool = { kind: 'select' }, selected = 0, hover = null, pending = null, mouse = { x: 0, y: 0, in: false }, confirmDemo = false, upgradeOpen = false, time = 0;
  const tip = $('tip');
  const snap = () => game.getSnapshot();
  const building = () => tool.kind === 'build' || tool.kind === 'move';
  const prefs = () => placement();
  /** Free placement applies to buildings; streets of the grid tool always follow cells. */
  const freeMode = () => prefs().mode === 'free' && building() && !isRoadType(tool.type);
  /** Street tool in free mode: draw roads by dragging instead of painting cells. */
  const drawMode = () => prefs().mode === 'free' && tool.kind === 'build' && isRoadType(tool.type);
  const roadShape = () => prefs().roadShape;
  let flipL = false;
  /** What the current drag asks the street tool for: a straight road, an L of two straight legs, or a smooth curve. */
  function roadRequest(path) {
    const p = prefs(), q = pt => (p.snapGrid ? snapPosition(pt, .5) : { x: pt.x, z: pt.z }), a = q(path[0]), style = tool.type;
    let b = q(path.at(-1));
    if (roadShape() === 'curve') return { points: simplifyPath(path.map(q)), style, shape: 'curve' };
    if (roadShape() === 'straight') {
      if (p.snapGrid) { const len = Math.hypot(b.x - a.x, b.z - a.z), ang = snapAngle(Math.atan2(b.z - a.z, b.x - a.x), Math.PI / 12); b = { x: a.x + Math.cos(ang) * len, z: a.z + Math.sin(ang) * len }; }
      return { points: [a, b], style, shape: 'polyline' };
    }
    // an L: the first leg follows the direction the drag set off in (F flips the corner)
    const lead = path.find(pt => Math.hypot(pt.x - path[0].x, pt.z - path[0].z) > .4) || b;
    const alongX = (Math.abs(lead.x - path[0].x) >= Math.abs(lead.z - path[0].z)) !== flipL, corner = alongX ? { x: b.x, z: a.z } : { x: a.x, z: b.z };
    const degenerate = Math.hypot(corner.x - a.x, corner.z - a.z) < .3 || Math.hypot(corner.x - b.x, corner.z - b.z) < .3;
    return { points: degenerate ? [a, b] : [a, corner, b], style, shape: 'polyline' };
  }
  let planMemo = { key: '', trace: null };
  /** The full plan of a request (memoised per request and state revision: idle frames cost nothing). */
  function traceFor(req) {
    const { state } = snap(), key = JSON.stringify(req) + '|' + (state.rev || 0) + '|' + state.coins;
    if (planMemo.key !== key) { const trace = planTrace(state, req); planMemo = { key, trace: { ...trace, joins: trace.ok && traceReachesCafe(state, trace) } }; }
    return planMemo.trace;
  }
  function showRoadPlan(req, at) {
    const { state } = snap(), plan = traceFor(req), cost = plan.cost !== undefined ? roadCostFor(state, plan) : 0;
    if (!plan.ok && plan.reason === 'tooShort') { // the drag has barely started: nothing to judge yet
      view.overlays.hideRoadPlan(); view.overlays.roadMarkers(plan.start?.position ? { ends: [{ position: plan.start.position, joined: plan.start.kind !== 'free' }] } : null); return { plan, why: null };
    }
    const why = plan.ok ? (!canAffordRoad(state, cost) ? 'notEnough' : null) : plan.reason;
    view.overlays.roadPlan(plan, !why);
    view.overlays.roadMarkers({ ends: [plan.start, plan.end].filter(e => e && e.position).map(e => ({ position: e.position, joined: e.kind !== 'free' })), problem: why && plan.at ? plan.at : null });
    const blocker = plan.blocker && state.buildings[plan.blocker];
    if (blocker) view.overlays.footprint(blocker.type, blocker.position, blocker.rotation, false);
    if (at) {
      const coin = '<svg class="ico" style="display:inline;width:13px;height:13px;vertical-align:-2px" viewBox="0 0 20 20"><use href="#i-coin"/></svg>';
      const grade = plan.grade > .03 ? ` · ${t('roadGrade', { n: Math.round(plan.grade * 100) })}` : '';
      const link = plan.ok ? `<br><span class="${plan.joins ? 'ok' : 'warn'}">${plan.joins ? '✓ ' + t('roadJoinsCafe') : '○ ' + t('roadNotYetCafe')}</span>` : '';
      tip.hidden = false;
      tip.innerHTML = `${t('n_' + tool.type)} · ${plan.length ? `${plan.length.toFixed(1)} m · ` : ''}${cost ? `${cost} ${coin}` : t('free')}${grade}${why ? ` · <span class="bad">✕ ${t(why)}</span>` : ''}${link}<br><span style="font-weight:600;opacity:.7">${t('roadsDraw_' + roadShape())}</span>`;
      const tx = Math.min(at.x + 16, innerWidth - tip.offsetWidth - 8); tip.style.transform = `translate(${tx}px,${at.y + 18}px)`;
    }
    return { plan, why };
  }
  const canAffordRoad = (state, cost) => game.rules().unlimitedMoney || state.coins >= cost;
  function buildRoad(req) { const res = game.dispatch({ type: CMD.BuildRoad, ...req }); view.overlays.hideRoadPlan(); view.overlays.roadMarkers(null); return res.ok; }
  const stepRad = () => prefs().step * Math.PI / 180;
  /** The saved blueprint version the build tool places (custom buildings), or null. */
  const toolBlueprint = () => tool.blueprint ? getBlueprint(snap().state, tool.blueprint) : null;
  /** How far a custom building's entrance side is turned from its front: it faces the street with its door. */
  const faceOffset = () => { const bp = tool.kind === 'build' && toolBlueprint(), e = bp && entranceOf(bp); return e ? FACE_ANGLE[e.side] : 0; };

  /** Pose of the current tool on grid cell (x, y): quarter turn chosen by hand (R) or facing the road. */
  function gridPose(type, x, y) {
    const state = snap().state;
    if (isRoadType(type)) return tileToPose(state, type, x, y, 0);
    const fa = faceOffset(), r = tool.manualR ? tool.r : angleToQuarter(normAngle(autoFace(state, type, tileToPose(state, type, x, y, tool.r).position, normAngle(quarterToAngle(tool.r) + fa)) - fa));
    return tileToPose(state, type, x, y, r);
  }
  /** Pose of the current tool for a free ground point, after the snaps that are switched on. */
  function freePose(type, ground) {
    const state = snap().state, p = prefs(), ignore = tool.kind === 'move' ? tool.id : 0;
    let pose = { position: p.snapGrid ? snapPosition(ground, .5) : { x: ground.x, z: ground.z }, rotation: tool.rot }, snapped = null;
    if (p.snapRoad) { const r0 = snapToRoad(state, type, pose), r = r0 && { ...r0, rotation: normAngle(r0.rotation - faceOffset()) }; if (r && !canPlace(state, type, r.position, r.rotation, ignore)) { pose = r; snapped = 'road'; } }
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
    tool = { r: 0, rot: 0, manualR: false, ...next }; confirmDemo = false; pending = null; draft = null; pendingRoad = null; view.overlays.hideRoadPlan(); view.overlays.roadMarkers(null);
    view.overlays.clearGhost(); view.overlays.hideFootprint(); tip.hidden = true;
    view.overlays.setBuildMode(building() || tool.kind === 'demolish');
    if (!selected) view.overlays.hideRange();
    updateHover(); onChange('tool');
  }
  /** Control points of the selected segment, for the edit handles. */
  const handlePoints = () => { const seg = road?.segmentId && roadsOf(snap().state).segments[road.segmentId]; return seg ? seg.controlPoints : []; };
  function showHandles() { view.overlays.roadHandles(editing && road?.segmentId ? handlePoints() : null, activeHandle); }
  function selectRoad(piece) {
    road = piece || null; editing = false; handle = activeHandle = -1; handleDrag = null; confirmDemo = false;
    view.overlays.roadHighlight(snap().state, road, true); showHandles(); onChange('selection');
  }
  function select(id) {
    if (id && road) { road = null; editing = false; view.overlays.roadHighlight(null, null, true); showHandles(); }
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
    const res = game.dispatch({ type: CMD.Place, buildingType: tool.type, ...(tool.blueprint ? { blueprint: tool.blueprint } : {}), position: pose.position, rotation: pose.rotation, autoFace: false });
    if (res.ok) { pending = null; if (DEFS[tool.type].unique) setTool({ kind: 'select' }); else onChange('tool'); }
    return res.ok;
  }
  function demolish(id) { const res = game.dispatch({ type: CMD.Demolish, id }); if (res.ok && selected === id) select(0); return res.ok; }

  /** Draws the ghost, footprint, range and tooltip for a pose. */
  function preview(pose, at) {
    const { state } = snap(), d = DEFS[tool.type];
    const moving = tool.kind === 'move' && state.buildings[tool.id];
    const seed = moving ? moving.seed : peekSeed(state);
    const bp = tool.kind === 'build' ? toolBlueprint() : moving?.blueprint ? getBlueprint(state, moving.blueprint) : null;
    const cost = bp && tool.kind === 'build' ? blueprintPriceFor(state, bp) : costFor(state, tool.type);
    const why = (tool.blueprint && tool.kind === 'build' && blueprintBlocker(state, tool.blueprint)) || canPlace(state, tool.type, pose.position, pose.rotation, moving ? tool.id : 0) || (tool.kind === 'build' && !canAffordCoins(state, cost) ? 'notEnough' : null);
    view.overlays.ghost(tool.type, view.variantOf(tool.type, seed), pose.position, pose.rotation, !why, time, moving ? moving.tier : 1, bp);
    view.overlays.footprint(tool.type, pose.position, pose.rotation, !why); view.overlays.range(tool.type, pose.position, pose.rotation, moving ? statsOf(moving).r : 0);
    if (!at) return why;
    const hint = isRoadType(tool.type) ? t('roadsHint') : freeMode() ? t(tool.kind === 'move' ? 'movingFree' : 'placingFree') : t(tool.kind === 'move' ? 'moving' : 'placing');
    const snapTag = pose.snapped ? ` · <span class="ok">${t('snapped_' + pose.snapped)}</span>` : '';
    tip.hidden = false;
    tip.innerHTML = `${bp ? esc(bp.name) : t('n_' + tool.type)} ${tool.kind === 'build' ? `· ${cost ? cost : t('free')} <svg class="ico" style="display:inline;width:13px;height:13px;vertical-align:-2px" viewBox="0 0 20 20"><use href="#i-coin"/></svg>${d.upkeep ? ` · −${d.upkeep}${t('perMin')}` : ''}` : ''}${why ? ` · <span class="bad">${t(why)}</span>` : snapTag}<br><span style="font-weight:600;opacity:.7">${hint}</span>`;
    return why;
  }
  function updateHover() {
    view.overlays.hideFootprint(); tip.hidden = true; if (tool.kind !== 'demolish') view.overlays.roadHighlight(null, null);
    if (building() && pending) { preview(pending, false); return; } // touch: the preview stays where it was tapped
    if (drawMode()) { view.overlays.hideGhost(); if (pendingRoad) showRoadPlan(pendingRoad, null); else if (draft) showRoadPlan(roadRequest(draft), mouse.in ? mouse : null); else if (mouse.in) { view.overlays.roadMarkers(null); tip.hidden = false; tip.innerHTML = `${t('n_' + tool.type)}<br><span style="font-weight:600;opacity:.7">${t('roadsDraw_' + roadShape())}</span>`; const tx = Math.min(mouse.x + 16, innerWidth - tip.offsetWidth - 8); tip.style.transform = `translate(${tx}px,${mouse.y + 18}px)`; } return; }
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
    get road() { return road; }, get editing() { return editing; }, get activeHandle() { return activeHandle; },
    selectRoad,
    /** Turns curve editing (handles on the control points) on or off for the selected segment. */
    toggleEditing(on = !editing) { if (!road?.segmentId) return; editing = on; activeHandle = -1; showHandles(); onChange('selection'); },
    /** Adds a control point at the middle of the selected segment (then drag it). */
    addControlPoint() {
      const { state } = snap(), seg = road?.segmentId && roadsOf(state).segments[road.segmentId]; if (!seg) return false;
      const pl = segmentPolyline(state, seg), mid = pointAt(pl, polylineLength(pl) / 2);
      const res = game.dispatch({ type: CMD.EditRoad, segmentId: seg.id, action: 'add', position: { x: mid.x, z: mid.z } });
      if (res.ok) { editing = true; activeHandle = roadsOf(state).segments[seg.id].controlPoints.findIndex(p => p.x === mid.x && p.z === mid.z); showHandles(); onChange('selection'); }
      return res.ok;
    },
    /** Removes the active (or last) control point of the selected segment. */
    removeControlPoint() {
      const seg = road?.segmentId && roadsOf(snap().state).segments[road.segmentId]; if (!seg || !seg.controlPoints.length) return false;
      const i = activeHandle >= 0 ? activeHandle : seg.controlPoints.length - 1;
      const res = game.dispatch({ type: CMD.EditRoad, segmentId: seg.id, action: 'remove', index: i }); activeHandle = -1; showHandles(); onChange('selection'); return res.ok;
    },
    demolishRoad() { if (!road) return false; if (!confirmDemo) { confirmDemo = true; onChange('selection'); return false; } const res = game.dispatch({ type: CMD.DemolishRoad, ...road }); if (res.ok) selectRoad(null); return res.ok; },
    undoRoad() { const r = game.undoRoad(); if (r?.ok) { if (road && !roadsOf(snap().state).segments[road.segmentId] && !roadsOf(snap().state).nodes[road.nodeId]) selectRoad(null); else showHandles(); } return r; },
    redoRoad() { const r = game.redoRoad(); if (r?.ok) showHandles(); return r; },
    get pending() { return pending || pendingRoad; }, get freeMode() { return freeMode(); }, get drawMode() { return drawMode(); },
    /** Opens or closes the upgrade preview of the selected building. */
    toggleUpgrade(open = !upgradeOpen) { upgradeOpen = !!selected && open; confirmDemo = false; onChange('selection'); },
    /** Confirms the previewed upgrade. The core validates it (money, tier) and answers with an event. */
    confirmUpgrade() { if (!selected) return false; const res = game.dispatch({ type: CMD.Upgrade, id: selected }); if (res.ok) { upgradeOpen = false; onChange('selection'); } return res.ok; },
    setTool, select, updateHover,
    frame(dt) {
      time += dt; if (building()) updateHover(); if (selected && !snap().state.buildings[selected]) select(0);
      const r = roadsOf(snap().state); if (road && !(road.segmentId ? r.segments[road.segmentId] : r.nodes[road.nodeId])) selectRoad(null);
      else if (road) view.overlays.roadHighlight(snap().state, road, true);
    },
    pointerMove(x, y) { mouse = { x, y, in: true }; updateHover(); },
    pointerLeave() { mouse.in = false; updateHover(); },
    /** Left-button press: roads and demolition paint while dragging. Returns true if the press starts painting. */
    startsPainting(x, y) {
      if (tool.kind === 'select' && editing && road?.segmentId && x !== undefined) { // grab a curve handle under the pointer
        const pts = handlePoints(); handle = -1;
        pts.forEach((p, i) => { const [sx, sy] = view.project({ x: p.x, y: .15, z: p.z }); if (Math.hypot(sx - x, sy - y) < 18 && handle < 0) handle = i; });
        if (handle >= 0) { activeHandle = handle; handleDrag = null; return true; }
      }
      return (tool.kind === 'build' && isRoadType(tool.type)) || tool.kind === 'demolish';
    },
    paint(x, y, dragging) {
      const { state } = snap();
      if (handle >= 0 && road?.segmentId) { // dragging a curve handle: preview the bent road
        const g = view.groundAt(x, y), seg = roadsOf(state).segments[road.segmentId]; if (!g || !seg) return;
        const cps = seg.controlPoints.map((p, i) => i === handle ? { x: g.x, z: g.z } : p), ends = segmentControl(state, seg);
        const pl = curvePoints([ends[0], ...cps, ends.at(-1)]), why = checkCurve(state, pl, seg.width);
        handleDrag = { x: g.x, z: g.z }; view.overlays.roadPlan({ polyline: pl, width: seg.width, style: seg.style, start: {}, end: {} }, !why);
        view.overlays.roadHandles(cps, handle); return;
      }
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
      if (handle >= 0) { // drop the handle: the core checks the new curve
        if (handleDrag && road?.segmentId) game.dispatch({ type: CMD.EditRoad, segmentId: road.segmentId, action: 'move', index: handle, position: handleDrag });
        handle = -1; handleDrag = null; view.overlays.hideRoadPlan(); showHandles(); onChange('selection'); return;
      }
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
      else if (!wasPainting) {
        const id = view.pickBuilding(x, y, state);
        if (id) { select(id); return; }
        const g = view.groundAt(x, y), piece = g && roadPieceAt(state, g.x, g.z);
        select(0); selectRoad(piece);
      }
    },
    /** Places the pending (touch) preview. */
    confirmPending() { if (pendingRoad) { const ok = buildRoad(pendingRoad); pendingRoad = null; onChange('tool'); return ok; } if (pending && building()) return place(pending); return false; },
    /** Escape / right click: drop a road being drawn or a pending preview, then the tool, then the selection. False when there was nothing to cancel. */
    cancel() { if (road) { if (editing) { editing = false; showHandles(); onChange('selection'); } else selectRoad(null); return true; }
      if (draft || pendingRoad) { draft = null; pendingRoad = null; view.overlays.hideRoadPlan(); view.overlays.roadMarkers(null); onChange('tool'); updateHover(); return true; } if (pending) { pending = null; onChange('tool'); updateHover(); return true; } if (tool.kind !== 'select') { setTool({ kind: 'select' }); return true; } if (selected) { select(0); return true; } return false; },
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
    /** F: the L trace turns its corner the other way. */
    flipCorner() { if (!drawMode() || roadShape() !== 'l') return false; flipL = !flipL; updateHover(); return true; },
    /** Continuous turning (Ctrl + wheel) in free mode. */
    rotateBy(rad) { if (!freeMode()) return false; tool.rot = normAngle(tool.rot + rad); if (pending) pending = { ...pending, rotation: tool.rot, snapped: null }; updateHover(); return true; },
    /** The player switched grid ⇄ free (or a snap): redraw the preview. */
    placementChanged() { if (tool.kind === 'move' || tool.kind === 'build') { if (prefs().mode === 'free' && hover) tool.rot = hover.rotation; pending = null; } updateHover(); onChange('tool'); },
    armDemolish() { if (selected) { confirmDemo = true; onChange('selection'); } },
    demolishSelected() { if (!selected) return; if (!confirmDemo) { confirmDemo = true; onChange('selection'); } else demolish(selected); },
    buildType(type) { if (tool.kind === 'build' && tool.type === type && !tool.blueprint) return setTool({ kind: 'select' }); select(0); setTool({ kind: 'build', type }); },
    /** Arms the build tool with a saved design ({ id, version? }; the latest version when none is given). */
    buildBlueprint(ref) {
      const bp = getBlueprint(snap().state, ref); if (!bp) return false;
      if (tool.kind === 'build' && tool.blueprint?.id === bp.id && tool.blueprint.version === bp.version) { setTool({ kind: 'select' }); return true; }
      select(0); setTool({ kind: 'build', type: bp.baseType, blueprint: { id: bp.id, version: bp.version } }); return true;
    },
  };
}
