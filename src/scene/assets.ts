import * as THREE from 'three'
import { distanceToRect, groundHeight, mapBounds, roomAt, occluders as solids, waterDepth } from './layout'

// All artwork is generated locally. The same rose texture drives the window and its light.
const palette = ['#ebbd78', '#ef9986', '#a5cbe8', '#96dcd2', '#bdabe4', '#e4cb91']
function canvasTexture(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function createRose() {
  return canvasTexture(1024, 1024, c => {
    c.translate(512, 512)
    const tones = ['#d1e4df', '#d9e4ed', '#eee3c8', '#e1d5db', '#d9e6dd', '#eee8d6']
    for (let ring = 0; ring < 3; ring++) {
      const inner = [48, 190, 330][ring], outer = [190, 330, 438][ring]
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8
        c.beginPath(); c.arc(0, 0, outer, a, b); c.arc(0, 0, inner, b, a, true); c.closePath()
        c.fillStyle = tones[(i + ring) % tones.length]; c.fill()
        c.strokeStyle = '#98aaa4'; c.lineWidth = 3; c.stroke()
      }
    }
    for (const radius of [48, 190, 330, 438]) {
      c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.strokeStyle = '#a6b4aa'; c.lineWidth = 5; c.stroke()
    }
    c.beginPath(); c.arc(0, 0, 47, 0, Math.PI * 2); c.fillStyle = '#f5edcf'; c.fill()
  })
}


export function createLancet() {
  return canvasTexture(384, 1024, c => {
    c.beginPath(); c.moveTo(18, 1006); c.lineTo(18, 290)
    c.bezierCurveTo(18, 160, 110, 60, 192, 18)
    c.bezierCurveTo(274, 60, 366, 160, 366, 290); c.lineTo(366, 1006); c.closePath(); c.clip()
    c.fillStyle = '#b5d9d7'; c.fillRect(0, 0, 384, 1024)
    for (let y = -1; y < 12; y++) for (let x = -1; x < 5; x++) {
      c.beginPath(); c.moveTo(x * 96 + 48, y * 100); c.lineTo(x * 96 + 96, y * 100 + 50)
      c.lineTo(x * 96 + 48, y * 100 + 100); c.lineTo(x * 96, y * 100 + 50); c.closePath()
      c.fillStyle = palette[((x + y * 3) % 6 + 6) % 6]; c.fill()
      c.strokeStyle = '#7b857a'; c.lineWidth = 4; c.stroke()
    }
    c.strokeStyle = '#f6e8bc'; c.lineWidth = 10
    c.strokeRect(24, 12, 336, 994)
    for (const x of [128, 256]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 1024); c.stroke() }
  })
}

export function createCaustics() {
  const size = 256, count = 7, data = new Uint8Array(size * size * 4)
  const random = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return n - Math.floor(n)
  }
  const sites = Array.from({ length: count * count }, (_, i) => [
    0.15 + random(i, 13) * 0.7, 0.15 + random(i, 71) * 0.7,
  ])
  // Periodic, irregular cell edges produce a water-light web without sine-wave bands.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * count + Math.sin(y / size * Math.PI * 4) * 0.2
    const v = y / size * count + Math.sin(x / size * Math.PI * 6) * 0.18
    const cx = Math.floor(u), cy = Math.floor(v)
    let nearest = Infinity, second = Infinity
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j
      const site = sites[((gy % count + count) % count) * count + (gx % count + count) % count]
      const distance = Math.hypot(gx + site[0] - u, gy + site[1] - v)
      if (distance < nearest) { second = nearest; nearest = distance }
      else second = Math.min(second, distance)
    }
    const ridge = Math.exp(-(second - nearest) * 22)
    const index = (y * size + x) * 4
    data[index] = data[index + 1] = data[index + 2] = Math.round(ridge * 255); data[index + 3] = 255
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true; texture.needsUpdate = true
  return texture
}

export function createLightVisibility() {
  const width = 192, height = 384, data = new Uint8Array(width * height * 4)
  const shadowRay = (x: number, y: number, z: number) => {
    const limit = z + 45.6
    if (limit <= 0) return 1
    for (const block of solids) {
      let near = 0.03, far = limit
      const origins = [x, y, z], directions = [-0.5, 2, -1]
      const lows = [block.x0, block.bottom, block.z0], highs = [block.x1, block.top, block.z1]
      for (let axis = 0; axis < 3; axis++) {
        const a = (lows[axis] - origins[axis]) / directions[axis], b = (highs[axis] - origins[axis]) / directions[axis]
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b))
      }
      if (far > near) return 0.12
    }
    return 1
  }
  // R: soft static contact shade, G: rose-window visibility, B: actual wet footprint.
  // All are baked from the same layout used by rendering and collision.
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const x = mapBounds.x0 + (i + 0.5) / width * (mapBounds.x1 - mapBounds.x0)
    const z = mapBounds.z0 + (j + 0.5) / height * (mapBounds.z1 - mapBounds.z0)
    const y = groundHeight(x, z), room = roomAt(x, z)
    let nearest = 5
    for (const block of solids) {
      if (block.bottom > y + 0.6 || block.top < y) continue
      nearest = Math.min(nearest, distanceToRect(block, x, z))
    }
    const occlusion = 1 - Math.exp(-nearest * 1.65) * 0.42
    const offset = (j * width + i) * 4
    data[offset] = Math.round(occlusion * 255)
    data[offset + 1] = Math.round((room?.id === 'rose' ? shadowRay(x, y + 0.03, z) : 0) * 255)
    data[offset + 2] = room && waterDepth(x, z) > 0 ? 255 : 0
    data[offset + 3] = 255
  }
  const texture = new THREE.DataTexture(data, width, height)
  texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true
  return texture
}


export function createEnvironment() {
  const texture = canvasTexture(1024, 512, c => {
    const gradient = c.createLinearGradient(0, 0, 0, 512)
    gradient.addColorStop(0, '#eef4f7'); gradient.addColorStop(0.45, '#f5f1e8')
    gradient.addColorStop(0.55, '#c3dedf'); gradient.addColorStop(1, '#849f9d')
    c.fillStyle = gradient; c.fillRect(0, 0, 1024, 512)
    for (let x = 40; x < 1024; x += 128) {
      c.fillStyle = '#fff1d6'; c.fillRect(x, 125, 34, 100)
      c.fillStyle = '#dce5d6'; c.fillRect(x + 5, 135, 24, 80)
    }
  })
  texture.mapping = THREE.EquirectangularReflectionMapping
  return texture
}
