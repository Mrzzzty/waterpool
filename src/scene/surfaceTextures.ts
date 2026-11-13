import * as THREE from 'three'

export type SurfaceMaps = { color: THREE.CanvasTexture; detail: THREE.DataTexture; period: number }
export type SurfaceLibrary = { ceramic: SurfaceMaps; plaster: SurfaceMaps; stone: SurfaceMaps }

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n))
const fract = (n: number) => n - Math.floor(n)
function hash(x: number, y: number) { return fract(Math.sin(x * 127.1 + y * 311.7 + 42.4) * 43758.5453) }
function smooth(a: number, b: number, n: number) {
  const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t)
}
function periodicNoise(size: number, frequency: number, seed: number) {
  const grid = Array.from({ length: frequency * frequency }, (_, i) => hash(i % frequency + seed, Math.floor(i / frequency) + seed))
  return (x: number, y: number) => {
    const u = x / size * frequency, v = y / size * frequency
    const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const at = (a: number, b: number) => grid[(b % frequency) * frequency + a % frequency]
    const top = at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx
    const bottom = at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx
    return top * (1 - sy) + bottom * sy
  }
}

function createSurface(kind: keyof SurfaceLibrary, anisotropy: number): SurfaceMaps {
  const size = kind === 'ceramic' ? 1024 : 512
  const period = kind === 'ceramic' ? 1.92 : kind === 'plaster' ? 2.4 : 1.2
  const color = new Uint8ClampedArray(size * size * 4), heights = new Float32Array(size * size)
  const roughness = new Float32Array(size * size)
  const broad = periodicNoise(size, 8, 17), medium = periodicNoise(size, 32, 71), fine = periodicNoise(size, 128, 9)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, offset = i * 4
    const n = broad(x, y), m = medium(x, y), f = fine(x, y)
    let rgb: number[], relief: number, rough: number
    if (kind === 'ceramic') {
      const tileSize = size / 8, tx = Math.floor(x / tileSize), ty = Math.floor(y / tileSize)
      const localX = (x + 0.5) % tileSize, localY = (y + 0.5) % tileSize
      const edge = Math.min(localX, tileSize - localX, localY, tileSize - localY)
      const glaze = smooth(0.9, 2.0, edge), bevel = smooth(1.0, 4.1, edge)
      const variation = (hash(tx, ty) - 0.5) * 10
      const tint = hash(tx + 29, ty + 13) - 0.5
      const grain = (m - 0.5) * 1.5 + (f - 0.5) * 0.8
      const face = [230 + variation + grain - tint * 3, 234 + variation + grain, 226 + variation + grain + tint * 4]
      rgb = [0, 1, 2].map(k => [171, 179, 169][k] * (1 - glaze) + face[k] * glaze)
      relief = bevel * 0.0013 + (m - 0.5) * 0.00006 + (f - 0.5) * 0.000015
      rough = 0.84 * (1 - glaze) + (0.29 + (hash(tx + 5, ty) - 0.5) * 0.08 + (m - 0.5) * 0.04) * glaze
    } else if (kind === 'plaster') {
      const mottling = (n - 0.5) * 7 + (m - 0.5) * 3 + (f - 0.5) * 1.5
      rgb = [232 + mottling, 229 + mottling, 217 + mottling]
      relief = n * 0.0014 + m * 0.00042 + f * 0.00013
      rough = 0.88 + (m - 0.5) * 0.1
    } else {
      const grain = (n - 0.5) * 9 + (m - 0.5) * 5 + (f - 0.5) * 3
      const pore = smooth(0.72, 0.9, f) * smooth(0.5, 0.7, m)
      rgb = [221 + grain - pore * 12, 216 + grain - pore * 12, 200 + grain - pore * 11]
      relief = n * 0.001 + m * 0.00028 - pore * 0.0004
      rough = 0.67 + (m - 0.5) * 0.14 + pore * 0.12
    }
    for (let channel = 0; channel < 3; channel++) color[offset + channel] = clamp(rgb[channel], 0, 255)
    color[offset + 3] = 255; heights[i] = relief; roughness[i] = rough
  }
  // Linear RG stores tangent-space normal XY; B stores roughness. One shared detail sample.
  const detail = new Uint8Array(size * size * 4)
  const height = (x: number, y: number) => heights[((y + size) % size) * size + (x + size) % size]
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, scale = size / period * 0.5
    const dx = (height(x + 1, y) - height(x - 1, y)) * scale
    const dy = (height(x, y + 1) - height(x, y - 1)) * scale
    const length = Math.hypot(dx, dy, 1)
    detail[i * 4] = Math.round((0.5 - dx / length * 0.5) * 255)
    detail[i * 4 + 1] = Math.round((0.5 + dy / length * 0.5) * 255)
    detail[i * 4 + 2] = Math.round(clamp(roughness[i]) * 255); detail[i * 4 + 3] = 255
  }
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size
  canvas.getContext('2d')!.putImageData(new ImageData(color, size, size), 0, 0)
  const colorMap = new THREE.CanvasTexture(canvas)
  colorMap.colorSpace = THREE.SRGBColorSpace
  const detailMap = new THREE.DataTexture(detail, size, size)
  detailMap.flipY = true
  for (const texture of [colorMap, detailMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = true; texture.anisotropy = anisotropy; texture.needsUpdate = true
  }
  return { color: colorMap, detail: detailMap, period }
}

export function createSurfaceLibrary(anisotropy: number): SurfaceLibrary {
  return { ceramic: createSurface('ceramic', anisotropy), plaster: createSurface('plaster', anisotropy), stone: createSurface('stone', anisotropy) }
}
export function disposeSurfaces(surfaces: SurfaceLibrary) {
  for (const maps of Object.values(surfaces)) { maps.color.dispose(); maps.detail.dispose() }
}
