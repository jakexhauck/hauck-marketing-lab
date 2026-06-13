import * as THREE from 'three';

/* 04 AUTOMATE: a glass data core. A vertical stack of discs inside a glass
   cylinder. Lower discs sit dim and dark; the upper discs glow copper,
   dormant contacts coming back to life. */

export function create(ctx){
  const { mats } = ctx;
  const group = new THREE.Group();

  /* steel base */
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.72, 0.18, 64), mats.steelRadial);
  base.position.y = 0.09;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.014, 12, 64), mats.copper);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.185;
  group.add(trim);

  /* central spine. Opaque, visible through the glass. */
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 24), mats.darkMetal);
  spine.position.y = 0.18 + 0.75;
  group.add(spine);

  /* disc stack: 9 discs, dim at the bottom, copper-hot at the top */
  const discGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.075, 48);
  const dimMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.7, roughness: 0.5 });
  for (let i = 0; i < 9; i++){
    const t = i / 8;
    let mat;
    if (i < 4){
      mat = dimMat;
    } else {
      /* capped so the hottest disc still reads copper, not white */
      mat = mats.copperGlow(0.2 + Math.pow(t, 2.2) * 1.0);
    }
    const d = new THREE.Mesh(discGeo, mat);
    d.position.y = 0.28 + i * 0.152;
    group.add(d);
  }

  /* warm core light near the top of the stack */
  const glow = new THREE.PointLight(0xff9a4a, 2.0, 2.0, 2);
  glow.position.set(0, 1.55, 0);
  group.add(glow);

  /* glass cylinder enclosure (small glass element, open-ended) */
  const glass = mats.makeGlass({ thickness: 0.5, overrides: { side: THREE.DoubleSide } });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 1.5, 64, 1, true), glass);
  tube.position.y = 0.18 + 0.75;
  group.add(tube);

  /* steel top cap */
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.58, 0.12, 64), mats.steelRadial);
  cap.position.y = 0.18 + 1.5 + 0.06;
  cap.castShadow = true;
  group.add(cap);

  const capTrim = new THREE.Mesh(new THREE.TorusGeometry(0.59, 0.012, 12, 64), mats.copper);
  capTrim.rotation.x = Math.PI / 2;
  capTrim.position.y = 0.18 + 1.5 + 0.01;
  group.add(capTrim);

  ctx.addContactShadow(group, 2.6, 2.6, 0.95);

  return group;
}
