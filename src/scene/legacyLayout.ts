// Shared architecture, walkable surfaces and water. Metres, with Y pointing up.
export type RegionId = 'arrival' | 'water' | 'columns' | 'rose' | 'gallery' | 'sun' | 'return'
export type Rect = { x0: number; x1: number; z0: number; z1: number }
export type Room = Rect & { id: RegionId; label: string; english: string; ceiling: number }
export type Solid = Rect & { bottom: number; top: number }
export type Floor = Rect & { height: number }
export type Portal = { axis: 'x' | 'z'; at: number; from: number; to: number; height: number; depth: number }
export type RoofOpening = { room: RegionId; x: number; z: number; width: number; length: number; round?: boolean; rise: number }
export const WATER_LEVEL = -0.08
export const PLAYER_RADIUS = 0.27
export const BODY_HEIGHT = 1.85
export const STEP_HEIGHT = 0.25
export const mapBounds: Rect = { x0: -14.5, x1: 22.5, z0: -46.5, z1: 33.5 }
export const rooms: Room[] = [
  { id: 'arrival', label: '浅光前厅', english: 'THE THRESHOLD', x0: -12, x1: 12, z0: 22, z1: 33, ceiling: 4.6 },
  { id: 'water', label: '静水中庭', english: 'THE STILL COURT', x0: -14, x1: 14, z0: -6, z1: 22, ceiling: 6.6 },
  { id: 'columns', label: '回声拱廊', english: 'THE ECHO ARCADE', x0: -14, x1: 2, z0: -24, z1: -6, ceiling: 5.2 },
  { id: 'rose', label: '彩光圣所', english: 'THE ROSE CHAMBER', x0: -14, x1: 14, z0: -46, z1: -24, ceiling: 10.8 },
  { id: 'gallery', label: '折返长廊', english: 'THE LONG WAY HOME', x0: 14, x1: 22, z0: -46, z1: 22, ceiling: 4.2 },
]
export const roomById = Object.fromEntries(rooms.map(room => [room.id, room])) as Record<RegionId, Room>
export const doors: Portal[] = [
  { axis: 'z', at: 22, from: -9, to: -4, height: 4.2, depth: 0.65 },
  { axis: 'z', at: 22, from: -1, to: 4, height: 4.2, depth: 0.65 },
  { axis: 'z', at: -6, from: -10.5, to: -4.5, height: 4.7, depth: 0.65 },
  { axis: 'z', at: -24, from: -8, to: -3, height: 4.4, depth: 0.65 },
  { axis: 'x', at: 14, from: -37, to: -32, height: 4.0, depth: 0.65 },
  { axis: 'x', at: 14, from: 13, to: 18, height: 4.0, depth: 0.65 },
]
export const arcadePortals: Portal[] = [
  ...[
    { from: -3.8, to: 1.2, height: 4.8 },
    { from: 4.4, to: 10.0, height: 5.1 },
    { from: 13.4, to: 18.4, height: 4.8 },
  ].map(opening => ({ axis: 'x' as const, at: -7.5, ...opening, depth: 0.9 })),
  ...[-39, -30, -21, -12, -3, 6, 15].map((at, index) => ({ axis: 'z' as const, at, from: index % 2 ? 17.1 : 15.2, to: index % 2 ? 20.7 : 18.8, height: 3.6, depth: 0.7 })),
]
export const portals = [...doors, ...arcadePortals]
export const roofOpenings: RoofOpening[] = [
  { room: 'arrival', x: -5.5, z: 26, width: 2.5, length: 5.4, rise: 2.0 },
  { room: 'water', x: 1.4, z: 7, width: 8.6, length: 8.6, round: true, rise: 3.5 },
  { room: 'water', x: 10.6, z: 4, width: 1.8, length: 15, rise: 2.0 },
  { room: 'columns', x: -9.8, z: -16, width: 3.6, length: 6.4, rise: 2.6 },
  { room: 'rose', x: -7.7, z: -34, width: 3.5, length: 12, rise: 2.4 },
  ...[-34, -10, 13].map(z => ({ room: 'gallery' as const, x: 19.9, z, width: 1.5, length: 4.2, rise: 2.4 })),
]
export const deepPool: Rect = { x0: -6, x1: 6, z0: -41, z1: -30 }
export const island = { x: 1.4, z: 7, radius: 2.25, height: 0.28 }
export const roundColumns = [
  { x: 12.2, z: 13.1, radius: 0.68, top: 6.6 },
  { x: 7.2, z: -2.0, radius: 0.8, top: 6.6 },
  { x: -11, z: -10.5, radius: 0.9, top: 5.2 },
  { x: -5.5, z: -14.3, radius: 0.85, top: 5.2 },
  { x: -10, z: -19, radius: 0.9, top: 5.2 },
  { x: -1.7, z: -20.5, radius: 0.85, top: 5.2 },
  { x: -10, z: -34, radius: 0.7, top: 10.8 },
  { x: 10, z: -40, radius: 0.7, top: 10.8 },
]
export const columns: Solid[] = roundColumns.map(column => ({ x0: column.x - column.radius, x1: column.x + column.radius, z0: column.z - column.radius, z1: column.z + column.radius, bottom: -0.6, top: column.top }))
export const floorZones: Floor[] = [
  { x0: 7.5, x1: 11.6, z0: 25, z1: 31, height: 0.6 },
  { x0: -8, x1: -5, z0: 29, z1: 31.5, height: -0.12 },
  { x0: -13.7, x1: 9.5, z0: -5.8, z1: 19.5, height: -0.48 },
  { x0: -13.7, x1: -7.9, z0: -5.8, z1: 19.5, height: -0.24 },
  { x0: -13.7, x1: 9.5, z0: 18.5, z1: 19.5, height: -0.12 },
  { x0: -7.9, x1: 9.5, z0: 17.5, z1: 18.5, height: -0.24 },
  { x0: -7.9, x1: 9.5, z0: 16.5, z1: 17.5, height: -0.36 },
  { x0: 8.5, x1: 9.5, z0: -5.8, z1: 16.5, height: -0.12 },
  { x0: 7.5, x1: 8.5, z0: -5.8, z1: 16.5, height: -0.24 },
  { x0: 6.5, x1: 7.5, z0: -5.8, z1: 16.5, height: -0.36 },
  { x0: -7.9, x1: 6.5, z0: -5.8, z1: -4.8, height: -0.12 },
  { x0: -7.9, x1: 6.5, z0: -4.8, z1: -3.8, height: -0.24 },
  { x0: -7.9, x1: 6.5, z0: -3.8, z1: -2.8, height: -0.36 },
  { x0: -12, x1: -4, z0: -20, z1: -5.5, height: -0.24 },
  { x0: -12, x1: -4, z0: -21, z1: -20, height: -0.12 },
  ...[-0.32, -0.16, 0, 0.16, 0.28].map((height, index) => ({ x0: island.x - 1.44 + index * 0.06, x1: island.x + 1.44 - index * 0.06, z0: 12 - index * 0.75, z1: 12.75 - index * 0.75, height })),
  { ...deepPool, height: -1.8 },
  ...[-27, -9, 8].flatMap(z => [
    { x0: 14, x1: 22, z0: z, z1: z + 3, height: 0.12 },
    { x0: 14, x1: 22, z0: z + 0.8, z1: z + 2.2, height: 0.24 },
  ]),
]
export function contains(rect: Rect, x: number, z: number) { return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1 }
export function roomAt(x: number, z: number) { return rooms.find(room => contains(room, x, z)) }
function rectangularGround(x: number, z: number) {
  for (let i = floorZones.length - 1; i >= 0; i--) if (contains(floorZones[i], x, z)) return floorZones[i].height
  return 0
}
export function groundHeight(x: number, z: number) {
  const floor = Math.hypot(x - island.x, z - island.z) <= island.radius ? island.height : rectangularGround(x, z)
  const seat = benches.find(bench => contains(bench, x, z))
  return Math.max(floor, seat?.top ?? -Infinity)
}
export function waterDepth(x: number, z: number) { return roomAt(x, z) ? Math.max(0, WATER_LEVEL - groundHeight(x, z)) : 0 }

function wallSegments(axis: 'x' | 'z', at: number, from: number, to: number, top: number, depth: number, openings: Portal[]): Solid[] {
  const cuts = [...new Set([from, to, ...openings.flatMap(door => [door.from, door.to])])].filter(n => n >= from && n <= to).sort((a, b) => a - b)
  return cuts.slice(0, -1).map((start, index) => {
    const end = cuts[index + 1], middle = (start + end) / 2
    const door = openings.find(opening => middle > opening.from && middle < opening.to)
    return {
      x0: axis === 'x' ? at - depth / 2 : start, x1: axis === 'x' ? at + depth / 2 : end,
      z0: axis === 'z' ? at - depth / 2 : start, z1: axis === 'z' ? at + depth / 2 : end,
      bottom: door ? door.height : -0.65, top,
    }
  })
}
function createWalls() {
  const result: Solid[] = []
  rooms.forEach((room, index) => {
    const edges = [
      { axis: 'x' as const, at: room.x0, from: room.z0, to: room.z1, side: -1 },
      { axis: 'x' as const, at: room.x1, from: room.z0, to: room.z1, side: 1 },
      { axis: 'z' as const, at: room.z0, from: room.x0, to: room.x1, side: -1 },
      { axis: 'z' as const, at: room.z1, from: room.x0, to: room.x1, side: 1 },
    ]
    for (const edge of edges) {
      const openings = doors.filter(door => door.axis === edge.axis && door.at === edge.at)
      const endpoints = rooms.flatMap(other => edge.axis === 'x' ? [other.z0, other.z1] : [other.x0, other.x1])
      // Door endpoints are not split by unrelated room extents.
      const cuts = [...new Set([edge.from, edge.to, ...endpoints])].filter(n => n >= edge.from && n <= edge.to && !openings.some(o => n > o.from && n < o.to)).sort((a, b) => a - b)
      for (let i = 0; i < cuts.length - 1; i++) {
        const middle = (cuts[i] + cuts[i + 1]) / 2
        const x = edge.axis === 'x' ? edge.at + edge.side * 0.05 : middle
        const z = edge.axis === 'z' ? edge.at + edge.side * 0.05 : middle
        const neighbor = rooms.findIndex(other => contains(other, x, z))
        if (neighbor >= 0 && neighbor < index) continue
        result.push(...wallSegments(edge.axis, edge.at, cuts[i], cuts[i + 1], Math.max(room.ceiling, neighbor >= 0 ? rooms[neighbor].ceiling : 0), 0.65, openings))
      }
    }
  })
  result.push(...wallSegments('x', -7.5, -6, 22, 6.6, 0.9, arcadePortals.filter(p => p.axis === 'x')))
  for (const portal of arcadePortals.filter(p => p.axis === 'z')) result.push(...wallSegments('z', portal.at, 14, 22, 4.2, portal.depth, [portal]))
  return result
}
export const screens: Solid[] = [
  { x0: -5.7, x1: -1.5, z0: -2.1, z1: -1.5, bottom: -0.48, top: 2.35 },
  { x0: -2.1, x1: -1.5, z0: -4.0, z1: -1.5, bottom: -0.48, top: 2.35 },
  { x0: -14, x1: -8.2, z0: -17.2, z1: -16.6, bottom: -0.24, top: 3.4 },
  { x0: -11.5, x1: -7.5, z0: -22.3, z1: -21.8, bottom: 0, top: 1.5 },
  { x0: -5, x1: 0.5, z0: -27.4, z1: -26.8, bottom: 0, top: 2.5 },
  { x0: 11.1, x1: 11.7, z0: -38, z1: -33.2, bottom: 0, top: 3.7 },
]
export const benches: Solid[] = [
  { x0: -11.65, x1: -11.0, z0: 25, z1: 30, bottom: 0, top: 0.44 },
  { x0: 12.95, x1: 13.65, z0: 1, z1: 10, bottom: 0, top: 0.44 },
  { x0: 21.0, x1: 21.65, z0: -18, z1: -15, bottom: 0, top: 0.44 },
  { x0: 14.35, x1: 15.0, z0: -2, z1: 1, bottom: 0, top: 0.44 },
  { x0: 12.8, x1: 13.65, z0: -43, z1: -39, bottom: 0, top: 0.44 },
]
export const pilasters: Solid[] = [-4.3, 7.0, 19.5].map(z => ({
  x0: 13.15, x1: 14.0, z0: z, z1: z + 0.8, bottom: 0, top: 6.6,
}))
export const walls = createWalls()
export const solids = [...walls, ...screens, ...benches, ...pilasters]
export const occluders = [...solids, ...columns]
export function distanceToRect(rect: Rect, x: number, z: number) {
  return Math.hypot(Math.max(rect.x0 - x, 0, x - rect.x1), Math.max(rect.z0 - z, 0, z - rect.z1))
}
function archClearance(portal: Portal, x: number, z: number) {
  const across = portal.axis === 'z' ? x : z, along = portal.axis === 'z' ? z : x
  if (Math.abs(along - portal.at) > portal.depth / 2 + PLAYER_RADIUS || across < portal.from || across > portal.to) return Infinity
  const radius = (portal.to - portal.from) / 2
  const offset = Math.min(radius, Math.abs(across - (portal.from + portal.to) / 2) + PLAYER_RADIUS)
  return portal.height - radius + Math.sqrt(Math.max(0, radius * radius - offset * offset))
}
export function canWalk(x: number, z: number, feet = groundHeight(x, z)) {
  if (!roomAt(x, z) || distanceToRect(deepPool, x, z) < PLAYER_RADIUS + 0.16) return false
  for (const solid of solids) if (feet + BODY_HEIGHT > solid.bottom + 0.02 && feet < solid.top - 0.02 && distanceToRect(solid, x, z) < PLAYER_RADIUS) return false
  for (const column of roundColumns) if (Math.hypot(x - column.x, z - column.z) < column.radius + PLAYER_RADIUS) return false
  for (const portal of portals) if (feet + BODY_HEIGHT > archClearance(portal, x, z)) return false
  return true
}
export function ceilingHeight(x: number, z: number) {
  let ceiling = roomAt(x, z)?.ceiling ?? 4.2
  for (const portal of portals) ceiling = Math.min(ceiling, archClearance(portal, x, z))
  return ceiling
}
function createFloorCells(): Floor[] {
  const cells: Floor[] = []
  for (const room of rooms) {
    const zones = floorZones.filter(zone => zone.x0 < room.x1 && zone.x1 > room.x0 && zone.z0 < room.z1 && zone.z1 > room.z0)
    const xs = [...new Set([room.x0, room.x1, ...zones.flatMap(zone => [zone.x0, zone.x1])])].filter(x => x >= room.x0 && x <= room.x1).sort((a, b) => a - b)
    const zs = [...new Set([room.z0, room.z1, ...zones.flatMap(zone => [zone.z0, zone.z1])])].filter(z => z >= room.z0 && z <= room.z1).sort((a, b) => a - b)
    for (let zi = 0; zi < zs.length - 1; zi++) {
      const row: Floor[] = []
      for (let xi = 0; xi < xs.length - 1; xi++) {
        const height = rectangularGround((xs[xi] + xs[xi + 1]) / 2, (zs[zi] + zs[zi + 1]) / 2)
        const previous = row.at(-1)
        if (previous && previous.height === height) previous.x1 = xs[xi + 1]
        else row.push({ x0: xs[xi], x1: xs[xi + 1], z0: zs[zi], z1: zs[zi + 1], height })
      }
      for (const cell of row) {
        const previous = cells.find(other => other.x0 === cell.x0 && other.x1 === cell.x1 && other.z1 === cell.z0 && other.height === cell.height)
        if (previous) previous.z1 = cell.z1
        else cells.push(cell)
      }
    }
  }
  return cells
}
export const floorCells = createFloorCells()
export const waterCells = floorCells.filter(cell => cell.height < WATER_LEVEL)
export const viewpoints: Record<Exclude<RegionId, 'sun' | 'return'>, { position: [number, number, number]; target: [number, number, number] }> = {
  arrival: { position: [-6.5, 1.72, 28], target: [-5, 2, 9] },
  water: { position: [10.8, 1.72, 17.8], target: [-3.8, 1.8, 3.8] },
  columns: { position: [-1.9, 1.72, -9], target: [-9.5, 1.8, -22] },
  rose: { position: [8.4, 1.72, -27.2], target: [-1, 4, -41] },
  gallery: { position: [17.4, 1.72, 19.4], target: [18.2, 1.8, -6] },
}
