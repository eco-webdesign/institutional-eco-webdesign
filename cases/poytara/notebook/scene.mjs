import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/EffectComposer.js/+esm";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/RenderPass.js/+esm";
import { BokehPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/BokehPass.js/+esm";
import { OutputPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/OutputPass.js/+esm";
import { RoomEnvironment } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/environments/RoomEnvironment.js/+esm";

/*
  Poytara abertura estúdio v0.2.1 — beats 0–3 + face final (automáticos).
  Após tampa: dolly/giro para frame frontal (notebook à direita, crop na borda;
  metade esquerda preta). Info por último. ACES / PMREM. CSP: sem blob/workers/Draco.
*/

var BUILD = "notebook-studio-v021-20261117215339";
var CDN_TAG = "v0.2.1";

var reduced =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduced) {
  document.body.classList.add("is-reduced");
}

var openRoot = document.querySelector(".pyOpen");
var canvas =
  document.getElementById("pyOpenCanvas") || document.getElementById("c");
var fallbackEl = document.getElementById("fallback");
var statusEl = document.getElementById("statusLine");
var focusVeil = document.getElementById("focusVeil");
var beatCopy =
  document.querySelector(".pyOpen__copy") || document.getElementById("beatCopy");
var figmaScreen = document.getElementById("figmaScreen");

var params = new URLSearchParams(window.location.search || "");
var mode = params.get("mode") === "orbit" ? "orbit" : "case";
var copyPos = params.get("pos") === "B" ? "B" : "A";
var forceBeat = params.get("beat");
var captureHold = params.get("hold") === "1";
var debugHud = params.get("debug") === "1";

var slash = String.fromCharCode(47);
var scriptEl =
  document.currentScript ||
  document.querySelector("script[data-eco-notebook]") ||
  document.querySelector('script[type="module"][src*="poytara/notebook/scene"]');
var scriptSrc = (scriptEl && scriptEl.src) || "";
var cdnBase;
if (scriptSrc.indexOf("cases/poytara/notebook/") >= 0) {
  cdnBase = scriptSrc.replace(/scene\.mjs(\?.*)?$/, "");
} else {
  cdnBase =
    "https:" +
    slash +
    slash +
    "cdn.jsdelivr.net/gh/eco-webdesign/institutional-eco-webdesign@" +
    CDN_TAG +
    "/cases/poytara/notebook/";
}
var glbUrl = cdnBase + "macbook-only.glb";
var posesUrl = cdnBase + "lid-poses.json";

document.body.setAttribute("data-mode", mode);
document.body.classList.toggle("is-debug", debugHud);
var hudEl = document.getElementById("hud");
if (hudEl) {
  hudEl.hidden = !debugHud;
}
if (beatCopy) {
  beatCopy.dataset.pos = copyPos;
  beatCopy.hidden = false;
  beatCopy.style.opacity = "0";
}

var isMobile = Math.min(window.innerWidth || 1440, window.innerHeight || 900) <= 430 ||
  (window.innerWidth || 1440) <= 430;

var TIMING = reduced
  ? { beat0: 120, loadHold: 80, dissolve: 180, enter: 420, lid: 360, figma: 280, face: 420, copy: 220 }
  : { beat0: 420, loadHold: 200, dissolve: 900, enter: 2100, lid: 1400, figma: 1500, face: 2100, copy: 700 };

var state = {
  webglOk: false,
  dofOk: false,
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
  loadProgress: 0,
  wireframe: true,
  studio: "dark-dramatic",
  build: BUILD,
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
      " · studio · " +
      mode +
      (state.gpuOffLikely ? " · soft-gpu" : "") +
      (state.dofOk ? " · dof" : " · no-dof") +
      (reduced ? " · reduced" : "") +
      (isMobile ? " · mobile" : "")
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
  if (beatCopy) {
    beatCopy.style.opacity = "1";
  }
  setBeat(3);
  lockScroll(false);
  setStatus("fallback · " + reason + " · beat 3 static");
}

function easeOutExpo(t) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function easeInOutExpo(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.5) {
    return Math.pow(2, 20 * t - 10) / 2;
  }
  return (2 - Math.pow(2, -20 * t + 10)) / 2;
}

function easeOutBack(t) {
  var c1 = 1.70158;
  var c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
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
  /* Higher res so the final frontal crop stays sharp */
  var w = 2048;
  var h = 1280;
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
    var p = clamp01(progress);
    var lw = 1024;
    var lh = 640;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(w / lw, 0, 0, h / lh, 0, 0);

    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(0, 0, lw, lh);

    ctx.fillStyle = "#3c3c3c";
    ctx.fillRect(0, 0, lw, 36);
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
    ctx.fillText("100%", lw - 56, 22);

    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 36, 48, lh - 36);
    for (var ti = 0; ti < 5; ti++) {
      ctx.fillStyle = ti === 0 ? "#0d99ff" : "#2a2a2a";
      roundRect(10, 48 + ti * 38, 28, 28, 6);
      ctx.fill();
    }

    ctx.fillStyle = "#252525";
    ctx.fillRect(48, 36, 168, lh - 36);
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
    var cw = lw - cx0;
    var ch = lh - cy0;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(cx0, cy0, cw, ch);

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx0 + 18, cy0 + 18, cw - 36, ch - 36);
    ctx.clip();
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(cx0 + 18, cy0 + 18, cw - 36, ch - 36);

    var ax = cx0 + cw * 0.12;
    var ay = cy0 + ch * 0.1;
    var aw = cw * 0.76;
    var ah = ch * 0.78;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ax, ay, aw, ah);

    var layerA = clamp01((p - 0.08) / 0.25);
    var layerB = clamp01((p - 0.2) / 0.25);
    var layerC = clamp01((p - 0.34) / 0.25);

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

    var curT = clamp01((p - 0.05) / 0.9);
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tex.needsUpdate = true;
  }

  paintFrame(0);
  return { texture: tex, paintFrame: paintFrame, canvas: paint };
}

function bindScreenTexture(root, figma) {
  var screenMesh = root.getObjectByName("Object_7");
  if (!screenMesh) {
    return null;
  }

  ["Object_4", "Object_6"].forEach(function (name) {
    var o = root.getObjectByName(name);
    if (o) {
      o.visible = false;
    }
  });

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
  plane.rotateX(-Math.PI / 2);
  var mat = new THREE.MeshBasicMaterial({
    map: figma.texture,
    toneMapped: false,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
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

function makeStudioFloor() {
  var group = new THREE.Group();
  group.name = "studioFloor";

  var cyclorama = new THREE.Mesh(
    new THREE.CylinderGeometry(18, 18, 14, 64, 1, true, 0, Math.PI),
    new THREE.MeshStandardMaterial({
      color: 0x12151c,
      roughness: 0.92,
      metalness: 0.05,
      side: THREE.BackSide,
    })
  );
  cyclorama.position.set(0, 5.5, -4);
  cyclorama.rotation.y = Math.PI;
  group.add(cyclorama);

  var ground = new THREE.Mesh(
    new THREE.CircleGeometry(16, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0e1118,
      roughness: 0.78,
      metalness: 0.18,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  group.add(ground);

  var contact = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 48),
    new THREE.ShadowMaterial({ opacity: 0.42 })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.002;
  contact.receiveShadow = true;
  group.add(contact);

  var floorWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CircleGeometry(16, 48)),
    new THREE.LineBasicMaterial({
      color: 0xb7c4ff,
      transparent: true,
      opacity: 0.35,
    })
  );
  floorWire.rotation.x = -Math.PI / 2;
  floorWire.position.y = 0.004;
  floorWire.name = "floorWire";
  group.add(floorWire);

  return { group: group, floorWire: floorWire, ground: ground, contact: contact };
}

function makePlaceholderWire() {
  var g = new THREE.Group();
  g.name = "placeholderWire";
  var base = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(3.2, 0.12, 2.15)),
    new THREE.LineBasicMaterial({
      color: 0xdde6ff,
      transparent: true,
      opacity: 0.55,
    })
  );
  base.position.y = 0.06;
  var lid = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(3.05, 0.08, 2.0)),
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
    })
  );
  lid.position.set(0, 0.2, -0.05);
  g.add(base);
  g.add(lid);
  return g;
}

function captureSolidMaterials(root) {
  var entries = [];
  root.traverse(function (o) {
    if (!o.isMesh || !o.material) {
      return;
    }
    var mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(function (m, idx) {
      if (!m || m.name === "screenOverlayMat") {
        return;
      }
      entries.push({
        mesh: o,
        index: idx,
        isArray: Array.isArray(o.material),
        solid: m,
        wire: new THREE.MeshBasicMaterial({
          color: 0xe8eeff,
          wireframe: true,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      });
    });
  });
  return entries;
}

function setWireframeMix(entries, wireAmount) {
  var w = clamp01(wireAmount);
  entries.forEach(function (e) {
    var m = e.solid;
    if (e.isArray) {
      e.mesh.material[e.index] = m;
    } else {
      e.mesh.material = m;
    }
    if (!m.userData._studioInit) {
      m.userData._studioInit = true;
      m.userData._baseOpacity = m.opacity === undefined ? 1 : m.opacity;
      m.userData._wasTransparent = !!m.transparent;
      if (m.emissive) {
        m.userData._baseEmissive = m.emissive.clone();
      }
    }
    m.wireframe = w > 0.28;
    if (m.emissive) {
      var glow = 0.55 * w;
      m.emissive.setRGB(
        (m.userData._baseEmissive.r || 0) + glow * 0.75,
        (m.userData._baseEmissive.g || 0) + glow * 0.85,
        (m.userData._baseEmissive.b || 0) + glow
      );
    }
    if (w > 0.02) {
      m.transparent = true;
      m.opacity =
        m.userData._baseOpacity *
        (m.wireframe ? 0.35 + 0.55 * Math.max(state.loadProgress, 0.2) : 1 - w * 0.35);
    } else {
      m.transparent = m.userData._wasTransparent;
      m.opacity = m.userData._baseOpacity;
      m.wireframe = false;
      if (m.emissive && m.userData._baseEmissive) {
        m.emissive.copy(m.userData._baseEmissive);
      }
    }
    m.needsUpdate = true;
  });
  state.wireframe = w > 0.05;
}

function scrambleText(el, finalText, progress) {
  if (!el) {
    return;
  }
  var p = clamp01(progress);
  if (p >= 1) {
    el.textContent = finalText;
    return;
  }
  var glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var out = "";
  for (var i = 0; i < finalText.length; i++) {
    var ch = finalText.charAt(i);
    if (ch === " " || ch === "." || ch === ",") {
      out += ch;
      continue;
    }
    if (i / Math.max(finalText.length, 1) < p) {
      out += ch;
    } else {
      out += glyphs.charAt((Math.random() * glyphs.length) | 0);
    }
  }
  el.textContent = out;
}

async function init() {
  lockScroll(true);
  setBeat(0);

  if (reduced && params.get("force3d") !== "1") {
    showFallback("reduced-motion");
    document.body.classList.add("is-figma-live");
    if (openRoot) {
      openRoot.classList.add("is-hold", "is-ready", "is-beat3");
    }
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
      antialias: !isMobile,
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
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = !state.gpuOffLikely;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x07090e, 1);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090e);
  scene.fog = new THREE.FogExp2(0x07090e, 0.028);

  var camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  camera.position.set(6.4, 3.8, 7.6);

  try {
    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  } catch (err) {
    setStatus("env-map skipped");
  }

  var hemi = new THREE.HemisphereLight(0x9eb6ff, 0x0a0c12, 0.28);
  scene.add(hemi);

  var key = new THREE.DirectionalLight(0xfff2e0, 2.8);
  key.position.set(5.2, 9.2, 4.2);
  key.castShadow = !state.gpuOffLikely;
  if (key.castShadow) {
    key.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.00035;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 2.2;
  }
  scene.add(key);

  var rim = new THREE.DirectionalLight(0x9ec5ff, 1.8);
  rim.position.set(-5.5, 4.5, -6.5);
  scene.add(rim);

  var fill = new THREE.DirectionalLight(0x6f87c8, 0.45);
  fill.position.set(-3.5, 2.2, 5.5);
  scene.add(fill);

  var studio = makeStudioFloor();
  scene.add(studio.group);

  var placeholder = makePlaceholderWire();
  scene.add(placeholder);

  if (focusVeil) {
    focusVeil.classList.remove("is-blur");
    focusVeil.hidden = true;
  }

  setStatus("loading studio assets…");

  var loadProgress = 0;
  var loadDone = false;
  var manager = new THREE.LoadingManager();
  manager.onProgress = function (_url, loaded, total) {
    loadProgress = total > 0 ? loaded / total : 0;
    state.loadProgress = loadProgress;
    if (studio.floorWire && studio.floorWire.material) {
      studio.floorWire.material.opacity = 0.15 + 0.55 * loadProgress;
    }
    placeholder.children.forEach(function (line) {
      if (line.material) {
        line.material.opacity = 0.25 + 0.55 * loadProgress;
      }
    });
    setStatus("loading " + Math.round(loadProgress * 100) + "%");
  };
  manager.onLoad = function () {
    loadDone = true;
    state.loadProgress = 1;
  };

  var poses = null;
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
      if (p.name === "closed") closedPose = p;
      if (p.name === "open") openPose = p;
    });
  }

  var loader = new GLTFLoader(manager);
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

  var bevels = root.getObjectByName("Bevels_2");
  applyLidPose(bevels, poses, "closed");
  state.lidPose = "closed";

  var figma = createFigmaTexture();
  var screenOverlay = bindScreenTexture(root, figma);
  if (figmaScreen) {
    document.body.classList.remove("is-figma-live");
  }

  root.traverse(function (o) {
    if (o.isMesh) {
      o.castShadow = !state.gpuOffLikely;
      o.receiveShadow = !state.gpuOffLikely;
      if (o.material) {
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) {
          if (!m) return;
          if (m.map && m.map !== figma.texture) {
            m.map.colorSpace = THREE.SRGBColorSpace;
          }
          if (m.metalness !== undefined) {
            m.envMapIntensity = 1.15;
            m.metalness = Math.min(1, (m.metalness || 0) + 0.08);
            m.roughness = Math.max(0.18, (m.roughness || 0.45) * 0.92);
          }
        });
      }
    }
  });

  var matEntries = captureSolidMaterials(root);
  setWireframeMix(matEntries, 1);

  scene.add(root);
  placeholder.visible = false;

  var box = new THREE.Box3().setFromObject(macbook);
  var center = box.getCenter(new THREE.Vector3());
  var size = box.getSize(new THREE.Vector3());
  macbook.position.sub(center);
  macbook.position.y += size.y * 0.42;

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
  var camFace = new THREE.Vector3();
  var camFaceTarget = new THREE.Vector3();
  var faceDist = 1;

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

  /*
    Final frame (ref ~1024×498):
    - Frontal to display; notebook on the RIGHT; left half black negative space.
    - Desktop: display left edge @ ~50% width; right side cropped off-frame.
      Display height ~8%→80% of viewport (~72% tall).
    - Mobile: center notebook, crop both sides; keep Figma readable.
  */
  function computeFaceCamera() {
    applyLidPose(bevels, poses, "open");
    root.updateMatrixWorld(true);
    if (!screenOverlay) {
      camFace.copy(camNear);
      camFaceTarget.copy(camTarget);
      faceDist = nearDist;
      return;
    }
    screenOverlay.updateWorldMatrix(true, true);
    var center = new THREE.Vector3();
    screenOverlay.getWorldPosition(center);
    var normal = new THREE.Vector3(0, 1, 0);
    normal.transformDirection(screenOverlay.matrixWorld).normalize();
    var towardNear = new THREE.Vector3().subVectors(camNear, center);
    if (normal.dot(towardNear) < 0) {
      normal.negate();
    }
    var screenRight = new THREE.Vector3(1, 0, 0);
    screenRight.transformDirection(screenOverlay.matrixWorld).normalize();
    var screenUp = new THREE.Vector3().crossVectors(normal, screenRight).normalize();
    /* Re-orthogonalize right in case */
    screenRight.crossVectors(screenUp, normal).normalize();

    var geo = screenOverlay.geometry;
    var localW = (geo && geo.parameters && geo.parameters.width) || size.x * 0.9;
    var localH = (geo && geo.parameters && geo.parameters.height) || size.z * 0.7;
    var worldScale = new THREE.Vector3();
    screenOverlay.getWorldScale(worldScale);
    var screenWorldW = Math.abs(localW * worldScale.x);
    var screenWorldH = Math.abs(localH * Math.max(worldScale.y, worldScale.z));

    var vFov = THREE.MathUtils.degToRad(camera.fov);
    /* Display spans ~8%→80% of viewport height */
    var fillH = isMobile ? 0.58 : 0.72;
    faceDist = screenWorldH / (fillH * 2 * Math.tan(vFov / 2));

    /*
      Vertical: screen mid should sit at ~44% from top (ndc y ≈ +0.12),
      slightly above optical center, with base/keyboard below.
    */
    var ndcY = isMobile ? 0.06 : 0.12;
    var vertShift = ndcY * faceDist * Math.tan(vFov / 2);

    if (isMobile) {
      /* Centered crop both sides — Figma stays readable */
      camFaceTarget.copy(center).addScaledVector(screenUp, -vertShift * 0.35);
      camFace.copy(camFaceTarget).addScaledVector(normal, faceDist);
      camFace.addScaledVector(screenUp, faceDist * 0.02);
    } else {
      /*
        Look near the LEFT edge of the display so that edge sits at ~50% width
        (ndc x≈0) and the right of the notebook is cropped by the frame.
      */
      var leftEdge = new THREE.Vector3()
        .copy(center)
        .addScaledVector(screenRight, -screenWorldW * 0.5);
      /* Aim slightly inset so chrome/bezel breathes at the center line */
      camFaceTarget
        .copy(leftEdge)
        .addScaledVector(screenRight, screenWorldW * 0.06)
        .addScaledVector(screenUp, -vertShift);
      camFace.copy(camFaceTarget).addScaledVector(normal, faceDist);
      /* Height slightly above keyboard plane */
      camFace.addScaledVector(screenUp, faceDist * 0.028);
    }
  }

  function applyFinalStudioLook(amount) {
    var a = clamp01(amount);
    renderer.setClearColor(new THREE.Color().setRGB(0.027 * (1 - a), 0.035 * (1 - a), 0.055 * (1 - a)), 1);
    scene.background = new THREE.Color().setRGB(0.027 * (1 - a), 0.035 * (1 - a), 0.055 * (1 - a));
    if (a > 0.5) {
      scene.background = new THREE.Color(0x000000);
      renderer.setClearColor(0x000000, 1);
      scene.fog = new THREE.FogExp2(0x000000, 0.045 + 0.02 * a);
    }
    if (studio.group) {
      studio.group.traverse(function (o) {
        if (o.name === "floorWire") {
          o.visible = a < 0.35;
        }
        if (o.isMesh && o.material && o.material.color && o !== studio.contact) {
          /* Fade cyclorama / ground toward pure black */
          if (!o.userData._baseColor) {
            o.userData._baseColor = o.material.color.clone();
          }
          o.material.color.copy(o.userData._baseColor).lerp(new THREE.Color(0x000000), a * 0.92);
        }
        if (o === studio.contact && o.material) {
          o.material.opacity = 0.42 + 0.2 * a;
        }
      });
    }
    if (screenOverlay && screenOverlay.material) {
      screenOverlay.material.opacity = Math.max(screenOverlay.material.opacity, 0.001);
    }
  }

  var nearDist = frameCamera(1);
  camNear.copy(camera.position);
  frameCamera(1.78);
  camFar.copy(camera.position);
  computeFaceCamera();
  applyLidPose(bevels, poses, "closed");
  state.lidPose = "closed";
  camera.position.copy(camFar);

  var composer = null;
  var bokehPass = null;
  var useDof =
    !reduced &&
    !isMobile &&
    !state.gpuOffLikely &&
    params.get("dof") !== "0";

  function resize() {
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    isMobile = w <= 430;
    var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    if (composer) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
    }
    if (bokehPass && bokehPass.uniforms && bokehPass.uniforms.aspect) {
      bokehPass.uniforms.aspect.value = camera.aspect;
    }
    var lidWas = state.lidPose;
    computeFaceCamera();
    if (lidWas !== "open") {
      applyLidPose(bevels, poses, lidWas === "opening" ? "closed" : lidWas || "closed");
    } else {
      applyLidPose(bevels, poses, "open");
    }
  }

  if (useDof) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bokehPass = new BokehPass(scene, camera, {
        focus: nearDist * 0.92,
        aperture: 0.00022,
        maxblur: 0.012,
      });
      composer.addPass(bokehPass);
      composer.addPass(new OutputPass());
      state.postOk = true;
      state.dofOk = true;
    } catch (err) {
      composer = null;
      bokehPass = null;
      state.postOk = false;
      state.dofOk = false;
    }
  }

  resize();
  window.addEventListener("resize", resize);

  var titleEl = beatCopy && beatCopy.querySelector(".pyOpen__title");
  var hintEl = beatCopy && beatCopy.querySelector(".pyOpen__hint");
  var titleFinal = (titleEl && titleEl.textContent) || "Poytara";
  var hintFinal =
    (hintEl && hintEl.textContent) || "Use o scroll para ver o case";

  var timeline = {
    start: 0,
    started: false,
    done: false,
    lastBeat: -1,
    figmaP: 0,
    assetsReadyAt: 0,
    copyShown: false,
    faceComputed: false,
  };

  var T_BEAT0 = TIMING.beat0;
  var T_DIS0 = T_BEAT0 + TIMING.loadHold;
  var T_DIS1 = T_DIS0 + TIMING.dissolve;
  var T_ENTER0 = T_DIS0;
  var T_ENTER1 = T_ENTER0 + TIMING.enter;
  var T_LID0 = T_ENTER0 + TIMING.enter * 0.42;
  var T_LID1 = T_LID0 + TIMING.lid;
  var T_FIG0 = T_LID0 + TIMING.lid * 0.72;
  var T_FIG1 = T_FIG0 + TIMING.figma;
  var T_FACE0 = Math.max(T_LID1, T_FIG1 * 0.85);
  var T_FACE1 = T_FACE0 + TIMING.face;
  var T_COPY0 = T_FACE1 + 120;
  var T_COPY1 = T_COPY0 + TIMING.copy;
  var T_DONE = T_COPY1 + 80;

  function placeCopyOutsideScreen() {
    if (!beatCopy) {
      return;
    }
    /* Desktop: left black negative space. Mobile: below / soft overlay edge. */
    if (isMobile) {
      beatCopy.style.top = "auto";
      beatCopy.style.bottom = "5%";
      beatCopy.style.left = "5%";
      beatCopy.style.right = "5%";
      beatCopy.style.maxWidth = "90%";
    } else {
      beatCopy.style.top = "22%";
      beatCopy.style.bottom = "auto";
      beatCopy.style.left = "4%";
      beatCopy.style.right = "auto";
      beatCopy.style.maxWidth = "min(28vw, 22rem)";
    }
    beatCopy.style.zIndex = "5";
  }

  function setDof(progressSharp) {
    if (!bokehPass || !bokehPass.uniforms) {
      return;
    }
    var p = clamp01(progressSharp);
    var maxBlur = reduced ? 0 : THREE.MathUtils.lerp(0.018, 0.0012, easeOutExpo(p));
    var aperture = THREE.MathUtils.lerp(0.00055, 0.00008, easeOutExpo(p));
    bokehPass.uniforms.maxblur.value = maxBlur;
    bokehPass.uniforms.aperture.value = aperture;
    bokehPass.uniforms.focus.value = nearDist * THREE.MathUtils.lerp(1.35, 0.92, easeOutExpo(p));
    bokehPass.enabled = maxBlur > 0.0015;
  }

  function renderFrame() {
    if (composer && state.dofOk) {
      try {
        composer.render();
      } catch (err) {
        state.dofOk = false;
        composer = null;
        renderer.render(scene, camera);
      }
    } else {
      renderer.render(scene, camera);
    }
  }

  function jumpToBeat(n) {
    placeholder.visible = false;
    setWireframeMix(matEntries, 0);
    if (studio.floorWire) studio.floorWire.visible = false;
    if (n >= 2) {
      applyLidPose(bevels, poses, "open");
      state.lidPose = "open";
      computeFaceCamera();
      document.body.classList.add("is-figma-live");
      figma.paintFrame(1);
      if (screenOverlay) screenOverlay.material.opacity = 1;
      timeline.figmaP = 1;
    } else {
      applyLidPose(bevels, poses, "closed");
      figma.paintFrame(0);
      if (screenOverlay) screenOverlay.material.opacity = 0;
      timeline.figmaP = 0;
    }
    if (n >= 3) {
      camera.position.copy(camFace);
      camera.lookAt(camFaceTarget);
      applyFinalStudioLook(1);
      setDof(1);
      placeCopyOutsideScreen();
    } else if (n >= 1) {
      camera.position.copy(camNear);
      camera.lookAt(camTarget);
      setDof(1);
    } else {
      camera.position.copy(camFar);
      camera.lookAt(camTarget);
      setDof(0);
    }
    if (n >= 3 && beatCopy) {
      beatCopy.style.opacity = "1";
      if (titleEl) titleEl.textContent = titleFinal;
      if (hintEl) hintEl.textContent = hintFinal;
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
    var readyGate = loadDone || state.loadProgress >= 0.99;
    if (!readyGate) {
      setBeat(0);
      setWireframeMix(matEntries, 1);
      camera.position.copy(camFar);
      camera.lookAt(camTarget);
      setDof(0);
      return;
    }
    if (!timeline.assetsReadyAt) {
      timeline.assetsReadyAt = elapsed;
    }
    var t = Math.max(0, elapsed - timeline.assetsReadyAt);

    var beat = 0;
    if (t >= T_FACE0) beat = 3;
    else if (t >= T_FIG0) beat = 2;
    else if (t >= T_ENTER0) beat = 1;
    if (beat !== timeline.lastBeat) {
      setBeat(beat);
      timeline.lastBeat = beat;
    }

    if (t < T_BEAT0) {
      setWireframeMix(matEntries, 1);
      camera.position.copy(camFar);
      camera.lookAt(camTarget);
      setDof(0);
      return;
    }

    /* Wireframe dissolve → solid */
    var dissolveT = clamp01((t - T_DIS0) / Math.max(TIMING.dissolve, 1));
    setWireframeMix(matEntries, 1 - easeOutExpo(dissolveT));
    if (studio.floorWire) {
      studio.floorWire.material.opacity = Math.max(0, 0.4 * (1 - easeOutExpo(dissolveT)));
      studio.floorWire.visible = dissolveT < 0.98;
    }

    /* Lid with weight + overshoot/settle */
    if (t < T_LID0) {
      applyLidPose(bevels, poses, "closed");
      state.lidPose = "closed";
    } else if (t < T_LID1) {
      var tl = clamp01((t - T_LID0) / TIMING.lid);
      var lidE = easeOutBack(tl);
      lerpLid(bevels, closedPose, openPose, lidE);
      state.lidPose = "opening";
    } else {
      applyLidPose(bevels, poses, "open");
      state.lidPose = "open";
    }

    /* Figma after lid mostly open (before / during face zoom) */
    if (t >= T_FIG0) {
      document.body.classList.add("is-figma-live");
      var tf = clamp01((t - T_FIG0) / TIMING.figma);
      timeline.figmaP = easeOutCubic(tf);
      figma.paintFrame(timeline.figmaP);
      if (screenOverlay) {
        screenOverlay.material.opacity = timeline.figmaP;
      }
    } else {
      figma.paintFrame(0);
      timeline.figmaP = 0;
      if (screenOverlay) screenOverlay.material.opacity = 0;
    }

    /* Camera: enter dolly → hold → face+zoom frontal (never scale model) */
    if (t < T_ENTER1) {
      var te = clamp01((t - T_ENTER0) / TIMING.enter);
      var teE = easeInOutExpo(te);
      camera.position.lerpVectors(camFar, camNear, teE);
      camera.lookAt(camTarget);
      setDof(teE);
    } else if (t < T_FACE0) {
      camera.position.copy(camNear);
      camera.lookAt(camTarget);
      setDof(1);
    } else if (t < T_FACE1) {
      if (!timeline.faceComputed) {
        computeFaceCamera();
        timeline.faceComputed = true;
        placeCopyOutsideScreen();
      }
      var tfz = clamp01((t - T_FACE0) / TIMING.face);
      var tfzE = easeInOutExpo(tfz);
      camera.position.lerpVectors(camNear, camFace, tfzE);
      var look = new THREE.Vector3().lerpVectors(camTarget, camFaceTarget, tfzE);
      camera.lookAt(look);
      applyFinalStudioLook(tfzE);
      setDof(1);
      if (bokehPass && bokehPass.uniforms) {
        bokehPass.uniforms.focus.value = faceDist * 0.98;
        bokehPass.uniforms.maxblur.value = THREE.MathUtils.lerp(0.0012, 0.00035, tfzE);
      }
    } else {
      camera.position.copy(camFace);
      camera.lookAt(camFaceTarget);
      applyFinalStudioLook(1);
      setDof(1);
      if (bokehPass && bokehPass.uniforms) {
        bokehPass.uniforms.focus.value = faceDist * 0.98;
        bokehPass.uniforms.maxblur.value = 0.00035;
        bokehPass.enabled = false;
      }
    }

    /* External info last — after face zoom settles, outside screen */
    if (t >= T_COPY0 && beatCopy) {
      placeCopyOutsideScreen();
      var tc = clamp01((t - T_COPY0) / TIMING.copy);
      beatCopy.style.opacity = String(easeOutExpo(tc));
      scrambleText(titleEl, titleFinal, tc);
      scrambleText(hintEl, hintFinal, Math.max(0, tc - 0.15));
      timeline.copyShown = true;
    }

    if (t >= T_DONE && !timeline.done) {
      timeline.done = true;
      lockScroll(false);
      figma.paintFrame(1);
      timeline.figmaP = 1;
      if (screenOverlay) screenOverlay.material.opacity = 1;
      camera.position.copy(camFace);
      camera.lookAt(camFaceTarget);
      applyFinalStudioLook(1);
      placeCopyOutsideScreen();
      if (beatCopy) {
        beatCopy.style.opacity = "1";
        if (titleEl) titleEl.textContent = titleFinal;
        if (hintEl) hintEl.textContent = hintFinal;
      }
      if (openRoot) {
        openRoot.classList.remove("is-intro", "is-anim");
        openRoot.classList.add("is-hold", "is-ready", "is-beat3");
      }
      document.documentElement.classList.remove("pyOpen-lock");
      if (window.__ecoCaseLenis && window.__ecoCaseLenis.start) {
        window.__ecoCaseLenis.start();
      }
      setBeat(3);
    }
  }

  function idleDrift(_now) {
    /* v0.2.1: final frame holds static (no drift) */
    if (!timeline.done) {
      return;
    }
    camera.position.copy(camFace);
    camera.lookAt(camFaceTarget);
    applyFinalStudioLook(1);
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
      idleDrift(now);
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
    build: BUILD,
    mode: "three",
    glb: glbUrl,
    studio: "dark-dramatic",
    tag: CDN_TAG,
  });
  window.__ecoCaseBuild = BUILD;
  setStatus(
    "ready · studio v0.2.1 face-right · stripeFix=" +
      state.stripeFix +
      (state.gpuOffLikely ? " · soft-gpu" : "") +
      (state.dofOk ? " · dof" : " · no-dof")
  );
}

try {
  init();
} catch (err) {
  showFallback("init-throw");
  console.error(err);
}
