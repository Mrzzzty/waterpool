import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { benches, screens, deepPool, floorCells, island, portals, roofOpenings, roomById, rooms, roundColumns, solids, type Portal, type Room, type Solid } from './legacyLayout'

function BoxBatch({ boxes, material }: { boxes: Solid[]; material: THREE.Material }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const object = new THREE.Object3D()
    boxes.forEach((box, i) => {
      object.position.set((box.x0 + box.x1) / 2, (box.bottom + box.top) / 2, (box.z0 + box.z1) / 2)
      object.scale.set(box.x1 - box.x0, box.top - box.bottom, box.z1 - box.z0)
      object.updateMatrix(); mesh.current.setMatrixAt(i, object.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true; mesh.current.computeBoundingSphere()
  }, [boxes, material])
  return <instancedMesh ref={mesh} args={[undefined, material, boxes.length]} castShadow receiveShadow><boxGeometry /></instancedMesh>
}
function Arch({ portal, material }: { portal: Portal; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const radius = (portal.to - portal.from) / 2, spring = portal.height - radius
    const shape = new THREE.Shape()
    shape.moveTo(-radius, spring)
    shape.absarc(0, spring, radius, Math.PI, 0, true)
    shape.lineTo(radius, portal.height + 0.025); shape.lineTo(-radius, portal.height + 0.025); shape.closePath()
    return new THREE.ExtrudeGeometry(shape, { depth: portal.depth, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2, curveSegments: 48 })
  }, [portal])
  useEffect(() => () => geometry.dispose(), [geometry])
  const middle = (portal.from + portal.to) / 2
  return <mesh geometry={geometry} material={material} castShadow receiveShadow
    position={portal.axis === 'z' ? [middle, 0, portal.at - portal.depth / 2] : [portal.at - portal.depth / 2, 0, middle]}
    rotation-y={portal.axis === 'x' ? Math.PI / 2 : 0} />
}
function PortalFrames({ material }: { material: THREE.Material }) {
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const portal of portals) {
      const r = (portal.to - portal.from) / 2, spring = portal.height - r, trim = 0.14
      const shape = new THREE.Shape()
      shape.moveTo(-r - trim, -0.48); shape.lineTo(-r - trim, spring)
      shape.absarc(0, spring, r + trim, Math.PI, 0, true)
      shape.lineTo(r + trim, -0.48); shape.lineTo(r, -0.48); shape.lineTo(r, spring)
      shape.absarc(0, spring, r, 0, Math.PI, false)
      shape.lineTo(-r, -0.48); shape.closePath()
      const frame = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 48 })
      for (const side of [-1, 1]) {
        const part = frame.clone(), middle = (portal.from + portal.to) / 2
        const face = portal.at + side * portal.depth / 2 - (side < 0 ? 0.08 : 0)
        if (portal.axis === 'x') { part.rotateY(Math.PI / 2); part.translate(face, 0, middle) }
        else part.translate(middle, 0, face)
        parts.push(part)
      }
      frame.dispose()
    }
    const merged = mergeGeometries(parts)!
    parts.forEach(part => part.dispose())
    return merged
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />
}

function Roof({ room, material }: { room: Room; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(room.x0 - 0.32, -room.z0 + 0.32); shape.lineTo(room.x1 + 0.32, -room.z0 + 0.32)
    shape.lineTo(room.x1 + 0.32, -room.z1 - 0.32); shape.lineTo(room.x0 - 0.32, -room.z1 - 0.32); shape.closePath()
    for (const opening of roofOpenings.filter(item => item.room === room.id)) {
      const hole = new THREE.Path()
      if (opening.round) hole.absarc(opening.x, -opening.z, opening.width / 2, 0, Math.PI * 2)
      else {
        hole.moveTo(opening.x - opening.width / 2, -opening.z - opening.length / 2)
        hole.lineTo(opening.x + opening.width / 2, -opening.z - opening.length / 2)
        hole.lineTo(opening.x + opening.width / 2, -opening.z + opening.length / 2)
        hole.lineTo(opening.x - opening.width / 2, -opening.z + opening.length / 2); hole.closePath()
      }
      shape.holes.push(hole)
    }
    return new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false, curveSegments: 64 })
  }, [room])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={material} position-y={room.ceiling} rotation-x={-Math.PI / 2} castShadow receiveShadow />
}
function RoseWall({ material }: { material: THREE.Material }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-14, -0.65); shape.lineTo(14, -0.65)
    shape.lineTo(14, 10.8); shape.lineTo(-14, 10.8); shape.closePath()
    const opening = new THREE.Path()
    opening.absarc(0, 6.8, 3.15, 0, Math.PI * 2)
    shape.holes.push(opening)
    for (const x of [-10, 10]) {
      const niche = new THREE.Path()
      niche.moveTo(x - 1.2, 1.2); niche.lineTo(x - 1.2, 5.2)
      niche.absarc(x, 5.2, 1.2, Math.PI, 0, true)
      niche.lineTo(x + 1.2, 1.2); niche.closePath(); shape.holes.push(niche)
    }
    return new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false, curveSegments: 96 })
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={material} position-z={-46.875} castShadow receiveShadow />
}

export default function Architecture({ tile, plaster, column: columnMaterial, stone, niche, rose }: {
  tile: THREE.Material; plaster: THREE.Material; column: THREE.Material; stone: THREE.Material; niche: THREE.Material; rose: THREE.Texture
}) {
  const opaqueWalls = useMemo(() => solids
    .filter(wall => Math.abs((wall.z0 + wall.z1) / 2 + 46) > 0.01 || wall.x0 >= roomById.rose.x1)
    .map(wall => benches.includes(wall) || screens.includes(wall) ? { ...wall, top: wall.top - 0.08 } : wall), [])
  const floors = useMemo<Solid[]>(() => [
    ...floorCells.map(cell => ({ ...cell, bottom: -2.1, top: cell.height })),
    ...[0, 1, 2, 3].map(i => ({ x0: -3, x1: 1, z0: -31.1 - i * 0.6, z1: -30.5 - i * 0.6, bottom: -1.8, top: -0.3 - i * 0.35 })),
  ], [])
  const stonework = useMemo<Solid[]>(() => [
    ...[...benches, ...screens].map(block => ({ ...block, bottom: block.top - 0.08 })),
    { x0: deepPool.x0 - 0.2, x1: deepPool.x0 + 0.04, z0: deepPool.z0 - 0.2, z1: deepPool.z1 + 0.2, bottom: 0, top: 0.10 },
    { x0: deepPool.x1 - 0.04, x1: deepPool.x1 + 0.2, z0: deepPool.z0 - 0.2, z1: deepPool.z1 + 0.2, bottom: 0, top: 0.10 },
    { x0: deepPool.x0 + 0.04, x1: deepPool.x1 - 0.04, z0: deepPool.z0 - 0.2, z1: deepPool.z0 + 0.04, bottom: 0, top: 0.10 },
    { x0: deepPool.x0 + 0.04, x1: deepPool.x1 - 0.04, z0: deepPool.z1 - 0.04, z1: deepPool.z1 + 0.2, bottom: 0, top: 0.10 },
  ], [])
  const shafts = useMemo<Solid[]>(() => roofOpenings.filter(opening => !opening.round).flatMap(opening => {
    const bottom = roomById[opening.room].ceiling, top = bottom + opening.rise
    const x0 = opening.x - opening.width / 2, x1 = opening.x + opening.width / 2
    const z0 = opening.z - opening.length / 2, z1 = opening.z + opening.length / 2
    return [
      { x0: x0 - 0.3, x1: x0, z0, z1, bottom, top }, { x0: x1, x1: x1 + 0.3, z0, z1, bottom, top },
      { x0: x0 - 0.3, x1: x1 + 0.3, z0: z0 - 0.3, z1: z0, bottom, top },
      { x0: x0 - 0.3, x1: x1 + 0.3, z0: z1, z1: z1 + 0.3, bottom, top },
    ]
  }), [])
  return <group>
    <BoxBatch boxes={opaqueWalls} material={plaster} />
    <RoseWall material={plaster} />
    <BoxBatch boxes={floors} material={tile} />
    <BoxBatch boxes={stonework} material={stone} />
    <PortalFrames material={stone} />
    <BoxBatch boxes={shafts} material={plaster} />
    {portals.map((portal, index) => <Arch key={index} portal={portal} material={plaster} />)}
    {rooms.map(room => <Roof key={room.id} room={room} material={plaster} />)}
    {roundColumns.map((column, index) => <mesh key={index} position={[column.x, (column.top - 0.6) / 2, column.z]} material={columnMaterial} castShadow receiveShadow>
      <cylinderGeometry args={[column.radius, column.radius, column.top + 0.6, 64]} />
    </mesh>)}
    <mesh position={[island.x, (island.height - 0.6) / 2, island.z]} material={columnMaterial} castShadow receiveShadow>
      <cylinderGeometry args={[island.radius, island.radius, island.height + 0.6, 96]} />
    </mesh>
    <mesh position={[island.x, island.height + 0.004, island.z]} rotation-x={-Math.PI / 2} material={stone} receiveShadow>
      <ringGeometry args={[island.radius - 0.18, island.radius, 96]} />
    </mesh>
    {roofOpenings.map((opening, index) => {
      const ceiling = roomById[opening.room].ceiling
      return <group key={index}>
        {opening.round && <mesh position={[opening.x, ceiling + opening.rise / 2, opening.z]} material={columnMaterial} castShadow receiveShadow>
          <cylinderGeometry args={[opening.width / 2, opening.width / 2, opening.rise, 96, 1, true]} />
        </mesh>}
        {/* Visible exterior daylight behind each opening, without HDR glow or emitted room light. */}
        <mesh position={[opening.x, ceiling + opening.rise - 0.02, opening.z]} rotation-x={Math.PI / 2}>
          {opening.round ? <circleGeometry args={[opening.width / 2, 96]} /> : <planeGeometry args={[opening.width, opening.length]} />}
          <meshBasicMaterial color="#dce6e8" />
        </mesh>
      </group>
    })}
    {/* Real arched recesses, closed at the rear; no flat decals or additional lights. */}
    {[-10, 10].map(x => <mesh key={x} position={[x, 3.8, -46.94]} material={niche} castShadow receiveShadow>
      <boxGeometry args={[2.8, 5.6, 0.12]} />
    </mesh>)}
    <group position={[0, 6.8, -45.62]}>
      <mesh><circleGeometry args={[3.15, 96]} /><meshBasicMaterial color="#dce4df" /></mesh>
      <mesh position-z={0.025}><planeGeometry args={[7.3, 7.3]} /><meshBasicMaterial map={rose} transparent alphaTest={0.08} color="#ecede3" /></mesh>
      <mesh position-z={0.08}><torusGeometry args={[3.18, 0.15, 12, 96]} /><primitive object={stone} attach="material" /></mesh>
    </group>
    {/* A fine recessed overflow channel follows the broad dry walkway. */}
    <mesh position={[10.05, 0.004, 7]}><boxGeometry args={[0.11, 0.012, 18]} /><meshStandardMaterial color="#4c625e" roughness={0.7} metalness={0.12} /></mesh>

  </group>
}

