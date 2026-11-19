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
  Poytara caverna v0.7.1 — realtime Igloo-style (SEM notebook / SEM video).
  Composição v0.6.2. Publicado 792 sem CSP → Draco/KTX2 OK; a=dr → force WebP.
  Fix: on GLB ready also add .is-three so CSS reveals #pyOpenThree.
*/

var BUILD = "cenario-caverna-v071-20261119150600";
var CDN_TAG = "v0.7.1";

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
  if (statusEl) statusEl.textContent = msg;
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
    });
  } catch (err) {
    fail("WebGL init falhou");
    return;
  }
  STATE.webglOk = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(
    canvas.clientWidth || window.innerWidth,
    canvas.clientHeight || window.innerHeight,
    false
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x0a0e14, 1);

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b121a, 0.01);

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

  scene.add(new THREE.AmbientLight(0x8a9bb0, 0.45));
  var amber = new THREE.PointLight(0xff7a28, 28, 14, 2);
  amber.position.set(0, 1.35, 0);
  scene.add(amber);
  var cool = new THREE.DirectionalLight(0x6a90b8, 0.55);
  cool.position.set(-5, 6, 3);
  scene.add(cool);
  var cyanKey = new THREE.SpotLight(0x3ecfff, 90, 36, Math.PI / 9, 0.5, 1);
  cyanKey.position.copy(blToThree([0.1, -6.4, 9.6]));
  cyanKey.target.position.copy(blToThree([0, 0, 0.58]));
  scene.add(cyanKey);
  scene.add(cyanKey.target);

  /* Fissure emit */
  var fissure = new THREE.Mesh(
    new THREE.PlaneGeometry(5.5, 4.2),
    new THREE.MeshBasicMaterial({
      color: 0x78e8ff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  fissure.position.copy(blToThree([0.1, -7.0, 10.2]));
  fissure.lookAt(blToThree([0.1, -2.0, 4.0]));
  scene.add(fissure);

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
    0.22,
    0.5,
    0.85
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
      "  c.rgb = mix(c.rgb, c.rgb * vec3(0.92, 1.02, 1.08), 0.3);",
      "  c.rgb = mix(c.rgb, c.rgb * vec3(1.08, 0.95, 0.82), 0.1);",
      "  vec2 p = vUv * 2.0 - 1.0;",
      "  float vig = smoothstep(1.55, 0.35, dot(p,p));",
      "  c.rgb *= mix(0.6, 1.0, vig);",
      "  float g = grain(vUv * vec2(1920.0, 1080.0) + uTime) * 0.03;",
      "  c.rgb += g - 0.015;",
      "  c.rgb = (c.rgb - 0.5) * 1.06 + 0.5;",
      "  gl_FragColor = c;",
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

  function onResize() {
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
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
    var breath = reduced ? 0 : Math.sin(t * 0.45) * 0.035;
    var px = mouse.x * 0.12;
    var py = mouse.y * 0.08;
    var sp = scrollParallax * 0.35;
    camera.position.set(
      camDef.position.x + px + breath * 0.25,
      camDef.position.y + py * 0.5 + breath,
      camDef.position.z + sp
    );
    camera.lookAt(
      lookTarget.x + px * 0.15,
      lookTarget.y + breath * 0.2,
      lookTarget.z
    );

    shaft.update(t);
    smoke.update(t);
    dust.update(t);
    gradeUniforms.uTime.value = t;
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

function toBasic(mat) {
  if (!mat || mat.isMeshBasicMaterial) return mat;
  var tex = mat.map || mat.emissiveMap || null;
  if (tex) {
    var m = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
    if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    return m;
  }
  if (mat.color) {
    return new THREE.MeshBasicMaterial({ color: mat.color.clone() });
  }
  return new THREE.MeshBasicMaterial({ color: 0x445566 });
}

function normalizeMaterials(root) {
  root.traverse(function (o) {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    if (Array.isArray(o.material)) {
      o.material = o.material.map(toBasic);
    } else {
      o.material = toBasic(o.material);
    }
  });
}

function addLitePlaceholder(root) {
  var floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 48),
    new THREE.MeshBasicMaterial({ color: 0x1a1f28 })
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  var ped = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.14, 0.58, 48),
    new THREE.MeshBasicMaterial({ color: 0x2a3038 })
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
    uColor: { value: new THREE.Color(0x3ecfff) },
    uOpacity: { value: 0.42 },
  };
  var mat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader:
      "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: [
      "varying vec2 vUv; uniform float uTime; uniform vec3 uColor; uniform float uOpacity;",
      "void main(){",
      "  float soft = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);",
      "  float along = pow(1.0 - vUv.y, 1.3);",
      "  float noise = sin(vUv.y * 16.0 + uTime * 0.35) * 0.04;",
      "  float a = soft * along * (0.75 + noise) * uOpacity;",
      "  gl_FragColor = vec4(uColor, a);",
      "}",
    ].join("\n"),
  });
  var mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 0.2, 12.0, 32, 1, true),
    mat
  );
  var top = blToThree([0.1, -6.4, 9.6]);
  var tip = blToThree([0.0, 0.0, 0.58]);
  mesh.position.copy(top).add(tip).multiplyScalar(0.5);
  mesh.lookAt(tip);
  mesh.rotateX(Math.PI / 2);
  group.add(mesh);
  return {
    group: group,
    update: function (t) {
      uniforms.uTime.value = t;
    },
  };
}

function makeSmoke() {
  var group = new THREE.Group();
  var mats = [];
  for (var i = 0; i < 8; i++) {
    var uniforms = {
      uTime: { value: 0 },
      uSeed: { value: i * 17.13 },
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
        "  float wisp = smoothstep(1.0, 0.2, d);",
        "  float f = n(uv * 3.0 + uTime * 0.05 + uSeed);",
        "  float a = wisp * (0.04 + 0.035 * f);",
        "  gl_FragColor = vec4(uColor, a);",
        "}",
      ].join("\n"),
    });
    mats.push(mat);
    var spr = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mat);
    var tt = i / 8;
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
  var count = 700;
  var positions = new Float32Array(count * 3);
  var phases = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    var t = Math.random();
    var r = Math.random() * (0.15 + t * 1.5);
    var ang = Math.random() * Math.PI * 2;
    var along = blToThree([
      0.05 + Math.cos(ang) * r * 0.15,
      -6.2 + t * 5.8,
      9.4 - t * 8.2,
    ]);
    positions[i * 3] = along.x;
    positions[i * 3 + 1] = along.y;
    positions[i * 3 + 2] = along.z;
    phases[i] = Math.random() * Math.PI * 2;
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  var mat = new THREE.PointsMaterial({
    color: 0xb8f3ff,
    size: 0.04,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  var points = new THREE.Points(geo, mat);
  return {
    points: points,
    update: function (t) {
      var pos = geo.attributes.position.array;
      for (var i = 0; i < count; i++) {
        var ph = phases[i];
        pos[i * 3 + 1] += Math.sin(t * 0.4 + ph) * 0.0008;
        pos[i * 3] += Math.cos(t * 0.25 + ph) * 0.0005;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.5 + 0.25 * Math.sin(t * 0.7);
    },
  };
}
