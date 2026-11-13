import * as THREE from 'three'

export const DAY_CYCLE_SECONDS = 480
export const INITIAL_DAY_PROGRESS = 0.58
const dawnSun = new THREE.Color('#ffd6ad')
const noonSun = new THREE.Color('#fff1db')
const duskSun = new THREE.Color('#ffbd91')
const dawnBounce = new THREE.Color('#ffe5cf')
const duskBounce = new THREE.Color('#ffd4b5')
const white = new THREE.Color(1, 1, 1)

export type DayCycle = {
  phase: number; elapsed: number; progress: number; daylight: number; warmth: number
  directScale: number; indirectScale: number
  sunColor: THREE.Color; indirectTint: THREE.Color
}
export function updateDayCycle(cycle: DayCycle) {
  // A cosine traversal turns gently at dawn and dusk; the full return takes 8 minutes.
  const progress = 0.5 - 0.5 * Math.cos(cycle.phase * Math.PI * 2)
  const daylight = Math.pow(Math.max(0, Math.sin(progress * Math.PI)), 0.75)
  cycle.progress = progress; cycle.daylight = daylight; cycle.warmth = 1 - daylight
  cycle.directScale = 0.48 + daylight * 0.52
  cycle.indirectScale = 0.62 + daylight * 0.38
  if (progress < 0.5) {
    const blend = THREE.MathUtils.smoothstep(progress, 0, 0.5)
    cycle.sunColor.copy(dawnSun).lerp(noonSun, blend)
    cycle.indirectTint.copy(dawnBounce).lerp(white, blend)
  } else {
    const blend = THREE.MathUtils.smoothstep(progress, 0.5, 1)
    cycle.sunColor.copy(noonSun).lerp(duskSun, blend)
    cycle.indirectTint.copy(white).lerp(duskBounce, blend)
  }
}
export function seekDayProgress(cycle: DayCycle, progress: number) {
  const forward = Math.acos(1 - 2 * THREE.MathUtils.clamp(progress, 0, 1)) / (Math.PI * 2)
  cycle.phase = cycle.phase > 0.5 ? 1 - forward : forward
  updateDayCycle(cycle)
}
export function createDayCycle(progress = INITIAL_DAY_PROGRESS): DayCycle {
  const cycle: DayCycle = {
    phase: 0, elapsed: 0, progress, daylight: 1, warmth: 0,
    directScale: 1, indirectScale: 1, sunColor: noonSun.clone(), indirectTint: white.clone(),
  }
  seekDayProgress(cycle, progress)
  return cycle
}
export function dayProgressLabel(progress: number) {
  if (progress < 0.2) return '晨光'
  if (progress < 0.4) return '上午'
  if (progress < 0.6) return '白昼'
  if (progress < 0.8) return '午后'
  return '黄昏'
}

