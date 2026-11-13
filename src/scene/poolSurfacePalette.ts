import * as THREE from 'three'
import {libraryURLs,prepareSurfaceLibrary,type SurfaceLibrary} from './surfaceLibrary'

// Periods are metres, matching scripts/generate-pool-surfaces.py and manifest.json.
// These gains complement the authored deeper relief; keep plaster/aggregate restrained.
export const surfaceSpecs = [
  { id: 'mosaic', period: 1.28, normalScale: 1.85 },
  { id: 'glaze', period: 1.28, normalScale: 2.10 },
  { id: 'plaster', period: 1.0, normalScale: .35 },
  { id: 'limestone', period: 2.4, normalScale: 2.00 },
  { id: 'terrazzo', period: 1.6, normalScale: 1.65 },
] as const
export type SurfaceId = typeof surfaceSpecs[number]['id']
export type PoolSurface = { color: THREE.Texture; detail: THREE.Texture; period: number; normalScale: number }
export type PoolSurfacePalette = Record<SurfaceId, PoolSurface>&{library:SurfaceLibrary}
export const surfaceTextureUrls = [...surfaceSpecs.flatMap(({ id }) => [
  id==='plaster'?'/assets/open-surfaces/plaster_color.jpg':`/assets/pool-surfaces/${id}_color.png`,
  id==='plaster'?'/assets/open-surfaces/plaster_normal-roughness.png':`/assets/pool-surfaces/${id}_normal-roughness.png`,
]),...libraryURLs]

export function prepareSurfacePalette(source: THREE.Texture[], anisotropy: number) {
  const textures = source.slice(0,surfaceSpecs.length*2).map((texture, index) => {
    const map = texture.clone()
    map.colorSpace = index % 2 === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.minFilter = THREE.LinearMipmapLinearFilter
    map.magFilter = THREE.LinearFilter
    map.generateMipmaps = true
    map.anisotropy = Math.min(16, anisotropy)
    map.needsUpdate = true
    return map
  })
  const surfaces = Object.fromEntries(surfaceSpecs.map((spec, i) => [spec.id, {
    color: textures[i * 2], detail: textures[i * 2 + 1],
    period: spec.period, normalScale: spec.normalScale,
  }])) as Record<SurfaceId,PoolSurface>
  const palette:PoolSurfacePalette={...surfaces,library:prepareSurfaceLibrary(source.slice(surfaceSpecs.length*2),anisotropy)}
  textures.push(palette.library.color,palette.library.detail)
  return { palette, textures }
}
