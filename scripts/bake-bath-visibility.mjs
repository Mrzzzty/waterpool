// Static visibility, not lighting: RGB stores visibility from the three HDR
// probe origins. Rebuild only when the shared plan / occluder generator changes.
import {build} from 'esbuild'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const sources=['src/story/quietBath.json','src/story/bathGeometry.ts','src/story/bathProbeGeometry.ts','scripts/bake-bath-visibility.mjs']
const hash=createHash('sha256');for(const file of sources)hash.update(await readFile(file))
const fingerprint=hash.digest('hex'),metaFile='src/story/assets/bath-probe-visibility.json',dataFile='src/story/assets/bath-probe-visibility.bin'
try{const previous=JSON.parse(await readFile(metaFile,'utf8'));if(previous.fingerprint===fingerprint&&(await readFile(dataFile)).length===previous.bytes){console.log('Bath visibility volume is current');process.exit(0)}}catch{}
const start=performance.now()
await mkdir('.work-backup',{recursive:true})
const bundle=await build({stdin:{contents:`export {bathOccluders} from './src/story/bathProbeGeometry';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'})
await writeFile('.work-backup/bath-occluders.mjs',bundle.outputFiles[0].text)
const {bathOccluders:boxes}=await import('../.work-backup/bath-occluders.mjs?'+Date.now())
const plan=JSON.parse(await readFile(sources[0],'utf8'))
const min=[plan.bounds[0],plan.bed,plan.bounds[2]],max=[plan.bounds[1],9.9,plan.bounds[3]],origins=[[-7,1.25,28.6],[-16,1.25,30.2],[-25.3,1.25,28.4]]
const dimensions=min.map((v,i)=>Math.ceil((max[i]-v)/.2)+1),data=new Uint8Array(dimensions.reduce((a,b)=>a*b,4))
const contains=(p,r)=>p[0]>=r[0]&&p[0]<=r[1]&&p[2]>=r[2]&&p[2]<=r[3]
function visibility(o,p){
 const d=p.map((v,i)=>v-o[i]),distance=Math.hypot(...d);for(let i=0;i<3;i++)d[i]/=Math.max(distance,1e-6)
 let nearest=distance
 const at=t=>o.map((v,i)=>v+d[i]*t)
 for(let i=0;i<boxes.length;i+=2){
  let enter=-Infinity,leave=Infinity
  for(let axis=0;axis<3;axis++){
   const inv=(d[axis]<0?-1:1)/Math.max(Math.abs(d[axis]),1e-5),a=(boxes[i][axis]-o[axis])*inv,b=(boxes[i+1][axis]-o[axis])*inv
   enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b))
  }
  if(enter>.015&&enter<nearest&&enter<leave)nearest=enter
 }
 for(const w of plan.partitions){
  const axis=w.axis==='x'?0:2,along=axis===0?2:0
  for(const face of [w.at-w.thick/2,w.at+w.thick/2]){
   const t=(face-o[axis])/(Math.abs(d[axis])<1e-5?1e-5:d[axis]);if(t<=.015||t>=nearest)continue
   const hit=at(t),q=(hit[along]-(w.lo+w.hi)/2)/((w.hi-w.lo)/2),crown=w.sill+w.rise*Math.sqrt(Math.max(0,1-q*q))
   if(hit[along]>=w.from&&hit[along]<=w.to&&hit[1]>=crown&&hit[1]<4.75)nearest=t
  }
 }
 for(const a of plan.arcWalls){
  const x=o[0]-a.center[0],z=o[2]-a.center[1],aa=d[0]*d[0]+d[2]*d[2],bb=x*d[0]+z*d[2]
  if(aa<1e-6)continue
  for(const radius of [a.radius-a.thickness/2,a.radius+a.thickness/2]){
   const disc=bb*bb-aa*(x*x+z*z-radius*radius);if(disc<0)continue
   for(const sign of [-1,1]){const t=(-bb+sign*Math.sqrt(disc))/aa;if(t<=.015||t>=nearest)continue
    const hit=at(t),angle=(Math.atan2(hit[2]-a.center[1],hit[0]-a.center[0])+Math.PI*2)%(Math.PI*2)
    if(hit[1]>=plan.bed&&hit[1]<=a.top&&angle>=a.start*Math.PI/180&&angle<=a.end*Math.PI/180)nearest=t
   }
  }
 }
 if(d[1]>1e-5){
  const t=(4.75-o[1])/d[1],hit=at(t)
  if(t>.015&&!([...plan.lightWells,...plan.ceilingZones].some(w=>contains(hit,w.bounds))))nearest=Math.min(nearest,t)
  for(const w of plan.lightWells){const t=(w.top-o[1])/d[1];if(t>.015&&contains(at(t),w.bounds))nearest=Math.min(nearest,t)}
 }
 const t=Math.max(0,Math.min(1,(distance-nearest-.06)/.18))
 return Math.round(255*(1-t*t*(3-2*t)))
}
let offset=0
for(let z=0;z<dimensions[2];z++)for(let y=0;y<dimensions[1];y++)for(let x=0;x<dimensions[0];x++){
 const p=[x,y,z].map((v,i)=>min[i]+v*(max[i]-min[i])/(dimensions[i]-1))
 for(const o of origins)data[offset++]=visibility(o,p)
 data[offset++]=255
}
await writeFile(dataFile,data)
await writeFile(metaFile,JSON.stringify({fingerprint,dimensions,min,max,origins,bytes:data.length,voxelMetres:.2},null,2)+'\n')
console.log(`Bath visibility: ${dimensions.join(' × ')}, ${data.length} bytes, ${((performance.now()-start)/1000).toFixed(1)} s`)
