import {fitAcoustic,type Acoustic} from '../acoustics'
import type {Act,Rect} from './rooms'
import {maps} from '../world/mapPlan'
export type AcousticZone={id:string;label:string;bounds:Rect;floor:number;ceiling:number;damp:number}
export const zones=Object.fromEntries((['hall','arcade','shaft','memory'] as Act[]).map(act=>[act,maps[act].rooms.map(r=>({
 id:act+':'+r.key,label:r.key,bounds:[r.x0,r.x1,r.z0,r.z1] as Rect,
 floor:Math.min(r.deck,...maps[act].pools.filter(p=>p.footprint.some(b=>b.x0<r.x1&&b.x1>r.x0&&b.z0<r.z1&&b.z1>r.z0)).map(p=>p.bottom)),
 ceiling:r.ceiling,damp:r.finish==='service'?.94:.82,
}))])) as Record<Act,AcousticZone[]>

export function zoneAt(act: Act, x: number, z: number): AcousticZone {
  for (const zone of zones[act]) {
    const b = zone.bounds
    if (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) return zone
  }
  return zones[act][zones[act].length-1]
}

const cache = new Map<string, Acoustic>()

export function presetOf(zone: AcousticZone): Acoustic {
  const hit = cache.get(zone.id)
  if (hit) return hit
  const width = zone.bounds[1] - zone.bounds[0]
  const depth = zone.bounds[3] - zone.bounds[2]
  const fitted = fitAcoustic(width, depth, zone.ceiling - zone.floor, zone.damp, .9)
  cache.set(zone.id, fitted)
  return fitted
}
