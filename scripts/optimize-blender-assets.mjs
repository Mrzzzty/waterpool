import { createHash } from 'node:crypto'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { weld, reorder, quantize } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import { readFile, writeFile, stat, copyFile } from 'node:fs/promises'
await MeshoptEncoder.ready;await MeshoptDecoder.ready
const output='public/assets/blender-current/poolrooms-baked.glb',raw='art/blender-current/poolrooms-baked-raw.glb'
try{await stat(raw)}catch{await copyFile(output,raw)}
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder})
const doc=await io.read(raw)
// Never quantize world positions or the material metadata in TEXCOORD_1: room
// boundaries must stay coincident and floor/skirt heights must remain exact.
await doc.transform(weld(),reorder({encoder:MeshoptEncoder}),quantize({pattern:/^(NORMAL|COLOR_0)$/,quantizeNormal:12,quantizeColor:8}))
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE})
await io.write(output,doc)
const check=await io.read(output)
let primitives=0,vertices=0
for(const mesh of check.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  if(!mesh.getName().startsWith('slide')&&(!p.getAttribute('COLOR_0')||!p.getAttribute('TEXCOORD_1')))throw Error('Lost baked attributes: '+mesh.getName())
  vertices+=p.getAttribute('POSITION').getCount();primitives++
}
const manifest=JSON.parse(await readFile('public/assets/blender-current/manifest.json','utf8'))
manifest.contentHash=createHash('sha256').update(await readFile(output)).digest('hex').slice(0,12);manifest.asset='poolrooms-baked.glb';manifest.uncompressedBytes=(await stat(raw)).size;manifest.bytes=(await stat(output)).size;manifest.runtimeVertices=vertices;manifest.compression='EXT_meshopt_compression; positions and material UV metadata lossless'
await writeFile('public/assets/blender-current/manifest.json',JSON.stringify(manifest,null,2))
await writeFile('src/scene/blenderManifest.json',JSON.stringify(manifest,null,2))
console.log(JSON.stringify({primitives,vertices,rawBytes:manifest.uncompressedBytes,compressedBytes:manifest.bytes,verified:'decoded baked colors and material metadata present'}))
