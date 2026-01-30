import "./style.css";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  CanvasTexture,
  Color,
  MOUSE,
  DirectionalLight,
  DoubleSide,
  Group,
  Raycaster,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import metadataPayload from "../Metadata/test.json";

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
  ["FL", 0xffd400],
  ["NX", 0xb0b5c8],
  ["SM", 0x7b59fa],
  ["LM", 0xe63036],
  ["TG", 0x8fd558],
  ["HH", 0x5a98fb],
  ["DZ", 0xff6a00],
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
let streetMeshCache = [];
const gridOrigin = new Vector3(0, 0, 0);
let centerPlaneObject = null;
const colorState = {
  neighborhoodColors: true,
};
const scannerState = {
  listening: false,
  timerId: null,
  burstRemaining: 0,
  listContainer: null,
  points: new Map(),
  focus: null,
};
const SCANNER_MESSAGES = [
  "Shots Fired",
  "Forum Breach",
  "Agent Eliminated",
  "Car Accident",
  "Loot Dropped",
  "Active Robbery",
  "Pedestrian Assault",
  "Street Race",
  "Suspicious Activity",
];
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
controls.mouseButtons = {
  LEFT: -1,
  MIDDLE: MOUSE.PAN,
  RIGHT: MOUSE.ROTATE,
};

scene.add(new AmbientLight(0x9ab8ff, 0.6));

const keyLight = new DirectionalLight(0xffffff, 1.0);
keyLight.position.set(6, 12, 8);
scene.add(keyLight);

const fillLight = new DirectionalLight(0x6ca6df, 0.6);
fillLight.position.set(-6, -4, -6);
scene.add(fillLight);

const gridUniforms = {
  uColor: { value: new Color(0xc8c8c8) },
  uSpacing: { value: 15094.3 },
  uLineWidth: { value: 150.0 },
  uFadeStart: { value: 120000.0 },
  uFadeEnd: { value: 600000.0 },
  uOpacity: { value: 0.3 },
  uOrigin: { value: new Vector2(0, 0) },
};


const gridMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  uniforms: gridUniforms,
  vertexShader: `
    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vViewPos = (viewMatrix * worldPos).xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uSpacing;
    uniform float uLineWidth;
    uniform float uFadeStart;
    uniform float uFadeEnd;
    uniform float uOpacity;
    uniform vec2 uOrigin;
    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    void main() {
      vec2 coord = (vWorldPos.xy - uOrigin) / uSpacing;
      vec2 grid = abs(fract(coord) - 0.5);
      float lineDist = min(grid.x, grid.y) * uSpacing;
      float line = 1.0 - smoothstep(uLineWidth * 0.5, uLineWidth, lineDist);
      float dist = length(vViewPos.xy);
      float fade = smoothstep(uFadeEnd, uFadeStart, dist);
      float alpha = line * fade * uOpacity;
      if (alpha <= 0.001) discard;
      gl_FragColor = vec4(uColor, alpha);
    }
  `,
});

const gridSize = gridUniforms.uFadeEnd.value * 20;
let gridBaseZ = -1;
const gridMesh = new Mesh(new PlaneGeometry(gridSize, gridSize), gridMaterial);
gridMesh.position.set(gridOrigin.x, gridOrigin.y, gridBaseZ);
gridMesh.renderOrder = -5;
gridMesh.frustumCulled = false;
scene.add(gridMesh);

const worldRoot = new Group();
scene.add(worldRoot);
const scannerGroup = new Group();
scene.add(scannerGroup);

const METADATA = metadataPayload?.metadata ?? metadataPayload;
const popupState = {
  container: null,
  header: null,
  closeBtn: null,
  image: null,
  name: null,
  attrs: null,
  isOpen: false,
};
let portalSphere = null;
const raycaster = new Raycaster();
const pointer = new Vector2();

const gltfLoader = new GLTFLoader();

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
  const isBuilding = meshName.endsWith("-Building");
  const appliedTint = colorState.neighborhoodColors ? tint : 0xffffff;
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
      if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
        material.metalness = 0;
        material.roughness = 0.85;
      }
      if (appliedTint !== null && material && "color" in material) {
        material.color.set(appliedTint);
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

function applySceneScale() {
  worldRoot.scale.setScalar(100);
  worldRoot.updateMatrixWorld(true);
}

function loadMesh(district, meshLabel) {
  const baseName = `${district.prefix}-${meshLabel}`;
  const tint = DISTRICT_TINTS.get(district.prefix) ?? 0xffffff;
  const url = new URL(
    `../Blockout/${district.folder}/${baseName}.glb`,
    import.meta.url
  );
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url.href,
      (gltf) => {
        const obj = gltf.scene;
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

function loadCenterPlane() {
  const url = new URL("../Blockout/CENTER/Center.glb", import.meta.url);
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url.href,
      (gltf) => {
        const obj = gltf.scene;
        obj.name = "CENTER-PLANE";
        centerPlaneObject = obj;
        obj.traverse((child) => {
          if (!child.isMesh) return;
          child.material = new MeshBasicMaterial({
            color: 0xff0000,
            side: DoubleSide,
            transparent: false,
            opacity: 1,
          });
          child.visible = false;
        });
        worldRoot.add(obj);
        resolve(obj);
      },
      undefined,
      (error) => {
        console.warn("Failed to load Center.glb", error);
        reject(error);
      }
    );
  });
}

function ensurePortalSphere() {
  if (!centerPlaneObject) return;
  worldRoot.updateMatrixWorld(true);
  const box = new Box3().setFromObject(centerPlaneObject);
  if (box.isEmpty()) return;
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  const radius = Math.max(size.x, size.y) * 0.5;
  if (!portalSphere) {
    const geometry = new SphereGeometry(1, 32, 32);
    const material = new MeshBasicMaterial({ color: 0xffffff });
    portalSphere = new Mesh(geometry, material);
    portalSphere.name = "CENTER-PORTAL";
    portalSphere.renderOrder = 5;
    worldRoot.add(portalSphere);
  }
  portalSphere.position.copy(center);
  portalSphere.scale.setScalar(radius);
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
  const spacing = gridUniforms.uSpacing.value;
  const snappedX =
    Math.floor((camera.position.x - gridOrigin.x) / spacing) * spacing +
    gridOrigin.x;
  const snappedY =
    Math.floor((camera.position.y - gridOrigin.y) / spacing) * spacing +
    gridOrigin.y;
  gridMesh.position.x = snappedX;
  gridMesh.position.y = snappedY;
  gridMesh.position.z = gridBaseZ;
  updateScannerPoints();
  updateCameraFocus();
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

  const settingsSection = document.createElement("div");
  settingsSection.className = "section collapsed";

  const settingsTitle = document.createElement("div");
  settingsTitle.className = "section-title";
  settingsTitle.textContent = "SETTINGS";

  const settingsContent = document.createElement("div");
  settingsContent.className = "section-content";
  settingsContent.style.display = "none";

  const colorsRow = document.createElement("div");
  colorsRow.className = "control-row toggle-row";
  colorsRow.innerHTML = `
    <label for="neighborhood-colors">Neighborhood Colors</label>
    <label class="switch">
      <input type="checkbox" id="neighborhood-colors" checked>
      <span class="slider"></span>
    </label>
  `;
  const colorsInput = colorsRow.querySelector("input");
  colorsInput.checked = true;
  colorsInput.addEventListener("change", () => {
    colorState.neighborhoodColors = colorsInput.checked;
    meshRegistry.forEach((obj, name) => {
      const prefix = name.split("-")[0];
      const tint = DISTRICT_TINTS.get(prefix) ?? 0xffffff;
      applyDoubleSided(obj, name, tint);
    });
  });
  settingsContent.appendChild(colorsRow);

  settingsSection.appendChild(settingsTitle);
  settingsSection.appendChild(settingsContent);
  menuBody.appendChild(settingsSection);

  settingsTitle.addEventListener("click", () => {
    const collapsed = settingsSection.classList.toggle("collapsed");
    settingsContent.style.display = collapsed ? "none" : "block";
  });

  const layersSection = document.createElement("div");
  layersSection.className = "section collapsed";

  const layersTitle = document.createElement("div");
  layersTitle.className = "section-title";
  layersTitle.textContent = "LAYERS";

  const layersContent = document.createElement("div");
  layersContent.className = "section-content";
  layersContent.style.display = "none";

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
    layersContent.appendChild(section);

    title.addEventListener("click", () => {
      const collapsed = section.classList.toggle("collapsed");
      content.style.display = collapsed ? "none" : "block";
    });
  });

  layersSection.appendChild(layersTitle);
  layersSection.appendChild(layersContent);
  menuBody.appendChild(layersSection);

  layersTitle.addEventListener("click", () => {
    const collapsed = layersSection.classList.toggle("collapsed");
    layersContent.style.display = collapsed ? "none" : "block";
  });

  const scannerSection = document.createElement("div");
  scannerSection.className = "section collapsed";

  const scannerTitle = document.createElement("div");
  scannerTitle.className = "section-title";
  scannerTitle.textContent = "SCANNER";

  const scannerContent = document.createElement("div");
  scannerContent.className = "section-content";
  scannerContent.style.display = "none";

  const listenRow = document.createElement("div");
  listenRow.className = "control-row toggle-row";
  listenRow.innerHTML = `
    <label for="scanner-listen">Listen</label>
    <label class="switch">
      <input type="checkbox" id="scanner-listen">
      <span class="slider"></span>
    </label>
  `;
  const listenInput = listenRow.querySelector("input");
  listenInput.checked = false;
  listenInput.addEventListener("change", () => {
    scannerState.listening = listenInput.checked;
    if (scannerState.listening) {
      if (scannerState.timerId) {
        clearTimeout(scannerState.timerId);
        scannerState.timerId = null;
      }
      spawnScannerPoint();
      scannerState.burstRemaining = 10;
      scheduleNextScan(true);
    } else if (scannerState.timerId) {
      clearTimeout(scannerState.timerId);
      scannerState.timerId = null;
      scannerState.burstRemaining = 0;
      const ids = Array.from(scannerState.points.keys());
      ids.forEach((id) => removeScannerPoint(id));
    }
  });
  scannerContent.appendChild(listenRow);

  const scannerList = document.createElement("div");
  scannerList.className = "scanner-list";
  scannerContent.appendChild(scannerList);
  scannerState.listContainer = scannerList;

  scannerSection.appendChild(scannerTitle);
  scannerSection.appendChild(scannerContent);
  menuBody.appendChild(scannerSection);

  scannerTitle.addEventListener("click", () => {
    const collapsed = scannerSection.classList.toggle("collapsed");
    scannerContent.style.display = collapsed ? "none" : "block";
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

function initPopup() {
  const app = document.getElementById("app");
  const container = document.createElement("div");
  container.id = "popup-window";
  container.innerHTML = `
    <div class="popup-header">
      <span class="popup-title">Card Details</span>
      <button class="popup-close" type="button">&times;</button>
    </div>
    <div class="popup-body">
      <div class="popup-image-wrap">
        <img class="popup-image" alt="Card preview" />
      </div>
      <div class="popup-meta">
        <div class="popup-name"></div>
        <div class="popup-attrs"></div>
      </div>
    </div>
  `;
  app.appendChild(container);
  const header = container.querySelector(".popup-header");
  const closeBtn = container.querySelector(".popup-close");
  const image = container.querySelector(".popup-image");
  const name = container.querySelector(".popup-name");
  const attrs = container.querySelector(".popup-attrs");

  const startDrag = { active: false, x: 0, y: 0, left: 0, top: 0 };
  const onMove = (e) => {
    if (!startDrag.active) return;
    const dx = e.clientX - startDrag.x;
    const dy = e.clientY - startDrag.y;
    container.style.left = `${startDrag.left + dx}px`;
    container.style.top = `${startDrag.top + dy}px`;
  };
  const onUp = () => {
    if (!startDrag.active) return;
    startDrag.active = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  header.addEventListener("mousedown", (e) => {
    startDrag.active = true;
    const rect = container.getBoundingClientRect();
    startDrag.x = e.clientX;
    startDrag.y = e.clientY;
    startDrag.left = rect.left;
    startDrag.top = rect.top;
    container.style.transform = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
    e.stopPropagation();
  });

  closeBtn.addEventListener("click", () => {
    container.classList.remove("visible");
    popupState.isOpen = false;
  });

  popupState.container = container;
  popupState.header = header;
  popupState.closeBtn = closeBtn;
  popupState.image = image;
  popupState.name = name;
  popupState.attrs = attrs;

  const cardName = METADATA?.cardname ?? "Unknown Card";
  const imageUrl = METADATA?.image_url ?? "";
  if (popupState.name) {
    popupState.name.textContent = cardName;
  }
  if (popupState.image) {
    popupState.image.src = imageUrl;
    popupState.image.alt = cardName;
  }
  if (popupState.attrs) {
    popupState.attrs.innerHTML = "";
    const attributes = Array.isArray(METADATA?.attributes)
      ? METADATA.attributes
      : [];
    attributes.forEach((attr) => {
      const row = document.createElement("div");
      row.className = "popup-attr";
      const label = document.createElement("span");
      label.textContent = attr?.trait_type ?? "Attribute";
      const value = document.createElement("strong");
      value.textContent = attr?.value ?? "";
      row.appendChild(label);
      row.appendChild(value);
      popupState.attrs.appendChild(row);
    });
  }
}

function openPopup() {
  if (!popupState.container) {
    initPopup();
  }
  if (!popupState.container) return;
  popupState.container.classList.add("visible");
  popupState.isOpen = true;
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

function buildStreetMeshCache() {
  streetMeshCache = [];
  meshRegistry.forEach((obj, name) => {
    if (!name.endsWith("-Street")) return;
    const prefix = name.split("-")[0];
    const district = DISTRICTS.find((d) => d.prefix === prefix);
    const districtTitle = district ? district.title : prefix;
    obj.traverse((child) => {
      if (child.isMesh && child.geometry) {
        streetMeshCache.push({ mesh: child, districtTitle });
      }
    });
  });
}

function updateGridOriginFromCenter() {
  if (!centerPlaneObject) return;
  const box = new Box3().setFromObject(centerPlaneObject);
  if (!box.isEmpty()) {
    box.getCenter(gridOrigin);
    const half = gridUniforms.uSpacing.value * 0.5;
    gridUniforms.uOrigin.value.set(gridOrigin.x - half, gridOrigin.y - half);
  }
  ensurePortalSphere();
}

function updateGridHeightFromLand() {
  let landBounds = null;
  worldRoot.updateMatrixWorld(true);
  meshRegistry.forEach((obj, name) => {
    if (!name.endsWith("-Land")) return;
    const box = new Box3().setFromObject(obj);
    if (!landBounds) {
      landBounds = box.clone();
    } else {
      landBounds.union(box);
    }
  });
  if (!landBounds) return;
  gridBaseZ = landBounds.min.z - 1;
}

function samplePointOnMesh(mesh) {
  const geometry = mesh.geometry;
  if (!geometry || !geometry.attributes.position) return null;
  const position = geometry.attributes.position;
  const index = geometry.index;
  let i0;
  let i1;
  let i2;
  if (index && index.count >= 3) {
    const tri = Math.floor(Math.random() * (index.count / 3)) * 3;
    i0 = index.getX(tri);
    i1 = index.getX(tri + 1);
    i2 = index.getX(tri + 2);
  } else {
    const tri = Math.floor(Math.random() * (position.count / 3)) * 3;
    i0 = tri;
    i1 = tri + 1;
    i2 = tri + 2;
  }
  const a = new Vector3().fromBufferAttribute(position, i0);
  const b = new Vector3().fromBufferAttribute(position, i1);
  const c = new Vector3().fromBufferAttribute(position, i2);
  const r1 = Math.random();
  const r2 = Math.random();
  const sqrtR1 = Math.sqrt(r1);
  const u = 1 - sqrtR1;
  const v = sqrtR1 * (1 - r2);
  const w = sqrtR1 * r2;
  const point = new Vector3(
    a.x * u + b.x * v + c.x * w,
    a.y * u + b.y * v + c.y * w,
    a.z * u + b.z * v + c.z * w
  );
  mesh.updateWorldMatrix(true, false);
  point.applyMatrix4(mesh.matrixWorld);
  point.z += 200;
  return point;
}

const scannerSphereGeometry = new SphereGeometry(2000, 24, 24);
const scannerSphereMaterial = new MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.9,
  depthTest: false,
});

function createScannerLabel(message, districtTitle, timeLabel) {
  const canvas = document.createElement("canvas");
  const width = 1024;
  const height = 512;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 80px Roboto, Arial, sans-serif";
  ctx.fillText(message, width / 2, 180);
  ctx.font = "500 52px Roboto, Arial, sans-serif";
  ctx.fillText(`${districtTitle} • ${timeLabel}`, width / 2, 300);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(24000, 12000, 1);
  return sprite;
}

function scheduleNextScan() {
  if (!scannerState.listening) return;
  let delay = 1000 + Math.random() * 4000;
  if (scannerState.burstRemaining > 0) {
    delay = 1000;
  }
  scannerState.timerId = window.setTimeout(() => {
    spawnScannerPoint();
    if (scannerState.burstRemaining > 0) {
      scannerState.burstRemaining -= 1;
    }
    scheduleNextScan();
  }, delay);
}

function spawnScannerPoint() {
  if (!streetMeshCache.length) return;
  const candidate =
    streetMeshCache[Math.floor(Math.random() * streetMeshCache.length)];
  const point = samplePointOnMesh(candidate.mesh);
  if (!point) return;
  const message =
    SCANNER_MESSAGES[Math.floor(Math.random() * SCANNER_MESSAGES.length)];
  const timestamp = new Date();
  const timeLabel = timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const id = `${timestamp.getTime()}-${Math.random().toString(16).slice(2, 8)}`;

  const sphere = new Mesh(scannerSphereGeometry, scannerSphereMaterial);
  sphere.position.copy(point);
  sphere.userData.baseScale = 1;
  sphere.userData.createdAt = performance.now();
  sphere.renderOrder = 10;
  scannerGroup.add(sphere);

  const label = createScannerLabel(message, candidate.districtTitle, timeLabel);
  if (label) {
    label.position.copy(point).add(new Vector3(0, 0, 7000));
    label.renderOrder = 11;
    scannerGroup.add(label);
  }

  const item = document.createElement("button");
  item.type = "button";
  item.className = "scanner-item";
  item.innerHTML = `
    <div class="scanner-item-message">${message}</div>
    <div class="scanner-item-meta">${candidate.districtTitle} • ${timeLabel}</div>
  `;
  item.addEventListener("click", () => {
    focusOnPoint(point);
  });
  if (scannerState.listContainer) {
    scannerState.listContainer.prepend(item);
  }

  const removalTimer = window.setTimeout(() => {
    removeScannerPoint(id);
  }, 60000);

  scannerState.points.set(id, {
    id,
    sphere,
    message,
    district: candidate.districtTitle,
    timestamp,
    listItem: item,
    label,
    removalTimer,
  });
}

function removeScannerPoint(id) {
  const entry = scannerState.points.get(id);
  if (!entry) return;
  if (entry.removalTimer) {
    clearTimeout(entry.removalTimer);
  }
  if (entry.sphere) {
    scannerGroup.remove(entry.sphere);
  }
  if (entry.label) {
    scannerGroup.remove(entry.label);
    if (entry.label.material && entry.label.material.map) {
      entry.label.material.map.dispose();
    }
    if (entry.label.material) {
      entry.label.material.dispose();
    }
  }
  if (entry.listItem) {
    entry.listItem.remove();
  }
  scannerState.points.delete(id);
}

function updateScannerPoints() {
  const now = performance.now();
  scannerState.points.forEach((entry) => {
    const age = (now - entry.sphere.userData.createdAt) / 1000;
    const pulse = 1 + Math.sin(age * 3.2) * 0.2;
    entry.sphere.scale.setScalar(pulse);
  });
}

function focusOnPoint(point) {
  const target = point.clone();
  const currentTarget = controls.target.clone();
  const offset = camera.position.clone().sub(currentTarget);
  const distance = Math.max(72000, Math.min(offset.length(), 180000));
  const direction = offset.length() > 0.001 ? offset.normalize() : new Vector3(1, 1, 1).normalize();
  const desiredPosition = target.clone().add(direction.multiplyScalar(distance));
  scannerState.focus = {
    startTime: performance.now(),
    duration: 1800,
    fromPos: camera.position.clone(),
    toPos: desiredPosition,
    fromTarget: currentTarget,
    toTarget: target,
  };
}

function updateCameraFocus() {
  if (!scannerState.focus) return;
  const now = performance.now();
  const { startTime, duration, fromPos, toPos, fromTarget, toTarget } =
    scannerState.focus;
  const t = Math.min(1, (now - startTime) / duration);
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  camera.position.lerpVectors(fromPos, toPos, eased);
  controls.target.lerpVectors(fromTarget, toTarget, eased);
  camera.updateProjectionMatrix();
  if (t >= 1) {
    scannerState.focus = null;
  }
}

let clickStart = null;
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (event.target !== canvas) return;
  clickStart = { x: event.clientX, y: event.clientY, time: performance.now() };
});

canvas.addEventListener("pointerup", (event) => {
  if (event.button !== 0) return;
  if (!clickStart) return;
  const dx = event.clientX - clickStart.x;
  const dy = event.clientY - clickStart.y;
  const dt = performance.now() - clickStart.time;
  clickStart = null;
  if (Math.hypot(dx, dy) > 4 || dt > 300) return;
  if (!portalSphere) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(portalSphere, true);
  if (hits.length) {
    openPopup();
  }
});

async function loadAllMeshes() {
  const tasks = [];
  for (const district of DISTRICTS) {
    for (const meshLabel of MESH_ORDER) {
      tasks.push(loadMesh(district, meshLabel));
    }
  }
  tasks.push(loadCenterPlane());
  const results = await Promise.allSettled(tasks);
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length) {
    console.warn(`Failed to load ${failures.length} meshes`);
  }
  applySceneScale();
  frameScene();
  buildStreetMeshCache();
  updateGridHeightFromLand();
  updateGridOriginFromCenter();
}

initUI();
initPopup();
initLoadingOverlay();
updateLoadingOverlay();
loadAllMeshes();
animate();
