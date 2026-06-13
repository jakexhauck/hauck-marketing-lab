import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMaterials } from './lib/materials.js';
import { noiseRoughness } from './lib/canvasTextures.js';
import { addContactShadow } from './lib/contactShadow.js';

/* The fixed showroom stage. One scene, one environment, one light rig.
   Pieces swap in and out of a single root group.

   RENDER ON DEMAND: there is no continuous rAF loop. A frame is scheduled
   only while something is unsettled (parallax easing, scroll-tied spin,
   a swap tween, the boot probe). When everything is within epsilon of its
   target, nothing is scheduled and the GPU goes idle. */

const EASE = t => 1 - Math.pow(1 - t, 3);

export function createStage({ settings, reduceMotion }){
  const holder = document.getElementById('stage');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.dprCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  holder.appendChild(renderer.domElement);
  const canvasEl = renderer.domElement;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0A0B0D);
  scene.fog = new THREE.Fog(0x0A0B0D, 9, 26);

  /* Environment map: essential for believable metal and glass. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const narrow = () => window.innerWidth < 760;
  const camera = new THREE.PerspectiveCamera(narrow() ? 44 : 36, window.innerWidth / window.innerHeight, 0.1, 60);

  /* Parallax rig holds everything so floor and lights tilt together. */
  const rig = new THREE.Group();
  scene.add(rig);

  /* Floor: polished dark concrete, like the showroom mockup. */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshStandardMaterial({
      color: 0x141519,
      roughness: 0.27,
      metalness: 0.1,
      roughnessMap: noiseRoughness(),
      envMapIntensity: 0.5
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = settings.shadows;
  rig.add(floor);

  /* Distant backdrop so the dark never goes flat black. */
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 30),
    new THREE.MeshStandardMaterial({ color: 0x121419, roughness: 0.95, metalness: 0 })
  );
  backdrop.position.set(0, 9, -17);
  rig.add(backdrop);

  /* Warm studio glow behind the piece slot. Graduated, never flat black,
     and OPAQUE on purpose: transmission glass cannot see transparent
     objects, so this gives the glass something real to refract. */
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 512;
  glowCanvas.height = 256;
  {
    const g = glowCanvas.getContext('2d');
    const grad = g.createRadialGradient(256, 112, 10, 256, 124, 240);
    grad.addColorStop(0, '#54462f');
    grad.addColorStop(0.28, '#241f1c');
    grad.addColorStop(0.62, '#121317');
    grad.addColorStop(1, '#0A0B0D');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
  }
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const glowRoot = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 9),
    new THREE.MeshBasicMaterial({ map: glowTex, fog: false })
  );
  glow.position.set(0, 2.1, -3.4);
  glowRoot.add(glow);
  rig.add(glowRoot);

  /* Lighting: warm tungsten key, cool rim, faint copper kicker, low ambient bed. */
  const key = new THREE.SpotLight(0xffe2c4, 300);
  key.position.set(-4.4, 6.4, 4.6);
  key.angle = 0.6;
  key.penumbra = 0.7;
  key.decay = 2;
  if (settings.shadows){
    key.castShadow = true;
    key.shadow.mapSize.set(settings.shadowSize, settings.shadowSize);
    key.shadow.bias = -0.0004;
    key.shadow.radius = 5;
  }
  key.target.position.set(0, 1.0, 0);
  rig.add(key, key.target);

  const rim = new THREE.SpotLight(0x9fb4cc, 150);
  rim.position.set(3.8, 3.4, -4.4);
  rim.angle = 0.7;
  rim.penumbra = 0.8;
  rim.decay = 2;
  rim.target.position.set(0, 1.2, 0);
  rig.add(rim, rim.target);

  const kicker = new THREE.PointLight(0xC98B5E, 16, 12, 2);
  kicker.position.set(2.3, 0.7, 3.0);
  rig.add(kicker);

  scene.add(new THREE.HemisphereLight(0x252a33, 0x0b0c0e, 0.5));

  /* The single piece slot. */
  const pieceRoot = new THREE.Group();
  rig.add(pieceRoot);

  const mats = createMaterials(settings);
  const ctx = {
    mats,
    settings,
    addContactShadow,
    anisotropy: renderer.capabilities.getMaxAnisotropy()
  };

  /* ---------- animated state, all damped toward targets ---------- */

  const state = {
    parX: 0, parY: 0, parXT: 0, parYT: 0,        /* rig parallax tilt */
    offX: 0, offXT: 0,                           /* piece lateral offset */
    spin: 0, spinT: 0,                           /* scroll-tied piece spin */
    dolly: 0                                     /* swap settle, decays to 0 */
  };

  let renders = 0;
  let rafId = null;
  let lastT = 0;
  let probe = null;       /* { left, times, resolve } */
  let swap = null;        /* { phase, t0, dur } */
  let pendingName = null;
  let currentName = null;
  const cache = new Map();

  function invalidate(){
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  function mount(name){
    const group = cache.get(name);
    if (!group) return;
    pieceRoot.clear();
    pieceRoot.add(group);
    currentName = name;
  }

  function applyCamera(){
    const n = narrow();
    const lookY = n ? 0.5 : 1.0;
    const camY = n ? 1.5 : 1.55;
    const camZ = (n ? 8.6 : 7.6) + state.dolly;
    camera.position.set(state.offX * 0.18, camY, camZ);
    camera.lookAt(state.offX * 0.55, lookY, 0);
  }

  function tick(now){
    rafId = null;
    let live = false;
    const dt = Math.min((now - lastT) / 1000, 0.05) || 0.016;
    lastT = now;

    /* framerate-independent damping */
    const k = reduceMotion ? 1 : 1 - Math.pow(0.002, dt);
    const chase = (cur, target, eps) => {
      const next = cur + (target - cur) * k;
      if (Math.abs(target - next) > eps){ live = true; return next; }
      return target;
    };

    state.parX = chase(state.parX, state.parXT, 0.0004);
    state.parY = chase(state.parY, state.parYT, 0.0004);
    state.offX = chase(state.offX, state.offXT, 0.002);
    state.spin = chase(state.spin, state.spinT, 0.0008);

    /* swap tween: quick fade out, mount, fade in with a small dolly settle */
    if (swap){
      const p = Math.min((now - swap.t0) / swap.dur, 1);
      if (swap.phase === 'out'){
        canvasEl.style.opacity = (1 - EASE(p)).toFixed(3);
        if (p >= 1){
          mount(pendingName);
          pendingName = null;
          state.dolly = 0.34;
          swap = { phase: 'in', t0: now, dur: 250 };
        }
      } else {
        canvasEl.style.opacity = EASE(p).toFixed(3);
        state.dolly = 0.34 * (1 - EASE(p));
        if (p >= 1){
          state.dolly = 0;
          swap = null;
        }
      }
      live = live || swap !== null;
    }

    rig.rotation.y = state.parY;
    rig.rotation.x = state.parX * 0.6;
    pieceRoot.position.x = state.offX;
    pieceRoot.rotation.y = state.spin;
    glowRoot.position.x = state.offX;
    applyCamera();

    renderer.render(scene, camera);
    renders++;

    if (probe){
      probe.times.push(now);
      probe.left--;
      if (probe.left <= 0){
        const t = probe.times;
        let sum = 0;
        for (let i = 1; i < t.length; i++) sum += t[i] - t[i - 1];
        probe.resolve(t.length > 1 ? sum / (t.length - 1) : 0);
        probe = null;
      } else {
        live = true;
      }
    }

    if (live) invalidate();
  }

  /* ---------- public API ---------- */

  function register(name, group){
    cache.set(name, group);
  }

  function has(name){
    return cache.has(name);
  }

  function show(name){
    if (!cache.has(name)) return;
    if (name === currentName && !pendingName) return;
    if (reduceMotion){
      mount(name);
      canvasEl.style.opacity = '1';
      invalidate();
      return;
    }
    pendingName = name;
    if (!swap || swap.phase !== 'out'){
      swap = { phase: 'out', t0: performance.now(), dur: 160 };
    }
    invalidate();
  }

  /* First reveal: mount directly and fade the canvas up. */
  function reveal(name){
    mount(name);
    if (reduceMotion){
      canvasEl.style.opacity = '1';
      invalidate();
      return;
    }
    state.dolly = 0.34;
    swap = { phase: 'in', t0: performance.now(), dur: 600 };
    invalidate();
  }

  /* textSide is where the copy sits; the piece moves the opposite way. */
  function setSide(textSide){
    if (narrow() || textSide === 'center'){ state.offXT = 0; return invalidate(); }
    state.offXT = textSide === 'left' ? 1.3 : -1.3;
    invalidate();
  }

  function setProgress(p){
    state.spinT = (p - 0.5) * (reduceMotion ? 0 : 0.26);
    invalidate();
  }

  function setParallax(nx, ny){
    if (reduceMotion) return;
    state.parYT = nx * 0.05;
    state.parXT = ny * 0.025;
    invalidate();
  }

  /* Measure n consecutive frames; resolves with the average frame time in ms. */
  function runProbe(n){
    return new Promise(resolve => {
      probe = { left: n, times: [], resolve };
      invalidate();
    });
  }

  /* Drop one tier at runtime if the probe came back slow. */
  function degrade(next){
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dprCap));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (!next.transmission) mats.degradeGlass();
    if (!next.shadows){
      key.castShadow = false;
    } else if (key.castShadow && key.shadow.mapSize.x > next.shadowSize){
      key.shadow.mapSize.set(next.shadowSize, next.shadowSize);
      if (key.shadow.map){ key.shadow.map.dispose(); key.shadow.map = null; }
    }
    if (!next.grain) document.body.classList.add('no-grain');
    invalidate();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = narrow() ? 44 : 36;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    invalidate();
  });

  /* tiny instrumentation hook for verification */
  Object.defineProperty(window, '__hmRenders', { get: () => renders });

  return { ctx, register, has, show, reveal, setSide, setProgress, setParallax, runProbe, degrade, invalidate };
}
