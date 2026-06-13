import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* 03 AUTOMATE: meshed polished-steel gears frozen mid-mesh, one copper. */

function gearGeometry(teeth, rPitch, toothH, holeR, depth){
  const rRoot = rPitch - toothH / 2;
  const rTip = rPitch + toothH / 2;
  const step = (Math.PI * 2) / teeth;
  const shape = new THREE.Shape();

  for (let i = 0; i < teeth; i++){
    const a = i * step;
    const pts = [
      [rRoot, a],
      [rRoot, a + step * 0.30],
      [rTip, a + step * 0.38],
      [rTip, a + step * 0.58],
      [rRoot, a + step * 0.66]
    ];
    pts.forEach((p, j) => {
      const x = Math.cos(p[1]) * p[0];
      const y = Math.sin(p[1]) * p[0];
      if (i === 0 && j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 8
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function gear(ctx, teeth, rPitch, material, depth = 0.12){
  const { mats } = ctx;
  const g = new THREE.Group();
  const toothH = 0.11;
  const body = new THREE.Mesh(gearGeometry(teeth, rPitch, toothH, rPitch * 0.22, depth), material);
  body.castShadow = true;
  g.add(body);

  /* hub and chrome axle cap */
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rPitch * 0.32, rPitch * 0.32, depth + 0.08, 32), material);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(rPitch * 0.1, rPitch * 0.1, depth + 0.22, 20), mats.chrome);
  axle.rotation.x = Math.PI / 2;
  g.add(axle);

  /* lightening holes */
  const holeGeo = new THREE.CylinderGeometry(rPitch * 0.12, rPitch * 0.12, depth + 0.02, 20);
  for (let i = 0; i < 5; i++){
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const h = new THREE.Mesh(holeGeo, mats.ink);
    h.rotation.x = Math.PI / 2;
    h.position.set(Math.cos(a) * rPitch * 0.58, Math.sin(a) * rPitch * 0.58, 0);
    g.add(h);
  }
  return g;
}

export function create(ctx){
  const { mats } = ctx;
  const group = new THREE.Group();

  /* stand: base slab plus a vertical dark backplate */
  const base = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.12, 0.8, 3, 0.03), mats.darkMetal);
  base.position.y = 0.06;
  base.receiveShadow = true;
  group.add(base);

  const plate = new THREE.Mesh(new RoundedBoxGeometry(1.9, 1.7, 0.08, 3, 0.03), mats.ink);
  plate.position.set(0, 0.12 + 0.85, -0.18);
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);

  /* gears mounted in front of the plate, frozen mid-mesh.
     center distances use the pitch radii so teeth interleave. */
  const zG = 0.02;

  const big = gear(ctx, 16, 0.56, mats.steel);
  big.position.set(-0.38, 0.95, zG);
  big.rotation.z = 0.0;
  group.add(big);

  const copperGear = gear(ctx, 11, 0.38, mats.copper);
  copperGear.position.set(-0.38 + (0.56 + 0.38) * 1.01, 0.95 - 0.12, zG);
  copperGear.rotation.z = (Math.PI * 2 / 11) * 0.5 + 0.12;
  group.add(copperGear);

  const small = gear(ctx, 9, 0.3, mats.steel);
  small.position.set(-0.38 + 0.30, 0.95 + (0.56 + 0.30) * 0.92, zG);
  small.rotation.z = (Math.PI * 2 / 9) * 0.5 - 0.1;
  group.add(small);

  ctx.addContactShadow(group, 3.0, 2.2, 0.95);

  group.rotation.y = -0.14;
  return group;
}
