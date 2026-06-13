import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { crmDesktopScreen, crmPhoneScreen, asTexture } from '../lib/canvasTextures.js';

/* 02 BUILD: a slim dark laptop open at 110 degrees plus a phone beside it.
   Screens are high-res CanvasTextures, slightly emissive. */

function screenMaterial(canvas, anisotropy){
  const tex = asTexture(canvas, { anisotropy });
  /* envMap and clearcoat stay low so reflections never wash out the UI */
  return new THREE.MeshPhysicalMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 1.05,
    roughness: 0.4,
    metalness: 0.0,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.22
  });
}

export function create(ctx){
  const { mats, anisotropy } = ctx;
  const group = new THREE.Group();

  /* display table slab */
  const slab = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.1, 1.5, 3, 0.03), mats.steel);
  slab.position.y = 0.05;
  slab.receiveShadow = true;
  slab.castShadow = true;
  group.add(slab);

  const tableY = 0.1;

  /* ----- laptop ----- */
  const laptop = new THREE.Group();

  const baseW = 1.5, baseD = 1.0, baseT = 0.05;
  const lapBase = new THREE.Mesh(new RoundedBoxGeometry(baseW, baseT, baseD, 3, 0.02), mats.darkMetal);
  lapBase.position.y = baseT / 2;
  lapBase.castShadow = true;
  laptop.add(lapBase);

  /* keyboard recess */
  const kb = new THREE.Mesh(new THREE.PlaneGeometry(baseW * 0.82, baseD * 0.55), mats.ink);
  kb.rotation.x = -Math.PI / 2;
  kb.position.set(0, baseT + 0.002, -0.08);
  laptop.add(kb);

  /* lid hinged at the rear edge, open 110 degrees */
  const lid = new THREE.Group();
  lid.position.set(0, baseT, -baseD / 2 + 0.02);
  const lidT = 0.04, lidH = 0.95;
  const lidShell = new THREE.Mesh(new RoundedBoxGeometry(baseW, lidH, lidT, 3, 0.02), mats.darkMetal);
  lidShell.position.y = lidH / 2;
  lidShell.castShadow = true;
  lid.add(lidShell);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(baseW * 0.92, lidH * 0.88),
    screenMaterial(crmDesktopScreen(), anisotropy)
  );
  screen.position.set(0, lidH / 2, lidT / 2 + 0.003);
  lid.add(screen);

  /* 110 degrees open: lid leans 20 degrees past vertical, away from the keys */
  lid.rotation.x = -THREE.MathUtils.degToRad(20);
  laptop.add(lid);

  laptop.position.set(-0.32, tableY, 0.1);
  laptop.rotation.y = 0.16;
  group.add(laptop);

  /* ----- phone, leaning on a small steel stand ----- */
  const phone = new THREE.Group();

  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.06), mats.steel);
  stand.position.set(0, 0.13, -0.07);
  stand.rotation.x = -0.18;
  phone.add(stand);

  const body = new THREE.Group();
  const shell = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.74, 0.03, 4, 0.025), mats.ink);
  shell.castShadow = true;
  body.add(shell);
  const pscreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.325, 0.69),
    screenMaterial(crmPhoneScreen(), anisotropy)
  );
  pscreen.position.z = 0.017;
  body.add(pscreen);
  body.position.y = 0.37;
  body.rotation.x = -0.18;
  phone.add(body);

  phone.position.set(0.78, tableY, 0.34);
  phone.rotation.y = -0.3;
  group.add(phone);

  ctx.addContactShadow(group, 3.6, 2.6, 0.95);

  group.rotation.y = 0.06;
  return group;
}
