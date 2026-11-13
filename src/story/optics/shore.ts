import * as T from 'three'
import {type Act,type Basin} from '../rooms'
import {maps} from '../../world/mapPlan'
import {compileMap,detailSolids} from '../../world/compileMap'
import {arcArguments} from '../bathGeometry'
export const floatLiteral=(n:number)=>n.toFixed(5)
export const rectLiteral=(r:number[])=>'vec4('+r.slice(0,4).map(floatLiteral).join(',')+')'
const rect=(r:{x0:number;x1:number;z0:number;z1:number})=>[r.x0,r.x1,r.z0,r.z1]
export function shoreline(act:Act,basin:Basin){
 const plan=maps[act],pool=plan.pools.find(p=>p.id===basin.poolId)??plan.pools[0],compiled=compileMap(plan)
 const well=!!plan.round,bath=act==='hall'&&pool===plan.pools[1],stairs=act==='hall'&&!bath
 const [west,east,north,south]=basin.bounds
 const relevant=(r:{x0:number;x1:number;z0:number;z1:number})=>r.x0<east+.3&&r.x1>west-.3&&r.z0<south+.3&&r.z1>north-.3
 const walls=[...compiled.walls,...plan.solids,...detailSolids(plan)].filter(r=>relevant(r)&&r.bottom<basin.initial&&r.top>basin.bed)
 const blocks=walls.map(rect)
 const landings=[...compiled.floorCells.filter(r=>relevant(r)&&r.height>basin.bed+.001),...(well?plan.landings:[])]
 const solids=[...walls.map(r=>[...rect(r),Math.max(basin.bed,r.bottom),r.top]),...landings.map(r=>[...rect(r),basin.bed,r.height])]
 const glsl=`const vec4 bounds=${rectLiteral(basin.bounds)};
 const bool well=${well?'true':'false'};
 float sdBox(vec2 p,vec4 box){vec2 q=abs(p-.5*(box.xz+box.yw))-.5*(box.yw-box.xz);return length(max(q,0.))+min(max(q.x,q.y),0.);}
 float cross2(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}
 float shore(vec2 p){
  float d=${well?'11.-length(p)':'-1000.'};
  ${well?'':pool.footprint.map(r=>'d=max(d,-sdBox(p,'+rectLiteral(rect(r))+'));').join('\n')}
  ${blocks.map(r=>'d=min(d,sdBox(p,'+rectLiteral(r)+'));').join('\n')}
  ${landings.map(r=>'if(uWaterLevel<='+floatLiteral(r.height+.002)+')d=min(d,sdBox(p,'+rectLiteral(rect(r))+'));').join('\n')}
  return d;
 }`
 const edges=[...pool.footprint,...landings]
 const axis=(lo:number,hi:number,k:0|2)=>{
  const values=new Set<number>(),n=Math.ceil((hi-lo)*1.4)
  for(let i=0;i<=n;i++)values.add(lo+(hi-lo)*i/n)
  for(const r of edges)for(const edge of rect(r).slice(k,k+2))if(edge>=lo&&edge<=hi)values.add(edge)
  return [...values].sort((a,b)=>a-b)
 }
 const xs=axis(west,east,0),zs=axis(north,south,2)
 const geometry=new T.PlaneGeometry(east-west,south-north,xs.length-1,zs.length-1)
 const pos=geometry.attributes.position
 for(let z=0;z<zs.length;z++)for(let x=0;x<xs.length;x++)pos.setXY(z*xs.length+x,xs[x]-(west+east)/2,(north+south)/2-zs[z])
 return {geometry,glsl,blocks,solids,well,bath,stairs,arcs:bath?arcArguments:[]}
}
