import plan from './quietBath.json'
import type {Rect} from './rooms'

// These are the same partitions that Blender extrudes. Curved walls retain
// conservative collision strips, while the water uses their exact circular edge.
export const bathWalls:Rect[]=[...plan.piers.map(r=>r as Rect)]
for(const w of plan.partitions){
  for(const [a,b] of [[w.from,w.lo],[w.hi,w.to]]){
    const l=w.at-w.thick/2,h=w.at+w.thick/2
    bathWalls.push(w.axis==='x'?[l,h,a,b]:[a,b,l,h])
  }
}
export const bathBlockers:Rect[]=[...bathWalls,...plan.collisionWalls.map(r=>r as Rect)]

export function bathCeiling(x:number,z:number){
  const contains=(r:number[])=>x>=r[0]&&x<=r[1]&&z>=r[2]&&z<=r[3]
  const low=plan.ceilingZones.find(r=>contains(r.bounds))
  if(low)return low.ceiling
  return plan.lightWells.find(r=>contains(r.bounds))?.top??4.75
}

const f=(n:number)=>n.toFixed(6)
export const arcArguments=plan.arcWalls.map(a=>{
  const start=a.start*Math.PI/180,end=a.end*Math.PI/180
  return `vec2(${a.center.map(f)}),${f(a.radius)},${f(a.thickness/2)},vec2(${f(Math.cos(start))},${f(Math.sin(start))}),vec2(${f(Math.cos(end))},${f(Math.sin(end))})`
})
