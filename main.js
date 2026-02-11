// main.js (WORKING VERSION + popup info card on preset 2)

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

// -------------------- Smooth camera fly --------------------
let fly = null;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * flyToPreset(preset, seconds, onArrive)
 * - Moves camera+target smoothly
 * - Calls onArrive() after arrival
 */
function flyToPreset(preset, seconds = 1.35, onArrive = null) {
  fly = {
    start: performance.now(),
    seconds,
    fromPos: camera.position.clone(),
    toPos: preset.pos.clone(),
    fromTarget: controls.target.clone(),
    toTarget: preset.target.clone(),
    onArrive,
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
    const cb = fly.onArrive;
    fly = null;
    controls.enabled = true;
    if (typeof cb === "function") cb();
  }
}

// -------------------- Model loading --------------------
const loader = new GLTFLoader();
let root = null;

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

    // Start at home camera
    camera.position.copy(PRESET_HOME.pos);
    controls.target.copy(PRESET_HOME.target);
    controls.update();

    makeUI(); // build UI after everything exists
  },
  undefined,
  (err) => {
    console.error(err);
    alert("Failed to load model.glb (check console).");
  }
);

// -------------------- UI (camera dots + info popup + copy camera) --------------------
function makeUI() {
  // ---- Info Popup (appears after arriving at preset 2) ----

const popup = document.createElement("div");

popup.style.position = "fixed";
popup.style.top = "50%";
popup.style.left = "60%"; // slightly right of center
popup.style.transform = "translate(-50%, -50%) translateY(-10px)";
popup.style.zIndex = "60";
popup.style.width = "340px";
popup.style.maxWidth = "85vw";
popup.style.borderRadius = "18px";
popup.style.overflow = "hidden";
popup.style.opacity = "0";
popup.style.pointerEvents = "none";
popup.style.transition = "opacity 260ms ease, transform 260ms ease";


  // yellow "button style" header + content
  popup.innerHTML = `
    <div style="
      background:#ffb020;
      color:#0b0c10;
      padding:12px 14px;
      font:800 14px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;">
      <div>Fed Street</div>
      <div style="font:800 12px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial; opacity:.85;">2</div>
    </div>
    <div style="
      background:rgba(0,0,0,.30);
      border:1px solid rgba(255,255,255,.18);
      border-top:0;
      backdrop-filter: blur(10px);
      color: rgba(255,255,255,.92);
      padding:14px;">
      <div style="font:700 13px/1.25 system-ui,-apple-system,Segoe UI,Roboto,Arial; margin-bottom:8px;">
        Lorem ipsum
      </div>
      <div style="font:12px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial; opacity:.92;">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        <br><br>
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
      </div>
    </div>
  `;
  document.body.appendChild(popup);

  const showPopup = () => {
  popup.style.pointerEvents = "auto";
  popup.style.opacity = "1";
  popup.style.transform = "translate(-50%, -50%) translateY(0px)";
};

const hidePopup = () => {
  popup.style.pointerEvents = "none";
  popup.style.opacity = "0";
  popup.style.transform = "translate(-50%, -50%) translateY(-10px)";
};


  // ---- Camera dots (left side) ----
  const ui = document.createElement("div");
  ui.style.position = "fixed";
  ui.style.left = "24px";
  ui.style.top = "120px";
  ui.style.zIndex = "50";
  ui.style.display = "flex";
  ui.style.flexDirection = "column";
  ui.style.gap = "14px";
  ui.style.userSelect = "none";
  document.body.appendChild(ui);

  const makeDot = ({ color = "#35c6ff", label = "1", title = "" } = {}) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = title;

    btn.style.width = "54px";
    btn.style.height = "54px";
    btn.style.borderRadius = "999px";
    btn.style.border = "3px solid rgba(255,255,255,.85)";
    btn.style.background = color;
    btn.style.cursor = "pointer";
    btn.style.display = "grid";
    btn.style.placeItems = "center";
    btn.style.padding = "0";
    btn.style.webkitTapHighlightColor = "transparent";

    btn.style.color = "white";
    btn.style.font = "800 16px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial";
    btn.textContent = label;

    btn.style.boxShadow =
      "0 12px 28px rgba(0,0,0,.35), inset 0 0 0 2px rgba(0,0,0,.12)";

    btn.onmouseenter = () => {
      btn.style.transform = "scale(1.05)";
      btn.style.filter = "brightness(1.05)";
    };
    btn.onmouseleave = () => {
      btn.style.transform = "scale(1)";
      btn.style.filter = "none";
    };

    return btn;
  };

  const dotHome = makeDot({
    color: "#2bb9ff",
    label: "1",
    title: "Back to start",
  });

  const dotFed = makeDot({
    color: "#ffb020",
    label: "2",
    title: "Go to Fed Street",
  });

  ui.appendChild(dotHome);
  ui.appendChild(dotFed);

  dotHome.onclick = () => {
    hidePopup();
    flyToPreset(PRESET_HOME, 1.25);
  };

  dotFed.onclick = () => {
    hidePopup();
    flyToPreset(PRESET_FED, 1.35, () => {
      // only show once we're properly “arrived”
      showPopup();
    });
  };

  // ---- Copy camera helper (bottom-left) ----
  const helper = document.createElement("div");
  helper.style.position = "fixed";
  helper.style.left = "24px";
  helper.style.bottom = "24px";
  helper.style.zIndex = "50";
  helper.style.display = "flex";
  helper.style.gap = "10px";
  helper.style.alignItems = "center";
  helper.style.padding = "10px 12px";
  helper.style.borderRadius = "12px";
  helper.style.border = "1px solid rgba(255,255,255,.18)";
  helper.style.background = "rgba(0,0,0,.35)";
  helper.style.backdropFilter = "blur(10px)";
  helper.style.color = "rgba(255,255,255,.92)";
  helper.style.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  helper.style.userSelect = "none";
  document.body.appendChild(helper);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy camera";
  copyBtn.style.padding = "10px 12px";
  copyBtn.style.borderRadius = "10px";
  copyBtn.style.border = "1px solid rgba(255,255,255,.18)";
  copyBtn.style.background = "rgba(255,255,255,.10)";
  copyBtn.style.color = "rgba(255,255,255,.95)";
  copyBtn.style.cursor = "pointer";

  const status = document.createElement("span");
  status.style.opacity = ".85";

  helper.appendChild(copyBtn);
  helper.appendChild(status);

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
  "pos": [${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(
      3
    )}, ${camera.position.z.toFixed(3)}],
  "target": [${controls.target.x.toFixed(3)}, ${controls.target.y.toFixed(
      3
    )}, ${controls.target.z.toFixed(3)}]
}`;
    await copyText(obj);
    status.textContent = "Copied ✅";
    setTimeout(() => (status.textContent = ""), 900);
  };

  // Escape -> Home (and hide popup)
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
}
window.addEventListener("resize", resize);

function render() {
  requestAnimationFrame(render);

  applyFly();
  if (!fly) controls.update();

  renderer.render(scene, camera);
}
render();
