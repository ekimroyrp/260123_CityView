import "./style.css";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

const DISTRICTS = [
  { title: "NORTH STAR", folder: "NORTH STAR", prefix: "NS" },
  { title: "FLASHING LIGHTS", folder: "FLASHING LIGHTS", prefix: "FL" },
  { title: "NEXUS", folder: "NEXUS", prefix: "NX" },
  { title: "SPACE MIND", folder: "SPACE MIND", prefix: "SM" },
  { title: "LITTLE MEOW", folder: "LITTLE MEOW", prefix: "LM" },
  { title: "TRANQUILITY GARDENS", folder: "TRANQUILITY GARDENS", prefix: "TG" },
  { title: "HAVEN HEIGHTS", folder: "HAVEN HEIGHTS", prefix: "HH" },
  { title: "DISTRICT ZERO", folder: "DISTRICT ZERO", prefix: "DZ" },
];

const MESH_ORDER = ["Building", "Overpass", "Plot", "Sidewalk", "Street", "Land"];
const DISTRICT_COLORS = new Map([
  ["NS", 0x0b9a4c],
  ["FL", 0xfeb953],
  ["NX", 0xb0b5c8],
  ["SM", 0x7b59fa],
  ["LM", 0xe63036],
  ["TG", 0x8fd558],
  ["HH", 0x5a98fb],
  ["DZ", 0xff5819],
]);

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  return { r: r1 + m, g: g1 + m, b: b1 + m };
}

function adjustDistrictColor(hex) {
  const color = new Color(hex);
  const { h, s, v } = rgbToHsv(color.r, color.g, color.b);
  const newS = Math.min(1, Math.max(0, s - 0.2));
  const newV = Math.min(1, Math.max(0, v + 1.0));
  const { r, g, b } = hsvToRgb(h, newS, newV);
  return new Color(r, g, b).getHex();
}

const DISTRICT_TINTS = new Map(
  [...DISTRICT_COLORS.entries()].map(([key, hex]) => [
    key,
    adjustDistrictColor(hex),
  ])
);

const visibilityState = new Map();
const meshRegistry = new Map();
const loadingState = {
  total: DISTRICTS.length * MESH_ORDER.length,
  loaded: 0,
  overlay: null,
  bar: null,
  label: null,
};

const canvas = document.getElementById("scene-canvas");

Object3D.DEFAULT_UP.set(0, 0, 1);

const renderer = new WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
if ("outputColorSpace" in renderer) {
  renderer.outputColorSpace = SRGBColorSpace;
}

const scene = new Scene();
scene.background = new Color(0x000000);

const camera = new PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);
camera.up.set(0, 0, 1);
camera.position.set(40, 30, 60);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.enableZoom = true;
controls.minDistance = 0.1;
controls.maxDistance = 20000;

scene.add(new AmbientLight(0x9ab8ff, 0.6));

const keyLight = new DirectionalLight(0xffffff, 1.0);
keyLight.position.set(6, 12, 8);
scene.add(keyLight);

const fillLight = new DirectionalLight(0x6ca6df, 0.6);
fillLight.position.set(-6, -4, -6);
scene.add(fillLight);

const worldRoot = new Group();
scene.add(worldRoot);

function setMeshVisibility(meshName, visible) {
  visibilityState.set(meshName, visible);
  const mesh = meshRegistry.get(meshName);
  if (mesh) {
    mesh.visible = visible;
  }
}

function applyDoubleSided(obj, meshName = "", tint = null) {
  const isLand = meshName.endsWith("-Land");
  const isOverpass = meshName.endsWith("-Overpass");
  const isPlot = meshName.endsWith("-Plot");
  const opacity = isOverpass ? 0.95 : isPlot ? 0.6 : isLand ? 0.5 : 0.75;
  obj.traverse((child) => {
    if (!child.isMesh) return;
    if (child.geometry && !child.geometry.attributes.normal) {
      child.geometry.computeVertexNormals();
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => {
      material.side = DoubleSide;
      material.transparent = true;
      material.opacity = opacity;
      if (tint !== null && material && "color" in material) {
        material.color.set(tint);
        if (isLand) {
          material.color.multiplyScalar(0.5);
        } else if (isOverpass) {
          material.color.multiplyScalar(1.5);
        }
      }
      material.needsUpdate = true;
    });
  });
}

function loadMesh(district, meshLabel) {
  const baseName = `${district.prefix}-${meshLabel}`;
  const tint = DISTRICT_TINTS.get(district.prefix) ?? 0xffffff;
  const url = new URL(
    `../Blockout/${district.folder}/${baseName}.obj`,
    import.meta.url
  );
  const loader = new OBJLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url.href,
      (obj) => {
        obj.name = baseName;
        applyDoubleSided(obj, baseName, tint);
        const desired = visibilityState.get(baseName);
        if (typeof desired === "boolean") {
          obj.visible = desired;
        }
        worldRoot.add(obj);
        meshRegistry.set(baseName, obj);
        markMeshLoaded(baseName, true);
        resolve(obj);
      },
      undefined,
      (error) => {
        console.warn(`Failed to load ${baseName}`, error);
        markMeshLoaded(baseName, false);
        reject(error);
      }
    );
  });
}

function frameScene() {
  const box = new Box3().setFromObject(worldRoot);
  if (box.isEmpty()) return;
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  worldRoot.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  let distance = maxDim / (2 * Math.tan(fov / 2));
  distance *= 1.4;

  camera.near = Math.max(0.01, distance / 1000);
  camera.far = Math.max(distance * 20, 50000);
  camera.position.set(distance * 0.6, distance * 0.4, distance);
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  controls.maxDistance = camera.far * 0.8;
  controls.update();
}

function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener("resize", handleResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function initUI() {
  const root = document.getElementById("ui-root");
  root.innerHTML = `
    <div id="ui-panel">
      <div id="ui-handle"></div>
      <div class="ui-body" id="menu-body"></div>
      <div id="ui-handle-bottom"></div>
    </div>
  `;

  const menuBody = document.getElementById("menu-body");

  DISTRICTS.forEach((district) => {
    const section = document.createElement("div");
    section.className = "section collapsed";

    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = district.title;

    const content = document.createElement("div");
    content.className = "section-content";
    content.style.display = "none";

    const sectionToggles = [];
    const setSectionMeshes = (visible) => {
      sectionToggles.forEach((toggle) => {
        toggle.input.checked = visible;
        setMeshVisibility(toggle.name, visible);
      });
    };

    MESH_ORDER.forEach((meshLabel) => {
      const baseName = `${district.prefix}-${meshLabel}`;
      const row = document.createElement("div");
      row.className = "control-row toggle-row";
      const id = `toggle-${baseName}`;
      row.innerHTML = `
        <label for="${id}">${baseName}</label>
        <label class="switch">
          <input type="checkbox" id="${id}" checked>
          <span class="slider"></span>
        </label>
      `;
      const input = row.querySelector("input");
      const defaultVisible = visibilityState.get(baseName);
      if (typeof defaultVisible === "boolean") {
        input.checked = defaultVisible;
      } else {
        visibilityState.set(baseName, true);
      }
      input.addEventListener("change", () => {
        setMeshVisibility(baseName, input.checked);
        if (input.checked && hideAllInput.checked) {
          hideAllInput.checked = false;
        }
      });
      content.appendChild(row);
      sectionToggles.push({ name: baseName, input });
    });

    const hideAllRow = document.createElement("div");
    hideAllRow.className = "control-row toggle-row";
    const hideAllId = `toggle-${district.prefix}-hide-all`;
    hideAllRow.innerHTML = `
      <label for="${hideAllId}">Hide All</label>
      <label class="switch">
        <input type="checkbox" id="${hideAllId}">
        <span class="slider"></span>
      </label>
    `;
    const hideAllInput = hideAllRow.querySelector("input");
    hideAllInput.checked = false;
    hideAllInput.addEventListener("change", () => {
      setSectionMeshes(!hideAllInput.checked);
    });
    content.appendChild(hideAllRow);

    section.appendChild(title);
    section.appendChild(content);
    menuBody.appendChild(section);

    title.addEventListener("click", () => {
      const collapsed = section.classList.toggle("collapsed");
      content.style.display = collapsed ? "none" : "block";
    });
  });

  const panel = document.getElementById("ui-panel");
  const handles = [
    document.getElementById("ui-handle"),
    document.getElementById("ui-handle-bottom"),
  ].filter(Boolean);

  if (panel && handles.length) {
    panel.style.position = "fixed";
    const rectInit = panel.getBoundingClientRect();
    panel.style.left = `${rectInit.left}px`;
    panel.style.top = `${rectInit.top}px`;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const left = startLeft + dx;
      const top = startTop + dy;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = "auto";
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      handles.forEach((h) => {
        h.style.cursor = "grab";
      });
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    handles.forEach((handle) => {
      handle.addEventListener("mousedown", (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseFloat(panel.style.left) || 0;
        startTop = parseFloat(panel.style.top) || 0;
        handles.forEach((h) => {
          h.style.cursor = "grabbing";
        });
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        e.preventDefault();
        e.stopPropagation();
      });
      handle.style.cursor = "grab";
    });

    window.addEventListener("resize", () => {
      panel.style.right = "auto";
    });
  }
}

function initLoadingOverlay() {
  const app = document.getElementById("app");
  const overlay = document.createElement("div");
  overlay.id = "loading-overlay";
  overlay.innerHTML = `
    <div class="loading-panel">
      <div class="loading-title">Loading Meshes</div>
      <div class="loading-bar">
        <div class="loading-bar-fill"></div>
      </div>
      <div class="loading-meta">0 / ${loadingState.total}</div>
    </div>
  `;
  app.appendChild(overlay);
  loadingState.overlay = overlay;
  loadingState.bar = overlay.querySelector(".loading-bar-fill");
  loadingState.label = overlay.querySelector(".loading-meta");
}

function updateLoadingOverlay() {
  if (!loadingState.bar || !loadingState.label) return;
  const ratio = loadingState.total === 0
    ? 1
    : loadingState.loaded / loadingState.total;
  const clamped = Math.min(1, Math.max(0, ratio));
  const percent = clamped * 100;
  loadingState.bar.style.width = `${percent.toFixed(1)}%`;
  loadingState.label.textContent = `${loadingState.loaded} / ${loadingState.total}`;
}

function markMeshLoaded() {
  loadingState.loaded += 1;
  updateLoadingOverlay();
  if (loadingState.loaded >= loadingState.total && loadingState.overlay) {
    loadingState.overlay.classList.add("done");
    window.setTimeout(() => {
      if (loadingState.overlay) {
        loadingState.overlay.remove();
        loadingState.overlay = null;
      }
    }, 350);
  }
}

async function loadAllMeshes() {
  const tasks = [];
  for (const district of DISTRICTS) {
    for (const meshLabel of MESH_ORDER) {
      tasks.push(loadMesh(district, meshLabel));
    }
  }
  const results = await Promise.allSettled(tasks);
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length) {
    console.warn(`Failed to load ${failures.length} meshes`);
  }
  frameScene();
}

initUI();
initLoadingOverlay();
updateLoadingOverlay();
loadAllMeshes();
animate();
