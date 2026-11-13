// 静态资产诊断：每个运行时 GLB 的三角数/批次/材质/纹理， loose 贴图体积与显存估算，dist bundle 体积。
//   node scripts/diagnose-assets.mjs
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

const GLBS = [
  'public/assets/map-atlas/hall/poolrooms-baked.glb',
  'public/assets/map-atlas/roam/poolrooms-baked.glb',
  'public/assets/map-atlas/arcade/poolrooms-baked.glb',
  'public/assets/map-atlas/shaft/poolrooms-baked.glb',
  'public/assets/blender-current/poolrooms-baked.glb',
  'public/assets/quiet-extension/quiet-bath.glb',
  'src/story/assets/bath-calibrated.glb',
  'src/story/assets/sunlit-arcade.glb',
  'src/story/assets/replay-station.glb',
  'src/story/assets/valve-wheel.glb',
]

function pngDim(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  }
  return null
}
const vramRGBA8 = (w, h) => Math.round(w * h * 4 * 1.333)

const report = { glbs: [], looseTextures: [], bundle: [] }

for (const rel of GLBS) {
  if (!existsSync(rel)) continue
  const doc = await io.read(rel)
  const root = doc.getRoot()
  const meshes = root.listMeshes().map(m => {
    let tris = 0, verts = 0
    const attrs = new Set()
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices()
      const pos = p.getAttribute('POSITION')
      tris += idx ? idx.getCount() / 3 : pos.getCount() / 3
      verts += pos.getCount()
      for (const a of p.listSemantics()) attrs.add(a)
    }
    return { name: m.getName(), tris, verts, prims: m.listPrimitives().length, attrs: [...attrs].sort() }
  })
  const textures = root.listTextures().map(t => {
    const img = t.getImage()
    const dim = img ? pngDim(Buffer.from(img)) : null
    return { name: t.getName(), mime: t.getMimeType(), bytes: img ? img.byteLength : 0, ...dim }
  })
  const sorted = [...meshes].sort((a, b) => b.tris - a.tris)
  report.glbs.push({
    file: rel,
    bytes: statSync(rel).size,
    tris: meshes.reduce((a, m) => a + m.tris, 0),
    verts: meshes.reduce((a, m) => a + m.verts, 0),
    meshes: meshes.length,
    drawUnits: meshes.reduce((a, m) => a + m.prims, 0),
    materials: root.listMaterials().map(m => m.getName()),
    textures,
    topMeshes: sorted.slice(0, 6),
    extensions: root.listExtensionsUsed().map(e => e.extensionName),
  })
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(png|jpg|jpeg|exr|bin)$/i.test(e.name)) out.push(p)
  }
  return out
}

const texDirs = ['public/assets', 'src/assets', 'src/story/assets']
let vramTotal = 0
for (const p of texDirs.flatMap(d => walk(d))) {
  const st = statSync(p)
  const dim = /\.(png)$/i.test(p) ? pngDim(readFileSync(p)) : null
  const vram = dim ? vramRGBA8(dim.w, dim.h) : null
  if (vram) vramTotal += vram
  report.looseTextures.push({ file: p.replace(/\\/g, '/'), bytes: st.size, ...dim, vramEstimate: vram })
}
report.looseTextureVramTotalMiB = +(vramTotal / 1048576).toFixed(1)

if (existsSync('dist/assets')) {
  for (const e of readdirSync('dist/assets')) {
    if (/\.(js|css)$/.test(e)) report.bundle.push({ file: e, bytes: statSync(join('dist/assets', e)).size })
  }
  report.bundle.sort((a, b) => b.bytes - a.bytes)
}

report.totals = {
  atlasTris: report.glbs.filter(g => g.file.includes('map-atlas')).reduce((a, g) => a + g.tris, 0),
  atlasBytes: report.glbs.filter(g => g.file.includes('map-atlas')).reduce((a, g) => a + g.bytes, 0),
  atlasDrawUnits: report.glbs.filter(g => g.file.includes('map-atlas')).reduce((a, g) => a + g.drawUnits, 0),
}
console.log(JSON.stringify(report, null, 2))