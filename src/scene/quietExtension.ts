import plan from './quietExtension.json'
import {stairFlight,type StairFlight,type Volume} from './poolModules'
import type {PoolBasin} from './poolBasins'
import type {Rect} from './legacyLayout'

export {plan as quietPlan}
export const quietEntrySteps=stairFlight({...plan.entrySteps,direction:'north'})
export const quietRooms:Volume[]=plan.rooms.map(r=>({...r,id:'rose',label:'静水回廊',english:'THE STILL PASSAGES'}))
export const quietSolids=[...plan.solids,...plan.arches.map(a=>({x0:a.x-a.depth/2,x1:a.x+a.depth/2,z0:a.z-a.radius,z1:a.z+a.radius,bottom:a.spring,top:a.spring+a.rise}))]

// One flooded architectural circuit, not separate pools with coping at every doorway.
// Subtract the collision walls from the wet mask, including the blind turns.
function subtract(r:Rect,b:Rect):Rect[]{
  const x0=Math.max(r.x0,b.x0),x1=Math.min(r.x1,b.x1),z0=Math.max(r.z0,b.z0),z1=Math.min(r.z1,b.z1)
  if(x0>=x1||z0>=z1)return [r]
  return [{x0:r.x0,x1:x0,z0:r.z0,z1:r.z1},{x0:x1,x1:r.x1,z0:r.z0,z1:r.z1},
    {x0,x1,z0:r.z0,z1:z0},{x0,x1,z0:z1,z1:r.z1}].filter(p=>p.x1>p.x0&&p.z1>p.z0)
}
export const quietFootprint=plan.solids.reduce<Rect[]>((parts,b)=>parts.flatMap(r=>subtract(r,b)),plan.rooms)
export const quietPool:PoolBasin={id:'still-bath',...plan.pool,footprint:quietFootprint,
  treads:plan.flights.flatMap(f=>stairFlight(f as StairFlight))}
