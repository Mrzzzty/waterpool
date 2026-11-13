export type PlanarVelocity={vx:number;vz:number}

/** Responsive on dry tile, a small glide while displacing water. Units m/s.
 * Integrate quadratic drag with a bounded denominator, independent of frame rate.
 */
export function advanceWading(v:PlanarVelocity,tx:number,tz:number,immersion:number,dt:number){
  const wet=Math.max(0,Math.min(1,immersion))
  const response=14-10.2*wet
  const blend=1-Math.exp(-response*dt)
  v.vx+=(tx-v.vx)*blend;v.vz+=(tz-v.vz)*blend
  const drag=1+.20*wet*Math.hypot(v.vx,v.vz)*dt
  v.vx/=drag;v.vz/=drag
}
