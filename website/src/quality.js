/* Quality tiers. Decided once at startup, can only drop after the frame probe. */

export const HIGH = 'high';
export const MID = 'mid';
export const LOW = 'low';

/* Returns a tier name, or null when WebGL is unavailable. */
export function detectTier(){
  try{
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }catch(e){
    return null;
  }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 820;
  return (coarse && small) ? MID : HIGH;
}

export function lowerTier(tier){
  return tier === HIGH ? MID : LOW;
}

export function settingsFor(tier){
  if (tier === HIGH){
    return { tier, dprCap: 2, shadows: true, shadowSize: 2048, transmission: true, grain: true };
  }
  if (tier === MID){
    return { tier, dprCap: 1.5, shadows: true, shadowSize: 1024, transmission: false, grain: true };
  }
  return { tier: LOW, dprCap: 1, shadows: false, shadowSize: 512, transmission: false, grain: false };
}
