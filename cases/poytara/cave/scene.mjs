import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm";
import { DRACOLoader } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/DRACOLoader.js/+esm";
import { KTX2Loader } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/KTX2Loader.js/+esm";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/EffectComposer.js/+esm";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/RenderPass.js/+esm";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm";
import { ShaderPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/ShaderPass.js/+esm";
import { OutputPass } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/OutputPass.js/+esm";

/*
  Poytara caverna v0.7.2 — cinematográfica realtime (SEM notebook / SEM video).
  Composição v0.6.2. Keep is-three from v0.7.1.
  Soft diagonal cyan cone + amber pool + fog/bloom/grain/vignette/ACES.
  No debug HUD unless ?debug=1. No Igloo/Abeto assets.
*/

var BUILD = "cenario-caverna-v072-20261119184000";
var CDN_TAG = "v0.7.2";

var reduced =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduced) document.body.classList.add("is-reduced");

var openRoot =
  document.querySelector(".pyOpen") || document.getElementById("pyOpen");
var canvas =
  document.getElementById("pyOpenCanvas") || document.getElementById("c");
var statusEl = document.getElementById("statusLine");
var fallbackEl = document.getElementById("fallback");

var params = new URLSearchParams(window.location.search || "");
var captureMode = params.get("capture") === "1";
var debugHud = params.get("debug") === "1";
var camMode = params.get("cam") || "comp";
var forceWebp = params.get("forceWebp") === "1" || params.get("webp") === "1";

var slash = String.fromCharCode(47);
var scriptEl =
  document.currentScript ||
  document.querySelector("script[data-eco-cave]") ||
  document.querySelector('script[type="module"][src*="poytara/cave/scene"]');
var scriptSrc = (scriptEl && scriptEl.src) || "";
var cdnBase;
if (
  scriptSrc.indexOf("cases/poytara/cave/") >= 0 ||
  /\/scene\.mjs(\?|$)/.test(scriptSrc)
) {
  cdnBase = scriptSrc.replace(/scene\.mjs(\?.*)?$/, "");
} else {
  cdnBase =
    "https:" +
    slash +
    slash +
    "cdn.jsdelivr.net/gh/eco-webdesign/institutional-eco-webdesign@" +
    CDN_TAG +
    "/cases/poytara/cave/";
}

var STATE = {
  build: BUILD,
  webglOk: false,
  loadProgress: 0,
  fps: 0,
  bytes: 0,
  cam: camMode,
  draco: false,
  ktx2: false,
  fallbackWebp: false,
};
window.__POYTARA_CAVE__ = STATE;
window.__POYTARA_THREE_PROVA__ = STATE;

function setStatus(msg) {
  if (statusEl && debugHud) statusEl.textContent = msg;
}
function fail(msg) {
  setStatus(msg);
  document.body.classList.add("is-webgl-off");
  if (fallbackEl) fallbackEl.classList.add("is-on");
}

function blToThree(v) {
  return new THREE.Vector3(v[0], v[2], -v[1]);
}

if (!canvas || !window.WebGLRenderingContext) {
  fail("WebGL indisponível");
} else {
  boot();
}

function boot() {
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
      preserveDrawingBuffer: captureMode,
    });
  } catch (err) {
    fail("WebGL init falhou");
    return;
  }
  STATE.webglOk = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, captureMode ? 1 : 1.75));
  renderer.setSize(
    canvas.clientWidth || window.innerWidth,
    canvas.clientHeight || window.innerHeight,
    false
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  /* near-black charcoal — not fake blue void */
  renderer.setClearColor(0x05070a, 1);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);
  scene.fog = new THREE.FogExp2(0x080c12, 0.014);

  var CAMS = {
    comp: { position: [0.15, -6.8, 2.05], target: [0.0, -0.6, 0.783], fov: 43.6 },
    open: { position: [0.1, -9.0, 2.5], target: [0.0, -0.3, 0.928], fov: 53.1 },
    close: { position: [-1.85, -3.2, 0.812], target: [0.0, 0.05, 0.186], fov: 32.2 },
  };
  function blCam(def) {
    return {
      position: blToThree(def.position),
      target: blToThree(def.target),
      fov: def.fov,
    };
  }
  var camDef = blCam(CAMS[camMode] || CAMS.comp);
  var camera = new THREE.PerspectiveCamera(
    camDef.fov,
    (canvas.clientWidth || 16) / (canvas.clientHeight || 9),
    0.05,
    250
  );
  camera.position.copy(camDef.position);
  var lookTarget = camDef.target.clone();
  camera.lookAt(lookTarget);

  /* soft fill — avoid flat 90s lighting */
  scene.add(new THREE.AmbientLight(0x5a6a7c, 0.28));
  var hemi = new THREE.HemisphereLight(0x4a6a7a, 0x120e0a, 0.42);
  scene.add(hemi);

  var amber = new THREE.PointLight(0xff8a3a, 4.2, 9, 2.4);
  amber.position.set(0.05, 1.05, 0.05);
  scene.add(amber);
  var amberPool = new THREE.SpotLight(0xff7a28, 9.5, 8, Math.PI / 3.0, 0.95, 1.6);
  amberPool.position.set(-0.15, 1.9, 0.25);
  amberPool.target.position.set(0.0, 0.0, 0.0);
  scene.add(amberPool);
  scene.add(amberPool.target);

  var cool = new THREE.DirectionalLight(0x6a90b8, 0.38);
  cool.position.set(-5, 6, 3);
  scene.add(cool);

  var cyanKey = new THREE.SpotLight(0x4ad4ff, 28, 34, Math.PI / 9.5, 0.78, 1.2);
  cyanKey.position.copy(blToThree([0.1, -6.4, 9.6]));
  cyanKey.target.position.copy(blToThree([0, 0, 0.58]));
  scene.add(cyanKey);
  scene.add(cyanKey.target);

  /* visible roof opening — soft emissive disc, not hard rectangle */
  var fissure = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 48),
    new THREE.MeshBasicMaterial({
      color: 0x8ef0ff,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  fissure.position.copy(blToThree([0.1, -7.0, 10.2]));
  fissure.lookAt(blToThree([0.1, -2.0, 4.0]));
  scene.add(fissure);
  var fissureHalo = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 48),
    new THREE.MeshBasicMaterial({
      color: 0x3ecfff,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  fissureHalo.position.copy(fissure.position);
  fissureHalo.quaternion.copy(fissure.quaternion);
  scene.add(fissureHalo);

  var shaft = makeShaft();
  scene.add(shaft.group);
  var smoke = makeSmoke();
  scene.add(smoke.group);
  var dust = makeDust();
  scene.add(dust.points);

  var composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  var bloom = new UnrealBloomPass(
    new THREE.Vector2(canvas.clientWidth || 1920, canvas.clientHeight || 1080),
    0.18,
    0.65,
    0.78
  );
  composer.addPass(bloom);
  var gradeUniforms = {
    tDiffuse: { value: null },
    uTime: { value: 0 },
  };
  var grade = new ShaderPass({
    uniforms: gradeUniforms,
    vertexShader:
      "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: [
      "uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;",
      "float grain(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }",
      "void main(){",
      "  vec4 c = texture2D(tDiffuse, vUv);",
      "  /* cyan/amber grade — restrained */",
      "  c.rgb = mix(c.rgb, c.rgb * vec3(0.88, 1.0, 1.08), 0.22);",
      "  c.rgb = mix(c.rgb, c.rgb * vec3(1.06, 0.96, 0.86), 0.08);",
      "  /* soft lift shadows without flattening */",
      "  c.rgb = max(c.rgb, vec3(0.0));",
      "  c.rgb = c.rgb / (c.rgb + vec3(1.0)) * 1.12;",
      "  vec2 p = vUv * 2.0 - 1.0;",
      "  float vig = smoothstep(1.65, 0.28, dot(p,p));",
      "  c.rgb *= mix(0.52, 1.0, vig);",
      "  float g = grain(vUv * vec2(1920.0, 1080.0) + uTime * 40.0) * 0.028;",
      "  c.rgb += g - 0.014;",
      "  c.rgb = (c.rgb - 0.5) * 1.08 + 0.48;",
      "  gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), 1.0);",
      "}",
    ].join("\n"),
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  var root = new THREE.Group();
  scene.add(root);
  addLitePlaceholder(root);

  var loadStart = performance.now();
  loadCaveGlb(renderer, root)
    .then(function (info) {
      STATE.loadProgress = 1;
      STATE.bytes = info.bytes || 0;
      STATE.draco = !!info.draco;
      STATE.ktx2 = !!info.ktx2;
      STATE.fallbackWebp = !!info.fallbackWebp;
      STATE.loadMs = Math.round(performance.now() - loadStart);
      setStatus(
        "ready · " +
          (STATE.bytes / 1048576).toFixed(2) +
          " MB · " +
          (STATE.ktx2 ? "ktx2" : "webp") +
          (STATE.draco ? "+draco" : "")
      );
      if (openRoot) {
        openRoot.classList.remove("is-intro");
        openRoot.classList.add("is-ready");
        openRoot.classList.add("is-three");
      }
      document.body.classList.add("is-ready");
    })
    .catch(function (err) {
      console.warn(err);
      setStatus("GLB falhou — placeholder");
      STATE.loadProgress = 1;
    });

  var mouse = { x: 0, y: 0 };
  var scrollParallax = 0;
  if (!captureMode) {
    window.addEventListener(
      "pointermove",
      function (e) {
        var w = window.innerWidth || 1;
        var h = window.innerHeight || 1;
        mouse.x = (e.clientX / w) * 2 - 1;
        mouse.y = (e.clientY / h) * 2 - 1;
      },
      { passive: true }
    );
    window.addEventListener(
      "scroll",
      function () {
        var y = window.scrollY || window.pageYOffset || 0;
        scrollParallax = Math.min(1, Math.max(0, y / (window.innerHeight || 800)));
      },
      { passive: true }
    );
  }

  function onResize() {
    var w = captureMode ? 1920 : canvas.clientWidth || window.innerWidth;
    var h = captureMode ? 1080 : canvas.clientHeight || window.innerHeight;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }
  window.addEventListener("resize", onResize);
  onResize();

  window.__POYTARA_CAPTURE_SET = function (name) {
    if (name === "open") camMode = "open";
    else if (name === "close") camMode = "close";
    else camMode = "comp";
    camDef = blCam(CAMS[camMode] || CAMS.comp);
    camera.fov = camDef.fov;
    camera.updateProjectionMatrix();
    camera.position.copy(camDef.position);
    lookTarget.copy(camDef.target);
    camera.lookAt(lookTarget);
    STATE.cam = camMode;
  };

  var clock = new THREE.Clock();
  var frames = 0;
  var fpsT = performance.now();
  function frame() {
    var t = clock.getElapsedTime();
    var breath = reduced || captureMode ? 0 : Math.sin(t * 0.45) * 0.028;
    var px = captureMode ? 0 : mouse.x * 0.1;
    var py = captureMode ? 0 : mouse.y * 0.06;
    var sp = captureMode ? 0 : scrollParallax * 0.28;
    camera.position.set(
      camDef.position.x + px + breath * 0.2,
      camDef.position.y + py * 0.45 + breath,
      camDef.position.z + sp
    );
    camera.lookAt(
      lookTarget.x + px * 0.12,
      lookTarget.y + breath * 0.15,
      lookTarget.z
    );

    shaft.update(t);
    smoke.update(t);
    dust.update(t);
    gradeUniforms.uTime.value = t;
    amber.intensity = 4.0 + Math.sin(t * 0.55) * 0.3;
    composer.render();

    frames++;
    var now = performance.now();
    if (now - fpsT >= 1000) {
      STATE.fps = frames;
      frames = 0;
      fpsT = now;
      if (debugHud) setStatus("fps " + STATE.fps + " · cam " + STATE.cam);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function toLit(mat) {
  if (!mat) return new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.92 });
  if (mat.isMeshBasicMaterial && mat.map) {
    /* baked lightmap stays unlit */
    var basic = new THREE.MeshBasicMaterial({ map: mat.map, color: 0xffffff });
    basic.map.colorSpace = THREE.SRGBColorSpace;
    return basic;
  }
  if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
    mat.metalness = 0.0;
    mat.roughness = Math.max(0.55, mat.roughness || 0.85);
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    if (mat.emissiveMap) {
      /* treat emission bake as basic */
      var b2 = new THREE.MeshBasicMaterial({ map: mat.emissiveMap, color: 0xffffff });
      b2.map.colorSpace = THREE.SRGBColorSpace;
      return b2;
    }
    if (mat.emissive && mat.emissive.getHex && mat.map) {
      var em = mat.emissive.getHex();
      if (em > 0) {
        var b3 = new THREE.MeshBasicMaterial({ map: mat.map, color: 0xffffff });
        b3.map.colorSpace = THREE.SRGBColorSpace;
        return b3;
      }
    }
    return mat;
  }
  if (mat.map || mat.emissiveMap) {
    var tex = mat.map || mat.emissiveMap;
    var m = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.0,
      normalMap: mat.normalMap || null,
      roughnessMap: mat.roughnessMap || null,
      aoMap: mat.aoMap || null,
      aoMapIntensity: 0.85,
    });
    if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    if (m.normalMap) m.normalScale = new THREE.Vector2(0.85, 0.85);
    return m;
  }
  if (mat.color) {
    return new THREE.MeshStandardMaterial({
      color: mat.color.clone().multiplyScalar(0.55),
      roughness: 0.9,
      metalness: 0.0,
    });
  }
  return new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.92 });
}

function normalizeMaterials(root) {
  root.traverse(function (o) {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    var name = (o.name || "") + " " + ((o.material && o.material.name) || "");
    var baked =
      /bake|floor|pedestal|combined|FloorBaked|PedestalBaked/i.test(name) ||
      (o.material && o.material.emissiveMap) ||
      (o.material && o.material.isMeshBasicMaterial && o.material.map);
    if (Array.isArray(o.material)) {
      o.material = o.material.map(function (m) {
        return baked ? toLit(m) : toLit(m);
      });
    } else {
      o.material = toLit(o.material);
    }
    /* pull back overbright baked maps */
    if (o.material && o.material.isMeshBasicMaterial && o.material.map) {
      o.material.color.setRGB(0.62, 0.66, 0.7);
    }
  });
}

function addLitePlaceholder(root) {
  var floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 48),
    new THREE.MeshStandardMaterial({ color: 0x12161c, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  var ped = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.14, 0.58, 48),
    new THREE.MeshStandardMaterial({ color: 0x1c222a, roughness: 0.9 })
  );
  ped.position.y = 0.29;
  root.add(ped);
}

function loadCaveGlb(renderer, root) {
  return new Promise(function (resolve, reject) {
    var tried = {};

    function attachDecoders(loader, withKtx2) {
      var draco = new DRACOLoader();
      draco.setDecoderPath(
        "https:" +
          slash +
          slash +
          "www.gstatic.com/draco/versioned/decoders/1.5.7/"
      );
      loader.setDRACOLoader(draco);
      if (withKtx2) {
        try {
          var ktx2 = new KTX2Loader();
          ktx2.setTranscoderPath(
            "https:" +
              slash +
              slash +
              "cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/"
          );
          ktx2.detectSupport(renderer);
          loader.setKTX2Loader(ktx2);
        } catch (e) {}
      }
    }

    function tryUrl(name, withKtx2) {
      if (tried[name]) return Promise.reject(new Error("exhausted"));
      tried[name] = true;
      var url = cdnBase + name;
      setStatus("loading " + name);
      return new Promise(function (res, rej) {
        var loader = new GLTFLoader();
        attachDecoders(loader, withKtx2);
        var bytes = 0;
        loader.load(
          url,
          function (gltf) {
            while (root.children.length) root.remove(root.children[0]);
            root.add(gltf.scene);
            normalizeMaterials(gltf.scene);
            var box = new THREE.Box3().setFromObject(gltf.scene);
            STATE.bbox = {
              min: box.min.toArray(),
              max: box.max.toArray(),
              size: box.getSize(new THREE.Vector3()).toArray(),
            };
            res({
              bytes: bytes,
              draco: true,
              ktx2: withKtx2 && name.indexOf("ktx2") >= 0,
              fallbackWebp: name.indexOf("webp") >= 0 || name.indexOf("lite") >= 0,
            });
          },
          function (ev) {
            if (ev && ev.total) {
              bytes = ev.total;
              STATE.bytes = bytes;
              STATE.loadProgress = Math.min(0.99, ev.loaded / ev.total);
            }
          },
          function (err) {
            rej(err);
          }
        );
      });
    }

    var chain;
    if (forceWebp) {
      chain = tryUrl("cave-webp.glb", false).catch(function () {
        return tryUrl("cave-lite.glb", false);
      });
    } else {
      chain = tryUrl("cave-draco.ktx2.glb", true)
        .catch(function () {
          return tryUrl("cave-webp.glb", false);
        })
        .catch(function () {
          return tryUrl("cave-lite.glb", false);
        });
    }
    chain.then(resolve).catch(reject);
  });
}

function makeShaft() {
  var group = new THREE.Group();
  var uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x4ad8ff) },
    uOpacity: { value: 0.48 },
  };
  var mat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: [
      "varying vec2 vUv;",
      "varying vec3 vNormal;",
      "varying vec3 vView;",
      "void main(){",
      "  vUv = uv;",
      "  vec4 mv = modelViewMatrix * vec4(position,1.0);",
      "  vNormal = normalize(normalMatrix * normal);",
      "  vView = normalize(-mv.xyz);",
      "  gl_Position = projectionMatrix * mv;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;",
      "uniform float uTime; uniform vec3 uColor; uniform float uOpacity;",
      "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }",
      "float noise(vec2 p){",
      "  vec2 i = floor(p); vec2 f = fract(p);",
      "  float a = hash(i); float b = hash(i + vec2(1.0,0.0));",
      "  float c = hash(i + vec2(0.0,1.0)); float d = hash(i + vec2(1.0,1.0));",
      "  vec2 u = f*f*(3.0-2.0*f);",
      "  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;",
      "}",
      "void main(){",
      "  /* cylinder UV: x around, y along — soft rim via fresnel, soft density along */",
      "  float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.6);",
      "  float along = pow(1.0 - vUv.y, 1.05) * smoothstep(0.0, 0.08, vUv.y);",
      "  float n = noise(vec2(vUv.x * 3.5, vUv.y * 8.0 - uTime * 0.15));",
      "  float n2 = noise(vec2(vUv.x * 9.0 + uTime * 0.04, vUv.y * 16.0));",
      "  float dens = along * (0.35 + 0.65 * fres) * (0.78 + 0.22 * n) * (0.9 + 0.12 * n2);",
      "  float a = dens * uOpacity;",
      "  vec3 col = uColor * (0.75 + 0.35 * dens);",
      "  gl_FragColor = vec4(col, a);",
      "}",
    ].join("\n"),
  });
  /* tapered cone: tip near pedestal, wide at roof opening — diagonal */
  var mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(2.45, 0.16, 12.6, 64, 32, true),
    mat
  );
  var top = blToThree([0.15, -6.55, 9.7]);
  var tip = blToThree([0.05, 0.05, 0.62]);
  mesh.position.copy(top).add(tip).multiplyScalar(0.5);
  mesh.lookAt(tip);
  mesh.rotateX(Math.PI / 2);
  group.add(mesh);

  /* secondary softer shell */
  var mat2 = mat.clone();
  mat2.uniforms = {
    uTime: uniforms.uTime,
    uColor: { value: new THREE.Color(0x6ae4ff) },
    uOpacity: { value: 0.2 },
  };
  var shell = new THREE.Mesh(
    new THREE.CylinderGeometry(3.05, 0.32, 12.4, 48, 20, true),
    mat2
  );
  shell.position.copy(mesh.position);
  shell.quaternion.copy(mesh.quaternion);
  group.add(shell);

  return {
    group: group,
    update: function (t) {
      uniforms.uTime.value = t;
      mat2.uniforms.uTime.value = t;
    },
  };
}

function makeSmoke() {
  var group = new THREE.Group();
  var mats = [];
  for (var i = 0; i < 6; i++) {
    var uniforms = {
      uTime: { value: 0 },
      uSeed: { value: i * 19.17 },
      uColor: { value: new THREE.Color(0x7ad8ef) },
    };
    var mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: uniforms,
      vertexShader:
        "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: [
        "varying vec2 vUv; uniform float uTime; uniform float uSeed; uniform vec3 uColor;",
        "float n(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }",
        "void main(){",
        "  vec2 uv = vUv * 2.0 - 1.0;",
        "  float d = length(uv);",
        "  float wisp = smoothstep(1.0, 0.15, d);",
        "  float f = n(uv * 2.5 + uTime * 0.04 + uSeed);",
        "  float a = wisp * (0.028 + 0.025 * f);",
        "  gl_FragColor = vec4(uColor, a);",
        "}",
      ].join("\n"),
    });
    mats.push(mat);
    var spr = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), mat);
    var tt = i / 6;
    spr.position.copy(blToThree([0.05, -6.0 + tt * 5.5, 9.2 - tt * 7.8]));
    group.add(spr);
  }
  return {
    group: group,
    update: function (t) {
      for (var i = 0; i < mats.length; i++) mats[i].uniforms.uTime.value = t;
    },
  };
}

function makeDust() {
  /* soft glowing sprites — avoid hard square dots */
  var count = 220;
  var positions = new Float32Array(count * 3);
  var phases = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    var t = Math.random();
    var r = Math.random() * (0.12 + t * 1.35);
    var ang = Math.random() * Math.PI * 2;
    var along = blToThree([
      0.05 + Math.cos(ang) * r * 0.18,
      -6.15 + t * 5.7,
      9.35 - t * 8.0,
    ]);
    positions[i * 3] = along.x;
    positions[i * 3 + 1] = along.y;
    positions[i * 3 + 2] = along.z;
    phases[i] = Math.random() * Math.PI * 2;
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  var dustCanvas = document.createElement("canvas");
  dustCanvas.width = 64;
  dustCanvas.height = 64;
  var ctx = dustCanvas.getContext("2d");
  var grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(220,245,255,1)");
  grd.addColorStop(0.35, "rgba(170,230,255,0.55)");
  grd.addColorStop(1, "rgba(100,200,255,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  var dustTex = new THREE.CanvasTexture(dustCanvas);

  var mat = new THREE.PointsMaterial({
    color: 0xc8f2ff,
    map: dustTex,
    size: 0.14,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    alphaTest: 0.02,
  });
  var points = new THREE.Points(geo, mat);
  return {
    points: points,
    update: function (t) {
      var pos = geo.attributes.position.array;
      for (var i = 0; i < count; i++) {
        var ph = phases[i];
        pos[i * 3 + 1] += Math.sin(t * 0.35 + ph) * 0.0004;
        pos[i * 3] += Math.cos(t * 0.22 + ph) * 0.00025;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.3 + 0.12 * Math.sin(t * 0.55);
    },
  };
}
