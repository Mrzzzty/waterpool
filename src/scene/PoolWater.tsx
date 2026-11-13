import { captureSize } from './renderQuality'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { DayCycle } from './daylightCycle'
import { waterFragment, waterVertex, worldUniforms } from './materials'
import { captureExcluded, captureUniforms } from './captureState'
import { basinAt, poolBasins } from './poolBasins'
import { floorCells, waterDepth } from './layout'
import { stepWater, subscribeWater, waterBodies, waterRevision, zoneOfBasin, type WaterBody } from './waterState'

export type Quality = 'high' | 'balanced' | 'low'

/**
 * One surface per body of water, built at the level its geometry currently
 * matches. The mesh then rides the eased level, so a draining pool moves
 * smoothly while the depth attribute stays a few centimetres behind.
 */
export function createWaterGeometry(body: WaterBody) {
  const level = body.built
  const vertices: number[] = [], indices: number[] = [], depths: number[] = []
  for (const cell of floorCells) {
    const cx = (cell.x0 + cell.x1) / 2, cz = (cell.z0 + cell.z1) / 2
    const basin = basinAt(cx, cz)
    if (!basin || zoneOfBasin(basin.id) !== body.id) continue
    if (waterDepth(cx, cz) <= .001) continue
    const nx = Math.max(1, Math.ceil((cell.x1 - cell.x0) * 2)), nz = Math.max(1, Math.ceil((cell.z1 - cell.z0) * 2))
    const start = vertices.length / 3
    for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
      const px = +(cell.x0 + x / nx * (cell.x1 - cell.x0)).toFixed(5)
      const pz = +(cell.z0 + z / nz * (cell.z1 - cell.z0)).toFixed(5)
      vertices.push(px, level, pz); depths.push(waterDepth(px, pz))
    }
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const a = start + z * (nx + 1) + x, b = a + 1, c = a + nx + 1, d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(depths, 1))
  geometry.setIndex(indices); geometry.computeBoundingSphere()
  return geometry
}

export default function PoolWater({ caustics, environment, quality, cycle }: { caustics: THREE.Texture; environment: THREE.Texture; quality: Quality; cycle: DayCycle }) {
  const { gl, camera, scene, size } = useThree()
  const dpr = useThree(state => state.viewport.dpr)
  const revision = useSyncExternalStore(subscribeWater, waterRevision)
  const resources = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
    target.texture.generateMipmaps=true;target.texture.minFilter=THREE.LinearMipmapLinearFilter
    target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType)
    const layers = waterBodies.map(body => {
      const reflection = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
      reflection.texture.generateMipmaps=true;reflection.texture.minFilter=THREE.LinearMipmapLinearFilter
      const matrix = new THREE.Matrix4()
      const material = new THREE.ShaderMaterial({
        vertexShader: waterVertex, fragmentShader: waterFragment, uniforms: {
          ...worldUniforms, uScene: { value: target.texture }, uDepth: { value: target.depthTexture },
          uReflection: { value: reflection.texture }, uReflectionMatrix: { value: matrix },
          uCaustics: { value: caustics }, uEnvironment: { value: environment }, uResolution: { value: new THREE.Vector2() },
          uReflectionTint: { value: cycle.indirectTint }, uReflectionGain: { value: cycle.indirectScale },
          uWaterLevel: { value: body.level }, uNear: { value: .1 }, uFar: { value: 180 }, uHasReflection: { value: 0 },
        },
      })
      return {
        body, reflection, matrix, material,
        geometry: createWaterGeometry(body),
        footprints: poolBasins.filter(basin => zoneOfBasin(basin.id) === body.id).flatMap(basin => basin.footprint),
        mesh: null as THREE.Mesh | null, lastMirror: -10, distance: Infinity,
      }
    })
    return {
      target, layers, mirror: new THREE.PerspectiveCamera(), look: new THREE.Vector3(), frame: 0, primary: '',
      elapsed: 0, lastCapture: -10, dirty: true,
      lastPosition: new THREE.Vector3(Infinity, Infinity, Infinity), lastQuaternion: new THREE.Quaternion(), lastProjection: new THREE.Matrix4(),
      hidden: [] as [THREE.Object3D, boolean][],
      clip: new THREE.Plane(new THREE.Vector3(0, 1, 0), .01), viewport: new THREE.Vector2(),
      mirrorSize:[1,1] as [number,number],frustum:new THREE.Frustum(),viewProjection:new THREE.Matrix4(),bounds:new THREE.Box3(),
    }
  }, [caustics, environment, cycle, revision])
  useEffect(() => {
    // Per-body mirrors stay smaller than before: eight surfaces now share the budget.
    const w = size.width * dpr, h = size.height * dpr, maxTexture = gl.capabilities.maxTextureSize
    const mirrorSize = captureSize(w, h, 1, Math.min(maxTexture, quality === 'high' ? 1536 : quality === 'balanced' ? 1024 : 640), quality === 'high' ? 1179648 : quality === 'balanced' ? 589824 : 262144)
    resources.mirrorSize=mirrorSize
    const refractSize = captureSize(w, h, quality === 'high' ? 1 : quality === 'balanced' ? .85 : .6, Math.min(maxTexture, quality === 'high' ? 2560 : quality === 'balanced' ? 1600 : 960), quality === 'high' ? 3686400 : quality === 'balanced' ? 1600000 : 655360)
    resources.target.setSize(...refractSize); resources.dirty = true
  }, [size, dpr, quality, resources, gl])
  useEffect(() => () => {
    resources.target.dispose(); resources.target.depthTexture?.dispose()
    resources.layers.forEach(layer => { layer.reflection.dispose(); layer.material.dispose(); layer.geometry.dispose() })
    if (captureUniforms.uOpaqueDepth.value === resources.target.depthTexture) { captureUniforms.uOpaqueDepth.value = null; captureUniforms.uHasDepth.value = 0 }
  }, [resources])

  useFrame((_, delta) => {
    stepWater(Math.min(delta, .1))
    const { target, layers, mirror, look, clip, viewport } = resources
    for (const layer of layers) {
      layer.material.uniforms.uReflectionGain.value = cycle.indirectScale
      layer.material.uniforms.uWaterLevel.value = layer.body.level
      if (layer.mesh) layer.mesh.position.y = layer.body.level - layer.body.built
    }
    const perspective = camera as THREE.PerspectiveCamera
    resources.elapsed += Math.min(delta, .1)
    resources.frustum.setFromProjectionMatrix(resources.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse))
    const visible=layers.filter(layer=>layer.footprints.some(r=>{
      resources.bounds.min.set(r.x0,layer.body.level-.04,r.z0);resources.bounds.max.set(r.x1,layer.body.level+.04,r.z1)
      return resources.frustum.intersectsBox(resources.bounds)
    }))
    for(const layer of layers)if(!visible.includes(layer)&&resources.elapsed-layer.lastMirror>6&&layer.reflection.width>1){
      layer.reflection.setSize(1,1);layer.material.uniforms.uHasReflection.value=0
    }
    if(!visible.length)return
    const moved = camera.position.distanceToSquared(resources.lastPosition) > .000001
      || 1 - Math.abs(camera.quaternion.dot(resources.lastQuaternion)) > .000001
      || !camera.projectionMatrix.equals(resources.lastProjection)
    const captureRate = quality === 'high' ? 30 : quality === 'balanced' ? 24 : 15
    const capture = resources.dirty || moved || resources.elapsed - resources.lastCapture >= 1 / captureRate
    if (!capture) return
    gl.getDrawingBufferSize(viewport)
    layers.forEach(({ material }) => { material.uniforms.uNear.value = perspective.near; material.uniforms.uFar.value = perspective.far; material.uniforms.uResolution.value.copy(viewport) })
    captureUniforms.uScreenSize.value.copy(viewport)
    captureUniforms.uCameraNear.value = perspective.near; captureUniforms.uCameraFar.value = perspective.far
    const previousTarget = gl.getRenderTarget(), previousClipping = gl.clippingPlanes
    const previousXr = gl.xr.enabled, previousShadow = gl.shadowMap.autoUpdate
    for (const layer of layers) if (layer.mesh) layer.mesh.visible = false
    gl.xr.enabled = false; gl.shadowMap.autoUpdate = false
    resources.hidden.length = 0
    captureExcluded.forEach(object => { resources.hidden.push([object, object.visible]); object.visible = false })
    try {
      // Every puddle, submerged step and pool uses this single scene/depth capture.
      gl.setRenderTarget(target); gl.clear(); gl.render(scene, camera)
      // One mirror render per capture: the nearest body wins, a visible neighbour
      // shares every third frame. Two bodies at the same height still share nothing,
      // because each owns its own target.
      for (const layer of layers) layer.distance = Math.min(...layer.footprints.map(r => Math.hypot(
        Math.max(r.x0 - camera.position.x, 0, camera.position.x - r.x1), Math.max(r.z0 - camera.position.z, 0, camera.position.z - r.z1))))
      const ordered = [...visible].sort((a, b) => a.distance - b.distance)
      const primary = ordered[0], changed = primary.body.id !== resources.primary
      const secondary = ordered.slice(1).filter(l => l.distance < 32).sort((a, b) => a.lastMirror - b.lastMirror)[0]
      const layer = !changed && secondary && ++resources.frame % 3 === 0 ? secondary : primary
      resources.primary = primary.body.id
      const { reflection, matrix, material, body } = layer
      if(reflection.width!==resources.mirrorSize[0]||reflection.height!==resources.mirrorSize[1])reflection.setSize(...resources.mirrorSize)
      const level = body.level
      mirror.copy(perspective)
      mirror.position.y = level * 2 - camera.position.y
      camera.getWorldDirection(look); look.add(camera.position); look.y = level * 2 - look.y
      mirror.up.set(0, -1, 0); mirror.lookAt(look); mirror.updateMatrixWorld()
      matrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1)
      matrix.multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse)
      clip.constant = -level + .01; gl.clippingPlanes = [clip]
      gl.setRenderTarget(reflection); gl.clear(); gl.render(scene, mirror)
      layer.lastMirror = resources.elapsed; material.uniforms.uHasReflection.value = 1
      captureUniforms.uOpaqueDepth.value = target.depthTexture; captureUniforms.uHasDepth.value = 1
      resources.lastPosition.copy(camera.position); resources.lastQuaternion.copy(camera.quaternion); resources.lastProjection.copy(camera.projectionMatrix)
      resources.lastCapture = resources.elapsed; resources.dirty = false
    } finally {
      resources.hidden.forEach(([object, visible]) => { object.visible = visible })
      for (const layer of layers) if (layer.mesh) layer.mesh.visible = true
      gl.clippingPlanes = previousClipping
      gl.xr.enabled = previousXr; gl.shadowMap.autoUpdate = previousShadow; gl.setRenderTarget(previousTarget)
    }
  }, -1)
  return <group userData={{ excludeFromRoomReflection: true }}>{resources.layers.map(layer =>
    <mesh key={layer.body.id} ref={mesh => { layer.mesh = mesh }} geometry={layer.geometry} material={layer.material} />
  )}</group>
}
