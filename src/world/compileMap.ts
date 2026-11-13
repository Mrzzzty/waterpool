import type {Rect,Solid,Floor} from '../scene/legacyLayout'
import {contains} from '../scene/poolModules'
import {planFloorAt,type MapPlan} from './mapPlan'

// Collision counterparts of the curved structural supports in buildMap.
export function detailSolids(plan:MapPlan):Solid[]{
 if(plan.id==='roam')return (plan.columns??[]).map(c=>{const h=c.r*.85;return {x0:c.x-h,x1:c.x+h,z0:c.z-h,z1:c.z+h,bottom:-.7,top:c.top}})
 if(plan.id==='arcade')return [6,-1,-8,-14,-19.5,-24.5,-28.5].flatMap(z=>[-2.62,2.62].map(x=>({x0:x-.13,x1:x+.13,z0:z-.13,z1:z+.13,bottom:0,top:4.3})))
 if(plan.round)return [-2.6,-1.7,-.8,.4,1.2,2.1].map(a=>{
  const x=Math.sin(a)*10.6,z=Math.cos(a)*10.6,rx=Math.abs(Math.cos(a))*.45+Math.abs(Math.sin(a))*.4,rz=Math.abs(Math.sin(a))*.45+Math.abs(Math.cos(a))*.4
  return {x0:x-rx,x1:x+rx,z0:z-rz,z1:z+rz,bottom:-10,top:38}
 })
 return []
}

/** A port is cut once through both half-walls. Solid union removes the common
 * interior face; height/width come from the same aperture used by navigation. */
export function compileMap(plan:MapPlan){
 const walls:Solid[]=[]
 for(const r of plan.rooms){
  if(plan.round)continue
  for(const side of ['x0','x1','z0','z1'] as const){
   const axis=side[0] as 'x'|'z',at=r[side],out=side.endsWith('0')?-1:1
   const lo=axis==='x'?r.z0:r.x0,hi=axis==='x'?r.z1:r.x1
   const ports=plan.ports.filter(p=>(p.a===r.key||p.b===r.key)&&p.axis===axis&&p.at===at)
   const cuts=[...new Set([lo,hi,...ports.flatMap(p=>[Math.max(lo,p.from),Math.min(hi,p.to)])])].sort((a,b)=>a-b)
   const add=(a:number,b:number,bottom:number,top:number)=>{
    if(b-a<.001||top-bottom<.001)return
    walls.push(axis==='x'?{x0:at+(out<0?-.24:0),x1:at+(out>0?.24:0),z0:a,z1:b,bottom,top}
     :{x0:a,x1:b,z0:at+(out<0?-.24:0),z1:at+(out>0?.24:0),bottom,top})
   }
   for(let i=0;i<cuts.length-1;i++){
    const a=cuts[i],b=cuts[i+1],p=ports.find(p=>(a+b)/2>p.from&&(a+b)/2<p.to)
    if(p){add(a,b,-11,p.bottom);add(a,b,p.spring+p.rise,r.ceiling)}else add(a,b,-11,r.ceiling)
   }
  }
 }
 // Partition only within each room. No overlaid floor planes and no shared
 // water vertices at different heights. All treads are actual solid volumes.
 const floorCells:Floor[]=[]
 const changes:Rect[]=[...plan.pools.flatMap(p=>[...p.footprint,...p.treads]),...plan.landings]
 for(const room of plan.rooms){
  const relevant=changes.filter(p=>p.x0<room.x1&&p.x1>room.x0&&p.z0<room.z1&&p.z1>room.z0)
  const xs=[...new Set([room.x0,room.x1,...relevant.flatMap(p=>[Math.max(room.x0,p.x0),Math.min(room.x1,p.x1)])])].sort((a,b)=>a-b)
  const zs=[...new Set([room.z0,room.z1,...relevant.flatMap(p=>[Math.max(room.z0,p.z0),Math.min(room.z1,p.z1)])])].sort((a,b)=>a-b)
  for(let z=0;z<zs.length-1;z++)for(let x=0;x<xs.length-1;x++){
   const height=planFloorAt(plan,(xs[x]+xs[x+1])/2,(zs[z]+zs[z+1])/2)
   const previous=floorCells.at(-1)
   if(previous&&previous.height===height&&previous.z0===zs[z]&&previous.z1===zs[z+1]&&previous.x1===xs[x])previous.x1=xs[x+1]
   else floorCells.push({x0:xs[x],x1:xs[x+1],z0:zs[z],z1:zs[z+1],height})
  }
 }
 const ceilings:Solid[]=[]
 for(const r of plan.rooms){
  if(plan.round)continue
  const wells=plan.wells.filter(w=>w.ceiling===r.ceiling&&w.x0<r.x1&&w.x1>r.x0&&w.z0<r.z1&&w.z1>r.z0)
  const xs=[...new Set([r.x0-.24,r.x1+.24,...wells.flatMap(w=>[w.x0,w.x1])])].sort((a,b)=>a-b)
  const zs=[...new Set([r.z0-.24,r.z1+.24,...wells.flatMap(w=>[w.z0,w.z1])])].sort((a,b)=>a-b)
  for(let z=0;z<zs.length-1;z++)for(let x=0;x<xs.length-1;x++){
   if(wells.some(w=>contains(w,(xs[x]+xs[x+1])/2,(zs[z]+zs[z+1])/2)))continue
   ceilings.push({x0:xs[x],x1:xs[x+1],z0:zs[z],z1:zs[z+1],bottom:r.ceiling,top:r.ceiling+.24})
  }
 }
 for(const w of plan.wells){
  ceilings.push({x0:w.x0-.24,x1:w.x0,z0:w.z0-.24,z1:w.z1+.24,bottom:w.ceiling,top:w.top},
   {x0:w.x1,x1:w.x1+.24,z0:w.z0-.24,z1:w.z1+.24,bottom:w.ceiling,top:w.top},
   {x0:w.x0,x1:w.x1,z0:w.z0-.24,z1:w.z0,bottom:w.ceiling,top:w.top},
   {x0:w.x0,x1:w.x1,z0:w.z1,z1:w.z1+.24,bottom:w.ceiling,top:w.top})
 }
 const bottom=Math.min(-1.5,...plan.pools.map(p=>p.bottom-.3))
 const volumes=[...walls.map(w=>({...w,bottom:Math.max(w.bottom,bottom)})),...plan.solids,...ceilings,...floorCells.map(f=>({...f,bottom,top:f.height}))]
 return {walls,ceilings,floorCells,volumes}
}

export function ceilingAt(plan:MapPlan,x:number,z:number){
 const r=plan.rooms.find(r=>contains(r,x,z));let ceiling=r?.ceiling??-100
 for(const p of plan.ports){
  const across=p.axis==='x'?x:z,along=p.axis==='x'?z:x
  if(Math.abs(across-p.at)<.3&&along>=p.from&&along<=p.to){
   const u=(along-(p.from+p.to)/2)/((p.to-p.from)/2)
   ceiling=Math.min(ceiling,p.spring+p.rise*Math.sqrt(Math.max(0,1-u*u)))
  }
 }
 return ceiling
}
