import * as THREE from 'three';
/* NOTE: RoundedBoxGeometry is a NAMED export from the addon. */
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* Hero piece: the glass H monogram on its brushed steel pedestal.
   Ported from the approved 2-glass.html mockup, scaled to the shared stage. */

export function create(ctx){
  const { mats } = ctx;
  const group = new THREE.Group();

  const glass = mats.makeGlass({ thickness: 1.4 });

  const hGroup = new THREE.Group();
  const barGeo = new RoundedBoxGeometry(0.4, 1.95, 0.64, 5, 0.05);
  const crossGeo = new RoundedBoxGeometry(0.84, 0.38, 0.64, 5, 0.05);

  const barL = new THREE.Mesh(barGeo, glass);
  barL.position.x = -0.54;
  const barR = new THREE.Mesh(barGeo, glass);
  barR.position.x = 0.54;
  const cross = new THREE.Mesh(crossGeo, glass);

  [barL, barR, cross].forEach(m => { m.castShadow = true; hGroup.add(m); });
  hGroup.position.y = 0.14 + 0.975;
  group.add(hGroup);

  /* Pedestal: lathe-turned brushed steel disc. */
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.16, 0.14, 96), mats.steelRadial);
  pedestal.position.y = 0.07;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  group.add(pedestal);

  /* Thin copper trim ring under the pedestal lip. */
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.012, 12, 96), mats.copper);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.022;
  group.add(trim);

  ctx.addContactShadow(group, 3.4, 3.4, 0.95);

  return group;
}
