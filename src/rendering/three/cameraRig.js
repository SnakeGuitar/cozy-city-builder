// Three.js side of the camera: turns a visual camera state into an orthographic or perspective camera,
// and answers rays, ground hits and projections. Holds no camera logic of its own.
// The isometric→perspective transition is a dolly zoom: the field of view widens while the camera moves in,
// so the area around the target keeps its size; at blend 0 a true orthographic camera is used.
import * as THREE from 'three';
import { CAMERA } from '../../presentation/camera/model.js';

const MIN_FOV = 3 * Math.PI / 180;
export function createCameraRig() {
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
  const persp = new THREE.PerspectiveCamera(35, 1, .1, 500);
  const target = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _v = new THREE.Vector3();
  let active = ortho, size = { w: 1, h: 1 };
  return {
    get camera() { return active; }, get target() { return target; }, get size() { return size; },
    setSize(w, h) { size = { w: Math.max(1, w), h: Math.max(1, h) }; },
    /** v: visual camera state from ui/camera/model.js */
    apply(v) {
      const H = CAMERA.viewHeight / v.zoom, a = size.w / size.h;
      target.set(v.target.x, 0, v.target.z);
      let d;
      if (v.blend <= 0) {
        active = ortho; d = CAMERA.isoDistance;
        ortho.left = -H * a / 2; ortho.right = H * a / 2; ortho.top = H / 2; ortho.bottom = -H / 2; ortho.updateProjectionMatrix();
      } else {
        active = persp; const e = v.blend * v.blend * (3 - 2 * v.blend), fov = MIN_FOV + (CAMERA.fov - MIN_FOV) * e;
        d = H / (2 * Math.tan(fov / 2));
        persp.fov = fov * 180 / Math.PI; persp.aspect = a; persp.near = Math.max(.05, d - 60); persp.far = d + 120; persp.updateProjectionMatrix();
      }
      const cp = Math.cos(v.pitch);
      active.position.set(target.x + Math.sin(v.yaw) * cp * d, Math.max(.5, Math.sin(v.pitch) * d), target.z + Math.cos(v.yaw) * cp * d);
      active.up.set(0, 1, 0); active.lookAt(target); active.updateMatrixWorld();
      return active;
    },
    raycaster(cx, cy) { ndc.set(cx / size.w * 2 - 1, -(cy / size.h) * 2 + 1); ray.setFromCamera(ndc, active); return ray; },
    /** Point on the ground plane under a screen position (null if the ray misses it). */
    groundAt(cx, cy) { const r = this.raycaster(cx, cy), hit = new THREE.Vector3(); return r.ray.intersectPlane(plane, hit) ? hit : null; },
    project(p) { _v.copy(p).project(active); return [(_v.x + 1) / 2 * size.w, (1 - _v.y) / 2 * size.h]; },
  };
}
