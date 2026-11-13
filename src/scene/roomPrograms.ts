import type { RegionId, Solid } from './legacyLayout'
import { stairFlight } from './poolModules'

export const roomNames: Record<RegionId,{label:string;english:string}> = {
  arrival:{label:'淋浴更衣室',english:'SHOWER & CHANGE'},
  water:{label:'主泳池',english:'DAYLIGHT POOL'},
  gallery:{label:'转角水道',english:'WATER PASSAGE'},
  columns:{label:'静水泡池',english:'RAISED QUIET BATH'},
  rose:{label:'滑梯浅池',english:'SLIDE & WADE'},
  sun:{label:'光井冷水池',english:'COLD LIGHTWELL'},
  return:{label:'更衣休息廊',english:'REST & CHANGE'},
}
export const slidePoints: [number,number,number][] = [
  [39.2,2.0,9.2],[38.6,1.8,8.4],[38.0,1.1,7.2],[37.0,.45,5.6],[35.8,.05,4.2],[34.9,-.25,2.8],
]
export const slideLanding={x:34.9,z:2.8}
export const circulationSteps = [
  ...stairFlight({x0:-12,x1:-8,z0:-14,z1:-8,start:.24,end:.84,direction:'west',steps:4}),
  ...stairFlight({x0:-24,x1:-20,z0:-38,z1:-35.6,start:.84,end:.24,direction:'north',steps:4}),
  ...stairFlight({x0:-28,x1:-24,z0:-44,z1:-40,start:.84,end:.24,direction:'east',steps:4}),
  ...stairFlight({x0:2.5,x1:4.3,z0:-79.5,z1:-74.0,start:.24,end:2.22,direction:'north',steps:11}),
  {x0:2.5,x1:4.3,z0:-81.7,z1:-79.5,height:2.22},
]
// Furniture data drives both the visible fixtures and their collision envelopes.
export const lockers = [
  {x:-.34,z:14.5,count:6,axis:'z' as const},
  {x:23.64,z:-65,count:8,axis:'z' as const},
  {x:17.64,z:-27,count:6,axis:'z' as const},
]
export const restSeats = [
  {x:-2.0,z:15.2,length:3,axis:'z' as const,floor:.24},
  {x:21.0,z:-67,length:3,axis:'z' as const,floor:.24},
  {x:14.0,z:-34,length:3,axis:'z' as const,floor:.24},
  {x:-30.2,z:-20.4,length:3,axis:'x' as const,floor:.84},
  {x:23.1,z:-91.8,length:3,axis:'z' as const,floor:.24},
]
export const programSolids: Solid[] = [
  ...lockers.map(a=>({x0:a.x-.29,x1:a.x+.29,z0:a.z-.3,z1:a.z+(a.count-1)*.6+.3,bottom:.24,top:2.1})),
  ...restSeats.map(a=>({x0:a.x-(a.axis==='x'?a.length/2:.3),x1:a.x+(a.axis==='x'?a.length/2:.3),z0:a.z-(a.axis==='z'?a.length/2:.3),z1:a.z+(a.axis==='z'?a.length/2:.3),bottom:a.floor,top:a.floor+.48})),
  // Shower partitions leave a clear centre aisle.
  ...[8.9,11.25,13.6].map(z=>({x0:-8,x1:-6.35,z0:z-.045,z1:z+.045,bottom:.24,top:2.2})),
  // Launch and stair side rails. The north end opens into the slide trough.
  {x0:2.38,x1:2.50,z0:-81.65,z1:-74,bottom:.24,top:3.12},
  {x0:4.30,x1:4.42,z0:-81.65,z1:-74,bottom:.24,top:3.12},
]
