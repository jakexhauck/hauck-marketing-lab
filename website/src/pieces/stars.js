import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* 05 ADVERTISE: five machined chrome stars mounted on a steel rail.
   The fifth star is copper. */

function starGeometry(rOuter, depth){
  const rInner = rOuter * 0.46;
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++){
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3,
    curveSegments: 4
  });
  geo.translate(0, 0, -depth / 2);
  /* flip so the first point aims up */
  geo.rotateZ(Math.PI);
  return geo;
}

export function create(ctx){
  const { mats } = ctx;
  const group = new THREE.Group();

  const railY = 1.06;
  const span = 2.0;

  /* feet and posts */
  [-span / 2 + 0.1, span / 2 - 0.1].forEach(x => {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 48), mats.steelRadial);
    foot.position.set(x, 0.04, 0);
    foot.receiveShadow = true;
    foot.castShadow = true;
    group.add(foot);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, railY - 0.08, 24), mats.steel);
    post.position.set(x, 0.08 + (railY - 0.08) / 2, 0);
    post.castShadow = true;
    group.add(post);
  });

  /* brushed steel rail */
  const rail = new THREE.Mesh(new RoundedBoxGeometry(span + 0.24, 0.09, 0.14, 3, 0.03), mats.steel);
  rail.position.y = railY;
  rail.castShadow = true;
  group.add(rail);

  /* five stars on short mounts above the rail.
     Each star tilts back a touch so the flat faces catch the warm key
     and the bright overhead of the environment instead of mirroring
     the dark room straight back at the camera. */
  const starGeoChrome = starGeometry(0.185, 0.07);
  const starGeoCopper = starGeometry(0.215, 0.08);
  const mountGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 16);

  const starChrome = new THREE.MeshPhysicalMaterial({
    color: 0xe2e5e9,
    metalness: 1.0,
    roughness: 0.12,
    envMapIntensity: 1.7
  });

  /* dedicated copper for the fifth star: rougher and dimmer than the shared
     copper so its face does not blow out to white under the key light */
  const starCopper = new THREE.MeshPhysicalMaterial({
    color: 0xC98B5E,
    metalness: 1.0,
    roughness: 0.4,
    envMapIntensity: 0.75
  });

  for (let i = 0; i < 5; i++){
    const x = -span / 2 + 0.08 + i * ((span - 0.16) / 4);
    const isCopper = i === 4;

    const mount = new THREE.Mesh(mountGeo, mats.darkMetal);
    mount.position.set(x, railY + 0.045 + 0.08, 0);
    group.add(mount);

    const star = new THREE.Mesh(
      isCopper ? starGeoCopper : starGeoChrome,
      isCopper ? starCopper : starChrome
    );
    star.position.set(x, railY + 0.125 + (isCopper ? 0.22 : 0.19), 0);
    star.rotation.x = isCopper ? -0.16 : -0.3;
    star.rotation.z = (i - 2) * 0.04;
    star.castShadow = true;
    group.add(star);
  }

  ctx.addContactShadow(group, 3.0, 1.8, 0.9);

  group.rotation.y = -0.1;
  return group;
}
