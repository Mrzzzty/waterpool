
import type { Solid } from './legacyLayout'

type Batch = { positions: number[]; normals: number[]; occlusion: number[] }
const rounded = (v: number) => +v.toFixed(4)

// Coordinate-compressed solid union: remove internal faces before greedy meshing.
// No per-frame CSG. The resulting spatial batches retain ordinary Three.js frustum culling.
export function buildSolidSurface(boxes: Solid[],voids:Solid[]=[],surfaceKey?:(p:number[],normal:number[])=>number) {
  const bounds = [...boxes,...voids].map(b => [[b.x0, b.x1], [b.bottom, b.top], [b.z0, b.z1]])
  const axes = [0, 1, 2].map(d => [...new Set(bounds.flatMap(b => b[d]).map(rounded))].sort((a, b) => a - b))
  const dims = axes.map(a => a.length - 1), [nx, ny, nz] = dims
  const indices = axes.map(a => new Map(a.map((v, i) => [v, i])))
  const volume = new Uint8Array(nx * ny * nz)
  for (const [index,b] of bounds.entries()) {
    const lo = b.map((range, d) => indices[d].get(rounded(range[0]))!)
    const hi = b.map((range, d) => indices[d].get(rounded(range[1]))!)
    for (let z = lo[2]; z < hi[2]; z++) for (let y = lo[1]; y < hi[1]; y++) {
      const offset = nx * (y + ny * z)
      volume.fill(index<boxes.length?1:0, offset + lo[0], offset + hi[0])
    }
  }
  const occupied = (p: number[]) => p[0] < 0 || p[1] < 0 || p[2] < 0 || p[0] >= nx || p[1] >= ny || p[2] >= nz ? 0 : volume[p[0] + nx * (p[1] + ny * p[2])]
  const batches = new Map<string, Batch>()
  let faceCount = 0
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3, width = dims[u], height = dims[v]
    const mask = new Int32Array(width * height), p = [0, 0, 0]
    for (let slice = 0; slice <= dims[d]; slice++) {
      for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
        p[u] = i; p[v] = j; p[d] = slice - 1; const a = occupied(p)
        p[d] = slice; const b = occupied(p)
        let key=0
        if(a!==b&&surfaceKey){
          const point=[0,0,0],normal=[0,0,0];point[d]=axes[d][slice];point[u]=(axes[u][i]+axes[u][i+1])/2;point[v]=(axes[v][j]+axes[v][j+1])/2;normal[d]=a?1:-1
          key=surfaceKey(point,normal)
        }
        mask[i + width * j] = a === b ? 0 : (a ? 1 : -1)*(1+key)
      }
      for (let j = 0; j < height; j++) for (let i = 0; i < width;) {
        const code = mask[i + width * j],sign=Math.sign(code)
        if (!code) { i++; continue }
        let w = 1, h = 1
        while (i + w < width && mask[i + w + width * j] === code) w++
        grow: while (j + h < height) {
          for (let k = 0; k < w; k++) if (mask[i + k + width * (j + h)] !== code) break grow
          h++
        }
        const corners = [[i, j], [i + w, j], [i + w, j + h], [i, j + h]]
        const vertices = corners.map(([a, b]) => {
          const vertex = [0, 0, 0]; vertex[d] = axes[d][slice]; vertex[u] = axes[u][a]; vertex[v] = axes[v][b]; return vertex
        })
        const ao = corners.map(([a, b]) => {
          const q = [0, 0, 0]; q[d] = sign > 0 ? slice : slice - 1
          const insideU = a === i ? a : a - 1, outsideU = a === i ? a - 1 : a
          const insideV = b === j ? b : b - 1, outsideV = b === j ? b - 1 : b
          q[u] = outsideU; q[v] = insideV; const sideU = occupied(q)
          q[u] = insideU; q[v] = outsideV; const sideV = occupied(q)
          q[u] = outsideU; const corner = occupied(q)
          return sideU && sideV ? .64 : 1 - (sideU + sideV + corner) * .1
        })
        const centerX = (vertices[0][0] + vertices[2][0]) / 2, centerZ = (vertices[0][2] + vertices[2][2]) / 2
        const key = Math.floor(centerX / 24) + ':' + Math.floor(centerZ / 24)
        const batch = batches.get(key) ?? { positions: [], normals: [], occlusion: [] }
        const normal = [0, 0, 0]; normal[d] = sign
        for (const k of sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
          batch.positions.push(...vertices[k]); batch.normals.push(...normal); batch.occlusion.push(ao[k])
        }
        batches.set(key, batch); faceCount++
        for (let y = 0; y < h; y++) mask.fill(0, i + width * (j + y), i + w + width * (j + y))
        i += w
      }
    }
  }
  return { batches, faceCount, cellCount: volume.length }
}
