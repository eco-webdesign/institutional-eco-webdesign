import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm";
import { DRACOLoader } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/DRACOLoader.js/+esm";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/EffectComposer.js/+esm";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/RenderPass.js/+esm";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm";
import { OutputPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/OutputPass.js/+esm";

/*
  Poytara abertura — beats 0–3 (Tympanus macbook-only.glb).
  Case mode: SEM orbit / drag / hover. Scroll lock até fim do beat 3.
  Screen: CanvasTexture do HTML/CSS Figma (não vídeo); ClampToEdge (fix listras).
  Créditos: MIT repalash + CC-BY timblewee — vendor/tympanus/ATTRIBUTION.md
*/

var reduced =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduced) {
  document.body.classList.add("is-reduced");
}

var openRoot = document.querySelector(".pyOpen");
var canvas = document.getElementById("pyOpenCanvas") || document.getElementById("c");
var fallbackEl = document.getElementById("fallback");
var statusEl = document.getElementById("statusLine");
var focusVeil = document.getElementById("focusVeil");
var beatCopy = document.querySelector(".pyOpen__copy") || document.getElementById("beatCopy");
var figmaScreen = document.getElementById("figmaScreen");

var params = new URLSearchParams(window.location.search || "");
var mode = params.get("mode") === "orbit" ? "orbit" : "case";
var copyPos = params.get("pos") === "B" ? "B" : "A";
var forceBeat = params.get("beat");
var captureHold = params.get("hold") === "1";
var debugHud = params.get("debug") === "1";

var slash = String.fromCharCode(47);
var cdnTag = "v0.1.0";
var cdnBase =
  "https:" +
  slash +
  slash +
  "cdn.jsdelivr.net" +
  slash +
  "gh" +
  slash +
  "eco-webdesign" +
  slash +
  "institutional-eco-webdesign@" +
  cdnTag +
  slash +
  "cases" +
  slash +
  "poytara" +
  slash +
  "notebook" +
  slash;
var useCdn = true;
var glbUrl = useCdn ? cdnBase + "macbook-only.glb" : "./vendor/tympanus/macbook-only.glb";
var posesUrl = useCdn ? cdnBase + "lid-poses.json" : "./vendor/tympanus/lid-poses.json";

document.body.setAttribute("data-mode", mode);
document.body.classList.toggle("is-debug", debugHud);
var hudEl = document.getElementById("hud");
if (hudEl) {
  hudEl.hidden = !debugHud;
}
if (beatCopy) {
  beatCopy.dataset.pos = copyPos;
  beatCopy.hidden = false;
}

var cssMs = function (name, fallback) {
  var raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) {
    return fallback;
  }
  if (raw.endsWith("ms")) {
    return parseFloat(raw);
  }
  if (raw.endsWith("s")) {
    return parseFloat(raw) * 1000;
  }
  return fallback;
};

var TIMING = {
  beat0: cssMs("--beat0-hold", 280),
  enter: cssMs("--beat1-enter", 900),
  lid: cssMs("--beat1-lid", 720),
  sharp: cssMs("--beat1-sharp", 480),
  figma: cssMs("--beat2-figma", 1400),
  copy: cssMs("--beat3-copy", 560),
};

var state = {
  webglOk: false,
  bloomOk: false,
  postOk: false,
  gpuOffLikely: false,
  still: reduced || mode === "case",
  modelSource: "tympanus-codrops-glb",
  mode: mode,
  beat: 0,
  scrollLocked: true,
  mobileRemoved: true,
  screenMode: "figma-html",
  lidPose: "closed",
  stripeFix: "clamp-canvas",
  copyPos: copyPos,
  glbPath: glbUrl,
  posesPath: posesUrl,
  debugHud: debugHud,
};

function setStatus(msg) {
  if (statusEl && debugHud) {
    statusEl.textContent = msg;
  }
  window.__POYTARA_THREE_PROVA__ = Object.assign({}, state, { status: msg });
}

function setBeat(n) {
  state.beat = n;
  document.body.setAttribute("data-beat", String(n));
  setStatus(
    "beat " +
      n +
      " · " +
      mode +
      (state.gpuOffLikely ? " · soft-gpu" : "") +
      (state.bloomOk ? " · bloom" : " · no-bloom") +
      (reduced ? " · reduced" : "") +
      " · pos=" +
      copyPos
  );
}

function lockScroll(on) {
  state.scrollLocked = on;
  document.documentElement.classList.toggle("is-scroll-lock", on);
  function block(ev) {
    if (!state.scrollLocked) {
      return;
    }
    ev.preventDefault();
  }
  if (on && !lockScroll._bound) {
    lockScroll._bound = true;
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    window.addEventListener(
      "keydown",
      function (ev) {
        if (!state.scrollLocked) {
          return;
        }
        var k = ev.key;
        if (
          k === "ArrowDown" ||
          k === "ArrowUp" ||
          k === "PageDown" ||
          k === "PageUp" ||
          k === " " ||
          k === "Spacebar"
        ) {
          ev.preventDefault();
        }
      },
      { passive: false }
    );
  }
}

function showFallback(reason) {
  state.webglOk = false;
  document.body.classList.add("is-webgl-off");
  if (fallbackEl) {
    fallbackEl.classList.add("is-on");
  }
  if (canvas) {
    canvas.style.display = "none";
  }
  setBeat(3);
  lockScroll(false);
  setStatus("fallback · " + reason + " · beat 3 static");
}

function applyLidPose(bevels, poses, name) {
  var list = (poses && poses.transforms) || [];
  var pose = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].name === name) {
      pose = list[i];
      break;
    }
  }
  if (!pose) {
    pose = list[list.length - 1] || null;
  }
  if (!bevels || !pose) {
    return null;
  }
  bevels.position.fromArray(pose.position);
  bevels.quaternion.fromArray(pose.quaternion);
  bevels.scale.fromArray(pose.scale);
  return pose;
}

function lerpLid(bevels, fromPose, toPose, t) {
  if (!bevels || !fromPose || !toPose) {
    return;
  }
  var a = new THREE.Vector3().fromArray(fromPose.position);
  var b = new THREE.Vector3().fromArray(toPose.position);
  bevels.position.lerpVectors(a, b, t);
  var qa = new THREE.Quaternion().fromArray(fromPose.quaternion);
  var qb = new THREE.Quaternion().fromArray(toPose.quaternion);
  bevels.quaternion.slerpQuaternions(qa, qb, t);
  var sa = new THREE.Vector3().fromArray(fromPose.scale);
  var sb = new THREE.Vector3().fromArray(toPose.scale);
  bevels.scale.lerpVectors(sa, sb, t);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function stripPhones(root) {
  var kill = [];
  root.traverse(function (o) {
    var n = (o.name || "").toLowerCase();
    if (n === "iphone" || n.indexOf("iphone") >= 0 || n === "phone") {
      kill.push(o);
    }
  });
  kill.forEach(function (o) {
    if (o.parent) {
      o.parent.remove(o);
    }
  });
  return kill.length;
}

function createFigmaTexture() {
  var w = 1024;
  var h = 640;
  var paint = document.createElement("canvas");
  paint.width = w;
  paint.height = h;
  var ctx = paint.getContext("2d");
  var tex = new THREE.CanvasTexture(paint);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;

  function roundRect(x, y, rw, rh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + rw, y, x + rw, y + rh, r);
    ctx.arcTo(x + rw, y + rh, x, y + rh, r);
    ctx.arcTo(x, y + rh, x, y, r);
    ctx.arcTo(x, y, x + rw, y, r);
    ctx.closePath();
  }

  function paintFrame(progress) {
    var p = Math.max(0, Math.min(1, progress));
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#3c3c3c";
    ctx.fillRect(0, 0, w, 36);
    ctx.fillStyle = "#ff5f57";
    ctx.beginPath();
    ctx.arc(18, 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#febc2e";
    ctx.beginPath();
    ctx.arc(34, 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#28c840";
    ctx.beginPath();
    ctx.arc(50, 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0f0f0";
    ctx.font = "500 13px IBM Plex Sans, sans-serif";
    ctx.fillText("Poytara — Draft", 72, 22);
    ctx.fillStyle = "rgba(240,240,240,0.45)";
    ctx.font = "11px IBM Plex Mono, monospace";
    ctx.fillText("100%", w - 56, 22);

    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 36, 48, h - 36);
    for (var ti = 0; ti < 5; ti++) {
      ctx.fillStyle = ti === 0 ? "#0d99ff" : "#2a2a2a";
      roundRect(10, 48 + ti * 38, 28, 28, 6);
      ctx.fill();
    }

    ctx.fillStyle = "#252525";
    ctx.fillRect(48, 36, 168, h - 36);
    ctx.fillStyle = "rgba(243,243,243,0.5)";
    ctx.font = "500 11px IBM Plex Sans, sans-serif";
    ctx.fillText("LAYERS", 60, 58);
    var layers = ["Frame 01", "Hero", "Logo", "CTA"];
    for (var li = 0; li < layers.length; li++) {
      ctx.fillStyle = li === 0 ? "rgba(13,153,255,0.2)" : "#303030";
      roundRect(58, 70 + li * 36, 140, 28, 4);
      ctx.fill();
      ctx.fillStyle = li === 0 ? "#9fd6ff" : "rgba(240,240,240,0.8)";
      ctx.fillText(layers[li], 70, 88 + li * 36);
    }

    var cx0 = 216;
    var cy0 = 36;
    var cw = w - cx0;
    var ch = h - cy0;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(cx0, cy0, cw, ch);

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx0 + 18, cy0 + 18, cw - 36, ch - 36);
    ctx.clip();
    /* Solid workspace — no fine grid (moiré / false “listras” on 1920 soft-gpu). */
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(cx0 + 18, cy0 + 18, cw - 36, ch - 36);

    var ax = cx0 + cw * 0.12;
    var ay = cy0 + ch * 0.1;
    var aw = cw * 0.76;
    var ah = ch * 0.78;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ax, ay, aw, ah);

    var layerA = Math.max(0, Math.min(1, (p - 0.08) / 0.25));
    var layerB = Math.max(0, Math.min(1, (p - 0.2) / 0.25));
    var layerC = Math.max(0, Math.min(1, (p - 0.34) / 0.25));

    ctx.globalAlpha = layerA;
    ctx.fillStyle = "#e8eef5";
    ctx.fillRect(ax + aw * 0.08, ay + ah * 0.1 + (1 - layerA) * 8, aw * 0.36, ah * 0.18);

    ctx.globalAlpha = layerB;
    ctx.fillStyle = "#d9e8f8";
    ctx.fillRect(ax + aw * 0.08, ay + ah * 0.34 + (1 - layerB) * 8, aw * 0.84, ah * 0.28);
    ctx.strokeStyle = "#0d99ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(ax + aw * 0.08, ay + ah * 0.34 + (1 - layerB) * 8, aw * 0.84, ah * 0.28);

    ctx.globalAlpha = layerC;
    ctx.fillStyle = "#0d99ff";
    ctx.fillRect(
      ax + aw * 0.64,
      ay + ah * 0.76 + (1 - layerC) * 8,
      aw * 0.28,
      ah * 0.14
    );
    ctx.globalAlpha = 1;

    var curT = Math.max(0, Math.min(1, (p - 0.05) / 0.9));
    var curX = ax + aw * (0.18 + curT * 0.54);
    var curY = ay + ah * (0.22 + curT * 0.46);
    ctx.save();
    ctx.translate(curX, curY);
    ctx.rotate((-45 * Math.PI) / 180);
    ctx.globalAlpha = curT > 0 ? 1 : 0;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 14);
    ctx.lineTo(10, 10);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    tex.needsUpdate = true;
  }

  paintFrame(0);
  return { texture: tex, paintFrame: paintFrame, canvas: paint };
}

function rewriteScreenUVs(mesh) {
  var geo = mesh.geometry;
  if (!geo || !geo.attributes || !geo.attributes.uv || !geo.attributes.position) {
    return;
  }
  var uv = geo.attributes.uv;
  var pos = geo.attributes.position;
  var i;
  var xmin = Infinity;
  var xmax = -Infinity;
  var zmin = Infinity;
  var zmax = -Infinity;
  for (i = 0; i < pos.count; i++) {
    var x = pos.getX(i);
    var z = pos.getZ(i);
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (z < zmin) zmin = z;
    if (z > zmax) zmax = z;
  }
  var dx = Math.max(xmax - xmin, 1e-6);
  var dz = Math.max(zmax - zmin, 1e-6);
  for (i = 0; i < pos.count; i++) {
    var u = (pos.getX(i) - xmin) / dx;
    /* V inverted so canvas top (toolbar) sits at the top of the open lid. */
    var v = 1 - (pos.getZ(i) - zmin) / dz;
    uv.setXY(i, THREE.MathUtils.clamp(u, 0, 1), THREE.MathUtils.clamp(v, 0, 1));
  }
  uv.needsUpdate = true;
}

function bindScreenTexture(root, figma) {
  var screenMesh = root.getObjectByName("Object_7");
  if (!screenMesh) {
    return null;
  }

  /* Glass/plastic lid meshes over the panel cause soft-gpu moiré on the right. */
  ["Object_4", "Object_6"].forEach(function (name) {
    var o = root.getObjectByName(name);
    if (o) {
      o.visible = false;
    }
  });

  /* Replace Object_7 with a clean plane (exact 0–1 UVs) — kills atlas/REPEAT listras. */
  var posAttr = screenMesh.geometry.attributes.position;
  var xmin = Infinity;
  var xmax = -Infinity;
  var zmin = Infinity;
  var zmax = -Infinity;
  var yAvg = 0;
  var i;
  for (i = 0; i < posAttr.count; i++) {
    var x = posAttr.getX(i);
    var y = posAttr.getY(i);
    var z = posAttr.getZ(i);
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (z < zmin) zmin = z;
    if (z > zmax) zmax = z;
    yAvg += y;
  }
  yAvg /= Math.max(posAttr.count, 1);

  var pw = xmax - xmin;
  var ph = zmax - zmin;
  var plane = new THREE.PlaneGeometry(pw, ph, 1, 1);
  /* PlaneGeometry is XY; lid screen is XZ → rotate into lid local space. */
  plane.rotateX(-Math.PI / 2);
  var mat = new THREE.MeshBasicMaterial({
    map: figma.texture,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  figma.texture.wrapS = THREE.ClampToEdgeWrapping;
  figma.texture.wrapT = THREE.ClampToEdgeWrapping;
  figma.texture.flipY = true;
  figma.texture.colorSpace = THREE.SRGBColorSpace;
  figma.texture.needsUpdate = true;

  var overlay = new THREE.Mesh(plane, mat);
  overlay.name = "screenOverlay";
  overlay.position.set((xmin + xmax) / 2, yAvg + 0.0012, (zmin + zmax) / 2);
  overlay.renderOrder = 3;
  screenMesh.visible = false;
  (screenMesh.parent || root).add(overlay);
  state.stripeFix = "clean-plane-hide-glass";
  return overlay;
}

async function init() {
  lockScroll(true);
  setBeat(0);

  if (reduced) {
    showFallback("reduced-motion");
    document.body.classList.add("is-figma-live");
    return;
  }

  if (!canvas || !window.WebGLRenderingContext) {
    showFallback("no-webgl");
    return;
  }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
  } catch (err) {
    showFallback("renderer-ctor");
    return;
  }

  var gl = renderer.getContext();
  if (!gl) {
    showFallback("no-context");
    return;
  }

  var debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  var rendererName = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "")
    : "";
  state.gpuOffLikely =
    /swiftshader|llvmpipe|softpipe|microsoft basic render/i.test(rendererName) ||
    rendererName === "";

  state.webglOk = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !state.gpuOffLikely;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xf3f5f7, 1);

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf3f5f7, 32, 96);

  var camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  camera.position.set(5.6, 3.4, 6.8);

  var hemi = new THREE.HemisphereLight(0xf4f6fa, 0x8a93a3, 0.55);
  scene.add(hemi);

  var key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4.5, 8, 3.5);
  key.castShadow = !state.gpuOffLikely;
  if (key.castShadow) {
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 2.5;
  }
  scene.add(key);

  var fill = new THREE.DirectionalLight(0xc5d6ff, 0.85);
  fill.position.set(-6, 2.5, 2);
  scene.add(fill);
  var rim = new THREE.DirectionalLight(0xffffff, 1.35);
  rim.position.set(-2, 4, -6);
  scene.add(rim);
  var front = new THREE.DirectionalLight(0xffffff, 0.35);
  front.position.set(1.5, 2, 7);
  scene.add(front);

  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ opacity: 0.22 })
  );
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  scene.add(floor);

  setStatus("loading glb…");

  var poses;
  try {
    var posesRes = await fetch(posesUrl);
    poses = await posesRes.json();
  } catch (err) {
    poses = null;
  }

  var closedPose = null;
  var openPose = null;
  if (poses && poses.transforms) {
    poses.transforms.forEach(function (p) {
      if (p.name === "closed") {
        closedPose = p;
      }
      if (p.name === "open") {
        openPose = p;
      }
    });
  }

  var draco = new DRACOLoader();
  var dracoPath =
    "https:" +
    slash +
    slash +
    "www.gstatic.com" +
    slash +
    "draco" +
    slash +
    "versioned" +
    slash +
    "decoders" +
    slash +
    "1.5.7" +
    slash;
  draco.setDecoderPath(dracoPath);
  var loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  var gltf;
  try {
    gltf = await loader.loadAsync(glbUrl);
  } catch (err) {
    console.error(err);
    showFallback("glb-load");
    return;
  }

  var root = gltf.scene;
  state.phonesStripped = stripPhones(root);

  var macbook = root.getObjectByName("macbook") || root;
  macbook.position.set(0, 0, 0);
  macbook.rotation.set(0, 0, 0);
  macbook.visible = false;

  var bevels = root.getObjectByName("Bevels_2");
  applyLidPose(bevels, poses, "closed");
  state.lidPose = "closed";

  var figma = createFigmaTexture();
  bindScreenTexture(root, figma);
  if (figmaScreen) {
    /* HTML/CSS source kept for tokens + future press-release swap */
    document.body.classList.remove("is-figma-live");
  }

  root.traverse(function (o) {
    if (o.isMesh) {
      o.castShadow = !state.gpuOffLikely;
      o.receiveShadow = !state.gpuOffLikely;
      if (o.material) {
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) {
          if (m && m.map && m.map !== figma.texture) {
            m.map.colorSpace = THREE.SRGBColorSpace;
          }
        });
      }
    }
  });

  scene.add(root);

  var box = new THREE.Box3().setFromObject(macbook);
  var center = box.getCenter(new THREE.Vector3());
  var size = box.getSize(new THREE.Vector3());
  macbook.position.sub(center);
  macbook.position.y += size.y * 0.42;

  /* Measure framing with lid OPEN so beat 3 does not crop the tampa at 1920. */
  applyLidPose(bevels, poses, "open");
  box.setFromObject(macbook);
  size = box.getSize(new THREE.Vector3());
  var targetY = box.min.y + size.y * 0.36;
  applyLidPose(bevels, poses, "closed");
  state.lidPose = "closed";

  var controls = null;
  if (mode === "orbit") {
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.target.set(0, targetY, 0);
    controls.minDistance = Math.max(size.x * 0.55, 2.2);
    controls.maxDistance = Math.max(size.x * 4.5, 24);
    controls.minPolarAngle = THREE.MathUtils.degToRad(22);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
    controls.minAzimuthAngle = THREE.MathUtils.degToRad(-80);
    controls.maxAzimuthAngle = THREE.MathUtils.degToRad(80);
    controls.update();
  }

  var camTarget = new THREE.Vector3(0, targetY, 0);
  var camFar = new THREE.Vector3();
  var camNear = new THREE.Vector3();

  function frameCamera(distScale) {
    var r = 0.5 * Math.hypot(size.x, size.y * 1.28, size.z);
    var vF = THREE.MathUtils.degToRad(camera.fov);
    var aspect = Math.max(camera.aspect, 0.35);
    var hF = 2 * Math.atan(Math.tan(vF / 2) * aspect);
    var fit = aspect < 0.7 ? 1.78 : 1.34;
    var dist = (r / Math.sin(Math.min(vF, hF) / 2)) * fit * (distScale || 1);
    var dir = new THREE.Vector3(0.58, 0.34, 0.74).normalize();
    camera.position.copy(camTarget).addScaledVector(dir, dist);
    camera.lookAt(camTarget);
    return dist;
  }

  var nearDist = frameCamera(1);
  camNear.copy(camera.position);
  frameCamera(1.62);
  camFar.copy(camera.position);
  camera.position.copy(camFar);

  var composer = null;
  var bloomPass = null;
  var forceBloom = params.get("forceBloom") === "1";
  var forceNoBloom = params.get("bloom") === "0";
  var usePost =
    !reduced && !forceNoBloom && (forceBloom || !state.gpuOffLikely);

  function resize() {
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    if (composer) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      if (bloomPass) {
        bloomPass.resolution.set(w, h);
      }
    }
  }

  if (usePost) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.14,
        0.42,
        0.9
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      state.postOk = true;
      state.bloomOk = true;
    } catch (err) {
      composer = null;
      state.postOk = false;
      state.bloomOk = false;
    }
  }

  resize();
  window.addEventListener("resize", resize);

  var timeline = {
    start: 0,
    started: false,
    done: false,
    lastBeat: -1,
    figmaP: 0,
  };

  var T0 = TIMING.beat0;
  var T1 = T0 + TIMING.enter;
  var T_LID0 = T0 + TIMING.enter * 0.45;
  var T_LID1 = T_LID0 + TIMING.lid;
  var T_FIG0 = T_LID0 + TIMING.lid * 0.4;
  var T_FIG1 = T_FIG0 + TIMING.figma;
  var T3 = Math.max(T_LID1, T_FIG1) + TIMING.copy * 0.35;

  function renderFrame() {
    if (composer && state.bloomOk) {
      try {
        composer.render();
      } catch (err) {
        state.bloomOk = false;
        composer = null;
        renderer.render(scene, camera);
      }
    } else {
      renderer.render(scene, camera);
    }
  }

  function jumpToBeat(n) {
    macbook.visible = n >= 1;
    if (n >= 1) {
      camera.position.copy(camNear);
      camera.lookAt(camTarget);
    } else {
      camera.position.copy(camFar);
      camera.lookAt(camTarget);
    }
    if (n >= 2) {
      applyLidPose(bevels, poses, "open");
      state.lidPose = "open";
      document.body.classList.add("is-figma-live");
      figma.paintFrame(1);
      timeline.figmaP = 1;
    } else if (n === 1) {
      applyLidPose(bevels, poses, "closed");
      figma.paintFrame(0);
      timeline.figmaP = 0;
    } else {
      applyLidPose(bevels, poses, "closed");
      figma.paintFrame(0);
    }
    if (focusVeil) {
      focusVeil.classList.toggle("is-blur", n === 1);
    }
    setBeat(n);
    timeline.lastBeat = n;
    if (n >= 3) {
      lockScroll(false);
      timeline.done = true;
      if (openRoot) {
        openRoot.classList.remove("is-intro", "is-anim");
        openRoot.classList.add("is-hold", "is-ready", "is-beat3");
      }
      document.documentElement.classList.remove("pyOpen-lock");
    }
  }

  function applyTimeline(elapsed) {
    var beat = 0;
    if (elapsed >= T3) {
      beat = 3;
    } else if (elapsed >= T_FIG0) {
      beat = 2;
    } else if (elapsed >= T0) {
      beat = 1;
    }

    if (beat !== timeline.lastBeat) {
      setBeat(beat);
      timeline.lastBeat = beat;
    }

    if (elapsed < T0) {
      macbook.visible = false;
      camera.position.copy(camFar);
      camera.lookAt(camTarget);
      if (focusVeil) {
        focusVeil.classList.remove("is-blur");
      }
      return;
    }

    macbook.visible = true;

    if (elapsed < T1) {
      var te = Math.min(1, (elapsed - T0) / TIMING.enter);
      camera.position.lerpVectors(camFar, camNear, easeOutCubic(te));
      camera.lookAt(camTarget);
      if (focusVeil) {
        focusVeil.classList.toggle("is-blur", te < 0.85);
      }
    } else {
      camera.position.copy(camNear);
      camera.lookAt(camTarget);
      if (focusVeil) {
        focusVeil.classList.remove("is-blur");
      }
    }

    if (elapsed < T_LID0) {
      applyLidPose(bevels, poses, "closed");
      state.lidPose = "closed";
    } else if (elapsed < T_LID1) {
      var tl = Math.min(1, (elapsed - T_LID0) / TIMING.lid);
      lerpLid(bevels, closedPose, openPose, easeOutCubic(tl));
      state.lidPose = "opening";
    } else {
      applyLidPose(bevels, poses, "open");
      state.lidPose = "open";
    }

    if (elapsed >= T_FIG0) {
      document.body.classList.add("is-figma-live");
      var tf = Math.min(1, (elapsed - T_FIG0) / TIMING.figma);
      timeline.figmaP = easeOutCubic(tf);
      figma.paintFrame(timeline.figmaP);
    } else {
      figma.paintFrame(0);
      timeline.figmaP = 0;
    }

    if (elapsed >= T3 && !timeline.done) {
      timeline.done = true;
      lockScroll(false);
      figma.paintFrame(1);
      timeline.figmaP = 1;
      if (openRoot) {
        openRoot.classList.remove("is-intro", "is-anim");
        openRoot.classList.add("is-hold", "is-ready", "is-beat3");
      }
      document.documentElement.classList.remove("pyOpen-lock");
      if (window.__ecoCaseLenis && window.__ecoCaseLenis.start) {
        window.__ecoCaseLenis.start();
      }
    }
  }

  function frame(now) {
    if (!timeline.started) {
      timeline.started = true;
      timeline.start = now;
    }
    if (controls && mode === "orbit") {
      controls.update();
    }
    var forced =
      forceBeat !== null && forceBeat !== undefined && forceBeat !== "";
    if (!forced && !timeline.done) {
      applyTimeline(now - timeline.start);
    } else if (!forced && timeline.done) {
      /* hold beat 3 — keep final paint */
    }
    renderFrame();
    requestAnimationFrame(frame);
  }

  if (forceBeat !== null && forceBeat !== undefined && forceBeat !== "") {
    jumpToBeat(parseInt(forceBeat, 10) || 0);
    timeline.done = true;
  } else if (captureHold) {
    jumpToBeat(3);
  }

  requestAnimationFrame(frame);
  if (openRoot) {
    openRoot.classList.add("is-three");
    openRoot.classList.remove("is-anim");
  }
  window.__ecoPoytaraNotebook = Object.assign({}, window.__ecoPoytaraNotebook || {}, {
    build: "notebook-jsdfix-20261117165252",
    mode: "three",
    glb: glbUrl,
  });
  setStatus(
    "ready · case beats · stripeFix=" +
      state.stripeFix +
      (state.gpuOffLikely ? " · soft-gpu" : "") +
      (state.bloomOk ? " · bloom" : " · no-bloom")
  );
}

try {
  init();
} catch (err) {
  showFallback("init-throw");
  console.error(err);
}
