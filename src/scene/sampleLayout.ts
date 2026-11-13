// Geometry and navigation share the metadata exported beside the Blender asset.
// Coordinates are metres in Three.js space: X right, Y up, Z back.
import metadata from '../../public/assets/poolcore-sample/layout.json'
import type { RegionId, Rect, Room, Solid, Floor } from './legacyLayout'

export type { RegionId, Rect, Room, Solid, Floor } from './legacyLayout'
type View = { position: [number, number, number]; target: [number, number, number] }
type SampleMetadata = {
  waterLevel: number
  rooms: Room[]
  solids: Solid[]
  floors: Floor[]
  columns: { x: number; z: number; radius: number; top: number }[]
  viewpoints: Record<RegionId, View>
  sun: { direction: [number, number, number]; intensity: number; color: string }
}
const sample = metadata as unknown as SampleMetadata
export const WATER_LEVEL = sample.waterLevel
export const PLAYER_RADIUS = 0.27
export const BODY_HEIGHT = 1.85
export const STEP_HEIGHT = 0.25
export const sun = sample.sun
export const roomVolumes = sample.rooms
// The bent corridor has three volumes but one navigation destination.
export const rooms = roomVolumes.filter((room, index) => roomVolumes.findIndex(other => other.id === room.id) === index)
export const roomById = Object.fromEntries(rooms.map(room => [room.id, room])) as Record<RegionId, Room>
export const mapBounds: Rect = {
  x0: Math.min(...roomVolumes.map(room => room.x0)),
  x1: Math.max(...roomVolumes.map(room => room.x1)),
  z0: Math.min(...roomVolumes.map(room => room.z0)),
  z1: Math.max(...roomVolumes.map(room => room.z1)),
}
export const solids = sample.solids
export const roundColumns = sample.columns
export const floorZones = sample.floors
export const occluders = [...solids, ...roundColumns.map(column => ({
  x0: column.x - column.radius, x1: column.x + column.radius,
  z0: column.z - column.radius, z1: column.z + column.radius,
  bottom: -1, top: column.top,
}))]
export function contains(rect: Rect, x: number, z: number) {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1
}
export function roomAt(x: number, z: number) { return roomVolumes.find(room => contains(room, x, z)) }
export function groundHeight(x: number, z: number) {
  // Later entries describe steps or ledges on top of the room's base floor.
  for (let i = floorZones.length - 1; i >= 0; i--) {
    if (contains(floorZones[i], x, z)) return floorZones[i].height
  }
  return 0
}
export function waterDepth(x: number, z: number) {
  return roomAt(x, z) ? Math.max(0, WATER_LEVEL - groundHeight(x, z)) : 0
}
export function distanceToRect(rect: Rect, x: number, z: number) {
  return Math.hypot(Math.max(rect.x0 - x, 0, x - rect.x1), Math.max(rect.z0 - z, 0, z - rect.z1))
}
export function canWalk(x: number, z: number, feet = groundHeight(x, z)) {
  if (!roomAt(x, z)) return false
  for (const solid of solids) {
    if (feet + BODY_HEIGHT > solid.bottom + 0.02 && feet < solid.top - 0.02 && distanceToRect(solid, x, z) < PLAYER_RADIUS) return false
  }
  for (const column of roundColumns) {
    if (feet < column.top && Math.hypot(x - column.x, z - column.z) < column.radius + PLAYER_RADIUS) return false
  }
  return true
}
export function ceilingHeight(x: number, z: number) {
  let ceiling = roomAt(x, z)?.ceiling ?? 2.55
  for (const solid of solids) {
    if (solid.bottom > groundHeight(x, z) + BODY_HEIGHT && distanceToRect(solid, x, z) < PLAYER_RADIUS) ceiling = Math.min(ceiling, solid.bottom)
  }
  return ceiling
}
function createFloorCells(): Floor[] {
  const cells: Floor[] = []
  for (const room of roomVolumes) {
    const zones = floorZones.filter(zone => zone.x0 < room.x1 && zone.x1 > room.x0 && zone.z0 < room.z1 && zone.z1 > room.z0)
    const xs = [...new Set([room.x0, room.x1, ...zones.flatMap(zone => [zone.x0, zone.x1])])]
      .filter(x => x >= room.x0 && x <= room.x1).sort((a, b) => a - b)
    const zs = [...new Set([room.z0, room.z1, ...zones.flatMap(zone => [zone.z0, zone.z1])])]
      .filter(z => z >= room.z0 && z <= room.z1).sort((a, b) => a - b)
    for (let zi = 0; zi < zs.length - 1; zi++) {
      const row: Floor[] = []
      for (let xi = 0; xi < xs.length - 1; xi++) {
        const height = groundHeight((xs[xi] + xs[xi + 1]) / 2, (zs[zi] + zs[zi + 1]) / 2)
        const previous = row.at(-1)
        if (previous && previous.height === height) previous.x1 = xs[xi + 1]
        else row.push({ x0: xs[xi], x1: xs[xi + 1], z0: zs[zi], z1: zs[zi + 1], height })
      }
      cells.push(...row)
    }
  }
  return cells
}
export const floorCells = createFloorCells()
export const waterCells = floorCells.filter(cell => cell.height < WATER_LEVEL)
export const viewpoints: Record<RegionId, View> = sample.viewpoints
