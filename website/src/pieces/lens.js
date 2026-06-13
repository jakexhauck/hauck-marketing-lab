import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { knurlStripes, reticleDisc, asTexture } from '../lib/canvasTextures.js';

/* 06 ADVERTISE: a precision targeting lens. Machined barrel, knurled focus
   ring, glass front element with a copper reticle etched inside.
   The reticle lives on an OPAQUE dark disc behind the glass element,
   because transmission glass cannot see transparent objects behind it. */

export function create(ctx){
  const { mats, anisotropy } = ctx;
  const group = new THREE.Group();

  /* cradle: base slab plus two V-blocks */
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.1, 0.9, 3, 0.03), mats.darkMetal);
  base.position.y = 0.05;
  base.receiveShadow = true;
  group.add(base);

  const vGeo = new RoundedBoxGeometry(0.18, 0.34, 0.7, 3, 0.03);
  [-0.5, 0.5].forEach(x => {
    const v = new THREE.Mesh(vGeo, mats.steel);
    v.position.set(x, 0.1 + 0.17, 0);
    v.castShadow = true;
    group.add(v);
  });

  /* the lens body, axis along x, resting in the cradle */
  const lensY = 0.72;
  const lens = new THREE.Group();

  /* rear cap */
  const rear = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.18, 64), mats.darkMetal);
  rear.rotation.z = Math.PI / 2;
  rear.position.x = -0.72;
  rear.castShadow = true;
  lens.add(rear);

  /* main barrel */
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.44, 0.72, 64), mats.steel);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.x = -0.27;
  barrel.castShadow = true;
  lens.add(barrel);

  /* knurled focus ring */
  const knurl = knurlStripes();
  const ringMat = new THREE.MeshPhysicalMaterial({
    color: 0x9da1a7,
    metalness: 0.95,
    roughness: 0.5,
    roughnessMap: knurl,
    bumpMap: knurl,
    bumpScale: 0.6,
    envMapIntensity: 0.8
  });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 96), ringMat);
  ring.rotation.z = Math.PI / 2;
  ring.position.x = 0.24;
  ring.castShadow = true;
  lens.add(ring);

  /* thin copper accent rings */
  [-0.64, 0.07, 0.41].forEach(x => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(x === 0.41 ? 0.5 : 0.465, 0.012, 12, 96), mats.copper);
    t.rotation.y = Math.PI / 2;
    t.position.x = x;
    lens.add(t);
  });

  /* front bezel */
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.5, 0.22, 96), mats.darkMetal);
  bezel.rotation.z = Math.PI / 2;
  bezel.position.x = 0.62;
  bezel.castShadow = true;
  lens.add(bezel);

  /* opaque reticle disc just behind the glass element */
  const reticle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.44, 0.03, 64),
    new THREE.MeshStandardMaterial({
      map: asTexture(reticleDisc(), { anisotropy }),
      emissive: 0xC98B5E,
      emissiveMap: asTexture(reticleDisc(), { anisotropy }),
      emissiveIntensity: 0.32,
      metalness: 0.2,
      roughness: 0.5
    })
  );
  reticle.rotation.z = Math.PI / 2;
  reticle.rotation.y = Math.PI / 2;
  reticle.position.x = 0.64;
  lens.add(reticle);

  /* glass front element: a shallow convex cap */
  const glass = mats.makeGlass({ thickness: 0.5 });
  const front = new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 24, 0, Math.PI * 2, 0, 0.62), glass);
  front.scale.set(1, 0.55, 1);
  front.rotation.z = -Math.PI / 2;
  front.position.x = 0.3;
  lens.add(front);

  lens.position.y = lensY;
  lens.rotation.y = -0.5;
  group.add(lens);

  ctx.addContactShadow(group, 2.8, 2.0, 0.95);

  group.rotation.y = 0.1;
  return group;
}
