// 把 Blender 导出的 GLB 压到网页能吃的体积：焊接顶点 → 去重 → 清理 → 量化。
// 不引入 meshopt/draco 压缩，加载端不需要额外解码器。
//
//   node scripts/optimize-glb.mjs src/story/assets/valve-wheel.glb [out.glb]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, quantize, weld } from '@gltf-transform/functions'
import { statSync } from 'node:fs'

const input = process.argv[2]
const output = process.argv[3] || input
if (!input) {
  console.error('用法：node scripts/optimize-glb.mjs <in.glb> [out.glb]')
  process.exit(2)
}

const before = statSync(input).size
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(input)

await doc.transform(
  weld({ tolerance: 0.0001 }),
  dedup(),
  prune({ keepAttributes: false, keepIndices: false }),
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
)

await io.write(output, doc)

const after = statSync(output).size
let tris = 0
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const index = prim.getIndices()
    tris += index ? index.getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3
  }
}
console.log(`${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB  (${tris} 三角形, ${doc.getRoot().listMaterials().length} 材质)`)
