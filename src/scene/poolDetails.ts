import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { FixtureMaterials } from './fixtureMaterials'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { entrySteps, poolEdges, POOL_DECK, basinAt } from './poolBasins'
import { poolBenches } from './poolFurnishings'
import { blocks, roomAt } from './layout'

/** Pool fixtures and material junctions share batches; no new lights or per-tile meshes. */
export function buildPoolDetails(tile: THREE.Material,props:FixtureMaterials) {
  const group=new THREE.Group(),geometries=new Set<THREE.BufferGeometry>(),materials:THREE.Material[]=[],textures:THREE.Texture[]=[]
  const surfaces:THREE.BufferGeometry[]=[]
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>()
  const batch=(geometry:THREE.BufferGeometry,material:THREE.Material)=>{
    const g=geometry.index?geometry.toNonIndexed():geometry
    if(g!==geometry)geometry.dispose()
    material=props.forGeometry(material,g)
    const list=batches.get(material)??[];list.push(g);batches.set(material,list)
  }
  const surface=(geometry:THREE.BufferGeometry,finish:number,base=0)=>{
    const g=geometry.index?geometry.toNonIndexed():geometry
    if(g!==geometry)geometry.dispose()
    const count=g.getAttribute('position').count
    g.setAttribute('aFinish',new THREE.Float32BufferAttribute(new Float32Array(count).fill(finish),1))
    g.setAttribute('aFinishBase',new THREE.Float32BufferAttribute(new Float32Array(count).fill(base),1))
    g.setAttribute('aOcclusion',new THREE.Float32BufferAttribute(new Float32Array(count).fill(1),1))
    surfaces.push(g)
  }
  const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z)
  const mat=(color:string,roughness:number,metalness=0)=>{
    const m=new THREE.MeshStandardMaterial({color,roughness,metalness});materials.push(m);return m
  }
  const marking=mat('#456b66',.78),grate=mat('#657772',.82),steel=props.steel,ivory=props.foam
  const strip=(x:number,z:number,y:number,w:number,l:number)=>{
    const g=new THREE.PlaneGeometry(w,l);g.rotateX(-Math.PI/2);g.translate(x,y,z);batch(g,marking)
  }
  // Keep the six-metre stair mouth open while finishing both remaining corners.
  const edges=poolEdges.flatMap(e=>{
    if(e.axis!=='z'||e.at!==6.2)return [e]
    const cuts=[e.from,e.to,...[-5.5,.5].filter(n=>n>e.from&&n<e.to)].sort((a,b)=>a-b)
    return cuts.slice(0,-1).flatMap((from,i)=>((from+cuts[i+1])/2>-5.5&&(from+cuts[i+1])/2<.5)?[]:[{...e,from,to:cuts[i+1]}])
  })
  for(const e of edges){
    const length=e.to-e.from,mid=(e.from+e.to)/2
    const direction=(e.axis==='x'?basinAt(e.at-.02,mid):basinAt(mid,e.at-.02))?1:-1
    const outward=e.at+direction*.45
    const count=Math.ceil(length/1.25),span=length/count
    for(let i=0;i<count;i++){
      const centre=e.from+(i+.5)*span
      // Continuous bullnose profile: a rounded grip over the water, flush stone behind.
      const profile=new THREE.Shape()
      profile.moveTo(.30,POOL_DECK-.035);profile.lineTo(.30,POOL_DECK+.045)
      profile.lineTo(.015,POOL_DECK+.045)
      profile.quadraticCurveTo(-.080,POOL_DECK+.045,-.080,POOL_DECK-.012)
      profile.quadraticCurveTo(-.080,POOL_DECK-.060,-.025,POOL_DECK-.060)
      profile.lineTo(.30,POOL_DECK-.035);profile.closePath()
      const cap=new THREE.ExtrudeGeometry(profile,{depth:span-.003,steps:1,curveSegments:8,bevelEnabled:false})
      cap.translate(0,0,-(span-.003)/2)
      cap.rotateY(e.axis==='x'?(direction>0?0:Math.PI):(direction>0?-Math.PI/2:Math.PI/2))
      cap.translate(e.axis==='x'?e.at:centre,0,e.axis==='z'?e.at:centre);surface(cap,3)
    }
    // Wider stone apron bridges the rounded lip and the terrazzo without a hard texture jump.
    surface(box(e.axis==='x'?.30:length,.008,e.axis==='x'?length:.30,e.axis==='x'?outward:mid,POOL_DECK+.003,e.axis==='z'?outward:mid),3)
    const joint=e.at+direction*.608
    strip(e.axis==='x'?joint:mid,e.axis==='z'?joint:mid,POOL_DECK+.008,e.axis==='x'?.012:length,e.axis==='x'?length:.012)
  }
  for(const step of entrySteps)strip(-2.5,step.z0+.04,step.height+.004,5.9,.035)
  for(const x of [1.8,4.4]){strip(x,-3.1,-1.196,.075,7.4);strip(x,-6.75,-1.195,1,.075)}
  const slitGeometry=new THREE.BoxGeometry(.13,.008,.018);geometries.add(slitGeometry)
  const drain=new THREE.InstancedMesh(slitGeometry,grate,240)
  let index=0
  for(const x of [-6.80,6.80])for(let i=0;i<120;i++)drain.setMatrixAt(index++,new THREE.Matrix4().makeTranslation(x,POOL_DECK+.008,-10.6+i*.135))
  drain.name='Pool detail / drain grilles';drain.instanceMatrix.needsUpdate=true;drain.computeBoundingSphere();drain.receiveShadow=true;group.add(drain)

  // Trim only actual solid wall faces: no ribbons across windows or open portals.
  for(const b of blocks){
    const dx=b.x1-b.x0,dz=b.z1-b.z0
    if(b.top-b.bottom<1.2||Math.min(dx,dz)>.31)continue
    const axis=dx<dz?'x':'z'
    const from=Math.max(axis==='x'?-28:-8,axis==='x'?b.z0:b.x0),to=Math.min(axis==='x'?18:8,axis==='x'?b.z1:b.x1),mid=(from+to)/2
    if(to<=from)continue
    for(const sign of [-1,1]){
      const at=axis==='x'?(sign<0?b.x0:b.x1):(sign<0?b.z0:b.z1)
      const x=axis==='x'?at+sign*.05:mid,z=axis==='z'?at+sign*.05:mid
      if(x<-8||x>8||z<-28||z>18)continue
      const room=roomAt(x,z)
      if(!room)continue
      const floor=Math.max(0,room.floor??0)
      for(const [y,h,depth,finish] of [[floor+.09,.18,.032,1],[floor+1.6,.08,.04,3]]){
        if(y-h/2<b.bottom||y+h/2>b.top)continue
        surface(box(axis==='x'?depth:to-from,h,axis==='z'?depth:to-from,axis==='x'?at+sign*depth*.4:mid,y,axis==='z'?at+sign*depth*.4:mid),finish,floor)
      }
    }
  }

  for(const bench of poolBenches){
    const alongX=bench.axis==='x'
    surface(new RoundedBoxGeometry(alongX?bench.length:.48,.10,alongX?.48:bench.length,2,.012).translate(bench.x,POOL_DECK+.43,bench.z),3)
    for(const offset of [-bench.length*.34,bench.length*.34])
      surface(box(alongX?.24:.38,.38,alongX?.38:.24,bench.x+(alongX?offset:0),POOL_DECK+.19,bench.z+(alongX?0:offset)),1)
  }
  const pipe=(points:number[][],radius=.026)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number])))
    const g=new THREE.TubeGeometry(curve,48,radius,12,false),uv=g.getAttribute('uv'),length=curve.getLength()
    for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*length/.35,uv.getY(i)*Math.PI*2*radius/.35)
    batch(g,steel)
  }
  pipe([[.77,POOL_DECK,6.82],[.77,1.03,6.74],[.77,1.07,6.1],[.77,-.22,1.75],[.77,-.43,1.3],[.77,-1.2,1.3]],.028)
  for(const z of [-6.82,-6.18]){
    pipe([[6.93,POOL_DECK,z],[6.90,.94,z],[6.55,1.06,z],[6.12,.85,z],[6.05,-.3,z],[6.05,-1.05,z]],.028)
  }
  for(const y of [-.08,-.34,-.60,-.86])batch(box(.14,.035,.64,6.05,y,-6.5),steel)

  // A quiet pair of dry shower fittings at the entrance.
  for(const z of [10.1,12.4]){
    surface(box(.025,1.85,.82,-7.977,1.25,z),1)
    pipe([[-7.91,.62,z],[-7.91,1.4,z],[-7.91,2.26,z],[-7.64,2.35,z],[-7.48,2.28,z]],.018)
    const head=new THREE.CylinderGeometry(.09,.09,.025,32);head.translate(-7.48,2.27,z);batch(head,steel)
    const valve=new THREE.CylinderGeometry(.047,.047,.06,24);valve.rotateZ(-Math.PI/2);valve.translate(-7.86,1.12,z);batch(valve,steel)
    surface(box(.68,.008,.70,-7.48,POOL_DECK+.003,z),3)
    for(let i=0;i<5;i++)strip(-7.48,z-.11+i*.055,POOL_DECK+.009,.24,.015)
  }

  // Wall-mounted rescue ring, kept out of the water and circulation.
  const ringX=-4.5,ringY=1.18,ringZ=-11.91
  const ring=new THREE.TorusGeometry(.265,.065,16,64);ring.translate(ringX,ringY,ringZ);batch(ring,ivory)
  for(let i=0;i<4;i++){
    const band=new THREE.TorusGeometry(.265,.069,8,10,Math.PI/6)
    band.rotateZ(i*Math.PI/2);band.translate(ringX,ringY,ringZ+.002);batch(band,marking)
  }
  const rope=new THREE.TorusGeometry(.36,.009,6,48);rope.translate(ringX,ringY,ringZ);batch(rope,ivory)
  batch(box(.06,.10,.07,ringX,ringY+.34,ringZ-.025),steel)

  // One shared plaque atlas; these are in-world pool details, not interface controls.
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=512
  const ctx=canvas.getContext('2d')!;ctx.scale(2,2)
  const labels=[['1.20 m','WATER DEPTH'],['0.48 m','SHALLOW PASSAGE'],['NO DIVING','POOL RULE'],['POOL 01','DAYLIGHT COURT'],['→','WATER PASSAGE'],['SHOWER','RINSE BEFORE ENTRY'],['01','LANE'],['02','LANE']]
  labels.forEach(([title,subtitle],i)=>{
    const x=i%4*256,y=Math.floor(i/4)*128
    ctx.fillStyle='#d5ddcf';ctx.fillRect(x,y,256,128)
    ctx.strokeStyle='#889d92';ctx.lineWidth=2;ctx.strokeRect(x+6,y+6,244,116)
    ctx.fillStyle='#375b57';ctx.textAlign='center';ctx.font='500 36px "Segoe UI",sans-serif';ctx.fillText(title,x+128,y+63)
    ctx.font='12px "Segoe UI",sans-serif';ctx.fillText(subtitle,x+128,y+95)
  })
  const atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=props.anisotropy;textures.push(atlas)
  const plaqueMat=new THREE.MeshStandardMaterial({map:atlas,roughness:.61,polygonOffset:true,polygonOffsetFactor:-1});materials.push(plaqueMat)
  const plaque=(label:number,w:number,h:number,x:number,y:number,z:number,axis:'x'|'z'|'floor',sign=1)=>{
    const g=new THREE.PlaneGeometry(w,h),uv=g.getAttribute('uv'),col=label%4,row=Math.floor(label/4)
    for(let i=0;i<uv.count;i++)uv.setXY(i,(col+uv.getX(i))/4,(1-row+uv.getY(i))/2)
    if(axis==='x')g.rotateY(sign*Math.PI/2)
    if(axis==='floor')g.rotateX(-Math.PI/2)
    g.translate(x,y,z);batch(g,plaqueMat)
  }
  plaque(0,.84,.42,7.978,1.18,.1,'x',-1)
  plaque(2,.72,.36,7.978,1.15,-7,'x',-1)
  plaque(3,1.04,.52,-2.6,2.50,-11.978,'z')
  plaque(1,.82,.41,7.978,1.15,-19,'x',-1)
  plaque(4,.58,.29,-1.1,1.2,-27.978,'z')
  plaque(5,.72,.36,-7.954,2.45,11.25,'x',1)
  plaque(0,.64,.32,6.99,POOL_DECK+.009,3.8,'floor')
  for(const [i,x] of [[6,1.8],[7,4.4]])plaque(i,.42,.21,x,POOL_DECK+.009,6.65,'floor')

  const merged=mergeGeometries(surfaces,false)!;surfaces.forEach(g=>g.dispose());geometries.add(merged)
  const shell=new THREE.Mesh(merged,tile);shell.castShadow=true;shell.receiveShadow=true;group.add(shell)
  for(const [material,parts] of batches){
    const geometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());geometries.add(geometry)
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Pool detail / '+(material.name||'signs')+' / batch '+group.children.length;mesh.castShadow=material!==plaqueMat;mesh.receiveShadow=true;group.add(mesh)
  }
  group.name='Pool fixtures and material junctions'
  return {group,geometries,materials,textures}
}
