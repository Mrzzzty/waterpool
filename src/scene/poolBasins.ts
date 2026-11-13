import {roamPlan,planPoolAt,planFloorAt,type Pool} from '../world/mapPlan'
import type {Floor,Rect} from './legacyLayout'
export type PoolBasin=Pool
export const POOL_DECK=.2
export const poolBasins=roamPlan.pools
export const poolSampleBounds:Rect={x0:-44,x1:42,z0:-62,z1:24}
export const causticsBounds:Rect={x0:-44,x1:42,z0:-62,z1:24}
export const entrySteps=poolBasins[0].treads
export const poolPartitionCells:Floor[]=poolBasins.flatMap(p=>[...p.footprint.map(r=>({...r,height:p.bottom})),...p.treads])
export const basinAt=(x:number,z:number)=>planPoolAt(roamPlan,x,z)
export const authoredPoolFloor=(x:number,z:number)=>planFloorAt(roamPlan,x,z)
export const authoredWet=(x:number,z:number)=>{const p=basinAt(x,z);return !!p&&authoredPoolFloor(x,z)<p.level-.001}
export type PoolEdge={axis:'x'|'z';at:number;from:number;to:number}
export const poolEdges:PoolEdge[]=[]
