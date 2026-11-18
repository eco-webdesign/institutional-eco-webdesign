import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/EffectComposer.js/+esm";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/RenderPass.js/+esm";
import { BokehPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/BokehPass.js/+esm";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm";
import { ShaderPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/ShaderPass.js/+esm";
import { OutputPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/OutputPass.js/+esm";
import { RoomEnvironment } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/environments/RoomEnvironment.js/+esm";
import { RGBELoader } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/RGBELoader.js/+esm";

/*
  Poytara abertura estúdio v0.4.0 — caverna mitológica + pedestal (DESKTOP).
  CSP: sem blob/workers/Draco/KTX2. HUD só ?debug=1. Timeline TIMING intacta.
*/

var BUILD = "notebook-studio-v040-20261118173622";
var CDN_TAG = "v0.4.0";

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
var captureMode = params.get("capture") === "1";

var slash = String.fromCharCode(47);
var scriptEl =
  document.currentScript ||
  document.querySelector("script[data-eco-notebook]") ||
  document.querySelector('script[type="module"][src*="poytara/notebook/scene"]');
var scriptSrc = (scriptEl && scriptEl.src) || "";
var cdnBase;
if (scriptSrc.indexOf("cases/poytara/notebook/") >= 0 || /\/scene\.mjs(\?|$)/.test(scriptSrc)) {
  /* Same-folder assets (jsDelivr path OR local harness) */
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
function isMobileEarly() {
  return Math.min(window.innerWidth || 1440, window.innerHeight || 900) <= 430 ||
    (window.innerWidth || 1440) <= 430;
}

var glbUrl = cdnBase + (isMobileEarly() ? "laptop-generic-mobile.glb" : "laptop-generic.glb");
var posesUrl = cdnBase + "lid-poses.json";
var hdriUrl = cdnBase + "cave-wall-1k.hdr";
var pedestalTexBase = cdnBase + "textures/pedestal/";
var caveTexBase = cdnBase + "textures/cave/";

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
  /* One launch line only — drop duplicate [A CONFIRMAR] note */
  var tagsNote = beatCopy.querySelector(".pyOpen__tagsNote");
  if (tagsNote && tagsNote.parentNode) {
    tagsNote.parentNode.removeChild(tagsNote);
  }
  var dateEl = beatCopy.querySelector(".pyOpen__date");
  if (dateEl) {
    var dt = (dateEl.textContent || "").trim();
    if (dt === "[A CONFIRMAR]" || dt.indexOf("Lançamento") < 0) {
      dateEl.textContent = "Lançamento [A CONFIRMAR]";
    }
  }
}

var isMobile = Math.min(window.innerWidth || 1440, window.innerHeight || 900) <= 430 ||
  (window.innerWidth || 1440) <= 430;

var TIMING = reduced
  ? { beat0: 80, loadHold: 60, dissolve: 200, enter: 360, lid: 320, figma: 240, face: 380, copy: 280 }
  : { beat0: 360, loadHold: 180, dissolve: 800, enter: 1800, lid: 1400, figma: 1400, face: 2000, copy: 600 };

var state = {
  webglOk: false,
  dofOk: false,
  bloomOk: false,
  postOk: false,
  gpuOffLikely: false,
  still: reduced || mode === "case",
  modelSource: "tevy-laptop-v1-cc0",
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
  captureMode: captureMode,
  captureTime: 0,
  lockCamera: null,
  finalCamLocked: false, /* desktop freezes after 1st face; mobile has _frozenMobileFace */
  loadProgress: 0,
  wireframe: true,
  studio: "cave-pedestal-v040",
  build: BUILD,
};

function setStatus(msg) {
  if (statusEl) {
    if (debugHud) {
      statusEl.textContent = msg;
      statusEl.hidden = false;
    } else {
      statusEl.textContent = "";
      statusEl.hidden = true;
    }
  }
  var hud = document.getElementById("hud");
  if (hud && !debugHud) {
    hud.hidden = true;
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
  tex.flipY = true;

  function roundRect(x, y, rw, rh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + rw, y, x + rw, y + rh, r);
    ctx.arcTo(x + rw, y + rh, x, y + rh, r);
    ctx.arcTo(x, y + rh, x, y, r);
    ctx.arcTo(x, y, x + rw, y, r);
    ctx.closePath();
  }

  function paintFrame(progress, flashAmt) {
    var p = clamp01(progress);
    var flash = clamp01(flashAmt || 0);
    var lw = 1024;
    var lh = 640;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(w / lw, 0, 0, h / lh, 0, 0);

    /* Thin MacBook glass bezel — black sides/top; aluminum chin at bottom */
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, lw, lh);
    var inset = 14;
    var chinH = 22;
    ctx.fillStyle = "#0e0e10";
    ctx.fillRect(inset, inset, lw - inset * 2, lh - inset * 2 - chinH);
    /* Visible chin / hinge bridge */
    var chinGrad = ctx.createLinearGradient(0, lh - chinH - inset, 0, lh);
    chinGrad.addColorStop(0, "#1c222c");
    chinGrad.addColorStop(0.55, "#2a3340");
    chinGrad.addColorStop(1, "#12151a");
    ctx.fillStyle = chinGrad;
    ctx.fillRect(inset - 2, lh - chinH - 4, lw - inset * 2 + 4, chinH + 4);

    var ox = inset;
    var oy = inset;
    var iw = lw - inset * 2;
    var ih = lh - inset * 2 - chinH;

    /* Figma chrome */
    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(ox, oy, iw, 34);
    ctx.fillStyle = "#ff5f57";
    ctx.beginPath();
    ctx.arc(ox + 18, oy + 17, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#febc2e";
    ctx.beginPath();
    ctx.arc(ox + 34, oy + 17, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#28c840";
    ctx.beginPath();
    ctx.arc(ox + 50, oy + 17, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5f5f5";
    ctx.font = "600 13px IBM Plex Sans, sans-serif";
    ctx.fillText("Poytara — Home", ox + 72, oy + 21);

    ctx.fillStyle = "#161616";
    ctx.fillRect(ox, oy + 34, 44, ih - 34);
    for (var ti = 0; ti < 5; ti++) {
      ctx.fillStyle = ti === 0 ? "#0d99ff" : "#2a2a2a";
      roundRect(ox + 8, oy + 46 + ti * 36, 28, 28, 6);
      ctx.fill();
    }

    ctx.fillStyle = "#1f1f1f";
    ctx.fillRect(ox + 44, oy + 34, 150, ih - 34);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "600 11px IBM Plex Sans, sans-serif";
    ctx.fillText("LAYERS", ox + 56, oy + 54);
    var layers = ["Frame Home", "Hero", "Produto", "CTA"];
    for (var li = 0; li < layers.length; li++) {
      ctx.fillStyle = li === 0 ? "rgba(13,153,255,0.22)" : "#2b2b2b";
      roundRect(ox + 52, oy + 64 + li * 34, 134, 26, 4);
      ctx.fill();
      ctx.fillStyle = li === 0 ? "#9fd6ff" : "rgba(240,240,240,0.85)";
      ctx.font = "500 11px IBM Plex Sans, sans-serif";
      ctx.fillText(layers[li], ox + 62, oy + 81 + li * 34);
    }

    var cx0 = ox + 194;
    var cy0 = oy + 34;
    var cw = iw - 194;
    var ch = ih - 34;
    ctx.fillStyle = "#111111";
    ctx.fillRect(cx0, cy0, cw, ch);

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx0 + 14, cy0 + 14, cw - 28, ch - 28);
    ctx.clip();
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(cx0 + 14, cy0 + 14, cw - 28, ch - 28);

    var ax = cx0 + cw * 0.08;
    var ay = cy0 + ch * 0.08;
    var aw = cw * 0.84;
    var ah = ch * 0.84;

    /* Bright white artboard */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ax, ay, aw, ah);

    var layerA = clamp01((p - 0.05) / 0.22);
    var layerB = clamp01((p - 0.18) / 0.28);
    var layerC = clamp01((p - 0.38) / 0.28);
    var layerD = clamp01((p - 0.55) / 0.3);

    /* Brand header bar */
    ctx.globalAlpha = layerA;
    ctx.fillStyle = "#075B2D";
    ctx.fillRect(ax, ay, aw, ah * 0.12);
    ctx.fillStyle = "#F4E6C8";
    ctx.font = "600 16px IBM Plex Sans, sans-serif";
    ctx.fillText("POYTARA", ax + aw * 0.04, ay + ah * 0.08);

    /* Hero with product blob + copy */
    ctx.globalAlpha = layerB;
    var hy = ay + ah * 0.14;
    var hh = ah * 0.46;
    ctx.fillStyle = "#E8F5EE";
    ctx.fillRect(ax + aw * 0.04, hy, aw * 0.92, hh);
    ctx.fillStyle = "#075B2D";
    ctx.font = "600 22px IBM Plex Sans, sans-serif";
    ctx.fillText("Nutrição que", ax + aw * 0.08, hy + hh * 0.32);
    ctx.fillText("acompanha cada fase", ax + aw * 0.08, hy + hh * 0.48);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "400 12px IBM Plex Sans, sans-serif";
    ctx.fillText("Ração premium com identidade própria.", ax + aw * 0.08, hy + hh * 0.66);
    /* Product disc */
    ctx.fillStyle = "#0A7A3C";
    ctx.beginPath();
    ctx.arc(ax + aw * 0.78, hy + hh * 0.5, hh * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#F4E6C8";
    ctx.beginPath();
    ctx.arc(ax + aw * 0.78, hy + hh * 0.5, hh * 0.14, 0, Math.PI * 2);
    ctx.fill();

    /* Cards row */
    ctx.globalAlpha = layerC;
    var cy = ay + ah * 0.64;
    for (var ci = 0; ci < 3; ci++) {
      ctx.fillStyle = ci === 1 ? "#075B2D" : "#F3F6F4";
      roundRect(ax + aw * (0.04 + ci * 0.31), cy, aw * 0.28, ah * 0.16, 6);
      ctx.fill();
      ctx.fillStyle = ci === 1 ? "#F4E6C8" : "#075B2D";
      ctx.font = "600 11px IBM Plex Sans, sans-serif";
      ctx.fillText(["Cães", "Gatos", "Onde comprar"][ci], ax + aw * (0.07 + ci * 0.31), cy + ah * 0.1);
    }

    /* CTA */
    ctx.globalAlpha = layerD;
    ctx.fillStyle = "#0D99FF";
    roundRect(ax + aw * 0.62, ay + ah * 0.84, aw * 0.3, ah * 0.1, 6);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 12px IBM Plex Sans, sans-serif";
    ctx.fillText("Ver catálogo", ax + aw * 0.68, ay + ah * 0.905);
    ctx.globalAlpha = 1;

    var curT = clamp01((p - 0.05) / 0.9);
    var curX = ax + aw * (0.2 + curT * 0.5);
    var curY = ay + ah * (0.25 + curT * 0.45);
    ctx.save();
    ctx.translate(curX, curY);
    ctx.rotate((-45 * Math.PI) / 180);
    ctx.globalAlpha = curT > 0 ? 1 : 0;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(11, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    /* Screen-on flash: white wash only inside the panel (feeds bloom from the display) */
    if (flash > 0.02) {
      ctx.globalAlpha = Math.min(1, flash * 1.15);
      ctx.fillStyle = "#f7f9ff";
      ctx.fillRect(inset, inset, lw - inset * 2, lh - inset * 2);
      ctx.globalAlpha = 1;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tex.needsUpdate = true;
  }

  paintFrame(0);
  return { texture: tex, paintFrame: paintFrame, canvas: paint };
}

function bindScreenTexture(root, figma) {
  var screenMesh = root.getObjectByName("screen");
  if (!screenMesh) {
    return null;
  }

  /*
    Tevy screen: unit quad on XZ, normal -Y, node scale ~0.148.
    Overlay inherits lid motion as child of `screen`.
  */
  var plane = new THREE.PlaneGeometry(2, 1.2499160766601562, 1, 1);
  plane.rotateX(Math.PI / 2);
  var mat = new THREE.MeshBasicMaterial({
    map: figma.texture,
    color: new THREE.Color(1.14, 1.14, 1.16),
    toneMapped: false,
    side: THREE.FrontSide,
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
  /* Slight push along -Y (screen normal) so it sits above glass */
  overlay.position.set(0, -0.004, 0);
  overlay.renderOrder = 3;
  screenMesh.add(overlay);

  /* Reflective dark glass + emissive idle (mock drives brightness) */
  var glass = new THREE.MeshPhysicalMaterial({
    color: 0x040405,
    metalness: 0.04,
    roughness: 0.06,
    transmission: 0.0,
    thickness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.05,
    emissive: new THREE.Color(0x1a2230),
    emissiveIntensity: 0.35,
    side: THREE.FrontSide,
  });
  screenMesh.material = glass;
  screenMesh.visible = true;

  /* Bezel / lid shell already separate — deepen lid_shell edge readability */
  var lidShell = root.getObjectByName("lid_shell");
  if (lidShell && lidShell.material) {
    var lm = lidShell.material;
    if (lm.color) lm.color.multiplyScalar(0.92);
  }

  state.stripeFix = "tevy-screen-xz-v030";
  return overlay;
}

function loadPbrMaps(base, names) {
  var loader = new THREE.TextureLoader();
  var out = {};
  names.forEach(function (n) {
    var t = loader.load(base + n + ".jpg");
    t.colorSpace = n === "albedo" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    out[n] = t;
  });
  return out;
}

function carveStoneNoise(geo, amp) {
  var pos = geo.attributes.position;
  var i;
  var v = new THREE.Vector3();
  for (i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    var n =
      Math.sin(v.x * 7.3 + v.z * 5.1) * 0.35 +
      Math.sin(v.x * 13.7 - v.z * 9.2) * 0.22 +
      Math.sin((v.x + v.z) * 21.0) * 0.12;
    /* Chip edges: stronger near outer radius */
    var r = Math.hypot(v.x, v.z);
    var edge = THREE.MathUtils.smoothstep(0.72, 1.05, r / Math.max(0.001, geo.parameters ? geo.parameters.radiusTop || geo.parameters.radius || 1 : 1));
    v.y += n * amp * (0.35 + edge);
    v.x += n * amp * 0.15 * edge;
    v.z += n * amp * 0.12 * edge;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function makePedestal(maps) {
  var group = new THREE.Group();
  group.name = "stonePedestal";
  var mat = new THREE.MeshPhysicalMaterial({
    color: 0xd8cfc0,
    map: maps.albedo || null,
    normalMap: maps.normal || null,
    roughnessMap: maps.roughness || null,
    aoMap: maps.ao || null,
    roughness: 0.92,
    metalness: 0.02,
    clearcoat: 0.04,
    clearcoatRoughness: 0.85,
    envMapIntensity: 0.35,
  });
  if (mat.map) mat.map.repeat.set(1.6, 1.6);
  if (mat.normalMap) mat.normalMap.repeat.set(1.6, 1.6);
  if (mat.roughnessMap) mat.roughnessMap.repeat.set(1.6, 1.6);
  if (mat.aoMap) mat.aoMap.repeat.set(1.6, 1.6);

  /* Plinth stack — worn temple pedestal */
  var baseGeo = carveStoneNoise(new THREE.CylinderGeometry(1.55, 1.72, 0.28, 48, 4), 0.045);
  var midGeo = carveStoneNoise(new THREE.CylinderGeometry(1.28, 1.48, 0.55, 48, 6), 0.055);
  var topGeo = carveStoneNoise(new THREE.CylinderGeometry(1.42, 1.22, 0.22, 48, 3), 0.035);
  var capGeo = carveStoneNoise(new THREE.CylinderGeometry(1.18, 1.35, 0.12, 40, 2), 0.02);

  var base = new THREE.Mesh(baseGeo, mat);
  base.position.y = 0.14;
  base.castShadow = true;
  base.receiveShadow = true;
  var mid = new THREE.Mesh(midGeo, mat.clone());
  mid.position.y = 0.55;
  mid.castShadow = true;
  mid.receiveShadow = true;
  var top = new THREE.Mesh(topGeo, mat.clone());
  top.position.y = 0.95;
  top.castShadow = true;
  top.receiveShadow = true;
  var cap = new THREE.Mesh(capGeo, mat.clone());
  cap.position.y = 1.12;
  cap.castShadow = true;
  cap.receiveShadow = true;
  /* Subtle moss tint on lower ring */
  if (base.material && base.material.color) base.material.color.set(0xc9c2ae);

  group.add(base, mid, top, cap);
  group.userData.topY = 1.18;
  group.userData.radius = 1.35;
  return group;
}

function makeCaveShell(maps) {
  var group = new THREE.Group();
  group.name = "caveShell";
  var caveMat = new THREE.MeshStandardMaterial({
    color: 0xcbb89a,
    map: maps.albedo || null,
    normalMap: maps.normal || null,
    roughnessMap: maps.roughness || null,
    roughness: 0.95,
    metalness: 0,
    side: THREE.BackSide,
    envMapIntensity: 0.2,
  });
  if (caveMat.map) caveMat.map.repeat.set(3, 2);
  if (caveMat.normalMap) caveMat.normalMap.repeat.set(3, 2);
  if (caveMat.roughnessMap) caveMat.roughnessMap.repeat.set(3, 2);

  var dome = new THREE.Mesh(new THREE.SphereGeometry(28, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.72), caveMat);
  dome.position.y = 4;
  dome.name = "caveDome";
  group.add(dome);

  /* Opening / oculus — bright disc above */
  var oculus = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffe2b0,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      toneMapped: false,
      depthWrite: false,
    })
  );
  oculus.rotation.x = Math.PI / 2;
  oculus.position.set(-2.5, 22, -4);
  oculus.name = "caveOculus";
  group.add(oculus);

  /* Soft god-ray shafts (additive quads) */
  var rayMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  var ri;
  for (ri = 0; ri < 5; ri++) {
    var ray = new THREE.Mesh(new THREE.PlaneGeometry(1.4 + ri * 0.35, 18 + ri * 1.2), rayMat.clone());
    ray.material.opacity = 0.045 + ri * 0.008;
    ray.position.set(-1.2 + ri * 0.55, 12, -1.5 + ri * 0.4);
    ray.rotation.z = -0.18 + ri * 0.05;
    ray.rotation.y = 0.35;
    ray.name = "godRay" + ri;
    group.add(ray);
  }

  /* Left shadow veil — keeps copy legible over bright cave */
  var veil = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 18),
    new THREE.MeshBasicMaterial({
      color: 0x1a1410,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    })
  );
  veil.position.set(-7.5, 4, 2);
  veil.rotation.y = 0.35;
  veil.name = "leftCopyVeil";
  group.add(veil);

  return group;
}

function makeStudioFloor() {
  /*
    v0.4.0 cave + pedestal. No black void floor reflection.
    Pedestal/cave textures loaded sync via TextureLoader (JPG).
  */
  var group = new THREE.Group();
  group.name = "cavePedestalWorld";

  var pedMaps = loadPbrMaps(pedestalTexBase, ["albedo", "normal", "roughness", "ao"]);
  var caveMaps = loadPbrMaps(caveTexBase, ["albedo", "normal", "roughness"]);
  var pedestal = makePedestal(pedMaps);
  pedestal.position.set(1.15, 0, -0.35);
  pedestal.scale.setScalar(1.05);
  group.add(pedestal);

  var cave = makeCaveShell(caveMaps);
  group.add(cave);

  /* Warm stone ground under pedestal (no mirror reflection) */
  var ground = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64),
    new THREE.MeshStandardMaterial({
      color: 0xb5a68c,
      map: pedMaps.albedo || null,
      roughness: 0.96,
      metalness: 0,
    })
  );
  if (ground.material.map) ground.material.map.repeat.set(4, 4);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.001;
  ground.receiveShadow = true;
  ground.name = "caveGround";
  group.add(ground);

  /* Contact shadow under notebook — soft disk on pedestal top */
  var contact = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 48),
    new THREE.MeshBasicMaterial({
      color: 0x1a120c,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(1.15, pedestal.userData.topY * 1.05 + 0.002, -0.35);
  contact.name = "pedestalContact";
  group.add(contact);

  /* Dissolve wire placeholder (load only) */
  var floorWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.4, 1.55, 1.1, 12)),
    new THREE.LineBasicMaterial({
      color: 0xc4b59a,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    })
  );
  floorWire.position.copy(pedestal.position);
  floorWire.position.y = 0.55;
  floorWire.name = "floorWire";
  group.add(floorWire);

  return {
    group: group,
    floorWire: floorWire,
    ground: ground,
    contact: contact,
    glow: null,
    softRefl: null,
    pedestal: pedestal,
    cave: cave,
    pedestalTopY: pedestal.userData.topY * 1.05,
  };
}

function makeDustTexture() {
  var c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  var g = c.getContext("2d");
  var grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(220,230,255,0.55)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  var tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeParticles(count) {
  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(count * 3);
  var i;
  for (i = 0; i < count; i++) {
    /* Warm dust in god-ray cone above pedestal / notebook */
    pos[i * 3] = 1.15 + (Math.random() - 0.35) * 1.4;
    pos[i * 3 + 1] = Math.random() * 4.8 + 1.2;
    pos[i * 3 + 2] = -0.35 + (Math.random() - 0.4) * 1.3;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.PointsMaterial({
    size: 0.032,
    map: makeDustTexture(),
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffe2b0,
    sizeAttenuation: true,
    toneMapped: false,
  });
  var pts = new THREE.Points(geo, mat);
  pts.name = "studioDust";
  pts.frustumCulled = false;
  return pts;
}

function shadeKeyAlbedo(map) {
  /* Push key legends darker/matte; keep aluminum midtones Space Gray */
  if (!map || !map.image) {
    return map;
  }
  try {
    var img = map.image;
    var w = img.width || 0;
    var h = img.height || 0;
    if (!w || !h) {
      return map;
    }
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    var id = ctx.getImageData(0, 0, w, h);
    var d = id.data;
    var i;
    for (i = 0; i < d.length; i += 4) {
      var r = d[i];
      var g = d[i + 1];
      var b = d[i + 2];
      var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 70) {
        /* Keys / legends — matte black */
        d[i] = Math.round(Math.min(r, g, b) * 0.12);
        d[i + 1] = d[i];
        d[i + 2] = d[i];
      } else {
        /* Chassis aluminum — Space Black */
        d[i] = Math.round(r * 0.18 + 4);
        d[i + 1] = Math.round(g * 0.19 + 4);
        d[i + 2] = Math.round(b * 0.22 + 5);
      }
    }
    ctx.putImageData(id, 0, 0);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = map.flipY;
    tex.wrapS = map.wrapS;
    tex.wrapT = map.wrapT;
    tex.needsUpdate = true;
    return tex;
  } catch (err) {
    return map;
  }
}

function boostKeyRoughness(roughMap, colorMap) {
  if (!colorMap || !colorMap.image) {
    return roughMap;
  }
  try {
    var img = colorMap.image;
    var w = img.width || 0;
    var h = img.height || 0;
    if (!w || !h) {
      return roughMap;
    }
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d");
    if (roughMap && roughMap.image) {
      ctx.drawImage(roughMap.image, 0, 0, w, h);
    } else {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
    }
    var base = ctx.getImageData(0, 0, w, h);
    var cc = document.createElement("canvas");
    cc.width = w;
    cc.height = h;
    var cctx = cc.getContext("2d");
    cctx.drawImage(img, 0, 0);
    var col = cctx.getImageData(0, 0, w, h).data;
    var d = base.data;
    var i;
    for (i = 0; i < d.length; i += 4) {
      var lum = 0.2126 * col[i] + 0.7152 * col[i + 1] + 0.0722 * col[i + 2];
      if (lum < 55) {
        /* G channel = roughness in ORM / rough maps */
        d[i + 1] = Math.max(d[i + 1], 230);
        d[i] = Math.min(d[i], 40);
      } else {
        d[i + 1] = Math.min(255, Math.max(d[i + 1], 110));
      }
    }
    ctx.putImageData(base, 0, 0);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace;
    tex.flipY = roughMap ? roughMap.flipY : false;
    tex.needsUpdate = true;
    return tex;
  } catch (err) {
    return roughMap;
  }
}

function upgradeChassisMaterials(root, figmaTex) {
  root.traverse(function (o) {
    if (!o.isMesh || !o.material) {
      return;
    }
    if (o.name === "screenOverlay" || o.name === "screenFlashPlane" || o.name === "hingeBar") {
      return;
    }
    if (o.name === "screen") {
      return;
    }
    var mats = Array.isArray(o.material) ? o.material : [o.material];
    var next = mats.map(function (m) {
      if (!m || m.map === figmaTex) {
        return m;
      }
      var n = (o.name || "").toLowerCase();
      var isBase = n === "base" || n.indexOf("base") >= 0;
      var isLid = n === "lid_shell" || n.indexOf("lid") >= 0;
      var colorMap = shadeKeyAlbedo(m.map || null);
      var roughMap = boostKeyRoughness(m.roughnessMap || null, m.map || colorMap);
      /* Space Gray/Black aluminum — slightly lifted base so soft key reads on palmrest */
      var baseCol = new THREE.Color(isBase ? 0x0c0e11 : 0x060708);
      if (isLid) baseCol.set(0x050607);
      var phys = new THREE.MeshPhysicalMaterial({
        color: baseCol,
        map: colorMap,
        normalMap: m.normalMap || null,
        roughnessMap: roughMap,
        metalnessMap: null,
        aoMap: m.aoMap || null,
        metalness: isBase ? 0.68 : 0.8,
        roughness: isBase ? 0.62 : 0.5,
        clearcoat: 0.1,
        clearcoatRoughness: 0.68,
        envMapIntensity: isBase ? 0.22 : 0.16,
        reflectivity: 0.32,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0,
      });
      if (isBase) {
        phys.userData = phys.userData || {};
        phys.userData.poytaraDeck = true;
      }
      if (phys.map) {
        phys.map.colorSpace = THREE.SRGBColorSpace;
      }
      return phys;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
}

function addDarkHingeBar(root) {
  var lid = root.getObjectByName("lid");
  if (!lid) {
    return null;
  }
  var bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0038, 0.0038, 0.308, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0x050506,
      metalness: 0.92,
      roughness: 0.72,
      clearcoat: 0.55,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.1,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    })
  );
  bar.name = "hingeBar";
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0, 0);
  lid.add(bar);
  return bar;
}

function makeVignetteGrainShader() {
  return {
    uniforms: {
      tDiffuse: { value: null },
      vignette: { value: 0.85 },
      grain: { value: 0.004 },
      time: { value: 0 },
    },
    vertexShader: [
      "varying vec2 vUv;",
      "void main() {",
      "  vUv = uv;",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D tDiffuse;",
      "uniform float vignette;",
      "uniform float grain;",
      "uniform float time;",
      "varying vec2 vUv;",
      "void main() {",
      "  vec4 c = texture2D(tDiffuse, vUv);",
      "  float d = distance(vUv, vec2(0.5));",
      "  float vig = smoothstep(1.12, 0.22, d * (0.5 + vignette));",
      "  c.rgb *= vig;",
      "  float n = fract(sin(dot(vUv * (time + 12.7), vec2(12.9898, 78.233))) * 43758.5453);",
      "  c.rgb += (n - 0.5) * grain;",
      "  gl_FragColor = c;",
      "}",
    ].join("\n"),
  };
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

function makeEdgeWires(root) {
  var group = new THREE.Group();
  group.name = "edgeWires";
  root.traverse(function (o) {
    if (!o.isMesh || !o.geometry || o.name === "screenOverlay") {
      return;
    }
    var n = (o.name || "").toLowerCase();
    if (n.indexOf("screen") >= 0) {
      return;
    }
    var pn = "";
    var cur = o.parent;
    var depth = 0;
    while (cur && depth < 6) {
      pn += " " + String(cur.name || "").toLowerCase();
      cur = cur.parent;
      depth++;
    }
    if (
      n.indexOf("key") >= 0 ||
      n.indexOf("keyboard") >= 0 ||
      n.indexOf("caps") >= 0 ||
      n.indexOf("touch_bar") >= 0 ||
      pn.indexOf("keyboard") >= 0 ||
      pn.indexOf("caps_lock") >= 0 ||
      pn.indexOf("touch_bar") >= 0
    ) {
      return;
    }
    try {
      var eg = new THREE.EdgesGeometry(o.geometry, 28);
      var line = new THREE.LineSegments(
        eg,
        new THREE.LineBasicMaterial({
          color: 0xd8e6ff,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          toneMapped: false,
        })
      );
      /* Identity in mesh space — EdgesGeometry already matches o.geometry */
      o.add(line);
      line.userData.isEdgeWire = true;
      group.userData._lines = group.userData._lines || [];
      group.userData._lines.push(line);
    } catch (err) {}
  });
  return group;
}

function setEdgeWireOpacity(edgeGroup, amount) {
  var a = clamp01(amount);
  var lines = (edgeGroup && edgeGroup.userData && edgeGroup.userData._lines) || [];
  lines.forEach(function (line) {
    if (line.material) {
      if (a <= 0.02) {
        line.material.opacity = 0;
        line.visible = false;
      } else {
        line.material.opacity = 0.08 + 0.7 * a;
        line.visible = true;
      }
    }
  });
  if (edgeGroup) edgeGroup.visible = a > 0.02;
}

function purgeEdgeWires(root) {
  if (!root) return;
  root.traverse(function (o) {
    if (o.isLineSegments || o.userData.isEdgeWire) {
      o.visible = false;
      if (o.material) o.material.opacity = 0;
    }
  });
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
  if (p >= 0.999) {
    el.textContent = finalText;
    return;
  }
  /* Deterministic glyphs — no Math.random loop that never settles */
  var glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var revealed = Math.floor(p * finalText.length + 0.0001);
  var bucket = Math.floor(p * 48);
  var out = "";
  for (var i = 0; i < finalText.length; i++) {
    var ch = finalText.charAt(i);
    if (ch === " " || ch === "." || ch === "," || ch === "—" || ch === "-") {
      out += ch;
      continue;
    }
    if (i < revealed) {
      out += ch;
    } else {
      out += glyphs.charAt((i * 17 + bucket * 3) % glyphs.length);
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
      preserveDrawingBuffer: true,
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
  renderer.toneMappingExposure = isMobile ? 1.58 : 1.18;
  renderer.shadowMap.enabled = !state.gpuOffLikely;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x2a2218, 1);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a3126);
  scene.fog = new THREE.FogExp2(0x4a3f32, 0.018);

  /* ~50–85mm feel */
  var camera = new THREE.PerspectiveCamera(26, 1, 0.05, 200);
  camera.position.set(6.4, 3.8, 7.6);

  var pmrem = null;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
  } catch (err) {
    pmrem = null;
  }

  var hemi = new THREE.HemisphereLight(0xffe6c4, 0x3a2e22, 0.42);
  scene.add(hemi);

  /* Warm key from cave oculus */
  var key = new THREE.DirectionalLight(0xffd9a8, 1.35);
  key.position.set(-2.2, 14.5, -3.5);
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

  /* Warm rim — Space Black readable against sand/ochre cave */
  var rim = new THREE.DirectionalLight(0xffe8c8, isMobile ? 2.4 : 2.0);
  rim.position.set(-6.2, 4.6, -6.2);
  scene.add(rim);

  var rimHinge = new THREE.DirectionalLight(0xf0dcc0, isMobile ? 1.6 : 1.35);
  rimHinge.position.set(4.2, 1.4, -5.2);
  scene.add(rimHinge);

  var rimLid = new THREE.DirectionalLight(0xfff0d8, isMobile ? 1.7 : 1.45);
  rimLid.position.set(0.5, 5.5, -3.8);
  scene.add(rimLid);

  /* Thin rim on base front lip + side — keeps chassis readable in final (same as close) */
  var rimFront = new THREE.DirectionalLight(0xe8d8c0, isMobile ? 1.4 : 1.15);
  rimFront.position.set(2.4, 0.55, 7.2);
  scene.add(rimFront);

  /* Soft fill from left (copy side stays darker) */
  var caveFill = new THREE.DirectionalLight(0x8a7a68, 0.35);
  caveFill.position.set(-8, 3.5, 4);
  scene.add(caveFill);

  /* Soft grazing key on deck — FINAL only (close stays v0.3.3) */
  var deckKey = new THREE.DirectionalLight(0xf4f0e8, 0);
  deckKey.position.set(0.55, 6.4, 6.4);
  deckKey.target.position.set(0.2, 0.06, 0.45);
  scene.add(deckKey);
  scene.add(deckKey.target);
  var deckFill = new THREE.DirectionalLight(0xc8d2e0, 0);
  deckFill.position.set(-2.2, 2.8, 5.0);
  deckFill.target.position.set(0.1, 0.05, 0.35);
  scene.add(deckFill);
  scene.add(deckFill.target);
  /* Palmrest spot — close cima/frente (physically-correct units need near throw) */
  var deckSpot = new THREE.SpotLight(0xf2eee6, 0, 2.8, Math.PI / 4.2, 0.62, 1.15);
  deckSpot.position.set(0.4, 1.55, 1.85);
  deckSpot.target.position.set(0.35, 0.08, 0.7);
  scene.add(deckSpot);
  scene.add(deckSpot.target);

  var fill = new THREE.DirectionalLight(0x2a3340, 0.04);
  fill.position.set(-3.2, 2.2, 4.2);
  scene.add(fill);

  /* Screen bounce onto keys only — decays toward palmrest/front */
  var screenBounce = new THREE.SpotLight(0xe8f0ff, 0, 2.4, Math.PI / 16, 0.72, 2.4);
  screenBounce.position.set(0, 1.6, 1.1);
  screenBounce.target.position.set(0, 0.12, 0.05);
  scene.add(screenBounce);
  scene.add(screenBounce.target);

  var studio = makeStudioFloor();
  scene.add(studio.group);

  /* Mobile: fewer motes so keyboard stays clean (desktop count locked) */
  var particleCount = reduced ? 0 : isMobile ? 14 : state.gpuOffLikely ? 72 : 120;
  var dust = particleCount > 0 ? makeParticles(particleCount) : null;
  if (dust) {
    scene.add(dust);
  }

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

  /* Cave HDRI — reflections; warm fog/background painted by applyFinalStudioLook */
  if (pmrem) {
    try {
      var hdrTex = await new RGBELoader(manager).loadAsync(hdriUrl);
      hdrTex.mapping = THREE.EquirectangularReflectionMapping;
      var envRT = pmrem.fromEquirectangular(hdrTex);
      scene.environment = envRT.texture;
      scene.environmentIntensity = isMobile ? 0.38 : 0.45;
      scene.background = new THREE.Color(0x3a3126);
      hdrTex.dispose();
      pmrem.dispose();
      state.envSource = "polyhaven-cave-wall";
    } catch (err) {
      console.warn("hdri-load", err);
      try {
        var envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = envTex;
        scene.environmentIntensity = 0.4;
        pmrem.dispose();
        state.envSource = "room-fallback";
      } catch (err2) {
        setStatus("env-map skipped");
      }
    }
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

  /* Real-world meters → scene units (~3.1 wide like prior framing) */
  var MODEL_SCALE = 10;
  root.scale.setScalar(MODEL_SCALE);

  var macbook = root.getObjectByName("laptop") || root;
  macbook.position.set(0, 0, 0);
  macbook.rotation.set(0, 0, 0);

  var bevels = root.getObjectByName("lid");
  applyLidPose(bevels, poses, "closed");
  state.lidPose = "closed";

  var figma = createFigmaTexture();
  var screenOverlay = bindScreenTexture(root, figma);
  var screenFlashPlane = null;
  if (screenOverlay) {
    screenFlashPlane = new THREE.Mesh(
      screenOverlay.geometry.clone(),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    screenFlashPlane.name = "screenFlashPlane";
    /* Child of overlay → tracks lid open; slight lift along local normal */
    screenFlashPlane.position.set(0, 0.003, 0);
    screenFlashPlane.scale.set(0.92, 0.92, 0.92);
    screenFlashPlane.renderOrder = 4;
    screenOverlay.add(screenFlashPlane);
  }
  if (figmaScreen) {
    document.body.classList.remove("is-figma-live");
  }

  root.traverse(function (o) {
    if (o.isMesh) {
      o.castShadow = !state.gpuOffLikely;
      o.receiveShadow = !state.gpuOffLikely;
    }
  });
  upgradeChassisMaterials(root, figma.texture);
  addDarkHingeBar(root);

  var matEntries = captureSolidMaterials(root);
  var edgeWires = makeEdgeWires(root);
  setWireframeMix(matEntries, 1);
  setEdgeWireOpacity(edgeWires, 1);

  scene.add(root);
  placeholder.visible = false;

  var box = new THREE.Box3().setFromObject(macbook);
  var center = box.getCenter(new THREE.Vector3());
  var size = box.getSize(new THREE.Vector3());
  macbook.position.sub(center);
  macbook.position.y += size.y * 0.42;

  /* Seat notebook on carved pedestal (v0.4.0).
     root.scale = MODEL_SCALE → convert world deltas to local macbook.position. */
  var pedX = 1.15;
  var pedZ = -0.35;
  var pedTop = studio.pedestalTopY || 1.18;
  macbook.position.x += pedX / MODEL_SCALE;
  macbook.position.z += pedZ / MODEL_SCALE;
  box.setFromObject(macbook);
  macbook.position.y += (pedTop - box.min.y + 0.012) / MODEL_SCALE;
  if (studio.contact) {
    studio.contact.position.set(pedX, pedTop + 0.004, pedZ);
  }
  if (studio.pedestal) {
    studio.pedestal.position.set(pedX, 0, pedZ);
  }

  applyLidPose(bevels, poses, "open");
  box.setFromObject(macbook);
  size = box.getSize(new THREE.Vector3());
  var targetY = box.min.y + size.y * 0.36;
  applyLidPose(bevels, poses, "closed");
  state.lidPose = "closed";

  /* Aim deck lights at palmrest (front half of base) after recentering */
  (function aimDeckLights() {
    var baseMesh = root.getObjectByName("base");
    var aimBox = new THREE.Box3();
    if (baseMesh) aimBox.setFromObject(baseMesh);
    else aimBox.setFromObject(macbook);
    var palm = new THREE.Vector3(
      aimBox.min.x + (aimBox.max.x - aimBox.min.x) * 0.62,
      aimBox.min.y + (aimBox.max.y - aimBox.min.y) * 0.92,
      aimBox.min.z + (aimBox.max.z - aimBox.min.z) * 0.72
    );
    if (deckKey && deckKey.target) {
      deckKey.target.position.copy(palm);
      deckKey.position.set(palm.x + 0.35, palm.y + 2.4, palm.z + 2.1);
      deckKey.target.updateMatrixWorld();
    }
    if (deckFill && deckFill.target) {
      deckFill.target.position.copy(palm);
      deckFill.position.set(palm.x - 1.6, palm.y + 1.4, palm.z + 1.6);
      deckFill.target.updateMatrixWorld();
    }
    if (deckSpot && deckSpot.target) {
      deckSpot.target.position.copy(palm);
      deckSpot.position.set(palm.x + 0.15, palm.y + 1.15, palm.z + 1.05);
      deckSpot.target.updateMatrixWorld();
    }
  })();

  var controls = null;
  if (mode === "orbit") {
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.target.set(pedX, targetY, pedZ);
    controls.minDistance = Math.max(size.x * 0.55, 2.2);
    controls.maxDistance = Math.max(size.x * 4.5, 24);
    controls.minPolarAngle = THREE.MathUtils.degToRad(22);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
    controls.minAzimuthAngle = THREE.MathUtils.degToRad(-80);
    controls.maxAzimuthAngle = THREE.MathUtils.degToRad(80);
    controls.update();
  }

  var camTarget = new THREE.Vector3(pedX, targetY, pedZ);
  var camFar = new THREE.Vector3();
  var camNear = new THREE.Vector3();
  var camFace = new THREE.Vector3();
  var camFaceTarget = new THREE.Vector3();
  var camFlash = new THREE.Vector3();
  var camFlashTarget = new THREE.Vector3();
  var faceDist = 1;

  function frameCamera(distScale, pose) {
    var r = 0.5 * Math.hypot(size.x, size.y * 1.28, size.z);
    var vF = THREE.MathUtils.degToRad(camera.fov);
    var aspect = Math.max(camera.aspect, 0.35);
    var hF = 2 * Math.atan(Math.tan(vF / 2) * aspect);
    var fit = aspect < 0.7 ? 1.78 : 1.34;
    var dist = (r / Math.sin(Math.min(vF, hF) / 2)) * fit * (distScale || 1);
    var dir =
      pose === "close"
        ? new THREE.Vector3(0.95, 0.1, 0.28).normalize()
        : new THREE.Vector3(0.62, 0.28, 0.72).normalize();
    camera.position.copy(camTarget).addScaledVector(dir, dist);
    if (pose === "close") {
      camera.position.y = Math.min(camera.position.y, camTarget.y + size.y * 0.22);
    }
    camera.lookAt(camTarget);
    return dist;
  }

  /*
    Final frame (ref ~1024×498), pulled back vs v0.2.1:
    - Frontal; notebook RIGHT; left half black for copy.
    - Desktop: moldura top ~8%, screen base ~80%, trackpad ~88–90%, floor glow below.
    - Mobile: smaller/higher notebook so title never overlaps keyboard.
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
    screenRight.crossVectors(screenUp, normal).normalize();

    var geo = screenOverlay.geometry;
    var localW = (geo && geo.parameters && geo.parameters.width) || size.x * 0.9;
    var localH = (geo && geo.parameters && geo.parameters.height) || size.z * 0.7;
    var worldScale = new THREE.Vector3();
    screenOverlay.getWorldScale(worldScale);
    var screenWorldW = Math.abs(localW * worldScale.x);
    var screenWorldH = Math.abs(localH * Math.max(worldScale.y, worldScale.z));

    var vFov = THREE.MathUtils.degToRad(camera.fov);
    /*
      Desktop vertical (v0.2.4): trackpad ~88–90%.
      Desktop horizontal (v0.2.3): left display edge ~50%, right side cropped out.
      Mobile: notebook above, info below.
    */
    /*
      Desktop = v0.3.0 framing (fillH 0.48, ndcY 0.22 → left edge ~50%, top ~8%)
      with a tiny pull so front/trackpad lands ~88–90%.
      Mobile: keep upper/mid + copy below.
    */
    /* Desktop LOCKED v0.3.4: fillH 0.515 / ndcY 0.30 / faceDist×0.92 / right crop */
    var fillH = isMobile ? 0.30 : 0.515;
    faceDist = screenWorldH / (fillH * 2 * Math.tan(vFov / 2));

    var ndcY = isMobile ? -0.02 : 0.30;
    var vertShift = ndcY * faceDist * Math.tan(vFov / 2);

    if (isMobile) {
      /*
        v0.3.5: whole chassis between header (~50px) and info (~725px).
        Side margins 12–20px; zero text overlap. Camera slightly higher
        to foreshorten lid height so width+height fit the safe band.
        Desktop path untouched below.
      */
      var chassisBox = new THREE.Box3().setFromObject(macbook);
      var cSize = new THREE.Vector3();
      var cCenter = new THREE.Vector3();
      chassisBox.getSize(cSize);
      chassisBox.getCenter(cCenter);
      var aspect = Math.max(0.2, camera.aspect || (390 / 844));
      var hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
      /*
        Proven v0.3.5 mobile fit (whole chassis, sides clear, no text overlap).
        Width-led; slight extra pullback so bezel/sidebar never kiss the edge.
        Desktop path untouched below.
      */
      var fillW = 0.84;
      var distW = (cSize.x * 0.5) / (Math.tan(hFov / 2) * fillW);
      var distH = (cSize.y * 0.5) / (Math.tan(vFov / 2) * 0.66);
      faceDist = Math.max(distW, distH) * 1.14;
      camFaceTarget.copy(cCenter).addScaledVector(screenUp, cSize.y * 0.05);
      camFace.copy(camFaceTarget).addScaledVector(normal, faceDist);
      camFace.addScaledVector(screenUp, faceDist * 0.02);
      if (!state._frozenMobileFace) {
        state._frozenMobileFace = camFace.clone();
        state._frozenMobileFaceTarget = camFaceTarget.clone();
        state._frozenMobileFaceDist = faceDist;
      } else {
        camFace.copy(state._frozenMobileFace);
        camFaceTarget.copy(state._frozenMobileFaceTarget);
        faceDist = state._frozenMobileFaceDist;
      }
    } else {
      var leftEdge = new THREE.Vector3()
        .copy(center)
        .addScaledVector(screenRight, -screenWorldW * 0.5);
      camFaceTarget
        .copy(leftEdge)
        .addScaledVector(screenRight, screenWorldW * 0.02)
        .addScaledVector(screenUp, -vertShift);
      /* Dolly in ~10%; right crop; trackpad near bottom */
      camFace.copy(camFaceTarget).addScaledVector(normal, faceDist * 0.92);
      camFace.addScaledVector(screenUp, faceDist * 0.01);
      camFace.addScaledVector(screenRight, -screenWorldW * 0.28);
      camFaceTarget.addScaledVector(screenRight, -screenWorldW * 0.1);
      if (!state.finalCamLocked) {
        state._frozenFace = camFace.clone();
        state._frozenFaceTarget = camFaceTarget.clone();
        state._frozenFaceDist = faceDist;
        state.finalCamLocked = true;
      } else if (state._frozenFace) {
        camFace.copy(state._frozenFace);
        camFaceTarget.copy(state._frozenFaceTarget);
        faceDist = state._frozenFaceDist;
      }
    }

    /* Flash still: mid lid+screen (same distance class as face, not camNear) */
    camFlashTarget.copy(center).addScaledVector(screenUp, screenWorldH * 0.02);
    camFlash.copy(camFlashTarget).addScaledVector(normal, faceDist * 1.05);
    camFlash.addScaledVector(screenUp, faceDist * 0.1);
    camFlash.addScaledVector(screenRight, -screenWorldW * 0.04);
  }

  function applyFinalStudioLook(amount) {
    var a = clamp01(amount);
    /* Warm cave atmosphere — sand/ochre fog, no black void */
    scene.background = new THREE.Color(0x3a3126);
    renderer.setClearColor(0x2a2218, 1);
    scene.fog = new THREE.FogExp2(0x4a3f32, 0.014 + 0.008 * a);
    renderer.toneMappingExposure = isMobile ? 1.45 : 1.22 + 0.06 * a;
    if (studio.group) {
      if (studio.floorWire) studio.floorWire.visible = false;
      if (studio.ground) studio.ground.visible = true;
      if (studio.contact) {
        studio.contact.visible = true;
        if (studio.contact.material) {
          studio.contact.material.opacity = 0.38 + 0.08 * a;
        }
      }
      if (studio.cave) studio.cave.visible = true;
      if (studio.pedestal) studio.pedestal.visible = true;
    }
    if (screenOverlay && screenOverlay.material) {
      screenOverlay.material.opacity = Math.max(screenOverlay.material.opacity, 0.001);
    }
  }

  /* Start close/low/lateral; camNear = mid for lid; camFace = final */
  var nearDist = frameCamera(0.72, "close");
  camFar.copy(camera.position); /* reuse camFar as START close */
  frameCamera(0.95, "near");
  camNear.copy(camera.position);
  computeFaceCamera();
  applyLidPose(bevels, poses, "closed");
  state.lidPose = "closed";
  camera.position.copy(camFar);

  var composer = null;
  var bokehPass = null;
  var bloomPass = null;
  var vigPass = null;
  var bloomFlash = 0;
  var useDof =
    !reduced &&
    !isMobile &&
    !state.gpuOffLikely &&
    params.get("dof") !== "0";
  var useBloom = !reduced && params.get("bloom") !== "0";
  var usePost = useDof || useBloom;

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
    if (bloomPass && bloomPass.resolution) {
      bloomPass.resolution.set(w, h);
    }
    var lidWas = state.lidPose;
    computeFaceCamera();
    if (lidWas !== "open") {
      applyLidPose(bevels, poses, lidWas === "opening" ? "closed" : lidWas || "closed");
    } else {
      applyLidPose(bevels, poses, "open");
    }
  }

  if (usePost) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      if (useDof) {
        bokehPass = new BokehPass(scene, camera, {
          focus: nearDist * 0.92,
          aperture: 0.00028,
          maxblur: 0.014,
        });
        composer.addPass(bokehPass);
        state.dofOk = true;
      }
      if (useBloom) {
        bloomPass = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          isMobile || state.gpuOffLikely ? 0.14 : 0.16,
          0.32,
          0.84
        );
        composer.addPass(bloomPass);
        state.bloomOk = true;
      }
      vigPass = new ShaderPass(makeVignetteGrainShader());
      vigPass.uniforms.vignette.value = isMobile || state.gpuOffLikely ? 1.35 : 1.2;
      vigPass.uniforms.grain.value = 0.004;
      composer.addPass(vigPass);
      composer.addPass(new OutputPass());
      state.postOk = true;
    } catch (err) {
      composer = null;
      bokehPass = null;
      bloomPass = null;
      vigPass = null;
      state.postOk = false;
      state.dofOk = false;
      state.bloomOk = false;
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
    copySettled: false,
    faceComputed: false,
    flashed: false,
    flashT0: undefined,
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
  /* Harness: absolute ms of flash plateau mid (~40ms into peak) */
  state.flashPeakMs = Math.round(T_LID0 + TIMING.lid * 0.32 + 40);
  state.flashT0Ms = Math.round(T_LID0 + TIMING.lid * 0.32);

  function placeCopyOutsideScreen() {
    if (!beatCopy) {
      return;
    }
    /* Desktop: left black. Mobile: below notebook with clear gap. */
    if (isMobile) {
      beatCopy.style.top = "auto";
      beatCopy.style.bottom = "2.5%";
      beatCopy.style.left = "8%";
      beatCopy.style.right = "8%";
      beatCopy.style.maxWidth = "84%";
      beatCopy.style.textAlign = "left";
      beatCopy.style.paddingTop = "0.2rem";
      if (titleEl) {
        titleEl.style.fontSize = "1.1rem";
        titleEl.style.marginBottom = "0.15rem";
        titleEl.style.marginTop = "0";
      }
      if (hintEl) {
        hintEl.style.fontSize = "0.85rem";
        hintEl.style.marginBottom = "0.3rem";
      }
    } else {
      beatCopy.style.top = "20%";
      beatCopy.style.bottom = "auto";
      beatCopy.style.left = "4%";
      beatCopy.style.right = "auto";
      beatCopy.style.maxWidth = "min(28vw, 22rem)";
      beatCopy.style.textAlign = "left";
      beatCopy.style.paddingTop = "0";
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
    if (bloomPass) {
      /* Idle: light edge bloom on bright UI. Flash: local, capped (~35–40% of frame). */
      var baseBloom = isMobile || state.gpuOffLikely ? 0.14 : 0.17;
      if (bloomFlash > 0.08) {
        /* High threshold: only screen white blooms — aluminum bounce must not steal the peak */
        bloomPass.strength = Math.min(1.05, baseBloom + bloomFlash * 0.88);
        bloomPass.radius = 0.18;
        bloomPass.threshold = 0.62;
      } else {
        bloomPass.strength = baseBloom;
        bloomPass.radius = 0.3;
        bloomPass.threshold = 0.82;
      }
    }
    if (vigPass && vigPass.uniforms) {
      if (vigPass.uniforms.time) vigPass.uniforms.time.value = performance.now() * 0.001;
      if (vigPass.uniforms.vignette) {
        vigPass.uniforms.vignette.value = bloomFlash > 0.08 ? 1.35 : (isMobile || state.gpuOffLikely ? 1.2 : 1.1);
      }
    }
    if (composer && state.postOk) {
      try {
        composer.render();
      } catch (err) {
        state.postOk = false;
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
    setEdgeWireOpacity(edgeWires, 0);
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
      setEdgeWireOpacity(edgeWires, 1);
      camera.position.copy(camFar);
      camera.lookAt(camTarget);
      setDof(0);
      return;
    }
    var t;
    if (captureMode) {
      /* elapsed is absolute timeline ms from harness */
      t = Math.max(0, elapsed);
    } else {
      if (!timeline.assetsReadyAt) {
        timeline.assetsReadyAt = elapsed;
      }
      t = Math.max(0, elapsed - timeline.assetsReadyAt);
    }

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
      setEdgeWireOpacity(edgeWires, 1);
      camera.position.copy(camFar);
      camera.lookAt(camTarget);
      setDof(0);
      return;
    }

    /* Wireframe dissolve → solid (~0.8s) + bright edge lines */
    var dissolveT = clamp01((t - T_DIS0) / Math.max(TIMING.dissolve, 1));
    var wireAmt = 1 - easeOutExpo(dissolveT);
    setWireframeMix(matEntries, wireAmt);
    setEdgeWireOpacity(edgeWires, wireAmt);
    if (wireAmt <= 0.02) {
      if (edgeWires) {
        edgeWires.visible = false;
        setEdgeWireOpacity(edgeWires, 0);
      }
      if (!timeline._purgedWires) {
        purgeEdgeWires(root);
        timeline._purgedWires = true;
      }
    }
    if (studio.floorWire) {
      studio.floorWire.material.opacity = Math.max(0, 0.2 * wireAmt);
      studio.floorWire.visible = wireAmt > 0.08;
    }
    if (placeholder) {
      placeholder.visible = wireAmt > 0.55 && t < T_DIS1;
      placeholder.children.forEach(function (line) {
        if (line.material) line.material.opacity = 0.35 + 0.5 * wireAmt;
      });
    }

    /* Lid with weight + overshoot/settle */
    var lidTl = 0;
    if (t < T_LID0) {
      applyLidPose(bevels, poses, "closed");
      state.lidPose = "closed";
    } else if (t < T_LID1) {
      lidTl = clamp01((t - T_LID0) / TIMING.lid);
      var lidE = easeOutBack(lidTl);
      lerpLid(bevels, closedPose, openPose, lidE);
      state.lidPose = "opening";
      /* Flash when lid ~30–40° open — timed 250–400ms peak */
      if (!timeline.flashed && lidTl >= 0.32 && !reduced) {
        timeline.flashed = true;
        timeline.flashT0 = t;
      }
    } else {
      applyLidPose(bevels, poses, "open");
      state.lidPose = "open";
      lidTl = 1;
    }

    /* Figma after lid mostly open; screen stays lit */
    if (t >= T_FIG0 || (timeline.flashed && lidTl >= 0.32)) {
      document.body.classList.add("is-figma-live");
      var tf = t >= T_FIG0 ? clamp01((t - T_FIG0) / TIMING.figma) : clamp01((lidTl - 0.32) / 0.4);
      timeline.figmaP = easeOutCubic(Math.max(timeline.figmaP || 0, tf));
      var paintP = Math.max(timeline.figmaP, bloomFlash > 0.08 ? 1 : 0);
      figma.paintFrame(paintP, bloomFlash > 0.08 ? Math.max(bloomFlash, 0.85) : 0);
      if (screenOverlay) {
        screenOverlay.material.opacity = Math.max(timeline.figmaP, bloomFlash > 0.08 ? 1 : 0, 0.001);
      }
      /* Timed flash envelope: plateau ~80ms then fade by ~350ms (250–400ms total) */
      if (timeline.flashed && timeline.flashT0 !== undefined) {
        var fAge = Math.max(0, t - timeline.flashT0);
        if (fAge <= 80) bloomFlash = 1;
        else if (fAge < 360) bloomFlash = 1 - (fAge - 80) / 280;
        else bloomFlash = 0;
      }
      /* Screen flash plane dominates the peak (MeshBasic white → bloom from panel) */
      if (screenFlashPlane && screenFlashPlane.material) {
        screenFlashPlane.material.color.set(0xffffff);
        screenFlashPlane.material.opacity = bloomFlash > 0.02 ? Math.min(1, bloomFlash * 1.35) : 0;
        screenFlashPlane.visible = bloomFlash > 0.02;
        /* Slightly inset so halo stays on panel + short bezel (~35–40% of frame) */
        screenFlashPlane.scale.set(0.88, 0.88, 0.88);
      }
      if (screenOverlay) {
        var sp = new THREE.Vector3();
        screenOverlay.getWorldPosition(sp);
        var sn = new THREE.Vector3(0, 1, 0);
        sn.transformDirection(screenOverlay.matrixWorld).normalize();
        if (sn.dot(camera.position.clone().sub(sp)) < 0) sn.negate();
        /* Bounce from screen onto keys: hot near hinge, decay toward front/trackpad */
        screenBounce.position.copy(sp).addScaledVector(sn, 0.04);
        screenBounce.target.position.copy(sp).addScaledVector(sn, -0.22);
        screenBounce.target.position.y = Math.max(0.28, Math.min(0.62, screenBounce.target.position.y));
        screenBounce.target.updateMatrixWorld();
        screenBounce.penumbra = 0.82;
        if (bloomFlash > 0.45) {
          screenBounce.intensity = 0;
          screenBounce.distance = 1.0;
          screenBounce.angle = Math.PI / 30;
          screenBounce.decay = 3.0;
        } else if (bloomFlash > 0.08) {
          screenBounce.intensity = 0.4 * bloomFlash;
          screenBounce.distance = 1.45;
          screenBounce.angle = Math.PI / 22;
          screenBounce.decay = 2.6;
        } else {
          screenBounce.intensity = (isMobile ? 2.85 : 2.65) * timeline.figmaP;
          screenBounce.distance = 3.0;
          screenBounce.angle = Math.PI / 10;
          screenBounce.decay = 1.7;
        }
      }
    } else {
      figma.paintFrame(0);
      timeline.figmaP = 0;
      if (screenOverlay) screenOverlay.material.opacity = 0;
      if (screenFlashPlane) {
        screenFlashPlane.visible = false;
        screenFlashPlane.material.opacity = 0;
      }
      screenBounce.intensity = 0;
    }
    /* Void black + subtle radial under base (never a horizon) */
    if (studio.floorWire) studio.floorWire.visible = false;
    if (studio.ground) {
      studio.ground.visible = true;
      if (studio.ground.material && studio.ground.material.color) {
        studio.ground.material.color.set(0x000000);
      }
    }
    if (studio.glow && studio.glow.material) {
      studio.glow.visible = true;
      studio.glow.material.opacity = bloomFlash > 0.15 ? 0.04 : 0.1 + 0.05 * timeline.figmaP;
    }
    if (studio.contact) {
      studio.contact.visible = false;
    }
    if (studio.softRefl && studio.softRefl.material) {
      studio.softRefl.visible = true;
      studio.softRefl.material.opacity = bloomFlash > 0.15 ? 0.08 : 0.155 + 0.02 * timeline.figmaP;
    }
    /* Stable key/fill — same aluminum in flash and idle (no silver wash) */
    /*
      Close (camNear / pre-face): keep v0.3.3 look LOCKED.
      Final (face+): soft grazing deck key so palmrest ~25–35/255.
    */
    var atFinalLook =
      t >= T_FACE0 ||
      (captureMode && state.captureTime >= T_FACE0) ||
      timeline.done;
    if (atFinalLook) {
      key.intensity = isMobile ? 0.22 : 0.18;
      fill.intensity = isMobile ? 0.09 : 0.07;
      rimLid.intensity = bloomFlash > 0.08 ? (isMobile ? 3.0 : 2.6) : (isMobile ? 2.7 : 2.35);
      rim.intensity = bloomFlash > 0.08 ? (isMobile ? 4.2 : 3.7) : (isMobile ? 3.9 : 3.45);
      rimHinge.intensity = bloomFlash > 0.08 ? (isMobile ? 3.0 : 2.6) : (isMobile ? 2.75 : 2.4);
      if (rimFront) rimFront.intensity = bloomFlash > 0.08 ? (isMobile ? 2.3 : 2.0) : (isMobile ? 2.45 : 2.2);
      /* Grazing key + near palm spot: palmrest mean target 25–35/255 (probe) */
      if (deckKey) deckKey.intensity = bloomFlash > 0.08 ? 0.45 : (isMobile ? 1.55 : 2.15);
      if (deckFill) deckFill.intensity = bloomFlash > 0.08 ? 0.2 : (isMobile ? 0.48 : 0.72);
      if (deckSpot) deckSpot.intensity = bloomFlash > 0.08 ? 2.5 : (isMobile ? 18 : 32);
      if (studio.softRefl && studio.softRefl.material && bloomFlash <= 0.15) {
        studio.softRefl.material.opacity = 0.15;
        studio.softRefl.visible = true;
      }
    } else {
      /* Close-locked intensities (v0.3.3) */
      key.intensity = isMobile ? 0.18 : 0.14;
      fill.intensity = isMobile ? 0.07 : 0.05;
      rimLid.intensity = bloomFlash > 0.08 ? (isMobile ? 2.8 : 2.4) : (isMobile ? 2.5 : 2.15);
      rim.intensity = bloomFlash > 0.08 ? (isMobile ? 4.0 : 3.5) : (isMobile ? 3.7 : 3.2);
      rimHinge.intensity = bloomFlash > 0.08 ? (isMobile ? 2.9 : 2.5) : (isMobile ? 2.6 : 2.2);
      if (rimFront) rimFront.intensity = bloomFlash > 0.08 ? (isMobile ? 2.0 : 1.7) : (isMobile ? 2.15 : 1.9);
      if (deckKey) deckKey.intensity = 0;
      if (deckFill) deckFill.intensity = 0;
      if (deckSpot) deckSpot.intensity = 0;
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

    /* External info last — scramble finishes in ~0.6s then STOPS */
    if (t >= T_COPY0 && beatCopy) {
      placeCopyOutsideScreen();
      var tc = clamp01((t - T_COPY0) / TIMING.copy);
      beatCopy.style.opacity = String(easeOutExpo(tc));
      if (tc >= 1 || timeline.copySettled) {
        if (titleEl) titleEl.textContent = titleFinal;
        if (hintEl) hintEl.textContent = hintFinal;
        timeline.copySettled = true;
      } else {
        scrambleText(titleEl, titleFinal, tc);
        scrambleText(hintEl, hintFinal, tc);
      }
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
      timeline.copySettled = true;
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
    /* Final frame holds camera static; particles keep living */
    if (!timeline.done) {
      return;
    }
    camera.position.copy(camFace);
    camera.lookAt(camFaceTarget);
    applyFinalStudioLook(1);
    bloomFlash = 0;
    screenBounce.intensity = isMobile ? 2.5 : 2.3;
    if (studio.glow && studio.glow.material) {
      studio.glow.visible = true;
      studio.glow.material.opacity = 0.12;
    }
    if (studio.contact) studio.contact.visible = false;
    if (screenOverlay) screenOverlay.material.opacity = 1;
    if (screenFlashPlane) {
      screenFlashPlane.visible = false;
      screenFlashPlane.material.opacity = 0;
    }
    figma.paintFrame(1);
    if (titleEl) titleEl.textContent = titleFinal;
    if (hintEl) hintEl.textContent = hintFinal;
  }

  function tickDust(now) {
    if (!dust || reduced) {
      return;
    }
    var arr = dust.geometry.attributes.position.array;
    var i;
    var t = now * 0.00012;
    for (i = 0; i < arr.length; i += 3) {
      arr[i] += Math.sin(t + i * 0.11) * 0.0012;
      arr[i + 1] += 0.00055 + Math.cos(t * 0.7 + i) * 0.0004;
      arr[i + 2] += Math.cos(t + i * 0.07) * 0.0009;
      if (arr[i + 1] > 5.2) {
        arr[i + 1] = 0.05;
      }
    }
    dust.geometry.attributes.position.needsUpdate = true;
    /* Prefer particles in the screen light cone */
    if (dust.material) {
      var live = Math.max(timeline.figmaP || 0, bloomFlash, screenBounce.intensity / 2.5);
      dust.material.opacity = 0.12 + 0.22 * Math.min(1, live);
      dust.material.size = state.gpuOffLikely || isMobile ? 0.038 : 0.028;
      dust.visible = live > 0.05 || timeline.done;
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
    if (!forced && captureMode) {
      /* Deterministic harness: wall-clock screenshot stalls must not skip beats */
      applyTimeline(state.captureTime);
    } else if (!forced && !timeline.done) {
      applyTimeline(now - timeline.start);
    } else if (!forced && timeline.done) {
      idleDrift(now);
    }
    if (state.lockCamera) {
      camera.position.copy(state.lockCamera.pos);
      camera.lookAt(state.lockCamera.target);
    }
    tickDust(now);
    renderFrame();
    requestAnimationFrame(frame);
  }


  function dumpCamera() {
    state.cameraDump = {
      position: camera.position.toArray(),
      target: camFaceTarget.toArray(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      aspect: camera.aspect,
      modelScale: 10,
      faceDist: faceDist,
      camFace: camFace.toArray(),
      camFaceTarget: camFaceTarget.toArray(),
      up: camera.up.toArray(),
      /* Three.js Y-up → Blender Z-up after glTF import */
      blenderPosition: [camera.position.x, -camera.position.z, camera.position.y],
      blenderTarget: [camFaceTarget.x, -camFaceTarget.z, camFaceTarget.y],
    };
    return state.cameraDump;
  }


  function ensureFrameGuides(on) {
    var el = document.getElementById("poytaraFrameGuides");
    if (!on) {
      if (el) el.style.display = "none";
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "poytaraFrameGuides";
      el.setAttribute("aria-hidden", "true");
      el.style.cssText =
        "pointer-events:none;position:fixed;inset:0;z-index:9998;" +
        "background:" +
        "linear-gradient(to right,transparent calc(50% - 1px),rgba(0,255,180,0.85) 50%,transparent calc(50% + 1px))," +
        "linear-gradient(to bottom,transparent calc(8% - 1px),rgba(0,200,255,0.85) 8%,transparent calc(8% + 1px))," +
        "linear-gradient(to bottom,transparent calc(89% - 1px),rgba(255,180,0,0.85) 89%,transparent calc(89% + 1px));";
      document.body.appendChild(el);
    }
    el.style.display = "block";
  }

  window.__POYTARA_CAPTURE_SET = function (ms) {
    var next = Math.max(0, Number(ms) || 0);
    if (next < state.captureTime - 1) {
      timeline.done = false;
      timeline.flashed = false;
      timeline.flashT0 = undefined;
      timeline.figmaP = 0;
      timeline.faceComputed = false;
      timeline.copyShown = false;
      timeline.copySettled = false;
      timeline.lastBeat = -1;
      bloomFlash = 0;
      if (screenFlashPlane) {
        screenFlashPlane.visible = false;
        screenFlashPlane.material.opacity = 0;
      }
      if (screenOverlay) screenOverlay.material.opacity = 0;
      screenBounce.intensity = 0;
      if (beatCopy) {
        beatCopy.style.opacity = "0";
      }
      document.body.classList.remove("is-figma-live");
      if (openRoot) {
        openRoot.classList.add("is-intro", "is-anim");
        openRoot.classList.remove("is-hold", "is-ready", "is-beat3");
      }
    }
    state.lockCamera = null;
    state.captureTime = next;
    if (next >= 7000) {
      dumpCamera();
      if (params.get("guides") === "1") {
        ensureFrameGuides(true);
      } else {
        ensureFrameGuides(false);
      }
    } else {
      ensureFrameGuides(false);
    }
  };

  window.__POYTARA_CAPTURE_FLASH_STILL = function () {
    /* Timeline at flash peak + mid lid/screen shot (never keyboard close) */
    var ms = Number(state.flashPeakMs) || 1780;
    state.captureTime = ms;
    timeline.done = false;
    timeline.flashed = false;
    timeline.flashT0 = undefined;
    timeline.figmaP = 0;
    timeline.faceComputed = false;
    applyTimeline(ms);
    root.updateMatrixWorld(true);
    /*
      At ~32% open, screen normal aims into the deck. Front mid-shot from AABB
      at ~faceDist so lid wedge + bright panel read (not keyboard close).
    */
    var boxFlash = new THREE.Box3().setFromObject(root);
    var cFlash = boxFlash.getCenter(new THREE.Vector3());
    var sFlash = boxFlash.getSize(new THREE.Vector3());
    var span = Math.max(sFlash.x, sFlash.y, sFlash.z, 1);
    var distMul = (typeof state._flashDistMul === "number") ? state._flashDistMul : 3.4;
    var elevMul = (typeof state._flashElevMul === "number") ? state._flashElevMul : 1.05;
    camFlashTarget.set(cFlash.x - sFlash.x * 0.08, cFlash.y + sFlash.y * 0.38, cFlash.z - sFlash.z * 0.05);
    camFlash.set(
      cFlash.x - span * 0.45,
      cFlash.y + span * elevMul,
      cFlash.z + span * distMul
    );
    camera.position.copy(camFlash);
    camera.lookAt(camFlashTarget);
    state.lockCamera = {
      pos: camFlash.clone(),
      target: camFlashTarget.clone(),
    };
    state._flashBox = { c: cFlash.toArray(), s: sFlash.toArray(), span: span, distMul: distMul };
    /* Keep flash visuals after camera override */
    if (screenFlashPlane && screenFlashPlane.material) {
      screenFlashPlane.visible = true;
      screenFlashPlane.material.opacity = 1;
    }
    if (screenOverlay && screenOverlay.material) {
      screenOverlay.material.opacity = 1;
    }
    if (figma && figma.paintFrame) {
      figma.paintFrame(1, 1);
    }
    bloomFlash = 1;
    if (bloomPass) {
      bloomPass.strength = 1.05;
      bloomPass.radius = 0.18;
      bloomPass.threshold = 0.62;
    }
    if (beatCopy) {
      beatCopy.style.opacity = "0";
    }
    renderFrame();
    dumpCamera();
    return ms;
  };

  window.__POYTARA_DUMP_CAMERA = function () {
    dumpCamera();
    return state.cameraDump;
  };

  window.__POYTARA_PROBE_DECK_LUM = function () {
    /*
      Palmrest ROI after composer. Prefer 2D drawImage (preserveDrawingBuffer)
      because WebGL readPixels often returns empty with EffectComposer.
      Image-space band: x 55–90%, y 62–90% (trackpad / front palmrest).
    */
    var el = renderer.domElement;
    var w = el.width;
    var h = el.height;
    var c2 = document.createElement("canvas");
    c2.width = w;
    c2.height = h;
    var ctx2 = c2.getContext("2d");
    if (!ctx2) return { error: "no-2d" };
    try {
      ctx2.drawImage(el, 0, 0);
    } catch (err) {
      return { error: "drawImage", detail: String(err && err.message) };
    }
    var x0 = Math.floor(w * 0.55);
    var x1 = Math.floor(w * 0.9);
    var y0 = Math.floor(h * 0.62);
    var y1 = Math.floor(h * 0.9);
    var img = ctx2.getImageData(x0, y0, x1 - x0, y1 - y0);
    var d = img.data;
    var sum = 0;
    var n = 0;
    var vals = [];
    var i;
    for (i = 0; i < d.length; i += 4) {
      var lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (lum > 4 && lum < 95) {
        sum += lum;
        n += 1;
        vals.push(lum);
      }
    }
    vals.sort(function (a, b) { return a - b; });
    function pct(p) {
      if (!vals.length) return null;
      return vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
    }
    var mean = n ? sum / n : null;
    var out = {
      mean: mean,
      p50: pct(0.5),
      p10: pct(0.1),
      p90: pct(0.9),
      n: n,
      roi: [x0, y0, x1, y1],
      target: [25, 35],
      ok: mean != null && mean >= 25 && mean <= 35,
      build: BUILD,
    };
    state.deckLumProbe = out;
    return out;
  };

  window.__POYTARA_TRY_FLASH_CAM = function (distMul, elevMul) {
    state._flashDistMul = Number(distMul) || 3.4;
    state._flashElevMul = Number(elevMul) || 1.05;
    var ms = window.__POYTARA_CAPTURE_FLASH_STILL();
    return { ms: ms, box: state._flashBox, cam: dumpCamera() };
  };

  window.__POYTARA_CAPTURE_CLOSE_PEDESTAL = function () {
    /* Desktop QA close: carved pedestal + Space Black notebook (not keyboard-only). */
    state.captureTime = 8200;
    applyTimeline(8200);
    applyFinalStudioLook(1);
    applyLidPose(bevels, poses, "open");
    state.lidPose = "open";
    root.updateMatrixWorld(true);
    if (studio.group) studio.group.updateMatrixWorld(true);
    var boxNb = new THREE.Box3().setFromObject(macbook);
    var nbCenter = boxNb.getCenter(new THREE.Vector3());
    var nbSize = boxNb.getSize(new THREE.Vector3());
    /* Fixed look: palmrest / hinge on stone — ignore cave AABB */
    var look = new THREE.Vector3(
      nbCenter.x + nbSize.x * 0.05,
      boxNb.min.y + nbSize.y * 0.22,
      nbCenter.z + nbSize.z * 0.08
    );
    var eye = new THREE.Vector3(
      look.x + Math.max(nbSize.x, 1.2) * 1.35,
      look.y + Math.max(nbSize.y, 0.8) * 1.05,
      look.z + Math.max(nbSize.z, 1.0) * 1.55
    );
    camera.position.copy(eye);
    camera.lookAt(look);
    state.lockCamera = { pos: eye.clone(), target: look.clone() };
    if (beatCopy) beatCopy.style.opacity = "0";
    /* Hide left copy veil for product close */
    if (studio.cave) {
      studio.cave.traverse(function (o) {
        if (o.name === "leftCopyVeil") o.visible = false;
      });
    }
    renderFrame();
    dumpCamera();
    return {
      look: look.toArray(),
      eye: eye.toArray(),
      nbSize: nbSize.toArray(),
      nbMin: boxNb.min.toArray(),
      nbMax: boxNb.max.toArray(),
    };
  };


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
    studio: "cave-pedestal-v040",
    tag: CDN_TAG,
  });
  window.__ecoCaseBuild = BUILD;
  setStatus(
    "ready · studio v0.3.1 · stripeFix=" +
      state.stripeFix +
      (state.gpuOffLikely ? " · soft-gpu" : "") +
      (state.dofOk ? " · dof" : " · no-dof") +
      (state.bloomOk ? " · bloom" : " · no-bloom")
  );
}

try {
  init();
} catch (err) {
  showFallback("init-throw");
  console.error(err);
}
