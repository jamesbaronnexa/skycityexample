import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.querySelector("#c");

// -------------------- Renderer --------------------
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// -------------------- Scene / Camera --------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x123e74); // SkyCity blue

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  2,
  200000
);

// -------------------- Controls --------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.8;

// Prevent upside-down flips
controls.minPolarAngle = 0.15;
controls.maxPolarAngle = Math.PI * 0.49;

// Track user interaction so we don't override their view
let userInteracted = false;
controls.addEventListener("start", () => {
  userInteracted = true;
  hidePopup?.();
});

// -------------------- Lighting (soft Redshift-ish) --------------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x20242c, 1.2));

const sun = new THREE.DirectionalLight(0xffffff, 0.70);
sun.position.set(-21700, 124800, 43300);
sun.castShadow = true;

// Softer-ish shadow look
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 1.5;

// Big world shadow camera so shadows actually appear at your scale
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200000;
sun.shadow.camera.left = -60000;
sun.shadow.camera.right = 60000;
sun.shadow.camera.top = 60000;
sun.shadow.camera.bottom = -60000;

scene.add(sun);

// -------------------- Camera Presets (your values) --------------------
const PRESET_HOME = {
  name: "Home",
  pos: new THREE.Vector3(17624.882, 27630.32, -12916.264),
  target: new THREE.Vector3(1788.92, -5766.223, -4642.796),
};

const PRESET_FED = {
  name: "Fed street",
  pos: new THREE.Vector3(8611.285, -10343.009, -17205.86),
  target: new THREE.Vector3(6552.512, -8971.525, -2939.588),
};

// -------------------- Responsive helpers --------------------
function isMobilePortrait() {
  // works well for iPhone/Android portrait
  return (
    window.matchMedia?.("(orientation: portrait)").matches &&
    window.innerWidth <= 900
  );
}

// Fit camera to model (for mobile portrait so nothing crops)
function fitCameraToObject(box, fitOffset = 1.25) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const cameraZ = Math.abs((maxSize / 2) / Math.tan(fov / 2)) * fitOffset;

  // keep your current viewing direction, just pull back
  const dir = new THREE.Vector3()
    .subVectors(camera.position, controls.target)
    .normalize();

  const newPos = center.clone().add(dir.multiplyScalar(cameraZ));

  camera.position.copy(newPos);
  controls.target.copy(center);
  controls.update();

  // keep a sensible zoom range
  controls.minDistance = maxSize * 0.25;
  controls.maxDistance = maxSize * 3.0;
}

// Apply the “right” start view depending on device
function applyResponsiveStartView(modelBox) {
  if (userInteracted) return;
  if (fly) return;

  if (isMobilePortrait()) {
    // Start from the HOME direction but framed to fit
    camera.position.copy(PRESET_HOME.pos);
    controls.target.copy(PRESET_HOME.target);
    controls.update();
    fitCameraToObject(modelBox, 1.35); // pull back a touch more for portrait
  } else {
    camera.position.copy(PRESET_HOME.pos);
    controls.target.copy(PRESET_HOME.target);
    controls.update();
  }
}

// -------------------- Smooth camera fly --------------------
let fly = null;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function flyToPreset(preset, seconds = 1.35) {
  fly = {
    start: performance.now(),
    seconds,
    fromPos: camera.position.clone(),
    toPos: preset.pos.clone(),
    fromTarget: controls.target.clone(),
    toTarget: preset.target.clone(),
  };
  controls.enabled = false; // prevent fighting
}

function applyFly() {
  if (!fly) return;

  const t = (performance.now() - fly.start) / (fly.seconds * 1000);
  const tt = easeInOutCubic(Math.min(1, Math.max(0, t)));

  camera.position.lerpVectors(fly.fromPos, fly.toPos, tt);
  controls.target.lerpVectors(fly.fromTarget, fly.toTarget, tt);
  controls.update();

  if (t >= 1) {
    fly = null;
    controls.enabled = true;
  }
}

// -------------------- Model loading --------------------
const loader = new GLTFLoader();
let root = null;
let modelBox = null;

// popup handlers (defined in makeUI)
let showPopup = null;
let hidePopup = null;

function applyMaterialDefaults() {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    obj.castShadow = true;
    obj.receiveShadow = true;

    const m = obj.material;
    if (!m) return;

    // Keep it “architectural” and stable
    if ("roughness" in m) m.roughness = Math.max(0.75, m.roughness ?? 0.75);
    if ("metalness" in m) m.metalness = Math.min(0.05, m.metalness ?? 0.0);

    if (m.map) m.map.anisotropy = maxAniso;
    if (m.normalMap) m.normalMap.anisotropy = maxAniso;

    m.needsUpdate = true;
  });
}

function centerModelAtOrigin() {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
}

loader.load(
  "./model.glb",
  (gltf) => {
    root = gltf.scene;
    scene.add(root);

    applyMaterialDefaults();
    centerModelAtOrigin();

    // compute box AFTER centering (center should be ~0,0,0)
    modelBox = new THREE.Box3().setFromObject(root);

    // Start view depends on device
    applyResponsiveStartView(modelBox);

    makeUI(); // build UI after everything exists
  },
  undefined,
  (err) => {
    console.error(err);
    alert("Failed to load model.glb (check console).");
  }
);

// -------------------- UI (camera dots + popup) --------------------
function makeUI() {
  // --- Camera dots (bigger + more prominent, left side like your ref) ---
  const camCol = document.createElement("div");
  camCol.style.position = "fixed";
  camCol.style.left = "16px";
  camCol.style.top = "120px";
  camCol.style.zIndex = "50";
  camCol.style.display = "flex";
  camCol.style.flexDirection = "column";
  camCol.style.gap = "14px";
  camCol.style.userSelect = "none";
  document.body.appendChild(camCol);

  const styleDot = (btn, fill) => {
    btn.type = "button";
    btn.style.width = "64px";
    btn.style.height = "64px";
    btn.style.borderRadius = "999px";
    btn.style.border = "4px solid rgba(255,255,255,.85)";
    btn.style.background = fill;
    btn.style.boxShadow = "0 10px 24px rgba(0,0,0,.28)";
    btn.style.display = "grid";
    btn.style.placeItems = "center";
    btn.style.cursor = "pointer";
    btn.style.color = "white";
    btn.style.font = "700 20px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    btn.style.webkitTapHighlightColor = "transparent";
  };

  const btn1 = document.createElement("button");
  btn1.title = "View 1 (Home)";
  btn1.textContent = "1";
  styleDot(btn1, "#29B6F6"); // blue

  const btn2 = document.createElement("button");
  btn2.title = "View 2 (Fed Street)";
  btn2.textContent = "2";
  styleDot(btn2, "#F9A825"); // yellow

  camCol.appendChild(btn1);
  camCol.appendChild(btn2);

  btn1.onclick = () => {
    hidePopup();
    flyToPreset(PRESET_HOME, 1.25);
  };

  btn2.onclick = () => {
    flyToPreset(PRESET_FED, 1.35);
    // show popup AFTER the fly ends (approx)
    setTimeout(() => showPopup(), 1200);
  };

  // --- Copy camera button ---
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy camera";
  copyBtn.style.position = "fixed";
  copyBtn.style.left = "16px";
  copyBtn.style.bottom = "110px";
  copyBtn.style.zIndex = "50";
  copyBtn.style.padding = "14px 18px";
  copyBtn.style.borderRadius = "14px";
  copyBtn.style.border = "1px solid rgba(255,255,255,.25)";
  copyBtn.style.background = "rgba(255,255,255,.18)";
  copyBtn.style.backdropFilter = "blur(10px)";
  copyBtn.style.color = "rgba(255,255,255,.95)";
  copyBtn.style.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  copyBtn.style.boxShadow = "0 10px 28px rgba(0,0,0,.30)";
  copyBtn.style.cursor = "pointer";
  document.body.appendChild(copyBtn);

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    }
  }

  copyBtn.onclick = async () => {
    const obj = `{
  "name": "Current",
  "pos": [${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)}],
  "target": [${controls.target.x.toFixed(3)}, ${controls.target.y.toFixed(3)}, ${controls.target.z.toFixed(3)}]
}`;
    await copyText(obj);
  };

  // --- Popup (center-right) ---
  const popup = document.createElement("div");
  popup.style.position = "fixed";
  popup.style.left = "56%";
  popup.style.top = "50%";
  popup.style.transform = "translateY(-50%)";
  popup.style.width = "320px";
  popup.style.maxWidth = "86vw";
  popup.style.padding = "18px";
  popup.style.borderRadius = "16px";
  popup.style.background = "rgba(255,255,255,.95)";
  popup.style.color = "#0b0c10";
  popup.style.boxShadow = "0 18px 48px rgba(0,0,0,.35)";
  popup.style.zIndex = "60";
  popup.style.opacity = "0";
  popup.style.pointerEvents = "none";
  popup.style.transition = "opacity 260ms ease";
  popup.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <div style="width:10px;height:10px;border-radius:999px;background:#F9A825;"></div>
      <div style="font-weight:800;">Federal Street</div>
    </div>
    <div style="font-size:13px;line-height:1.45;opacity:.9;">
      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
    </div>
  `;
  document.body.appendChild(popup);

  showPopup = () => {
    popup.style.opacity = "1";
    popup.style.pointerEvents = "auto";
  };
  hidePopup = () => {
    popup.style.opacity = "0";
    popup.style.pointerEvents = "none";
  };

  // Hide popup if the user drags/zooms/pans
  controls.addEventListener("start", () => hidePopup());

  // Escape -> Home
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hidePopup();
      flyToPreset(PRESET_HOME, 1.05);
    }
  });
}

// -------------------- Resize + render loop --------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);

  // On mobile rotate/orientation changes, re-frame ONLY if user hasn't interacted
  if (root && modelBox && !userInteracted && !fly) {
    applyResponsiveStartView(modelBox);
  }
}
window.addEventListener("resize", resize);

function render() {
  requestAnimationFrame(render);

  applyFly();
  if (!fly) controls.update();

  renderer.render(scene, camera);
}
render();
