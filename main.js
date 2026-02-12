// main.js — SkyCity demo (DESKTOP + MOBILE presets, blue bg, big dot buttons, popup responsive)
// Assumes your HTML uses an importmap for "three" + "three/addons/"
// and your GLB is at ./model.glb

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.querySelector("#c");

// -------------------- Helpers --------------------
function isMobilePortrait() {
  return (
    window.innerWidth <= 900 &&
    window.matchMedia &&
    window.matchMedia("(orientation: portrait)").matches
  );
}

// track interaction so we don't keep snapping camera on resize
let userInteracted = false;

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

// mark interaction + hide popup when user moves camera
controls.addEventListener("start", () => {
  userInteracted = true;
  hidePopup();
});
renderer.domElement.addEventListener("pointerdown", () => {
  userInteracted = true;
  hidePopup();
});

// -------------------- Lighting (soft Redshift-ish) --------------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x20242c, 1.2));

const sun = new THREE.DirectionalLight(0xffffff, 0.7);
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

// -------------------- Camera Presets (desktop) --------------------
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

// -------------------- Camera Presets (mobile portrait) --------------------
const PRESET_HOME_MOBILE = {
  name: "Home Mobile",
  pos: new THREE.Vector3(16771.504, 44049.7, -14394.172),
  target: new THREE.Vector3(2601.223, -5520.177, -1666.704),
};

const PRESET_FED_MOBILE = {
  name: "Fed Mobile",
  pos: new THREE.Vector3(9332.957, -7553.001, -22851.309),
  target: new THREE.Vector3(6457.856, -8185.593, -2928.293),
};

function getPresetHome() {
  return isMobilePortrait() ? PRESET_HOME_MOBILE : PRESET_HOME;
}
function getPresetFed() {
  return isMobilePortrait() ? PRESET_FED_MOBILE : PRESET_FED;
}

// -------------------- Smooth camera fly --------------------
let fly = null;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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

    // Start at correct camera for device
    const startPreset = getPresetHome();
    camera.position.copy(startPreset.pos);
    controls.target.copy(startPreset.target);
    controls.update();

    makeUI(); // build UI after everything exists
  },
  undefined,
  (err) => {
    console.error(err);
    alert("Failed to load model.glb (check console).");
  }
);

// -------------------- UI (big dots + popup) --------------------
let popupEl = null;

function makeUI() {
  // ----- BIG DOT CAMERA BUTTONS (left side) -----
  const camCol = document.createElement("div");
  camCol.style.position = "fixed";
  camCol.style.left = "18px";
  camCol.style.top = "110px";
  camCol.style.zIndex = "50";
  camCol.style.display = "flex";
  camCol.style.flexDirection = "column";
  camCol.style.gap = "14px";
  camCol.style.userSelect = "none";
  document.body.appendChild(camCol);

  function makeDot(label, bg, ring) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;

    btn.style.width = "64px";
    btn.style.height = "64px";
    btn.style.borderRadius = "999px";
    btn.style.border = `4px solid ${ring}`;
    btn.style.background = bg;
    btn.style.color = "white";
    btn.style.font = "700 20px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    btn.style.display = "grid";
    btn.style.placeItems = "center";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 10px 26px rgba(0,0,0,.35)";
    btn.style.webkitTapHighlightColor = "transparent";
    btn.style.transform = "translateZ(0)";
    btn.onmouseenter = () => (btn.style.filter = "brightness(1.05)");
    btn.onmouseleave = () => (btn.style.filter = "none");
    return btn;
  }

  // Match your reference vibe: cyan + yellow
  const btn1 = makeDot("1", "#29B6F6", "rgba(255,255,255,.75)");
  const btn2 = makeDot("2", "#F5A623", "rgba(255,255,255,.75)");

  btn1.title = "View 1 (Home)";
  btn2.title = "View 2 (Fed Street)";

  btn1.onclick = () => {
    hidePopup();
    flyToPreset(getPresetHome(), 1.15);
  };

  btn2.onclick = () => {
    hidePopup();
    flyToPreset(getPresetFed(), 1.25, () => {
      showPopup(); // show after camera arrives at view 2
    });
  };

  camCol.appendChild(btn1);
  camCol.appendChild(btn2);

  // ----- POPUP (yellow button style + lorem) -----
  popupEl = document.createElement("div");
  popupEl.style.position = "fixed";
  popupEl.style.zIndex = "60";
  popupEl.style.opacity = "0";
  popupEl.style.transform = "translateY(8px)";
  popupEl.style.pointerEvents = "none";
  popupEl.style.transition = "opacity 220ms ease, transform 220ms ease";

  popupEl.style.borderRadius = "16px";
  popupEl.style.border = "1px solid rgba(255,255,255,.18)";
  popupEl.style.background = "rgba(0,0,0,.55)";
  popupEl.style.backdropFilter = "blur(10px)";
  popupEl.style.color = "rgba(255,255,255,.95)";
  popupEl.style.boxShadow = "0 18px 40px rgba(0,0,0,.35)";
  popupEl.style.padding = "14px";
  popupEl.style.font = "13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial";

  // responsive sizing (desktop vs mobile)
  function applyPopupLayout() {
  if (!popupEl) return;

  popupEl.style.left = "50%";
  popupEl.style.right = "auto";

  if (isMobilePortrait()) {
    // Mobile: bottom half, centered, safe margin
    popupEl.style.top = "auto";
    popupEl.style.bottom = "30px"; // above iOS browser chrome
    popupEl.style.transform = "translateX(-50%) translateY(8px)";
    popupEl.style.width = "min(92vw, 360px)";
  } else {
    // Desktop: bottom half but slightly above bottom
    popupEl.style.top = "auto";
    popupEl.style.bottom = "60px";
    popupEl.style.transform = "translateX(-50%) translateY(8px)";
    popupEl.style.width = "380px";
  }
}


  popupEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <div style="width:10px;height:10px;border-radius:999px;background:#F5A623;box-shadow:0 0 0 4px rgba(245,166,35,.25);"></div>
      <div style="font-weight:800;letter-spacing:.2px;">Fed Street</div>
      <div style="margin-left:auto;opacity:.75;font-size:12px;">Arrived</div>
    </div>

    <div style="opacity:.92;margin-bottom:12px;">
      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
    </div>

    <div style="display:flex;gap:10px;align-items:center;">
      <button id="popupBtn" type="button"
        style="
          pointer-events:auto;
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(0,0,0,.18);
          background:#F5A623;
          color:#101010;
          font:800 13px system-ui, -apple-system, Segoe UI, Roboto, Arial;
          cursor:pointer;
          box-shadow:0 10px 18px rgba(0,0,0,.25);
        ">
        Sample CTA
      </button>
      <div style="opacity:.7;font-size:12px;">(drag to dismiss)</div>
    </div>
  `;

  document.body.appendChild(popupEl);
  applyPopupLayout();

  // dismiss popup if they interact
  const popupBtn = popupEl.querySelector("#popupBtn");
  popupBtn.addEventListener("click", () => {
    // placeholder action
    console.log("Popup CTA clicked");
  });

  // keep popup layout correct on resize/orientation
  window.addEventListener("resize", applyPopupLayout);

  // Escape -> Home
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hidePopup();
      flyToPreset(getPresetHome(), 1.05);
    }
  });
}

function showPopup() {
  if (!popupEl) return;
  popupEl.style.opacity = "1";
  popupEl.style.transform = popupEl.style.transform.replace("translateY(8px)", "translateY(0px)");
}


function hidePopup() {
  if (!popupEl) return;
  popupEl.style.opacity = "0";
  popupEl.style.transform = popupEl.style.transform.replace("translateY(0px)", "translateY(8px)");
}


// -------------------- Resize + render loop --------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);

  // If user hasn't interacted, keep the correct "home" framing for orientation changes
  if (!userInteracted && root) {
    const startPreset = getPresetHome();
    camera.position.copy(startPreset.pos);
    controls.target.copy(startPreset.target);
    controls.update();
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
