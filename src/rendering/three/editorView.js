// The building editor's 3D preview: its own renderer, camera and light, the lot with its footprint, entrance and
// street-connection marks, the draft's parts, selection and problem outlines, move / turn / resize gizmos, a
// day / night preview, a side-by-side comparison with the original and thumbnails.
// It only draws what it is given and reports what the player does with the pointer; the editor model decides.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { M, T, windowMat, lampMat } from './art.js';
import { partModel, partSignature, blueprintProto } from './blueprintModel.js';
import { resolveParts, entranceOf, lotSize } from '../../core/domain/blueprint.js';
import { FACES, FACE_ANGLE } from '../../core/config/modules.js';
import { cosSin } from '../../core/domain/geometry.js';

const SEL = '#4f8a1e', BAD = '#c8553f', WARN = '#d49a2a';

/**
 * `onGizmo({ id, pose?, size?, phase })` reports gizmo edits in the lot frame (phase 'change' while dragging, 'end'
 * on release); `reducedMotion` turns camera damping off.
 */
export function createEditorView(container, { onGizmo = () => {}, reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'ed-canvas'; renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'preview'); container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, .05, 80);
  camera.position.set(2.6, 2.2, 3.2); scene.background = new THREE.Color('#f3ead7'); scene.fog = new THREE.Fog('#f3ead7', 9, 16);
  const hemi = new THREE.HemisphereLight('#fff6e0', '#8d7b60', 1.1), sun = new THREE.DirectionalLight('#fff1d6', 1.6);
  sun.position.set(3, 5, 2.5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
  scene.add(hemi, sun);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, .35, 0); orbit.enableDamping = !reducedMotion; orbit.minDistance = 1; orbit.maxDistance = 14; orbit.maxPolarAngle = Math.PI * .49; orbit.update();

  // ground, lot, grid
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 48).rotateX(-Math.PI / 2), M.grass()); ground.receiveShadow = true; ground.position.y = -.003; scene.add(ground);
  const helpers = new THREE.Group(); scene.add(helpers); // everything that is not the building (hidden in thumbnails)
  let lot = null, lotSide = 0;
  const lotMat = new THREE.MeshLambertMaterial({ color: '#e7dcc2' }), lineMat = new THREE.LineBasicMaterial({ color: '#6a4631', transparent: true, opacity: .55 });
  const badLot = new THREE.LineDashedMaterial({ color: BAD, dashSize: .08, gapSize: .05 }), okLot = new THREE.LineBasicMaterial({ color: '#6a4631' });
  function buildLot(s) {
    if (lot) { helpers.remove(lot); lot.traverse(o => o.geometry?.dispose()); }
    lot = new THREE.Group(); lotSide = s;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), lotMat); pad.receiveShadow = true; pad.position.y = -.001; lot.add(pad);
    const pts = []; for (let v = -s / 2; v <= s / 2 + 1e-9; v += .1) { pts.push(-s / 2, .001, v, s / 2, .001, v, v, .001, -s / 2, v, .001, s / 2); }
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: '#b8a88b', transparent: true, opacity: .35 })); lot.add(grid);
    const h = s / 2, outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-h, .004, -h), new THREE.Vector3(h, .004, -h), new THREE.Vector3(h, .004, h), new THREE.Vector3(-h, .004, h)]), okLot);
    outline.computeLineDistances(); outline.userData.outline = true; lot.add(outline);
    helpers.add(lot);
  }
  // entrance arrow and the strip where the street should run
  const arrowMat = new THREE.MeshBasicMaterial({ color: SEL }), streetMat = new THREE.MeshBasicMaterial({ map: T.frame(), color: '#8f8a80', transparent: true, opacity: .55, depthWrite: false });
  const arrow = new THREE.Group(); { const shaft = new THREE.Mesh(new THREE.BoxGeometry(.04, .01, .22), arrowMat); shaft.position.z = .11; const head = new THREE.Mesh(new THREE.ConeGeometry(.07, .12, 12).rotateX(Math.PI / 2), arrowMat); head.position.z = .27; arrow.add(shaft, head); }
  const street = new THREE.Mesh(new THREE.PlaneGeometry(1, .5).rotateX(-Math.PI / 2), streetMat);
  helpers.add(arrow, street);

  // parts: one group per part, rebuilt only when its look changes, moved when its pose changes
  const partsRoot = new THREE.Group(); scene.add(partsRoot);
  const views = new Map(); // id → { sig, obj }
  const outlines = new Group2(helpers);
  let compareObj = null, compareKey = '', current = null;

  // gizmo on a proxy object at the primary part's pose
  const proxy = new THREE.Object3D(); scene.add(proxy);
  const gizmo = new TransformControls(camera, renderer.domElement); gizmo.setSize(.8); scene.add(gizmo);
  let gizmoId = null, size0 = null, snaps = { move: .05, angle: 15, scale: .1 }, mode = 'translate';
  gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; });
  gizmo.addEventListener('mouseDown', () => { const p = current?.parts.find(q => q.id === gizmoId); size0 = p ? { ...p.size } : null; });
  gizmo.addEventListener('objectChange', () => report('change'));
  gizmo.addEventListener('mouseUp', () => { report('end'); proxy.scale.set(1, 1, 1); });
  function report(phase) {
    if (gizmoId === null) return;
    if (mode === 'scale') { if (size0) onGizmo({ id: gizmoId, size: { w: size0.w * proxy.scale.x, h: size0.h * proxy.scale.y, d: size0.d * proxy.scale.z }, phase }); }
    else onGizmo({ id: gizmoId, pose: { x: proxy.position.x, y: proxy.position.y, z: proxy.position.z, ry: proxy.rotation.y }, phase });
  }
  function applySnaps() {
    gizmo.setTranslationSnap(snaps.move || null); gizmo.setRotationSnap(snaps.angle ? THREE.MathUtils.degToRad(snaps.angle) : null); gizmo.setScaleSnap(snaps.scale || null);
  }
  applySnaps();
  function placeGizmo(bp, res, primary) {
    const r = primary !== null ? res.get(primary) : null;
    if (!r) { gizmo.detach(); gizmoId = null; return; }
    gizmoId = primary; if (!gizmo.dragging) { proxy.position.set(r.x, r.y, r.z); proxy.rotation.set(0, r.ry, 0); proxy.scale.set(1, 1, 1); }
    if (gizmo.object !== proxy) gizmo.attach(proxy);
    const face = FACES.includes(r.part.anchor);
    gizmo.setMode(mode); gizmo.setSpace(mode === 'translate' && !face ? 'world' : 'local');
    gizmo.showX = mode !== 'rotate'; gizmo.showZ = mode !== 'rotate' && !(mode === 'translate' && face); gizmo.showY = true;
  }

  function sizeOf() { const w = container.clientWidth || 1, h = container.clientHeight || 1; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const ro = new ResizeObserver(sizeOf); ro.observe(container); sizeOf();
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

  return {
    canvas: renderer.domElement,
    /**
     * Draws a draft: `selection` (ids, primary last), `issues` from validateBlueprint (their parts get dashed
     * outlines: red for errors, amber for warnings; never colour alone, the list names them too).
     */
    update(bp, { selection = [], issues = [] } = {}) {
      current = bp; const s = lotSize(bp); if (s !== lotSide) buildLot(s);
      const res = resolveParts(bp), seen = new Set();
      for (const r of res.values()) {
        const sig = partSignature(r.part); let v = views.get(r.part.id);
        if (!v || v.sig !== sig) { if (v) { partsRoot.remove(v.obj); v.obj.traverse(o => o.geometry?.dispose()); } v = { sig, obj: partModel(r.part, bp.seed) }; v.obj.userData.partId = r.part.id; partsRoot.add(v.obj); views.set(r.part.id, v); }
        v.obj.position.set(r.x, r.y, r.z); v.obj.rotation.set(0, r.ry, 0); seen.add(r.part.id);
      }
      for (const [id, v] of views) if (!seen.has(id)) { partsRoot.remove(v.obj); v.obj.traverse(o => o.geometry?.dispose()); views.delete(id); }
      // outlines: selection solid green; problems dashed
      const lines = [];
      for (const id of selection) { const r = res.get(id); if (r) lines.push({ r, color: SEL, dashed: false, wide: id === selection.at(-1) }); }
      for (const i of issues) { const r = i.partId && res.get(i.partId); if (r) lines.push({ r, color: i.level === 'error' ? BAD : WARN, dashed: true }); }
      outlines.set(lines);
      const outside = issues.some(i => i.code === 'outsideLot'), ol = lot.children.find(o => o.userData.outline); ol.material = outside ? badLot : okLot;
      const e = entranceOf(bp, res); arrow.visible = street.visible = !!e;
      if (e) {
        const a = FACE_ANGLE[e.side], [c, sn] = cosSin(a), h = s / 2;
        arrow.position.set(e.x, .02, e.z); arrow.rotation.set(0, a, 0);
        street.scale.set(s, 1, 1); street.position.set(sn * (h + .3), .002, c * (h + .3)); street.rotation.set(0, a, 0);
      }
      placeGizmo(bp, res, selection.at(-1) ?? null);
    },
    /** Shows the original version beside the draft (null hides it). */
    compare(original) {
      const key = original ? `${original.id}@${original.version}` : '';
      if (key === compareKey) return; compareKey = key;
      if (compareObj) { scene.remove(compareObj); compareObj = null; }
      if (original) { compareObj = blueprintProto(original).clone(); compareObj.position.x = -(lotSize(original) + .7); scene.add(compareObj); }
      orbit.target.x = original ? -(lotSize(original) + .7) / 2 : 0; orbit.update();
    },
    /** Lot-frame point → screen pixels (labels over the preview). */
    project(p) { const v = new THREE.Vector3(p.x, p.y, p.z).project(camera), r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, visible: v.z < 1 }; },
    /** The part under a screen point, or null. */
    pick(cx, cy) {
      const r = renderer.domElement.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
      ray.setFromCamera(ndc, camera);
      for (const hit of ray.intersectObjects(partsRoot.children, true)) { let o = hit.object; while (o && o.userData.partId === undefined) o = o.parent; if (o) return o.userData.partId; }
      return null;
    },
    /** True while a gizmo handle is under the pointer or being dragged (clicks then do not pick). */
    get gizmoActive() { return gizmo.dragging || gizmo.axis !== null; },
    setMode(m) { mode = m; if (current) placeGizmo(current, resolveParts(current), gizmoId); },
    get mode() { return mode; },
    setSnaps(s) { snaps = { ...snaps, ...s }; applySnaps(); },
    /** Day (0) to night (1) light, windows lit at night. */
    setNight(n) {
      hemi.intensity = 1.1 - n * .75; sun.intensity = 1.6 - n * 1.35; sun.color.set(n > .5 ? '#9fb3ff' : '#fff1d6');
      scene.background.set(n > .5 ? '#2b3150' : '#f3ead7'); scene.fog.color.set(scene.background);
      windowMat.emissiveIntensity = n * 1.1; lampMat.emissiveIntensity = .2 + n;
    },
    /** Resets the camera to a three-quarter view of the lot. */
    resetCamera() { camera.position.set(2.6, 2.2, 3.2); orbit.target.set(compareObj ? orbit.target.x : 0, .35, 0); orbit.update(); },
    /** A square picture of the draft alone (catalogue card), as a data URL. */
    thumbnail(px = 128) {
      const keep = { helpers: helpers.visible, gizmo: gizmo.visible, cmp: compareObj?.visible, bg: scene.background, pos: camera.position.clone(), tgt: orbit.target.clone(), aspect: camera.aspect };
      helpers.visible = gizmo.visible = false; if (compareObj) compareObj.visible = false; outlines.group.visible = false; scene.background = null;
      const s = lotSide || 1; camera.position.set(s * 1.55, s * 1.35, s * 1.75); orbit.target.set(0, s * .3, 0); camera.lookAt(orbit.target); camera.aspect = 1; camera.updateProjectionMatrix();
      const w = renderer.domElement.width, h = renderer.domElement.height, side = Math.min(w, h); renderer.setClearAlpha(0);
      renderer.setViewport(0, 0, side / renderer.getPixelRatio(), side / renderer.getPixelRatio()); renderer.render(scene, camera);
      const out = document.createElement('canvas'); out.width = out.height = px; out.getContext('2d').drawImage(renderer.domElement, 0, h - side, side, side, 0, 0, px, px);
      helpers.visible = keep.helpers; gizmo.visible = keep.gizmo; if (compareObj) compareObj.visible = keep.cmp; outlines.group.visible = true; scene.background = keep.bg; renderer.setClearAlpha(1);
      camera.position.copy(keep.pos); orbit.target.copy(keep.tgt); camera.aspect = keep.aspect; camera.updateProjectionMatrix(); sizeOf(); orbit.update();
      return out.toDataURL('image/png');
    },
    frame() { if (orbit.enableDamping) orbit.update(); renderer.render(scene, camera); },
    /** Releases the GPU context and every geometry this view made. */
    dispose() {
      ro.disconnect(); gizmo.detach(); gizmo.dispose(); orbit.dispose();
      for (const v of views.values()) v.obj.traverse(o => o.geometry?.dispose()); views.clear(); outlines.set([]);
      if (lot) lot.traverse(o => o.geometry?.dispose());
      renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove();
      windowMat.emissiveIntensity = 0; lampMat.emissiveIntensity = .2;
    },
  };
}

/** Box outlines around parts (selection and problems), rebuilt per update; a small fixed pool of materials. */
function Group2(parent) {
  const group = new THREE.Group(); parent.add(group);
  const mats = new Map(), mat = (color, dashed) => { const k = color + dashed; if (!mats.has(k)) mats.set(k, dashed ? new THREE.LineDashedMaterial({ color, dashSize: .04, gapSize: .03, depthTest: false }) : new THREE.LineBasicMaterial({ color, depthTest: false })); return mats.get(k); };
  return {
    group,
    set(list) {
      for (const c of [...group.children]) { group.remove(c); c.geometry.dispose(); }
      for (const { r, color, dashed, wide } of list) {
        const pad = wide ? .03 : .015, geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w + pad, r.h + pad, r.d + pad));
        const l = new THREE.LineSegments(geo, mat(color, dashed)); l.position.set(r.x, r.y + r.h / 2, r.z); l.rotation.y = r.ry; l.renderOrder = 10;
        if (dashed) l.computeLineDistances(); group.add(l);
      }
    },
  };
}
