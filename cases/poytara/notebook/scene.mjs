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

/*
  Poytara abertura estúdio v0.2.4 — flash só na tela; rim/tampa legível.
  CSP: sem blob/workers/Draco. HUD só ?debug=1.
*/

var BUILD = "notebook-studio-v024-20261117231835";
var CDN_TAG = "v0.2.4";

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
  captureMode: captureMode,
  captureTime: 0,
  loadProgress: 0,
  wireframe: true,
  studio: "dark-dramatic",
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

    /* Thin MacBook glass bezel — pure black frame that always reads */
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, lw, lh);
    var inset = 14;
    ctx.fillStyle = "#0e0e10";
    ctx.fillRect(inset, inset, lw - inset * 2, lh - inset * 2);

    var ox = inset;
    var oy = inset;
    var iw = lw - inset * 2;
    var ih = lh - inset * 2;

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
  var screenMesh = root.getObjectByName("Object_7");
  if (!screenMesh) {
    return null;
  }

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
  /* Lid panel is XZ: lay flat, then 180° in-plane so chrome/top reads upright (v0.2.1 was inverted). */
  plane.rotateX(-Math.PI / 2);
  plane.rotateY(Math.PI);
  var mat = new THREE.MeshBasicMaterial({
    map: figma.texture,
    toneMapped: false,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  /* Horizontal un-mirror via UV (not mesh.scale — scale flips face-right framing) */
  figma.texture.wrapS = THREE.RepeatWrapping;
  figma.texture.wrapT = THREE.ClampToEdgeWrapping;
  figma.texture.repeat.set(-1, 1);
  figma.texture.offset.set(1, 0);
  figma.texture.flipY = true;
  figma.texture.colorSpace = THREE.SRGBColorSpace;
  figma.texture.needsUpdate = true;

  var overlay = new THREE.Mesh(plane, mat);
  overlay.name = "screenOverlay";
  overlay.position.set((xmin + xmax) / 2, yAvg + 0.0015, (zmin + zmax) / 2);
  overlay.renderOrder = 3;
  screenMesh.visible = false;

  /* Darken glass/bezel meshes instead of hiding — keeps chin/hinge bridge */
  ["Object_4", "Object_5", "Object_6", "Object_8"].forEach(function (name) {
    var o = root.getObjectByName(name);
    if (!o || !o.material) {
      return;
    }
    o.visible = true;
    var mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(function (m) {
      if (!m) return;
      if (m.color) m.color.set(0x050506);
      if (m.emissive) {
        m.emissive.set(0x0a0c10);
        m.emissiveIntensity = 0.12;
      }
      if (m.metalness !== undefined) m.metalness = 0.9;
      if (m.roughness !== undefined) m.roughness = 0.35;
      if (m.opacity !== undefined) {
        m.transparent = false;
        m.opacity = 1;
      }
      m.needsUpdate = true;
    });
  });

  /* Extra black chin strip under panel so screen never floats */
  var chin = new THREE.Mesh(
    new THREE.PlaneGeometry(pw * 1.02, ph * 0.08),
    new THREE.MeshStandardMaterial({
      color: 0x050506,
      metalness: 0.85,
      roughness: 0.4,
      emissive: new THREE.Color(0x10141c),
      emissiveIntensity: 0.18,
    })
  );
  chin.name = "screenChin";
  chin.rotation.x = -Math.PI / 2;
  chin.position.set((xmin + xmax) / 2, yAvg + 0.0008, zmin - ph * 0.02);
  chin.renderOrder = 2;
  (screenMesh.parent || root).add(chin);

  (screenMesh.parent || root).add(overlay);
  state.stripeFix = "uv-roty-pi-chin-bezel-v024";
  return overlay;
}

function makeStudioFloor() {
  /* Infinite-feel floor: huge plane + radial glow (no hard circle rim) */
  var group = new THREE.Group();
  group.name = "studioFloor";

  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshPhysicalMaterial({
      color: 0x050608,
      roughness: 0.22,
      metalness: 0.78,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.4,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.012;
  ground.receiveShadow = true;
  group.add(ground);

  var gc = document.createElement("canvas");
  gc.width = 256;
  gc.height = 256;
  var gctx = gc.getContext("2d");
  var grd = gctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  grd.addColorStop(0, "rgba(90,105,150,0.10)");
  grd.addColorStop(0.35, "rgba(40,50,90,0.03)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  gctx.fillStyle = grd;
  gctx.fillRect(0, 0, 256, 256);
  var glowTex = new THREE.CanvasTexture(gc);
  glowTex.needsUpdate = true;

  var glow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 3.2),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.035,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.001;
  glow.name = "floorGlow";
  group.add(glow);

  var contact = new THREE.Mesh(
    new THREE.CircleGeometry(2.8, 48),
    new THREE.ShadowMaterial({ opacity: 0.5 })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.0025;
  contact.receiveShadow = true;
  group.add(contact);

  /* Soft grid fade — no hard outer ring */
  var floorWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(6, 6, 8, 8)),
    new THREE.LineBasicMaterial({
      color: 0xa8c0ff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
  );
  floorWire.rotation.x = -Math.PI / 2;
  floorWire.position.y = 0.004;
  floorWire.name = "floorWire";
  group.add(floorWire);

  return {
    group: group,
    floorWire: floorWire,
    ground: ground,
    contact: contact,
    glow: glow,
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
    /* Bias into screen/key light cone (front-right of notebook) */
    var inCone = Math.random() < 0.72;
    if (inCone) {
      pos[i * 3] = (Math.random() - 0.15) * 3.2;
      pos[i * 3 + 1] = Math.random() * 2.4 + 0.08;
      pos[i * 3 + 2] = (Math.random() - 0.2) * 2.8 + 0.4;
    } else {
      pos[i * 3] = (Math.random() - 0.35) * 9;
      pos[i * 3 + 1] = Math.random() * 4.2 + 0.05;
      pos[i * 3 + 2] = (Math.random() - 0.45) * 7;
    }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.PointsMaterial({
    size: 0.055,
    map: makeDustTexture(),
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xe8f0ff,
    sizeAttenuation: true,
  });
  var pts = new THREE.Points(geo, mat);
  pts.name = "studioDust";
  pts.frustumCulled = false;
  return pts;
}

function upgradeChassisMaterials(root, figmaTex) {
  root.traverse(function (o) {
    if (!o.isMesh || !o.material) {
      return;
    }
    if (o.name === "screenOverlay") {
      return;
    }
    var mats = Array.isArray(o.material) ? o.material : [o.material];
    var next = mats.map(function (m) {
      if (!m || m.map === figmaTex) {
        return m;
      }
      var n = (o.name || "").toLowerCase();
      var isKey = n.indexOf("key") >= 0 || n.indexOf("deck") >= 0;
      var baseCol = m.color ? m.color.clone() : new THREE.Color(0x3a3e48);
      if (!isKey) {
        /* Lift lid/chassis above pure void so moldura reads */
        baseCol.lerp(new THREE.Color(0x5a616c), 0.45);
      }
      var phys = new THREE.MeshPhysicalMaterial({
        color: baseCol,
        map: m.map || null,
        normalMap: m.normalMap || null,
        roughnessMap: m.roughnessMap || null,
        metalnessMap: m.metalnessMap || null,
        metalness: isKey ? 0.2 : 0.92,
        roughness: isKey ? 0.65 : 0.26,
        clearcoat: isKey ? 0.1 : 0.78,
        clearcoatRoughness: isKey ? 0.5 : 0.18,
        envMapIntensity: isKey ? 0.55 : 1.6,
        reflectivity: 0.82,
        emissive: isKey ? new THREE.Color(0x000000) : new THREE.Color(0x243044),
        emissiveIntensity: isKey ? 0 : 0.38,
      });
      if (m.map) {
        phys.map.colorSpace = THREE.SRGBColorSpace;
      }
      return phys;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
}

function makeVignetteGrainShader() {
  return {
    uniforms: {
      tDiffuse: { value: null },
      vignette: { value: 0.85 },
      grain: { value: 0.035 },
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
      "  float vig = smoothstep(1.05, 0.28, d * (0.55 + vignette));",
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
      line.material.opacity = 0.15 + 0.85 * a;
      line.visible = a > 0.04;
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
  renderer.toneMappingExposure = isMobile ? 1.48 : 1.36;
  renderer.shadowMap.enabled = !state.gpuOffLikely;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 1);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.016);

  /* ~50–85mm feel */
  var camera = new THREE.PerspectiveCamera(26, 1, 0.05, 200);
  camera.position.set(6.4, 3.8, 7.6);

  try {
    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.42;
    pmrem.dispose();
  } catch (err) {
    setStatus("env-map skipped");
  }

  var hemi = new THREE.HemisphereLight(0x8a9ab8, 0x050608, isMobile ? 0.32 : 0.24);
  scene.add(hemi);

  var key = new THREE.DirectionalLight(0xfff1e0, 0.55);
  key.position.set(4.2, 7.5, 3.2);
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

  var rim = new THREE.DirectionalLight(0xd0e4ff, 5.2);
  rim.position.set(-6.2, 4.6, -6.2);
  scene.add(rim);

  var rimHinge = new THREE.DirectionalLight(0xb8d4ff, 3.8);
  rimHinge.position.set(4.2, 1.4, -5.2);
  scene.add(rimHinge);

  var rimLid = new THREE.DirectionalLight(0xe8f2ff, 3.2);
  rimLid.position.set(0.5, 5.5, -3.8);
  scene.add(rimLid);

  var fill = new THREE.DirectionalLight(0x4a5878, 0.18);
  fill.position.set(-2.5, 1.8, 5.5);
  scene.add(fill);

  /* Screen bounce onto keyboard (fake RectArea — CSP-safe) */
  var screenBounce = new THREE.SpotLight(0xe8f0ff, 0, 4.2, Math.PI / 11, 0.55, 1.9);
  screenBounce.position.set(0, 1.6, 1.1);
  screenBounce.target.position.set(0, 0.08, 0.35);
  scene.add(screenBounce);
  scene.add(screenBounce.target);

  var studio = makeStudioFloor();
  scene.add(studio.group);

  var particleCount = reduced ? 0 : isMobile ? 220 : state.gpuOffLikely ? 320 : 720;
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
    }
  });
  upgradeChassisMaterials(root, figma.texture);

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
      Desktop: screen ~52% tall → moldura ~8%, base tela ~80%, trackpad ~88–90%.
      Mobile: smaller/higher notebook (upper/mid), full-ish screen, room for copy below.
    */
    var fillH = isMobile ? 0.30 : 0.52;
    faceDist = screenWorldH / (fillH * 2 * Math.tan(vFov / 2));

    var ndcY = isMobile ? 0.42 : 0.20;
    var vertShift = ndcY * faceDist * Math.tan(vFov / 2);

    if (isMobile) {
      camFaceTarget.copy(center).addScaledVector(screenUp, -vertShift * 0.12);
      camFace.copy(camFaceTarget).addScaledVector(normal, faceDist * 1.08);
      camFace.addScaledVector(screenUp, faceDist * 0.08);
    } else {
      /* Left edge of display ~50%; crop right; keep base/trackpad in frame */
      var leftEdge = new THREE.Vector3()
        .copy(center)
        .addScaledVector(screenRight, -screenWorldW * 0.5);
      camFaceTarget
        .copy(leftEdge)
        .addScaledVector(screenRight, screenWorldW * 0.04)
        .addScaledVector(screenUp, -vertShift);
      camFace.copy(camFaceTarget).addScaledVector(normal, faceDist);
      camFace.addScaledVector(screenUp, faceDist * 0.02);
    }
  }

  function applyFinalStudioLook(amount) {
    var a = clamp01(amount);
    renderer.setClearColor(new THREE.Color().setRGB(0.027 * (1 - a), 0.035 * (1 - a), 0.055 * (1 - a)), 1);
    scene.background = new THREE.Color().setRGB(0.027 * (1 - a), 0.035 * (1 - a), 0.055 * (1 - a));
    if (a > 0.5) {
      scene.background = new THREE.Color(0x000000);
      renderer.setClearColor(0x000000, 1);
      /* Weak fog — strong fog ate the lid silhouette */
      scene.fog = new THREE.FogExp2(0x000000, 0.012 + 0.008 * a);
    }
    if (studio.group) {
      studio.group.traverse(function (o) {
        if (o.name === "floorWire") {
          o.visible = a < 0.25;
        }
        if (o === studio.glow && o.material) {
          /* Floor glow stays tiny in final; never a light pool */
          o.material.opacity = 0.04 * (1 - a * 0.5);
          o.visible = a < 0.95;
        }
        if (o.isMesh && o.material && o.material.color && o !== studio.contact && o !== studio.glow) {
          if (!o.userData._baseColor) {
            o.userData._baseColor = o.material.color.clone();
          }
          /* Only crush the ground plane toward void */
          if (o === studio.ground) {
            o.material.color.copy(o.userData._baseColor).lerp(new THREE.Color(0x000000), a * 0.97);
          }
        }
        if (o === studio.contact && o.material) {
          o.material.opacity = 0.35 + 0.15 * a;
        }
      });
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
          isMobile || state.gpuOffLikely ? 0.18 : 0.28,
          0.55,
          0.82
        );
        composer.addPass(bloomPass);
        state.bloomOk = true;
      }
      if (!isMobile && !state.gpuOffLikely) {
        vigPass = new ShaderPass(makeVignetteGrainShader());
        vigPass.uniforms.vignette.value = 0.9;
        vigPass.uniforms.grain.value = 0.028;
        composer.addPass(vigPass);
      }
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
    /* Desktop: left black. Mobile: below notebook with clear gap. */
    if (isMobile) {
      beatCopy.style.top = "auto";
      beatCopy.style.bottom = "5%";
      beatCopy.style.left = "8%";
      beatCopy.style.right = "8%";
      beatCopy.style.maxWidth = "84%";
      beatCopy.style.textAlign = "left";
      beatCopy.style.paddingTop = "0.75rem";
      if (titleEl) {
        titleEl.style.fontSize = "1.25rem";
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
      var baseBloom = isMobile || state.gpuOffLikely ? 0.28 : 0.34;
      bloomPass.strength = baseBloom + bloomFlash * 2.8;
      /* High threshold during flash → only the bright panel blooms, not floor */
      bloomPass.threshold = bloomFlash > 0.08 ? 0.62 : 0.78;
    }
    if (vigPass && vigPass.uniforms && vigPass.uniforms.time) {
      vigPass.uniforms.time.value = performance.now() * 0.001;
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
    if (studio.floorWire) {
      studio.floorWire.material.opacity = Math.max(0, 0.28 * wireAmt);
      studio.floorWire.visible = wireAmt > 0.05;
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
      /* Flash when lid ~30–40° open */
      if (!timeline.flashed && lidTl >= 0.32 && lidTl <= 0.48 && !reduced) {
        bloomFlash = 1;
        timeline.flashed = true;
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
      /* During flash: paint brighter so bloom origins on the panel */
      var paintP = Math.max(timeline.figmaP, bloomFlash > 0.15 ? 0.85 : 0);
      figma.paintFrame(paintP, bloomFlash);
      if (screenOverlay) {
        screenOverlay.material.opacity = Math.max(timeline.figmaP, bloomFlash * 0.95, 0.001);
      }
      /* Bounce tightly onto keyboard from screen — never a floor pool */
      if (screenOverlay) {
        var sp = new THREE.Vector3();
        screenOverlay.getWorldPosition(sp);
        var sn = new THREE.Vector3(0, 1, 0);
        sn.transformDirection(screenOverlay.matrixWorld).normalize();
        if (sn.dot(camera.position.clone().sub(sp)) < 0) sn.negate();
        screenBounce.position.copy(sp).addScaledVector(sn, 0.08);
        screenBounce.target.position.set(sp.x * 0.15, 0.12, sp.z + 0.15);
        screenBounce.target.updateMatrixWorld();
      }
      screenBounce.intensity = 2.8 * timeline.figmaP + bloomFlash * 7.5;
    } else {
      figma.paintFrame(0);
      timeline.figmaP = 0;
      if (screenOverlay) screenOverlay.material.opacity = 0;
      screenBounce.intensity = 0;
    }
    /* Kill floor glow during flash so bloom cannot form a ground ellipse */
    if (studio.glow) {
      if (bloomFlash > 0.04) {
        studio.glow.visible = false;
        studio.glow.material.opacity = 0;
      } else {
        studio.glow.visible = true;
        studio.glow.material.opacity = 0.05 + 0.04 * timeline.figmaP;
      }
    }
    /* ~0.45–0.55s decay at 60fps */
    bloomFlash *= 0.88;

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
    bloomFlash *= 0.9;
    screenBounce.intensity = isMobile ? 4.2 : 3.6;
    if (studio.glow) {
      studio.glow.visible = false;
      studio.glow.material.opacity = 0;
    }
    if (screenOverlay) screenOverlay.material.opacity = 1;
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
      dust.material.opacity = 0.45 + 0.4 * Math.min(1, screenBounce.intensity / 3);
      dust.material.size = state.gpuOffLikely || isMobile ? 0.07 : 0.05;
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
    tickDust(now);
    renderFrame();
    requestAnimationFrame(frame);
  }

  window.__POYTARA_CAPTURE_SET = function (ms) {
    var next = Math.max(0, Number(ms) || 0);
    if (next < state.captureTime - 1) {
      timeline.done = false;
      timeline.faceComputed = false;
      timeline.flashed = false;
      timeline.copyShown = false;
      timeline.copySettled = false;
      timeline.lastBeat = -1;
      bloomFlash = 0;
      if (beatCopy) {
        beatCopy.style.opacity = "0";
      }
      document.body.classList.remove("is-figma-live");
      if (openRoot) {
        openRoot.classList.add("is-intro", "is-anim");
        openRoot.classList.remove("is-hold", "is-ready", "is-beat3");
      }
    }
    state.captureTime = next;
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
    studio: "dark-dramatic",
    tag: CDN_TAG,
  });
  window.__ecoCaseBuild = BUILD;
  setStatus(
    "ready · studio v0.2.4 · stripeFix=" +
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
