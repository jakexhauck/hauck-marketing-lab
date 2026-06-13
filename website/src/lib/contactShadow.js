import * as THREE from 'three';
import { makeCanvas } from './canvasTextures.js';

/* Soft radial contact shadow under each piece. Baked once, shared by all. */

let sharedTexture = null;

function texture(){
  if (sharedTexture) return sharedTexture;
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  sharedTexture = new THREE.CanvasTexture(c);
  return sharedTexture;
}

export function addContactShadow(group, width = 2.4, depth = 2.0, opacity = 1.0){
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({
      map: texture(),
      transparent: true,
      opacity,
      depthWrite: false
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  group.add(mesh);
  return mesh;
}
