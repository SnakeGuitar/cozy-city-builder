// Tools and selection: turns pointer/keyboard intents into core commands and previews.
// Owns only presentation state (current tool, hover, selection); game rules stay in core/.
import { DEFS, isRoadType } from '../core/config/catalog.js';
import { canPlace, autoFace } from '../core/domain/grid.js';
import { CMD, peekSeed, refundFor, costFor, canAfford } from '../core/commands/commands.js';
import { LANDMARK } from '../core/config/catalog.js';
import { $ } from './dom/dom.js';
import { t } from './dom/i18n.js';

export function createInteraction({ game, view, onChange }) {
  let tool = { kind: 'select' }, selected = 0, hover = null, mouse = { x: 0, y: 0, in: false }, confirmDemo = false, upgradeOpen = false, time = 0;
  const tip = $('tip');
  const snap = () => game.getSnapshot();
  const building = () => tool.kind === 'build' || tool.kind === 'move';
  const rotationFor = (type, x, y) => isRoadType(type) ? 0 : tool.manualR ? tool.r : autoFace(snap().state, type, x, y, tool.r);

  function setTool(next) {
    if (tool.kind === 'move' && next.kind !== 'move') view.setBuildingHidden(tool.id, false);
    tool = { r: 0, manualR: false, ...next }; confirmDemo = false;
    view.overlays.clearGhost(); view.overlays.hideFootprint(); tip.hidden = true;
    view.overlays.setBuildMode(building() || tool.kind === 'demolish');
    if (!selected) view.overlays.hideRange();
    updateHover(); onChange('tool');
  }
  function select(id) {
    selected = id || 0; confirmDemo = false; upgradeOpen = false; view.selectBuilding(selected);
    const b = selected && snap().state.buildings[selected];
    if (b) view.overlays.range(b.type, b.x, b.y); else view.overlays.hideRange();
    onChange('selection');
  }
  function place(x, y) {
    if (tool.kind === 'move') {
      const id = tool.id, res = game.dispatch({ type: CMD.Move, id, x, y, r: rotationFor(tool.type, x, y), autoFace: false });
      if (res.ok) { setTool({ kind: 'select' }); select(id); }
      return res.ok;
    }
    const res = game.dispatch({ type: CMD.Place, buildingType: tool.type, x, y, r: rotationFor(tool.type, x, y), autoFace: false });
    if (res.ok && DEFS[tool.type].unique) setTool({ kind: 'select' });
    return res.ok;
  }
  function demolish(id) { const res = game.dispatch({ type: CMD.Demolish, id }); if (res.ok && selected === id) select(0); return res.ok; }

  function updateHover() {
    view.overlays.hideFootprint(); tip.hidden = true;
    if (!mouse.in) { view.overlays.hideGhost(); return; }
    const { state } = snap();
    if (building()) {
      const d = DEFS[tool.type], tile = view.tileAt(mouse.x, mouse.y, d.s); if (!tile) return;
      const { x, y } = tile; hover = [x, y];
      const r = rotationFor(tool.type, x, y);
      const seed = tool.kind === 'move' ? state.buildings[tool.id].seed : peekSeed(state);
      const why = canPlace(state, tool.type, x, y, tool.kind === 'move' ? tool.id : 0) || (tool.kind === 'build' && !canAfford(state, tool.type) ? 'notEnough' : null);
      const cost = costFor(state, tool.type);
      view.overlays.ghost(tool.type, view.variantOf(tool.type, seed), x, y, r, !why, time);
      view.overlays.footprint(x, y, d.s, !why); view.overlays.range(tool.type, x, y);
      tip.hidden = false;
      tip.innerHTML = `${t('n_' + tool.type)} ${tool.kind === 'build' ? `· ${cost ? cost : t('free')} <svg class="ico" style="display:inline;width:13px;height:13px;vertical-align:-2px" viewBox="0 0 20 20"><use href="#i-coin"/></svg>${d.upkeep ? ` · −${d.upkeep}${t('perMin')}` : ''}` : ''}${why ? ` · <span class="bad">${t(why)}</span>` : ''}<br><span style="font-weight:600;opacity:.7">${isRoadType(tool.type) ? t('roadsHint') : t(tool.kind === 'move' ? 'moving' : 'placing')}</span>`;
    } else if (tool.kind === 'demolish') {
      const id = view.pickBuilding(mouse.x, mouse.y, state), b = id && state.buildings[id];
      tip.hidden = false;
      if (b) { view.overlays.footprint(b.x, b.y, DEFS[b.type].s, false); tip.innerHTML = b.type === LANDMARK ? `<span class="bad">${t('cafeHeart')}</span>` : `${t('demolish')}: ${t('n_' + b.type)}${refundFor(state, b) ? ` · +${refundFor(state, b)}` : ''}`; }
      else tip.innerHTML = t('demolishMode');
    }
    if (!tip.hidden) { const tx = Math.min(mouse.x + 16, innerWidth - tip.offsetWidth - 8); tip.style.transform = `translate(${tx}px,${mouse.y + 18}px)`; }
  }

  return {
    get tool() { return tool; }, get selected() { return selected; }, get confirmDemo() { return confirmDemo; }, get upgradeOpen() { return upgradeOpen; },
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
      if (tool.kind === 'build') { const tile = view.tileAt(x, y); if (tile) place(tile.x, tile.y); }
      else if (tool.kind === 'demolish' && dragging) { const id = view.pickBuilding(x, y, state); if (id && isRoadType(state.buildings[id].type)) demolish(id); }
    },
    click(x, y, wasPainting) {
      const { state } = snap();
      if (building()) {
        if (isRoadType(tool.type)) { if (!wasPainting) this.paint(x, y, false); return; }   // a tap places one tile
        const tile = view.tileAt(x, y, DEFS[tool.type].s); if (tile) place(tile.x, tile.y);
      }
      else if (tool.kind === 'demolish') { const id = view.pickBuilding(x, y, state); if (id) demolish(id); }
      else if (!wasPainting) { const id = view.pickBuilding(x, y, state); select(id && !isRoadType(state.buildings[id].type) ? id : 0); }
    },
    /** Escape / right click: leave the tool, then the selection. Returns false when there was nothing to cancel. */
    cancel() { if (tool.kind !== 'select') { setTool({ kind: 'select' }); return true; } if (selected) { select(0); return true; } return false; },
    startMove(id) {
      const b = snap().state.buildings[id]; if (!b) return;
      select(0); setTool({ kind: 'move', id, type: b.type, r: b.r }); view.setBuildingHidden(id, true);
    },
    rotate() {
      if (building()) { tool.r = ((tool.manualR || !hover ? tool.r : autoFace(snap().state, tool.type, hover[0], hover[1], tool.r)) + 1) % 4; tool.manualR = true; updateHover(); }
      else if (selected) game.dispatch({ type: CMD.Rotate, id: selected });
    },
    armDemolish() { if (selected) { confirmDemo = true; onChange('selection'); } },
    demolishSelected() { if (!selected) return; if (!confirmDemo) { confirmDemo = true; onChange('selection'); } else demolish(selected); },
    buildType(type) { if (tool.kind === 'build' && tool.type === type) return setTool({ kind: 'select' }); select(0); setTool({ kind: 'build', type }); },
  };
}
