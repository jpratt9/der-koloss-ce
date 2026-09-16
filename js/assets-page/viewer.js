import * as THREE from 'three';
import { WeaponRig } from '../weapons.js';

export function createWeaponViewer({ canvas, canvasWrap }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 50);
  // Eye height and the height the model is mounted at are the SAME number on
  // purpose — the model's measured centre then lands exactly on the optical
  // centre of the frame. Two different constants here is how the framing drifts.
  const STAGE_EYE_Y = 0.06;
  camera.position.set(0, STAGE_EYE_Y, 3.1);
  scene.add(new THREE.HemisphereLight(0xc7d2df, 0x24140e, 1.25));
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const keyLight = new THREE.DirectionalLight(0xffead0, 3.2);
  keyLight.position.set(3, 4, 4);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xa31f27, 4.5);
  rimLight.position.set(-4, 1, -3);
  scene.add(rimLight);
  const modelPivot = new THREE.Group();
  scene.add(modelPivot);

  const rigCamera = new THREE.PerspectiveCamera();
  const weaponRig = new WeaponRig(rigCamera);
  weaponRig.hipPos.set(0, 0, 0);
  let currentMount = null;
  let yaw = -0.28;
  let pitch = -0.12;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastInteraction = 0;

  // The pose the archive holds the weapon in: no aim, no movement, no sway. The
  // render loop feeds these same values every frame, so a rig settled with them
  // is in exactly the pose that will be drawn.
  const REST_POSE = { ads: false, moving: false, sprinting: false, mouseX: 0, mouseY: 0 };

  // Bounds of what is actually ON SCREEN. Box3.setFromObject() does not test
  // `visible` and does not skip sprites, so a plain box here swallows the hidden
  // gloves and the zero-opacity muzzle flash and centres the weapon against
  // geometry nobody can see.
  function visibleBounds(root) {
    const box = new THREE.Box3();
    const scratch = new THREE.Box3();
    (function walk(object, parentVisible) {
      const visible = parentVisible && object.visible;
      if (visible && object.isMesh && !object.isSprite && object.geometry) {
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        box.union(scratch.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld));
      }
      for (const child of object.children) walk(child, visible);
    })(root, true);
    return box;
  }

  function setModel(id, pap, finish) {
    const weaponChanged = weaponRig.current?.id !== id;
    if (currentMount) modelPivot.remove(currentMount);
    weaponRig.alwaysGold = false;
    weaponRig.diamondNext = finish === 'diamond';
    weaponRig.equip(id, pap);
    weaponRig.equipT = 1;
    if (finish === 'gold') weaponRig.applyGoldCamo(true);
    if (finish === 'diamond' && !weaponRig.diamondCamo) weaponRig.applyDiamondCamo();
    const model = weaponRig.current.group;
    // The archive presents the weapon alone, so the gloves come off. Test the
    // glove flag, NOT the part name: a name prefix of "hand" also matches
    // `handguard` and `handle`, which took the wooden forend and the carry handle
    // off fifteen weapons and left the front end hanging in space.
    model.traverse((o) => { if (o.userData?.isGlove) o.visible = false; });
    // Settle the rig into its rest pose BEFORE measuring. equip() leaves the
    // weapon in the lowered holster pose it rises out of, and the first update()
    // of the render loop lifts it back up — so a box taken here without this
    // call is stale by the height of that raise. The error is then multiplied by
    // the fit scale below, which is why it threw the small guns (scaled ~3x)
    // clean off the top of the frame and left the rifles sitting high.
    weaponRig.update(0, REST_POSE);
    model.removeFromParent();
    model.updateMatrixWorld(true);
    const box = visibleBounds(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z, 0.01);
    const scale = 1.28 / longest;
    const centerMount = new THREE.Group();
    centerMount.position.copy(center).multiplyScalar(-1);
    centerMount.add(model);
    const orientationMount = new THREE.Group();
    orientationMount.rotation.y = Math.PI / 2;
    orientationMount.add(centerMount);
    currentMount = new THREE.Group();
    currentMount.scale.setScalar(scale);
    currentMount.position.y = STAGE_EYE_Y;
    currentMount.add(orientationMount);
    modelPivot.clear();
    modelPivot.add(currentMount);
    if (weaponChanged) {
      yaw = -0.28;
      pitch = -0.12;
    }
  }

  canvasWrap.addEventListener('pointerdown', (event) => {
    dragging = true; lastX = event.clientX; lastY = event.clientY; lastInteraction = performance.now();
    canvasWrap.setPointerCapture(event.pointerId);
  });
  canvasWrap.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    yaw += (event.clientX - lastX) * 0.008;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - lastY) * 0.006, -0.65, 0.65);
    lastX = event.clientX; lastY = event.clientY; lastInteraction = performance.now();
  });
  canvasWrap.addEventListener('pointerup', (event) => { dragging = false; lastInteraction = performance.now(); canvasWrap.releasePointerCapture(event.pointerId); });
  canvasWrap.addEventListener('pointercancel', () => { dragging = false; });

  function resizeRenderer() {
    const rect = canvasWrap.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resizeRenderer).observe(canvasWrap);
  resizeRenderer();

  let lastFrame = performance.now();
  function renderFrame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (!dragging && now - lastInteraction > 1700 && !matchMedia('(prefers-reduced-motion: reduce)').matches) yaw += dt * 0.22;
    weaponRig.update(dt, REST_POSE);
    modelPivot.rotation.set(pitch, yaw, 0.03);
    renderer.render(scene, camera);
    requestAnimationFrame(renderFrame);
  }
  requestAnimationFrame(renderFrame);
  function resetView() { yaw = -0.28; pitch = -0.12; lastInteraction = 0; }
  return { weaponRig, setModel, resetView };
}
