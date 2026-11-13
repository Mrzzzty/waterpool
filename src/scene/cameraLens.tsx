import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const preferenceKey = 'poolrooms.camera-lens.v1'
const listeners = new Set<() => void>()
const defaultEnabled = typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches
const readPreference = () => {
  try {
    const saved = localStorage.getItem(preferenceKey)
    return saved === null ? defaultEnabled : saved === 'on'
  } catch { return defaultEnabled }
}
let enabled = readPreference()
function emitPreference() { for (const notify of listeners) notify() }
function onStorage(event: StorageEvent) {
  if (event.key !== preferenceKey && event.key !== null) return
  enabled = readPreference()
  emitPreference()
}
function subscribe(notify: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage)
  listeners.add(notify)
  return () => {
    listeners.delete(notify)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}
export function setCameraLensEnabled(value: boolean) {
  enabled = value
  try { localStorage.setItem(preferenceKey, value ? 'on' : 'off') } catch { /* Private/file views still keep the session choice. */ }
  emitPreference()
}
/** The same preference follows the player between the story and seven-area walk. */
export function useCameraLens() {
  return [useSyncExternalStore(subscribe, () => enabled, () => defaultEnabled), setCameraLensEnabled] as const
}

const lensShader = /* glsl */ `
uniform float strength;
void mainUv(inout vec2 uv) {
  vec2 point = uv * 2.0 - 1.0;
  vec2 metric = vec2(aspect, 1.0);
  vec2 radial = point * metric;
  float radius2 = dot(radial, radial) / dot(metric, metric);
  // Inverse radial lens map with a small, constant crop. Every source UV stays
  // inside the frame, including ultrawide corners: no black border or clamping smear.
  point *= (1.0 + strength * radius2) / (1.0 + strength);
  uv = point * 0.5 + 0.5;
}
`

class CameraLensEffect extends Effect {
  constructor() {
    super('PoolCameraLens', lensShader, { uniforms: new Map([['strength', new Uniform(0)]]) })
  }
  set enabled(value: boolean) { this.uniforms.get('strength')!.value = value ? .055 : 0 }
}

/** UV-only: merged into the existing colour pass, with no extra texture fetches. */
export function CameraLens() {
  const [lensEnabled] = useCameraLens()
  const effect = useMemo(() => new CameraLensEffect(), [])
  useLayoutEffect(() => { effect.enabled = lensEnabled }, [effect, lensEnabled])
  useEffect(() => () => effect.dispose(), [effect])
  return <primitive object={effect} dispose={null} />
}
