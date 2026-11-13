import {roamPlan,planFloorAt,type View} from '../world/mapPlan'
import {compileMap,ceilingAt} from '../world/compileMap'
import {contains,spatialIndex,type Opening} from './poolModules'
import {roomNames} from './roomPrograms'
import {basinAt} from './poolBasins'
import {levelOfZone,zoneOfBasin} from './waterState'
import {inLobby,lobbyBlocked} from '../connection/turnstile'
import type {RegionId,Rect,Solid,Floor,Room} from './legacyLayout'
export type {RegionId,Rect,Solid,Floor,Room}
export const WATER_LEVEL=.04,PLAYER_RADIUS=.27,BODY_HEIGHT=1.85,STEP_HEIGHT=.25
export const sun={direction:[-.55,.55,.63] as [number,number,number],intensity:3.5,color:'#fff2df'}
const compiled=compileMap(roamPlan)
export const roomVolumes=roamPlan.rooms.map(r=>({...r,...roomNames[r.region],id:r.region,floor:r.deck}))
export const rooms=Object.keys(roomNames).map(id=>roomVolumes.find(r=>r.id===id)!)
export const roomById=Object.fromEntries(rooms.map(r=>[r.id,r])) as Record<RegionId,typeof roomVolumes[number]>
export const mapBounds={x0:Math.min(...roomVolumes.map(r=>r.x0)),x1:Math.max(...roomVolumes.map(r=>r.x1)),z0:Math.min(...roomVolumes.map(r=>r.z0)),z1:Math.max(...roomVolumes.map(r=>r.z1))}
export const roomAt=(x:number,z:number)=>roomVolumes.find(r=>contains(r,x,z))
export const groundHeight=(x:number,z:number,_feet?:number)=>planFloorAt(roamPlan,x,z)
export const terrainHeight=groundHeight
export const floorCells=compiled.floorCells
export const walkPlatforms:Floor[]=[]
export const blocks=compiled.walls.concat(roamPlan.solids)
const fixtureSolids:Solid[]=roamPlan.fixtures.filter(f=>f.kind==='locker'||f.kind==='bench').map(f=>({x0:f.x-.29,x1:f.x+.29,z0:f.z-(f.length??1)/2,z1:f.z+(f.length??1)/2,bottom:f.y,top:f.y+(f.kind==='locker'?1.82:.5)}))
const columnSolids:Solid[]=(roamPlan.columns??[]).map(c=>{const h=c.r*.85;return {x0:c.x-h,x1:c.x+h,z0:c.z-h,z1:c.z+h,bottom:-.7,top:c.top}})
export const solids=[...blocks,...fixtureSolids,...columnSolids]
export const occluders=[...blocks,...compiled.ceilings,...columnSolids]
export const roundColumns:{x:number;z:number;radius:number;top:number}[]=(roamPlan.columns??[]).map(c=>({x:c.x,z:c.z,radius:c.r,top:c.top}))
export const roofOpenings=roamPlan.wells
export const windows:Opening[]=[]
export type Arch={x:number;z:number;radius:number;spring:number;rise:number;depth:number;rotation:number;thickness:number;wallTop?:number}
export const arches:Arch[]=roamPlan.ports.map(p=>({x:p.axis==='x'?p.at:(p.from+p.to)/2,z:p.axis==='z'?p.at:(p.from+p.to)/2,radius:(p.to-p.from)/2,spring:p.spring,rise:p.rise,depth:.48,rotation:p.axis==='x'?Math.PI/2:0,thickness:.12}))
export const modulePortals=roamPlan.ports.map(p=>({x:p.axis==='x'?p.at:(p.from+p.to)/2,z:p.axis==='z'?p.at:(p.from+p.to)/2,feet:p.bottom,kind:p.a+' / '+p.b}))
export const viewpoints=roamPlan.views as Record<RegionId,View>
export const distanceToRect=(r:Rect,x:number,z:number)=>Math.hypot(Math.max(r.x0-x,0,x-r.x1),Math.max(r.z0-z,0,z-r.z1))
const near=spatialIndex(solids,PLAYER_RADIUS)
export function waterLevelAt(x:number,z:number){const b=basinAt(x,z);return b?(levelOfZone(zoneOfBasin(b.id))??b.level):-100}
export const waterDepth=(x:number,z:number)=>Math.max(0,waterLevelAt(x,z)-groundHeight(x,z))
export const waterCells=floorCells.filter(c=>waterDepth((c.x0+c.x1)/2,(c.z0+c.z1)/2)>.001)
export function ceilingHeight(x:number,z:number,feet=groundHeight(x,z)){
 let h=ceilingAt(roamPlan,x,z)
 if(inLobby('roam',x,z))h=Math.min(h,2.7)
 for(const s of near(x,z))if(s.bottom>feet+.02&&distanceToRect(s,x,z)<PLAYER_RADIUS)h=Math.min(h,s.bottom)
 return h
}
export function canWalk(x:number,z:number,feet=groundHeight(x,z)){
 if(!roomAt(x,z)||lobbyBlocked('roam',x,z)||feet+BODY_HEIGHT>ceilingHeight(x,z,feet)+.02)return false
 return !near(x,z).some(s=>feet+BODY_HEIGHT>s.bottom+.02&&feet<s.top-.02&&distanceToRect(s,x,z)<PLAYER_RADIUS)
}
