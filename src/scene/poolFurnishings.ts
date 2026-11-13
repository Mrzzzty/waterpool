import type { Solid } from './legacyLayout'
import { POOL_DECK } from './poolBasins'

/** Built-in seating stays against walls; these same dimensions define collision. */
export const poolBenches = [
  { x: -7.70, z: -.5, length: 3.0, axis: 'z' as const },
  { x: 7.70, z: .1, length: 2.8, axis: 'z' as const },
  { x: .4, z: -27.70, length: 2.4, axis: 'x' as const },
]
export const fixtureColliders: Solid[] = poolBenches.map(b=>({
  x0:b.x-(b.axis==='x'?b.length/2:.25),x1:b.x+(b.axis==='x'?b.length/2:.25),
  z0:b.z-(b.axis==='z'?b.length/2:.25),z1:b.z+(b.axis==='z'?b.length/2:.25),
  bottom:POOL_DECK,top:POOL_DECK+.48,
}))
// Pool ladder rail envelope; the broad stairs remain the traversable water entry.
fixtureColliders.push({x0:6.00,x1:6.42,z0:-6.88,z1:-6.12,bottom:-1.2,top:1.08})
