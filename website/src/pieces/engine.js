import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* 01 BUILD: a machined steel engine block with a glass window
   revealing glowing copper internals. */

export function create(ctx){
  const { mats } = ctx;
  const group = new THREE.Group();

  /* skid base */
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.12, 1.15, 3, 0.03), mats.darkMetal);
  base.position.y = 0.06;
  base.receiveShadow = true;
  group.add(base);

  /* main block */
  const block = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.05, 0.95, 4, 0.05), mats.steel);
  block.position.y = 0.12 + 0.525;
  block.castShadow = true;
  block.receiveShadow = true;
  group.add(block);

  /* head plate */
  const head = new THREE.Mesh(new RoundedBoxGeometry(1.56, 0.16, 1.0, 3, 0.04), mats.darkMetal);
  head.position.y = 0.12 + 1.05 + 0.08;
  head.castShadow = true;
  group.add(head);

  /* copper intake stacks */
  const stackGeo = new THREE.CylinderGeometry(0.085, 0.1, 0.3, 32);
  for (let i = 0; i < 4; i++){
    const s = new THREE.Mesh(stackGeo, mats.copper);
    s.position.set(-0.54 + i * 0.36, 0.12 + 1.05 + 0.16 + 0.15, 0);
    s.castShadow = true;
    group.add(s);
  }

  /* cooling fins on the rear face */
  const finGeo = new THREE.BoxGeometry(1.3, 0.045, 0.1);
  for (let i = 0; i < 6; i++){
    const f = new THREE.Mesh(finGeo, mats.darkMetal);
    f.position.set(0, 0.34 + i * 0.13, -0.51);
    group.add(f);
  }

  /* window cavity: an opaque dark box recessed into the front face,
     so the glowing internals stay visible through the glass
     (transmission cannot see transparent objects behind it). */
  const cavity = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.34), mats.ink);
  cavity.position.set(0, 0.66, 0.32);
  group.add(cavity);

  /* glowing copper crank inside the cavity */
  const crank = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 20), mats.copperGlow(1.5));
  shaft.rotation.z = Math.PI / 2;
  crank.add(shaft);
  const lobeGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24);
  for (let i = 0; i < 3; i++){
    const lobe = new THREE.Mesh(lobeGeo, mats.copperGlow(1.0 + i * 0.35));
    lobe.rotation.z = Math.PI / 2;
    lobe.position.set(-0.18 + i * 0.18, (i % 2 === 0 ? 0.05 : -0.05), 0);
    crank.add(lobe);
  }
  crank.position.set(0, 0.66, 0.42);
  group.add(crank);

  /* warm spill so the glow reads on the steel around the window */
  const spill = new THREE.PointLight(0xff9a4a, 3.2, 1.8, 2);
  spill.position.set(0, 0.68, 0.62);
  group.add(spill);

  /* glass window pane, flush with the front face */
  const pane = new THREE.Mesh(
    new RoundedBoxGeometry(0.74, 0.52, 0.05, 3, 0.02),
    mats.makeGlass({ thickness: 0.3 })
  );
  pane.position.set(0, 0.66, 0.5);
  group.add(pane);

  /* copper window frame: four slim bars */
  const frameH = new THREE.BoxGeometry(0.84, 0.05, 0.06);
  const frameV = new THREE.BoxGeometry(0.05, 0.6, 0.06);
  const fy = [0.66 + 0.29, 0.66 - 0.29];
  fy.forEach(y => {
    const b = new THREE.Mesh(frameH, mats.copper);
    b.position.set(0, y, 0.5);
    group.add(b);
  });
  [-0.41, 0.41].forEach(x => {
    const b = new THREE.Mesh(frameV, mats.copper);
    b.position.set(x, 0.66, 0.5);
    group.add(b);
  });

  /* chrome head bolts */
  const boltGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.06, 16);
  [[-0.66, 0.42], [0.66, 0.42], [-0.66, -0.42], [0.66, -0.42]].forEach(p => {
    const b = new THREE.Mesh(boltGeo, mats.chrome);
    b.position.set(p[0], 0.12 + 1.05 + 0.16 + 0.03, p[1]);
    group.add(b);
  });

  ctx.addContactShadow(group, 3.0, 2.4, 0.95);

  group.rotation.y = -0.32;
  return group;
}
