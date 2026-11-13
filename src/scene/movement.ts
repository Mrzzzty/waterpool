import { BODY_HEIGHT, STEP_HEIGHT, canWalk, ceilingHeight, groundHeight } from './layout'

export const EYE_HEIGHT = 1.72
export const JUMP_SPEED = 4.6
const GRAVITY = 12
export type Motion = { x: number; z: number; feet: number; verticalSpeed: number; grounded: boolean }

export function resetMotion(motion: Motion, x = motion.x, z = motion.z, feetHint = motion.feet) {
  motion.x = x; motion.z = z; motion.feet = groundHeight(x, z, feetHint)
  motion.verticalSpeed = 0; motion.grounded = true
}
export function jump(motion: Motion) {
  if (motion.grounded) { motion.verticalSpeed = JUMP_SPEED; motion.grounded = false }
}
export function advanceMotion(motion: Motion, dx: number, dz: number, delta: number) {
  // Short sweeps keep narrow corners solid even at low frame rates or while sprinting.
  const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.1))
  const dt = delta / count
  for (let i = 0; i < count; i++) {
    const move = (x: number, z: number) => {
      const floor = groundHeight(x, z, motion.feet)
      const rise = floor - motion.feet
      if (rise > (motion.grounded ? STEP_HEIGHT : 0.015) || !canWalk(x, z, Math.max(motion.feet, floor))) return
      motion.x = x; motion.z = z
      if (motion.grounded && rise >= -0.025) motion.feet = floor
      else if (rise < -0.025) motion.grounded = false
    }
    move(motion.x + dx / count, motion.z)
    move(motion.x, motion.z + dz / count)
    if (!motion.grounded) {
      motion.feet += motion.verticalSpeed * dt - 0.5 * GRAVITY * dt * dt
      motion.verticalSpeed -= GRAVITY * dt
    }
    const ceiling = ceilingHeight(motion.x, motion.z, motion.feet) - BODY_HEIGHT
    if (motion.feet > ceiling) { motion.feet = ceiling; motion.verticalSpeed = Math.min(motion.verticalSpeed, 0) }
    const floor = groundHeight(motion.x, motion.z, motion.feet)
    if (motion.feet <= floor) { motion.feet = floor; motion.verticalSpeed = 0; motion.grounded = true }
  }
}

