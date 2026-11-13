
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const cache = new Map()
function moduleURL(path) {
  path = resolve(path)
  if (cache.has(path)) return cache.get(path)
  let code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  code = code.replace(/from\s+['"](\.\.?\/[^'"]+)['"]/g, (_, file) => 'from "' + moduleURL(resolve(dirname(path), file + '.ts')) + '"')
  code = code.replace(/from\s+['"](three(?:\/addons\/[^'"]+)?)['"]/g, (_, spec) => 'from "' + pathToFileURL(resolve(spec === 'three' ? 'node_modules/three/build/three.module.js' : 'node_modules/three/examples/jsm/' + spec.slice('three/addons/'.length))).href + '"')
  code = code.replace(/import\.meta\.env/g, '({DEV:false,PROD:true,MODE:"node"})')
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  cache.set(path, url); return url
}
const l = await import(moduleURL('src/scene/liminalLayout.ts'))
const movement = await import(moduleURL('src/scene/movement.ts'))
const { mapBounds: b, terrainHeight, groundHeight, canWalk, viewpoints, walkPlatforms, STEP_HEIGHT } = l
const step = .2, layers = 4, nx = Math.round((b.x1-b.x0)/step)+1, nz = Math.round((b.z1-b.z0)/step)+1
const heights = new Float32Array(nx*nz*layers), walk = new Uint8Array(heights.length), seen = new Uint8Array(heights.length)
heights.fill(NaN)
for (let z=0; z<nz; z++) for (let x=0; x<nx; x++) {
  const px=b.x0+x*step, pz=b.z0+z*step, i=(z*nx+x)*layers
  const hs=[...new Set([terrainHeight(px,pz),...walkPlatforms.filter(p=>l.contains(p,px,pz)).map(p=>p.height)])].sort((a,b)=>a-b)
  assert(hs.length<=layers,'More storeys than the navigation check supports')
  hs.forEach((h,k)=>{heights[i+k]=h;walk[i+k]=Number(canWalk(px,pz,h))})
}
function index(x,z,feet) {
  const i=(Math.round((z-b.z0)/step)*nx+Math.round((x-b.x0)/step))*layers
  let best=i
  for(let k=1;k<layers;k++)if(Number.isFinite(heights[i+k])&&Math.abs(heights[i+k]-feet)<Math.abs(heights[best]-feet))best=i+k
  return best
}
const targets=[...Object.entries(viewpoints).map(([name,v])=>({name,x:v.position[0],z:v.position[2],feet:v.position[1]-1.72})),
 {name:'flooded hall floor',x:-6,z:0,feet:-.5},
 {name:'hall threshold shelf',x:0,z:13.2,feet:0},
 {name:'spiral mid tread',x:6.8,z:-48.2,feet:-1},
 {name:'spiral last tread',x:-3,z:-43.3,feet:-3},
 ...l.modulePortals.map((p,i)=>{
  const c=[[p.x+.7,p.z],[p.x-.7,p.z],[p.x,p.z+.7],[p.x,p.z-.7]].find(([x,z])=>canWalk(x,z,terrainHeight(x,z)))
  assert(c,'connector '+i+' has no walkable threshold')
  return {name:'connector '+i,x:c[0],z:c[1],feet:terrainHeight(c[0],c[1])}
 }),
]
for(const t of targets)assert(canWalk(t.x,t.z,t.feet),t.name+' is blocked')
const first=targets[0], queue=[index(first.x,first.z,first.feet)];seen[queue[0]]=1
for(let q=0;q<queue.length;q++){
 const i=queue[q], cell=Math.floor(i/layers),x=cell%nx,z=Math.floor(cell/nx)
 for(const n of [x?cell-1:-1,x<nx-1?cell+1:-1,z?cell-nx:-1,z<nz-1?cell+nx:-1]){
  if(n<0)continue
  for(let k=0;k<layers;k++){const j=n*layers+k;if(seen[j]||!walk[j]||Math.abs(heights[j]-heights[i])>STEP_HEIGHT+.001)continue;seen[j]=1;queue.push(j)}
 }
}
for(const t of targets)assert(seen[index(t.x,t.z,t.feet)],t.name+' disconnected or requires jumping')
assert.equal(groundHeight(-6,0),-.5)
assert.equal(groundHeight(0,13.2),0)
assert.equal(groundHeight(0,-49),-4)
assert.equal(groundHeight(6.8,-48.2),-1)
const edges=new Set()
for(const i of queue){
 const c=Math.floor(i/layers),x=c%nx,z=Math.floor(c/nx),r=l.roomAt(b.x0+x*step,b.z0+z*step)?.id
 for(const n of [x<nx-1?c+1:-1,z<nz-1?c+nx:-1])for(let k=0;n>=0&&k<layers;k++){
  const j=n*layers+k;if(!seen[j]||Math.abs(heights[i]-heights[j])>STEP_HEIGHT+.001)continue
  const o=l.roomAt(b.x0+(n%nx)*step,b.z0+Math.floor(n/nx)*step)?.id
  if(r&&o&&r!==o)edges.add([r,o].sort().join('/'))
 }
}
const need=[['arrival','water'],['water','gallery'],['gallery','columns'],['gallery','sun'],['gallery','rose'],['rose','return'],['water','return']]
for(const [a,b] of need)assert(edges.has([a,b].sort().join('/')),a+'/'+b+' disconnected')
// The actual controller walks the spiral stair down below the waterline and back.
const motion={x:0,z:-40.5,feet:.2,verticalSpeed:0,grounded:true}
const path=[[0,-41.8],[3,-41.8],[6.8,-41.8],[6.8,-45.4],[6.8,-48.2],[6.8,-51],[6,-53.1],[3,-53.1],[0,-53.1],[-3,-53.1],[-5.2,-51.7],[-5.2,-48.2],[-5.2,-45.4],[-3,-43.3]]
const walkTo=(m,tx,tz)=>{let i=0;while(Math.hypot(m.x-tx,m.z-tz)>.15&&i++<2400){const dx=tx-m.x,dz=tz-m.z,n=Math.hypot(dx,dz)||1;movement.advanceMotion(m,dx/n*.03,dz/n*.03,1/60)}assert(i<2400,'stuck at '+tx+','+tz)}
for(const [x,z] of path)walkTo(motion,x,z)
assert(motion.feet<-2.4,'spiral does not descend below the waterline')
for(const [x,z] of [...path].reverse())walkTo(motion,x,z)
assert(motion.feet>-.01,'spiral cannot be climbed back to the deck')
// Wading out of the flooded hall through the entry threshold shelves.
const exit={x:-6,z:0,feet:-.5,verticalSpeed:0,grounded:true}
for(const [tx,tz] of [[0,6],[0,11],[0,12.4],[0,13.2],[0,15]])walkTo(exit,tx,tz)
assert(exit.feet>.19,'cannot climb out of the flooded hall')
console.log('PASS: '+targets.length+' viewpoints/landmarks, flooded hall shelves, spiral stair both directions and the seven-region loop connect without jumping.')
