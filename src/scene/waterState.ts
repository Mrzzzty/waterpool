import { poolBasins } from './poolBasins'

/** Connected basins hold one volume of water and must drain together. */
const connected: Record<string, string> = Object.fromEntries(poolBasins.filter(p=>p.zone).map(p=>[p.id,p.zone!]))

export type WaterBody = {
  id: string
  /** Current surface height, eased toward `target` every frame. */
  level: number
  target: number
  /** Level the surface geometry was last rebuilt at. */
  built: number
}

const byId = new Map<string, WaterBody>()
for (const basin of poolBasins) {
  const id = zoneOfBasin(basin.id)
  if (!byId.has(id)) byId.set(id, { id, level: basin.level, target: basin.level, built: basin.level })
}

/** Every body in a stable order, used to build and draw one surface each. */
export const waterBodies: WaterBody[] = [...byId.values()]

export function zoneOfBasin(basinId: string) {
  return connected[basinId] ?? basinId
}

export function bodyOfZone(zoneId: string) {
  return byId.get(zoneId)
}

export function levelOfZone(zoneId: string) {
  return byId.get(zoneId)?.level
}

/** Metres per second while a valve is open. 1.2 m takes about 3.4 s. */
const DRAIN_RATE = .35
/** Rebuild the surface mesh once the level has drifted this far from its geometry. */
const REBUILD_STEP = .25

let revision = 0
const listeners = new Set<() => void>()

export function waterRevision() {
  return revision
}

export function subscribeWater(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function notify() {
  revision++
  for (const listener of listeners) listener()
}

export function setWaterLevel(zoneId: string, level: number) {
  const body = byId.get(zoneId)
  if (!body) return false
  body.target = level
  return true
}

export function waterLevelTarget(zoneId: string) {
  return byId.get(zoneId)?.target
}

/** Advance every easing level. Called once per frame from the water surface. */
export function stepWater(delta: number) {
  let rebuild = false
  for (const body of byId.values()) {
    if (body.level === body.target) continue
    const direction = Math.sign(body.target - body.level)
    const step = Math.min(Math.abs(body.target - body.level), Math.max(delta, 0) * DRAIN_RATE)
    body.level += direction * step
    if (Math.abs(body.level - body.built) >= REBUILD_STEP || body.level === body.target) rebuild = true
  }
  if (rebuild) {
    for (const body of byId.values()) body.built = body.level
    notify()
  }
}

/** Debug handle for wiring valves before the interaction layer exists. */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__water = {
    bodies: waterBodies,
    set: (zone: string, level: number) => setWaterLevel(zone, level),
    list: () => waterBodies.map(body => `${body.id}: ${body.level.toFixed(2)} → ${body.target.toFixed(2)}`),
  }
}
