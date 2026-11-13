import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { FixtureMaterials } from './fixtureMaterials'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { poolBasins } from './poolBasins'
import { lockers, restSeats, programSolids, slidePoints, circulationSteps } from './roomPrograms'

/** Functional furnishings are merged by material, with a small shared sign atlas. */
export function buildRoomFixtures(tile:THREE.Material,props:FixtureMaterials,slideGeometry?:THREE.BufferGeometry){
  const group=new THREE.Group(),geometries=new Set<THREE.BufferGeometry>(),materials:THREE.Material[]=[],textures:THREE.Texture[]=[]
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>()
  const add=(source:THREE.BufferGeometry,material:THREE.Material,finish?:number,base=.24)=>{
    const g=source.index?source.toNonIndexed():source;if(g!==source)source.dispose()
    if(finish!==undefined){const n=g.getAttribute('position').count
      g.setAttribute('aFinish',new THREE.Float32BufferAttribute(new Float32Array(n).fill(finish),1))
      g.setAttribute('aFinishBase',new THREE.Float32BufferAttribute(new Float32Array(n).fill(base),1))
      g.setAttribute('aOcclusion',new THREE.Float32BufferAttribute(new Float32Array(n).fill(.96),1))}
    material=props.forGeometry(material,g)
    const list=batches.get(material)??[];list.push(g);batches.set(material,list)
  }
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material,finish?:number,base=.24)=>{
    const bevel=m===props.wood||m===props.paint||m===props.enamel||(m===tile&&finish===3)
    const g=bevel?new RoundedBoxGeometry(w,h,d,2,Math.min(.018,Math.min(w,h,d)*.35)):new THREE.BoxGeometry(w,h,d)
    const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv')
    if(m===props.wood||m===props.paint||m===props.enamel||m===props.rubber||m===props.steel){
      const period=m===props.rubber?.24:m===props.steel?.35:.16
      for(let i=0;i<p.count;i++){
        const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i))
        if(m===props.wood){
          // Grain follows the length of each slat; metre scale survives merging.
          const alongX=w>d,u=alongX?p.getX(i):p.getZ(i),v=ny>.6?(alongX?p.getZ(i):p.getX(i)):p.getY(i)
          uv.setXY(i,u/1.8+x*.37+z*.13,v/.34+x*.19+z*.31)
        }else{const u=ny>.6?p.getX(i):nx>nz?p.getZ(i):p.getX(i),v=ny>.6?p.getZ(i):p.getY(i);uv.setXY(i,u/period,v/period)}
      }
    }
    add(g.translate(x,y,z),m,finish,base)
  }
  const mat=(color:string,roughness:number,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});materials.push(m);return m}
  const {steel,paint,wood,rubber}=props,ivory=props.enamel,fiberglass=props.gelcoat
  const ink=mat('#385c60',.76)
  const tube=(points:THREE.Vector3[],radius=.023,material:THREE.Material=steel)=>{
    const curve=new THREE.CatmullRomCurve3(points),g=new THREE.TubeGeometry(curve,Math.max(8,points.length*7),radius,12,false)
    if(material===steel){const uv=g.getAttribute('uv'),length=curve.getLength();for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*length/.35,uv.getY(i)*Math.PI*2*radius/.35)}
    add(g,material)
  }
  for(const b of programSolids.slice(lockers.length+restSeats.length,lockers.length+restSeats.length+3))
    box((b.x0+b.x1)/2,(b.bottom+b.top)/2,(b.z0+b.z1)/2,b.x1-b.x0,b.top-b.bottom,b.z1-b.z0,tile,1)
  for(const row of lockers)for(let i=0;i<row.count;i++){
    const z=row.z+i*.6
    box(row.x,1.14,z,.54,1.8,.56,paint)
    box(row.x-.277,1.14,z,.014,1.72,.515,ivory)
    box(row.x-.302,1.12,z+.16,.035,.12,.025,steel)
    for(let j=0;j<3;j++)box(row.x-.289,1.82-j*.055,z,.008,.012,.23,ink)
    box(row.x,.29,z,.48,.10,.50,rubber)
  }
  for(const seat of restSeats){
    const along=seat.axis==='x'
    for(const offset of [-.19,0,.19])box(seat.x+(along?0:offset),seat.floor+.45,seat.z+(along?offset:0),along?seat.length:.16,.07,along?.16:seat.length,wood)
    for(const offset of [-seat.length*.34,seat.length*.34])box(seat.x+(along?offset:0),seat.floor+.21,seat.z+(along?0:offset),along?.14:.50,.42,along?.50:.14,paint)
  }
  // Four small hooks and a slatted drain complete the shower room's wet/dry threshold.
  for(const z of [9.6,10.5,11.9,12.8])box(-6.30,1.63,z,.045,.08,.04,steel)
  for(let i=0;i<32;i++)box(-6.12,.247,9.05+i*.14,.14,.012,.018,ink)
  box(-4.2,.249,8.6,2.8,.012,.65,rubber)
  for(const basin of poolBasins.slice(2).filter(b=>b.id!=='still-bath'))for(const r of basin.footprint){
    const y=basin.deck+.018
    // Split pool coping at the actual stair mouths and at the connected water port.
    for(const axis of ['x','z'] as const)for(const at of axis==='x'?[r.x0,r.x1]:[r.z0,r.z1]){
      const from=axis==='x'?r.z0:r.x0,to=axis==='x'?r.z1:r.x1
      const openings=basin.treads.filter(t=>axis==='x'?(Math.abs(t.x0-at)<.01||Math.abs(t.x1-at)<.01):(Math.abs(t.z0-at)<.01||Math.abs(t.z1-at)<.01)).map(t=>axis==='x'?[t.z0,t.z1]:[t.x0,t.x1])
      const cuts=[...new Set([from,to,...openings.flat().filter(n=>n>from&&n<to)])].sort((a,b)=>a-b)
      for(let i=0;i<cuts.length-1;i++){
        const a=cuts[i],b=cuts[i+1],mid=(a+b)/2;if(openings.some(o=>mid>o[0]&&mid<o[1]))continue
        const segments=Math.max(1,Math.ceil((b-a)/1.2)),span=(b-a)/segments
        for(let j=0;j<segments;j++){
          const centre=a+(j+.5)*span
          box(axis==='x'?at:centre,y,axis==='z'?at:centre,axis==='x'?.20:span-.004,.045,axis==='x'?span-.004:.20,tile,3,basin.deck)
        }
      }
    }
  }
  // Underwater nosing is flush with each actual tread, not a floating overlay.
  for(const basin of poolBasins.slice(2))for(const step of basin.treads){
    const width=step.x1-step.x0,depth=step.z1-step.z0
    if(width<2||depth>1.25||step.height>basin.level+.08)continue
    box((step.x0+step.x1)/2,step.height+.003,step.z1-.045,width-.12,.006,.035,ink)
  }
  // Small ceramic return outlets give the basins a useful scale without props in the water.
  for(const basin of poolBasins.filter(b=>['main','training','warm','slide','cold'].includes(b.id))){
    const r=basin.footprint[0],y=Math.max(basin.bottom+.25,basin.level-.26)
    for(const fraction of [.38,.70]){
      const z=r.z0+(r.z1-r.z0)*fraction,x=r.x1-.012
      const rim=new THREE.TorusGeometry(.052,.012,8,24);rim.rotateY(-Math.PI/2);rim.translate(x,y,z);add(rim,ivory)
      const recess=new THREE.CircleGeometry(.041,24);recess.rotateY(-Math.PI/2);recess.translate(x+.002,y,z);add(recess,ink)
      for(const offset of [-.02,0,.02])box(x-.004,y+offset,z,.008,.006,.067,ivory)
    }
  }
  // Two restrained lane guides mark the training pool, keeping the quiet baths unmarked.
  for(const x of [-.8,2.8]){
    box(x,-1.016,-35.6,.07,.006,6.6,ink)
    box(x,-1.015,-38.86,.85,.006,.07,ink)
  }
  for(const step of circulationSteps){
    if(step.x0<0)continue
    box((step.x0+step.x1)/2,step.height+.004,step.z1-.025,step.x1-step.x0-.12,.008,.035,ink)
  }
  // A usable shallow-water slide: low launch deck, anti-slip stair and one curved trough.
  const curve=new THREE.CatmullRomCurve3(slidePoints.map(p=>new THREE.Vector3(...p)))
  const positions:number[]=[],indices:number[]=[],uvs:number[]=[],left:THREE.Vector3[]=[],right:THREE.Vector3[]=[]
  const count=112,widthSegments=22
  for(let i=0;i<=count;i++){
    const t=i/count,p=curve.getPoint(t),d=curve.getTangent(t),side=new THREE.Vector3(-d.z,0,d.x).normalize()
    for(let j=0;j<=widthSegments;j++){
      const angle=(j/widthSegments-.5)*Math.PI,q=p.clone().addScaledVector(side,Math.sin(angle)*.68)
      q.y+=(1-Math.cos(angle))*.48;positions.push(q.x,q.y,q.z);uvs.push(t*curve.getLength()/.65,j/widthSegments*2.1/.65)
      if(j===0)left.push(q.clone());if(j===widthSegments)right.push(q.clone())
    }
    if(i<count)for(let j=0;j<widthSegments;j++){const a=i*(widthSegments+1)+j,b=a+widthSegments+1;indices.push(a,a+1,b,a+1,b+1,b)}
  }
  const trough=new THREE.BufferGeometry();trough.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));trough.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));trough.setIndex(indices);trough.computeVertexNormals();if(slideGeometry){trough.dispose();add(slideGeometry.clone(),fiberglass)}else add(trough,fiberglass)
  tube(left,.035,ivory);tube(right,.035,ivory)
  for(const x of [2.42,4.38]){
    const points=[new THREE.Vector3(x,1.14,-74.0),new THREE.Vector3(x,3.12,-79.5),new THREE.Vector3(x,3.12,-81.5)]
    tube(points,.028)
    for(let i=0;i<5;i++){const z=-74.3-i*1.4,y=.42+i*.50;tube([new THREE.Vector3(x,y,z),new THREE.Vector3(x,y+.9,z)],.021)}
  }
  for(const t of [.32,.6]){
    const p=curve.getPoint(t);box(p.x,(p.y-.60)/2,p.z,.12,p.y+.60,.12,paint)
  }
  // Single atlas for all functional room / depth signs.
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024
  const c=canvas.getContext('2d')!;c.scale(2,2)
  const depthLabel=(id:string)=>{const p=poolBasins.find(b=>b.id===id)!;return (p.level-p.bottom).toFixed(2)+' m'}
  const levelLabel=(id:string)=>{const p=poolBasins.find(b=>b.id===id)!;return 'WATER '+(p.level>=0?'+':'')+p.level.toFixed(2)}
  const labels=[['SHOWER','RINSE / CHANGE'],['QUIET BATH',depthLabel('warm')+' / '+levelLabel('warm')],['SLIDE POOL',depthLabel('slide')+' / ONE AT A TIME'],['COLD COURT',depthLabel('cold')+' / '+levelLabel('cold')],['REST & CHANGE','LOCKERS / SEATING'],['FOOT RINSE',depthLabel('annex-0')],['SLIDE ENTRY','E / SIT AND SLIDE'],['TRAINING',depthLabel('training')+' / NO DIVING']]
  labels.forEach(([title,sub],i)=>{const x=i%4*256,y=Math.floor(i/4)*256;c.fillStyle='#d6ded1';c.fillRect(x,y,256,256);c.strokeStyle='#78928b';c.lineWidth=2;c.strokeRect(x+8,y+8,240,240);c.textAlign='center';c.fillStyle='#375b58';c.font='500 26px Segoe UI';c.fillText(title,x+128,y+121);c.font='11px Segoe UI';c.fillText(sub,x+128,y+159)})
  const atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=props.anisotropy;textures.push(atlas)
  const signs=new THREE.MeshStandardMaterial({map:atlas,roughness:.65});materials.push(signs)
  const sign=(id:number,x:number,y:number,z:number,rotation=0,size=.8)=>{
    const g=new THREE.PlaneGeometry(size,size),uv=g.getAttribute('uv')
    for(let i=0;i<uv.count;i++)uv.setXY(i,(id%4+uv.getX(i))/4,(1-Math.floor(id/4)+uv.getY(i))/2)
    g.rotateY(rotation);g.translate(x,y,z);add(g,signs)
  }
  sign(0,-7.96,2.0,16.0,Math.PI/2)
  sign(1,-23.83,1.95,-24,Math.PI/2,.55)
  sign(2,-12,2.1,-95.96,0,1.1)
  sign(3,23.96,1.65,-85,-Math.PI/2,1)
  sign(4,23.96,2.5,-63,-Math.PI/2,1)
  sign(7,7.96,1.75,-35,-Math.PI/2)
  // A low marker at the launch does not block the slide opening.
  box(4.35,2.76,-80.1,.035,.5,.7,paint);sign(6,4.325,2.76,-80.1,-Math.PI/2,.48)
  for(const [material,parts] of batches){const geometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());geometries.add(geometry)
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Room fixture / '+(material.name||'signs')+' / batch '+group.children.length;mesh.castShadow=material!==signs;mesh.receiveShadow=true;group.add(mesh)}
  group.name='Functional rooms / slide / changing facilities'
  return {group,geometries,materials,textures}
}
