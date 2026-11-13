
import type { Floor, Rect, Room, Solid } from './legacyLayout'

export type Volume = Room & { floor: number; open?: boolean }
export type Opening = { axis: 'x' | 'z'; at: number; from: number; to: number; bottom: number; top: number; glass?: boolean }
export type StairFlight = Rect & { start: number; end: number; direction: 'north' | 'south' | 'east' | 'west'; steps?: number }

export const contains = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1

// Stair geometry and navigation always consume the same tread list.
export function stairFlight(spec: StairFlight): Floor[] {
  const count = spec.steps ?? Math.ceil(Math.abs(spec.end - spec.start) / .18)
  return Array.from({ length: count }, (_, i) => {
    const a = i / count, b = (i + 1) / count
    const rect = { x0: spec.x0, x1: spec.x1, z0: spec.z0, z1: spec.z1 }
    if (spec.direction === 'north') { rect.z0 = spec.z1 - b * (spec.z1 - spec.z0); rect.z1 = spec.z1 - a * (spec.z1 - spec.z0) }
    if (spec.direction === 'south') { rect.z0 = spec.z0 + a * (spec.z1 - spec.z0); rect.z1 = spec.z0 + b * (spec.z1 - spec.z0) }
    if (spec.direction === 'east') { rect.x0 = spec.x0 + a * (spec.x1 - spec.x0); rect.x1 = spec.x0 + b * (spec.x1 - spec.x0) }
    if (spec.direction === 'west') { rect.x0 = spec.x1 - b * (spec.x1 - spec.x0); rect.x1 = spec.x1 - a * (spec.x1 - spec.x0) }
    return { ...rect, height: +(spec.start + (spec.end - spec.start) * b).toFixed(5) }
  })
}

export function spatialIndex<T extends Rect>(items: T[], padding = 0) {
  const buckets = new Map<string, T[]>(), size = 8
  for (const item of items) {
    for (let x = Math.floor((item.x0 - padding) / size); x <= Math.floor((item.x1 + padding) / size); x++)
      for (let z = Math.floor((item.z0 - padding) / size); z <= Math.floor((item.z1 + padding) / size); z++) {
        const key = x + ':' + z, bucket = buckets.get(key) ?? []
        bucket.push(item); buckets.set(key, bucket)
      }
  }
  const empty: T[] = []
  return (x: number, z: number) => buckets.get(Math.floor(x / size) + ':' + Math.floor(z / size)) ?? empty
}

// Authored landmarks with constrained, seeded variants. This is not a full WFC solver.
// Each adjoining module shares a 3.6 m portal and a stair transition, including elevation.
export function makePoolAnnex(seed = 3719) {
  let state = seed >>> 0
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
  const types = [
    { kind: 'compression', width: 8, length: 10, floor: -.28, ceiling: 3.1 },
    { kind: 'cistern', width: 12, length: 14, floor: -.64, ceiling: 7.6 },
    { kind: 'bend', width: 6, length: 10, floor: -.28, ceiling: 3 },
    { kind: 'lightwell', width: 14, length: 12, floor: -.64, ceiling: 8.4 },
  ]
  const rooms: Volume[] = [], floors: Floor[] = [], walls: Solid[] = [], roofs: Rect[] = []
  const portals: { x: number; z: number; feet: number; kind: string }[] = []
  let center = -16, boundary = -96, previousFloor = .12, previousWidth = 26
  for (const type of types) {
    const previousCenter = center
    center += Math.round((random() - .5) * 12) * .4
    const room: Volume = { id: 'rose', label: '阶梯池厅', english: 'STEPPED POOL', x0: center - type.width / 2, x1: center + type.width / 2, z0: boundary - type.length, z1: boundary, floor: type.floor, ceiling: type.ceiling }
    const shared0 = Math.max(room.x0, previousCenter - previousWidth / 2)
    const shared1 = Math.min(room.x1, previousCenter + previousWidth / 2)
    const portal = (shared0 + shared1) / 2, half = 1.8
    if (shared1 - shared0 < half * 2 + .3) throw new Error('Pool module portal cannot connect')
    const block = (x0: number, x1: number, bottom: number, top: number) => {
      if (x1 > x0) walls.push({ x0, x1, z0: boundary - .14, z1: boundary + .14, bottom, top })
    }
    block(shared0, portal - half, -1.4, type.ceiling)
    block(portal + half, shared1, -1.4, type.ceiling)
    block(portal - half, portal + half, Math.max(previousFloor, type.floor) + 2.65, type.ceiling)
    const n = Math.ceil(Math.abs(type.floor - previousFloor) / .18), run = n * .55
    floors.push(...stairFlight({
      x0: shared0, x1: shared1,
      z0: type.floor < previousFloor ? boundary - run : boundary,
      z1: type.floor < previousFloor ? boundary : boundary + run,
      start: previousFloor, end: type.floor, direction: 'north', steps: n,
    }))
    portals.push({ x: portal, z: boundary, feet: Math.max(previousFloor, type.floor), kind: type.kind })
    if (type.ceiling > 5) roofs.push({ x0: center - 1, x1: center + 2.2, z0: room.z0 + 3, z1: room.z0 + 7 })
    rooms.push(room); boundary = room.z0; previousFloor = type.floor; previousWidth = type.width
  }
  return { rooms, floors, walls, roofs, portals }
}

export function exteriorWalls(volumes: Volume[], windows: Opening[]): Solid[] {
  const walls: Solid[] = []
  for (const room of volumes) for (const side of ['x0', 'x1', 'z0', 'z1'] as const) {
    const axis = side[0] as 'x' | 'z', at = room[side], sign = side.endsWith('0') ? -1 : 1
    const from = axis === 'x' ? room.z0 : room.x0, to = axis === 'x' ? room.z1 : room.x1
    const cuts = [from, to, ...volumes.flatMap(r => axis === 'x' ? [r.z0, r.z1] : [r.x0, r.x1]), ...windows.filter(w => w.axis === axis && w.at === at).flatMap(w => [w.from, w.to])]
    const sorted = [...new Set(cuts.filter(v => v >= from && v <= to))].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1], mid = (a + b) / 2
      const other = volumes.find(r => contains(r, axis === 'x' ? at + sign * .01 : mid, axis === 'z' ? at + sign * .01 : mid))
      const top = room.open ? 2.8 : room.ceiling
      const add = (bottom: number, upper: number) => {
        if (upper <= bottom) return
        walls.push(axis === 'x'
          ? { x0: at + (sign < 0 ? -.28 : 0), x1: at + (sign > 0 ? .28 : 0), z0: a, z1: b, bottom, top: upper }
          : { x0: a, x1: b, z0: at + (sign < 0 ? -.28 : 0), z1: at + (sign > 0 ? .28 : 0), bottom, top: upper })
      }
      if (other) { if (!room.open && !other.open && room.ceiling > other.ceiling) add(other.ceiling, room.ceiling); continue }
      const opening = windows.find(w => w.axis === axis && w.at === at && mid > w.from && mid < w.to)
      if (opening) { add(-1.4, opening.bottom); add(opening.top, top) } else add(-1.4, top)
    }
  }
  return walls
}
