import * as T from 'three'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import {buildSolidSurface} from '../scene/solidSurface'
import {compileMap} from './compileMap'
import {planPoolAt,type MapPlan} from './mapPlan'
import {contains} from '../scene/poolModules'
import {slidePoints} from '../scene/roomPrograms'

function surfaceAt(plan:MapPlan,x:number,y:number,z:number,nx:number,ny:number,nz:number,fixed?:number){
  x+=nx*.015;z+=nz*.015
  const room=plan.rooms.find(r=>contains(r,x,z)),pool=planPoolAt(plan,x,z)
  let f=fixed??(ny<-.65?2:ny>.65?(pool&&y<pool.level?0:3):1)
  if(fixed===undefined&&room?.finish==='mineral')f=ny>.65?3:ny<-.65?2:y<room.deck-.1?0:2
  if(fixed===undefined&&room?.finish==='service'&&ny>.65)f=4
  return {finish:f,base:room?.deck??0}
}
export function tagGeometry(g:T.BufferGeometry,plan:MapPlan,fixed?:number){
 const p=g.getAttribute('position'),n=g.getAttribute('normal'),finish=new Float32Array(p.count),base=new Float32Array(p.count)
 for(let i=0;i<p.count;i+=3){
  const s=surfaceAt(plan,(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3,n.getX(i),n.getY(i),n.getZ(i),fixed)
  for(let j=0;j<3;j++){finish[i+j]=s.finish;base[i+j]=s.base}
 }
 g.setAttribute('aFinish',new T.BufferAttribute(finish,1));g.setAttribute('aFinishBase',new T.BufferAttribute(base,1))
 g.setAttribute('aOcclusion',new T.BufferAttribute(new Float32Array(p.count).fill(1),1))
 if(!g.hasAttribute('uv'))g.setAttribute('uv',new T.BufferAttribute(new Float32Array(p.count*2),2))
}

/** Authoring geometry. Blender welds, bevels and bakes this exact surface; the
 * browser loads the export. No CSG or whole-map mesh construction while walking. */
export function buildMap(plan:MapPlan,tile:T.Material,fixture:T.Material){
 const group=new T.Group(),geometries=new Set<T.BufferGeometry>(),compiled=compileMap(plan)
 const add=(input:T.BufferGeometry,name:string,material=tile,fixed?:number)=>{
  const g=input.index?input.toNonIndexed():input;if(g!==input)input.dispose()
  if(material===tile)tagGeometry(g,plan,fixed)
  const m=new T.Mesh(g,material);m.name=name;m.castShadow=m.receiveShadow=true;group.add(m);geometries.add(g);return m
 }
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,name:string,material=tile,finish?:number)=>add(new T.BoxGeometry(w,h,d).translate(x,y,z),name,material,finish)
 const volumes=plan.round?compiled.volumes.filter(v=>v.bottom>=0||plan.solids.includes(v)):compiled.volumes
 const surface=buildSolidSurface(volumes,plan.voids,(p,n)=>{const s=surfaceAt(plan,p[0],p[1],p[2],n[0],n[1],n[2]);return s.finish+Math.round(s.base*100)*8})
 for(const [key,batch]of surface.batches){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(batch.positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(batch.normals,3))
  add(g,'Atlas '+plan.id+' shell '+key)
 }
 // The curved intrados is part of the aperture, not a decorative ring laid over
 // a rectangular opening. Shared walls meet it above the spring without overlap.
 for(const [i,p]of plan.ports.entries()){
  const r=(p.to-p.from)/2,shape=new T.Shape()
  shape.moveTo(-r,p.spring);shape.lineTo(-r,p.spring+p.rise);shape.lineTo(r,p.spring+p.rise);shape.lineTo(r,p.spring)
  shape.absellipse(0,p.spring,r,p.rise,0,Math.PI,false,0);shape.closePath()
  const g=new T.ExtrudeGeometry(shape,{depth:.48,bevelEnabled:false,curveSegments:24});g.translate(0,0,-.24)
  if(p.axis==='x')g.rotateY(Math.PI/2)
  g.translate(p.axis==='x'?p.at:(p.from+p.to)/2,0,p.axis==='z'?p.at:(p.from+p.to)/2)
  add(g,'Atlas '+plan.id+' aperture '+i,tile,1)
 }
 // Room articulation: stone wainscot cap + cornice give walls horizontal shadow
 // lines; pilasters add vertical rhythm; skylight frames and roof beams break the
 // bare-box ceiling. Port-aware so doorways stay clear.
 if(!plan.round){
  const roomAt=(x:number,z:number)=>plan.rooms.find(r=>contains(r,x,z))
  for(const w of compiled.walls){
   const thinX=(w.x1-w.x0)<=(w.z1-w.z0)
   const len=thinX?w.z1-w.z0:w.x1-w.x0
   if(len<1.4)continue
   const cx=(w.x0+w.x1)/2,cz=(w.z0+w.z1)/2
   const ra=thinX?roomAt(w.x0-.4,cz):roomAt(cx,w.z0-.4)
   const rb=thinX?roomAt(w.x1+.4,cz):roomAt(cx,w.z1+.4)
   const r=ra??rb;if(!r||r.key==='main-hall')continue
   const deck=r.deck,face=thinX?(ra?w.x0:w.x1):(ra?w.z0:w.z1),s=ra?-1:1
   const capY=deck+1.5
   if(w.bottom<=capY-.1&&w.top>=capY+.2){
    if(thinX)box(face+s*.05,capY,cz,.14,.16,len,'Atlas wainscot cap',tile,3)
    else box(cx,capY,face+s*.05,len,.16,.14,'Atlas wainscot cap',tile,3)
   }
   if(w.top-deck>7){
    const corY=deck+Math.min(6,w.top-deck-1.2)
    if(w.bottom<=corY&&w.top>=corY+.2){
     if(thinX)box(face+s*.07,corY,cz,.18,.22,len,'Atlas cornice',tile,3)
     else box(cx,corY,face+s*.07,len,.22,.18,'Atlas cornice',tile,3)
    }
   }
  }
  for(const r of plan.rooms){
   if(r.key==='main-hall')continue
   if((r.x1-r.x0)*(r.z1-r.z0)<250)continue
   const longX=(r.x1-r.x0)>=(r.z1-r.z0)
   const a0=longX?r.x0:r.z0,a1=longX?r.x1:r.z1
   const n=Math.max(3,Math.round((a1-a0)/5))
   for(const side of[0,1]){
    const wallAt=longX?(side?r.z1:r.z0):(side?r.x1:r.x0)
    const axis=longX?'z':'x'
    for(let i=1;i<n;i++){
     const c=a0+(a1-a0)*i/n
     if(plan.ports.some(p=>(p.a===r.key||p.b===r.key)&&p.axis===axis&&p.at===wallAt&&c>p.from-.6&&c<p.to+.6))continue
     const h=Math.min(6,r.ceiling-r.deck)
     if(longX)box(c,r.deck+h/2,wallAt+(side?-.18:.18),.7,h,.36,'Atlas pilaster',tile,1)
     else box(wallAt+(side?-.18:.18),r.deck+h/2,c,.36,h,.7,'Atlas pilaster',tile,1)
    }
   }
  }
  for(const w of plan.wells){
   const y=w.ceiling+.05,t=.16,d=.34,mx=(w.x0+w.x1)/2,mz=(w.z0+w.z1)/2
   box(mx,y,w.z0,w.x1-w.x0+t,t,d,'Atlas well frame',tile,1)
   box(mx,y,w.z1,w.x1-w.x0+t,t,d,'Atlas well frame',tile,1)
   box(w.x0,y,mz,t,t,w.z1-w.z0+t,'Atlas well frame',tile,1)
   box(w.x1,y,mz,t,t,w.z1-w.z0+t,'Atlas well frame',tile,1)
   for(const f of[1/3,2/3])box(w.x0+(w.x1-w.x0)*f,y,mz,.08,t,w.z1-w.z0,'Atlas well mullion',tile,1)
  }
  for(const r of plan.rooms){
   if(r.key==='main-hall')continue
   if(r.ceiling-r.deck<8)continue
   const longX=(r.x1-r.x0)>=(r.z1-r.z0)
   const span=longX?r.z1-r.z0:r.x1-r.x0
   const along=longX?r.x1-r.x0:r.z1-r.z0
   const n=Math.max(2,Math.round(along/6))
   for(let i=1;i<n;i++){
    if(longX)box(r.x0+along*i/n,r.ceiling-.35,(r.z0+r.z1)/2,.5,.7,span,'Atlas roof beam',tile,2)
    else box((r.x0+r.x1)/2,r.ceiling-.35,r.z0+along*i/n,span,.7,.5,'Atlas roof beam',tile,2)
   }
  }
 }
 if(plan.id==='arcade'){
  for(const [i,z]of [6,-1,-8,-14,-19.5,-24.5,-28.5].entries()){
   const radius=2.62,shape=new T.Shape();shape.absellipse(0,0,radius,2.1,0,Math.PI,false,0)
   shape.lineTo(-radius+.18,0);shape.absellipse(0,0,radius-.18,1.92,Math.PI,0,true,0);shape.closePath()
   const g=new T.ExtrudeGeometry(shape,{depth:.24,bevelEnabled:false,curveSegments:28});g.translate(0,4.3,z-.12)
   add(g,'Atlas arcade diminishing rhythm '+i,tile,1)
   for(const x of [-2.62,2.62])box(x,2.15,z,.26,4.3,.26,'Atlas arcade rhythm pier '+i,tile,1)
  }
 }
 if(plan.id==='roam'){
  // Cylindrical tiled columns rise from the flooded floor; metric arc-length UV
  // keeps the glaze continuous around each shaft (Dream Pool 12 reference).
  for(const [i,c]of (plan.columns??[]).entries()){
   const h=c.top+.7,g=new T.CylinderGeometry(c.r,c.r,h,48,1,false)
   const uv=g.getAttribute('uv')
   for(let k=0;k<uv.count;k++){uv.setX(k,uv.getX(k)*Math.PI*2*c.r);uv.setY(k,uv.getY(k)*h)}
   g.translate(c.x,(c.top-.7)/2,c.z)
   add(g,'Atlas roam column '+i,tile,1)
  }
  // Low east ceiling: the receding column row stands in a darker compressed band.
  box(14.62,4.75,0,11.24,.3,28.48,'Atlas roam low ceiling',tile,1)
  const curve=new T.CatmullRomCurve3(slidePoints.map(p=>new T.Vector3(...p))),frames=curve.computeFrenetFrames(48,false)
  const positions:number[]=[],uv:number[]=[],indices:number[]=[]
  for(let i=0;i<=48;i++){
   const p=curve.getPointAt(i/48),side=frames.binormals[i];if(side.y<0)side.negate()
   const lateral=new T.Vector3().crossVectors(new T.Vector3(0,1,0),frames.tangents[i]).normalize()
   for(let j=0;j<=16;j++){
    const angle=j/16*Math.PI,q=p.clone().addScaledVector(lateral,Math.cos(angle)*.54);q.y+=.50-Math.sin(angle)*.50
    positions.push(q.x,q.y,q.z);uv.push(i/48,j/16)
    if(i<48&&j<16){const a=i*17+j;indices.push(a,a+17,a+1,a+1,a+17,a+18)}
   }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals()
  // Blender's solidify stage gives this open trough actual thickness.
  const slide=add(g,'Atlas slide gelcoat',fixture);slide.userData.slide=true
 }
 // The well keeps its 22 m / 10 m / 40 m scale but gains an asymmetrical dry
 // landing, shallow entry stair, recessed wall bays and a continuous round shell.
 if(plan.round){
  // One shell with a carved outlet. Separate stacked rings leave coincident
  // cap faces and a dotted horizontal lighting seam around the whole well.
  const angles=[...new Set([...Array.from({length:193},(_,i)=>i*Math.PI*2/192),3.80,4.12])].sort((a,b)=>a-b),ys=[-10,-.5,2.4,40],positions:number[]=[]
  const filled=(i:number,j:number)=>j>=0&&j<3&&!(j===1&&(angles[i]+angles[i+1])/2>3.80&&(angles[i]+angles[i+1])/2<4.12)
  const p=(a:number,y:number,r:number)=>[Math.cos(a)*r,y,-Math.sin(a)*r]
  const quad=(a:number[],b:number[],c:number[],d:number[])=>positions.push(...a,...b,...c,...a,...c,...d)
  const count=angles.length-1
  for(let j=0;j<3;j++)for(let i=0;i<count;i++)if(filled(i,j)){
   const a=angles[i],b=angles[i+1],lo=ys[j],hi=ys[j+1]
   quad(p(a,lo,11),p(a,hi,11),p(b,hi,11),p(b,lo,11))
   quad(p(a,lo,11.24),p(b,lo,11.24),p(b,hi,11.24),p(a,hi,11.24))
   if(!filled(i,j-1))quad(p(a,lo,11),p(b,lo,11),p(b,lo,11.24),p(a,lo,11.24))
   if(!filled(i,j+1))quad(p(a,hi,11),p(a,hi,11.24),p(b,hi,11.24),p(b,hi,11))
   if(!filled((i+count-1)%count,j))quad(p(a,lo,11),p(a,lo,11.24),p(a,hi,11.24),p(a,hi,11))
   if(!filled((i+1)%count,j))quad(p(b,lo,11),p(b,hi,11),p(b,hi,11.24),p(b,lo,11.24))
  }
  const wall=new T.BufferGeometry();wall.setAttribute('position',new T.Float32BufferAttribute(positions,3));wall.computeVertexNormals()
  add(wall,'Atlas '+plan.id+' round wall',tile,1)
  add(new T.CylinderGeometry(11.24,11.24,.3,96).translate(0,-10.15,0),'Atlas '+plan.id+' deep basin',tile,0)
  box(0,-.18,9,13,.36,4,'Atlas '+plan.id+' dry landing',tile,3)
  // Broad steps descend into the deep water; no floating catwalk.
  for(const [i,s]of plan.landings.filter(l=>l.height<0).entries())box((s.x0+s.x1)/2,(-10+s.height)/2,(s.z0+s.z1)/2,s.x1-s.x0,10+s.height,s.z1-s.z0,'Atlas '+plan.id+' entry step '+i,tile,1)
  // Radial buttresses stop short of the centre and frame the bottom intake.
  for(const a of [-2.6,-1.7,-.8,.4,1.2,2.1]){
   const g=new T.BoxGeometry(.9,48,.8).translate(0,14,10.6).rotateY(a)
   add(g,'Atlas '+plan.id+' recessed pier '+a,tile,1)
  }
  // Roof panel has the exact well opening, rather than a luminous solid ceiling.
  for(const b of [[-11.4,-4.1,-11.4,11.4],[4.1,11.4,-11.4,11.4],[-4.1,4.1,-11.4,1.7],[-4.1,4.1,9.3,11.4]])
   box((b[0]+b[1])/2,40.12,(b[2]+b[3])/2,b[1]-b[0],.24,b[3]-b[2],'Atlas '+plan.id+' roof',tile,2)
 }
 // Sparse functional objects; all are batched by material on export.
 const fixtures:T.BufferGeometry[]=[]
 const part=(g:T.BufferGeometry,x:number,y:number,z:number,rotation=0)=>{g.rotateY(rotation);g.translate(x,y,z);fixtures.push(g)}
 for(const f of plan.fixtures){
  const a=f.rotation??0,L=f.length??1
  if(f.kind==='bench'){
   part(new RoundedBoxGeometry(.55,.10,L,2,.025),f.x,f.y+.45,f.z,a)
   for(const s of [-1,1])part(new T.BoxGeometry(.42,.4,.18),f.x,f.y+.2,f.z+s*(L/2-.25),a)
  }else if(f.kind==='locker'){
   part(new RoundedBoxGeometry(.45,1.82,L,2,.015),f.x,f.y+.91,f.z,a)
   part(new T.BoxGeometry(.035,.18,.035),f.x-.245,f.y+1.0,f.z+.28,a)
  }else if(f.kind==='shower'){
   part(new T.CylinderGeometry(.025,.025,1.65,10),f.x,f.y+1.15,f.z,a)
   part(new T.CylinderGeometry(.12,.12,.028,16).rotateZ(.12),f.x+.2,f.y+2.0,f.z,a)
   part(new T.BoxGeometry(.11,.09,.09),f.x+.08,f.y+.9,f.z,a)
  }else if(f.kind==='gauge'){
   part(new T.BoxGeometry(.08,L,.025),f.x,f.y+L/2,f.z,a)
  }else if(f.kind==='rail'){
   const points=[new T.Vector3(f.x,f.y+.85,f.z),new T.Vector3(f.x,f.y+.8,f.z-.4),new T.Vector3(f.x,f.y-.45,f.z-L)]
   part(new T.TubeGeometry(new T.CatmullRomCurve3(points),20,.035,8,false),0,0,0)
  }else if(f.kind==='lamp'){
   part(new T.CylinderGeometry(.11,.11,.035,20).rotateX(Math.PI/2),f.x,f.y,f.z,a)
  }
 }
 if(fixtures.length){
  const non=fixtures.map(g=>{const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();return n})
  const merged=mergeGeometries(non,false)!;non.forEach(g=>g.dispose());add(merged,'Atlas '+plan.id+' fittings',fixture)
 }
 return {group,geometries,compiled}
}

export function makeWellCaps(plan:MapPlan){
 const group=new T.Group();group.name='Sealed daylight wells'
 for(const w of plan.wells){
  // A dim opal ceiling gives a bounded source, not a white HDR flood. Sunlight
  // passes the aperture; the well walls hide every neighbouring exterior room.
  const color=new T.Color(.72,.84,.88).multiplyScalar(w.strength*1.15)
  const m=new T.Mesh(new T.PlaneGeometry(w.x1-w.x0,w.z1-w.z0),new T.MeshBasicMaterial({color,side:T.DoubleSide}))
  m.userData.wellRadiance=color.clone()
  m.rotation.x=Math.PI/2;m.position.set((w.x0+w.x1)/2,w.top,(w.z0+w.z1)/2);m.name='Opal well';m.castShadow=false;group.add(m)
 }
 return group
}

export function updateWellCaps(root:T.Object3D,tint:T.Color,gain:number){
 root.traverse(o=>{if(o instanceof T.Mesh&&o.userData.wellRadiance)(o.material as T.MeshBasicMaterial).color.copy(o.userData.wellRadiance).multiply(tint).multiplyScalar(gain)})
}
