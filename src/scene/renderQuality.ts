import type { Quality } from './PoolWater'

/** Keep small/medium windows crisp without supersampling a native 4K view again. */
export function scenePixelRatio(quality:Quality,width:number,height:number,deviceRatio:number){
  const desired=quality==='high'?Math.min(2,Math.max(1.5,deviceRatio)):quality==='balanced'?1.25:.8
  const budget=quality==='high'?8294400:quality==='balanced'?3686400:1600000
  return Math.min(desired,Math.sqrt(budget/Math.max(1,width*height)))
}
export function captureSize(width:number,height:number,scale:number,maxEdge:number,maxPixels:number):[number,number]{
  const w=Math.max(1,width*scale),h=Math.max(1,height*scale)
  const fit=Math.min(1,maxEdge/Math.max(w,h),Math.sqrt(maxPixels/(w*h)))
  return [Math.max(1,Math.round(w*fit)),Math.max(1,Math.round(h*fit))]
}
