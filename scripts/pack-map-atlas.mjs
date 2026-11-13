import {NodeIO} from '@gltf-transform/core'
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions'
import {weld,reorder,quantize} from '@gltf-transform/functions'
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer'
import {mkdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
await MeshoptEncoder.ready;await MeshoptDecoder.ready
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder})
await mkdir('src/world/assets',{recursive:true})
const entries=[]
for(const id of ['roam','hall','arcade','shaft']){
 const dir='public/assets/map-atlas/'+id,raw='art/map-atlas/'+id+'/poolrooms-baked-raw.glb',output=dir+'/poolrooms-baked.glb'
 const document=await io.read(raw)
 await document.transform(weld(),reorder({encoder:MeshoptEncoder}),quantize({pattern:/^(NORMAL|COLOR_0)$/,quantizeNormal:12,quantizeColor:8}))
 document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE})
 await io.write(output,document)
 const checked=await io.read(output)
 for(const mesh of checked.getRoot().listMeshes())for(const p of mesh.listPrimitives())if(!p.getAttribute('COLOR_0')||!p.getAttribute('TEXCOORD_1'))throw Error('Missing bake data '+id)
 await copyFile(output,'src/world/assets/'+id+'.glb')
 const manifest=JSON.parse(await readFile(dir+'/manifest.json','utf8'))
 Object.assign(manifest,{id,contentHash:createHash('sha256').update(await readFile(output)).digest('hex'),bytes:(await stat(output)).size,rawBytes:(await stat(raw)).size})
 await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2));entries.push(manifest)
 console.log(id+': '+(manifest.bytes/1048576).toFixed(2)+' MiB, '+manifest.triangles+' triangles')
}
await writeFile('art/map-atlas/manifest.json',JSON.stringify(entries,null,2))
