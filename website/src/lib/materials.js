import * as THREE from 'three';
import { brushedLinear, brushedRadial } from './canvasTextures.js';

/* One material family shared by every piece: machined steel, dark metal,
   copper accents, chrome, glass. Pieces never invent their own finishes. */

export function createMaterials(settings){
  const brushLin = brushedLinear();
  const brushRad = brushedRadial();

  const steel = new THREE.MeshPhysicalMaterial({
    color: 0xb9bdc2,
    metalness: 0.9,
    roughness: 0.35,
    roughnessMap: brushLin,
    clearcoat: 0.15,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.85
  });

  const steelRadial = new THREE.MeshPhysicalMaterial({
    color: 0xb9bdc2,
    metalness: 0.95,
    roughness: 0.32,
    roughnessMap: brushRad,
    clearcoat: 0.1,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.9
  });

  const darkMetal = new THREE.MeshPhysicalMaterial({
    color: 0x2a2d33,
    metalness: 0.85,
    roughness: 0.45,
    envMapIntensity: 0.6
  });

  const ink = new THREE.MeshStandardMaterial({
    color: 0x0d0e11,
    metalness: 0.4,
    roughness: 0.6
  });

  const copper = new THREE.MeshPhysicalMaterial({
    color: 0xC98B5E,
    metalness: 1.0,
    roughness: 0.28,
    envMapIntensity: 1.1
  });

  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xd6d9dd,
    metalness: 1.0,
    roughness: 0.08,
    envMapIntensity: 1.25
  });

  /* Heated copper, used for glowing internals. Opaque, so it stays visible
     through transmission glass. */
  function copperGlow(intensity){
    return new THREE.MeshStandardMaterial({
      color: 0x8a5230,
      emissive: 0xff9a4a,
      emissiveIntensity: intensity,
      metalness: 0.3,
      roughness: 0.4
    });
  }

  /* Glass factory. On the HIGH tier this is true transmission glass.
     On MID and LOW it is faked with transparency plus a hot envMap,
     which reads as glass in a dark scene at a fraction of the cost. */
  const glassRegistry = [];
  function makeGlass(opts = {}){
    const real = settings.transmission;
    const m = new THREE.MeshPhysicalMaterial(Object.assign({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.04,
      ior: 1.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      specularIntensity: 1.0,
      envMapIntensity: real ? 1.5 : 2.4,
      transmission: real ? 1.0 : 0.0,
      thickness: real ? (opts.thickness ?? 1.2) : 0.0,
      transparent: !real,
      opacity: real ? 1.0 : 0.45,
      attenuationColor: new THREE.Color(0xF3DFCC),
      attenuationDistance: 6.0
    }, opts.overrides || {}));
    glassRegistry.push(m);
    return m;
  }

  /* Tier drop at runtime: turn every transmission material into fake glass. */
  function degradeGlass(){
    for (const m of glassRegistry){
      if (m.transmission > 0){
        m.transmission = 0;
        m.thickness = 0;
        m.transparent = true;
        m.opacity = 0.45;
        m.envMapIntensity = 2.4;
        m.needsUpdate = true;
      }
    }
  }

  return { steel, steelRadial, darkMetal, ink, copper, chrome, copperGlow, makeGlass, degradeGlass };
}
