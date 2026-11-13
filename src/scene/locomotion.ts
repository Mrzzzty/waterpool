export type Effort = { stamina:number; exhausted:boolean; recoveryDelay:number }
export type LocomotionStatus = { stamina:number; sprinting:boolean; exhausted:boolean; wet:boolean; depth:number; canSlide:boolean; sliding:boolean }
export const initialLocomotion:LocomotionStatus={stamina:1,sprinting:false,exhausted:false,wet:false,depth:0,canSlide:false,sliding:false}
export function createEffort():Effort{return {stamina:1,exhausted:false,recoveryDelay:0}}
export function canSprint(effort:Effort){return !effort.exhausted&&effort.stamina>.001}
/** Charge actual displacement, so holding Shift against a wall cannot drain effort. */
export function updateEffort(e:Effort,dt:number,requested:boolean,moved:boolean,wet:boolean){
  const sprint=requested&&moved&&canSprint(e)
  if(sprint){e.stamina=Math.max(0,e.stamina-dt*(wet?.145:.115));e.recoveryDelay=.9;if(e.stamina===0)e.exhausted=true}
  else {e.recoveryDelay=Math.max(0,e.recoveryDelay-dt);if(e.recoveryDelay===0)e.stamina=Math.min(1,e.stamina+dt*(moved?.095:.16))}
  // A held Shift does not cause repeated one-frame bursts at zero stamina.
  if(e.exhausted&&e.stamina>=.30&&!requested)e.exhausted=false
  return sprint&&!e.exhausted
}
