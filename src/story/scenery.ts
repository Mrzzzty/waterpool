import * as T from 'three'
import type {SurfaceLibrary} from '../scene/surfaceLibrary'
import {makeCeramic} from './optics/TileShader'
import {opticsControls} from './optics/ceramic'
import {suspendedMotes} from './optics/deepLight'
import { basins, pieces, floorAt, type Act, type Piece, type Rect } from './rooms'
import { ReplayStation, replayPart } from './ReplayStation'
import { StoryWater } from './StoryWater'
import { Footprints } from './footprints'
import {storyArchitecture} from '../world/storyArchitecture'
import {updateWellCaps} from '../world/buildMap'
import {lightAtlasProps} from '../world/propIrradiance'
import { StorySky } from './StorySky'
import { conduits } from './Conduit'
import { lightRecord } from './lightRecord'


export type PlateKind='enamel'|'brass'|'paper'
const PLATE_W=1024, PLATE_H=214

function fitFont(c:CanvasRenderingContext2D,text:string,maxWidth:number,start:number,family:string,weight=500) {
  let px=start
  for(;px>16;px-=2){c.font=`${weight} ${px}px ${family}`;if(c.measureText(text).width<=maxWidth)break}
  return px
}

// 逐字排，带字距——1989 年的牌子都是这种疏排，不是现在这种贴在一起的字。
function drawSpaced(c:CanvasRenderingContext2D,text:string,cy:number,maxWidth:number,color:string,gapRatio=0.10) {
  const chars=[...text]
  const px=parseFloat(c.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||'40')
  let gap=px*gapRatio
  const widths=chars.map(ch=>c.measureText(ch).width)
  let total=widths.reduce((a,b)=>a+b,0)+gap*(chars.length-1)
  while(total>maxWidth&&gap>0){gap=Math.max(0,gap-px*.01);total=widths.reduce((a,b)=>a+b,0)+gap*(chars.length-1)}
  let x=PLATE_W/2-total/2
  c.textAlign='left'
  c.fillStyle=color
  for(let i=0;i<chars.length;i++){
    c.fillText(chars[i],x,cy)
    x+=widths[i]+gap
  }
  c.textAlign='center'
}

// 牌子上的螺丝头：中心亮、边缘暗，比几何体便宜，凑近也看不出是画的。
function rivet(c:CanvasRenderingContext2D,x:number,y:number,r:number,hot:string,cold:string) {
  const g=c.createRadialGradient(x-r*.35,y-r*.35,r*.15,x,y,r)
  g.addColorStop(0,hot);g.addColorStop(1,cold)
  c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()
  c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=1;c.stroke()
}

function plateTexture(text:string,kind:PlateKind) {
  const canvas=document.createElement('canvas')
  canvas.width=PLATE_W; canvas.height=PLATE_H
  const c=canvas.getContext('2d')!
  const W=PLATE_W, H=PLATE_H
  c.textAlign='center'; c.textBaseline='middle'

  if(kind==='brass'){
    const g=c.createLinearGradient(0,0,W*0.35,H)
    g.addColorStop(0,'#b98f4c'); g.addColorStop(.42,'#a3763a')
    g.addColorStop(.58,'#b3894a'); g.addColorStop(1,'#8b6430')
    c.fillStyle=g; c.fillRect(0,0,W,H)
    // 拉丝方向
    for(let y=0;y<H;y+=2){c.fillStyle=`rgba(255,232,180,${Math.random()*.05})`;c.fillRect(0,y,W,1)}
    for(let i=0;i<90;i++){c.fillStyle=`rgba(70,45,18,${Math.random()*.07})`;c.fillRect(Math.random()*W,Math.random()*H,Math.random()*90,1)}
    c.strokeStyle='rgba(58,38,10,.55)'; c.lineWidth=3; c.strokeRect(13,13,W-26,H-26)
    c.strokeStyle='rgba(255,226,168,.34)'; c.lineWidth=1.5; c.strokeRect(19,19,W-38,H-38)
    const px=fitFont(c,text,W-200,70,'"Microsoft YaHei",sans-serif',600)
    // 刻字的斜面：先压一层亮边，再压字本身，读起来像凹进去
    c.save(); c.translate(0,2.5); drawSpaced(c,text,H/2,W-200,'rgba(255,228,175,.55)',.08); c.restore()
    drawSpaced(c,text,H/2,W-200,'#2f2109',.08)
    for(const [x,y] of [[34,34],[W-34,34],[34,H-34],[W-34,H-34]])rivet(c,x,y,8,'#e8c98a','#7a5620')
    return {canvas,roughness:.34,metalness:.82,emissive:.10,frame:'brass' as const,font:px}
  }

  if(kind==='paper'){
    c.fillStyle='#ddd6c0'; c.fillRect(0,0,W,H)
    for(let i=0;i<600;i++){c.fillStyle=`rgba(120,110,80,${Math.random()*.06})`;c.fillRect(Math.random()*W,Math.random()*H,Math.random()*3,1)}
    const edge=c.createLinearGradient(0,0,0,H)
    edge.addColorStop(0,'rgba(90,80,55,.16)'); edge.addColorStop(.2,'rgba(0,0,0,0)')
    edge.addColorStop(.85,'rgba(90,80,55,.10)'); edge.addColorStop(1,'rgba(90,80,55,.20)')
    c.fillStyle=edge; c.fillRect(0,0,W,H)
    c.strokeStyle='rgba(70,66,52,.35)'; c.lineWidth=1.5; c.strokeRect(20,20,W-40,H-40)
    fitFont(c,text,W-150,52,'"Courier New",monospace',600)
    drawSpaced(c,text,H/2,W-150,'#33312a',.04)
    return {canvas,roughness:.88,metalness:0,emissive:.16,frame:'card' as const,font:0}
  }

  // 搪瓷：底釉偏灰绿，边上有流釉的暗边，四个角铆死
  c.fillStyle='#c0c4ad'; c.fillRect(0,0,W,H)
  for(let i=0;i<420;i++){
    c.fillStyle=`rgba(255,255,255,${Math.random()*.055})`
    c.fillRect(Math.random()*W,Math.random()*H,Math.random()*14+2,Math.random()*3+1)
  }
  for(let i=0;i<70;i++){
    c.fillStyle=`rgba(96,104,88,${Math.random()*.09})`
    c.beginPath(); c.arc(Math.random()*W,Math.random()*H,Math.random()*10+2,0,Math.PI*2); c.fill()
  }
  const shade=c.createLinearGradient(0,0,0,H)
  shade.addColorStop(0,'rgba(30,40,34,.16)'); shade.addColorStop(.30,'rgba(0,0,0,0)')
  shade.addColorStop(.72,'rgba(0,0,0,0)'); shade.addColorStop(1,'rgba(30,40,34,.20)')
  c.fillStyle=shade; c.fillRect(0,0,W,H)
  c.strokeStyle='#3b4c44'; c.lineWidth=4; c.strokeRect(15,15,W-30,H-30)
  c.strokeStyle='rgba(59,76,68,.42)'; c.lineWidth=1.5; c.strokeRect(25,25,W-50,H-50)
  const dirt=c.createLinearGradient(0,H*.58,0,H)
  dirt.addColorStop(0,'rgba(74,76,58,0)'); dirt.addColorStop(1,'rgba(74,76,58,.26)')
  c.fillStyle=dirt; c.fillRect(0,H*.58,W,H*.42)
  for(let i=0;i<9;i++){
    const x=Math.random()*W, len=20+Math.random()*90
    c.fillStyle=`rgba(88,86,66,${.05+Math.random()*.10})`
    c.fillRect(x,H-len,1+Math.random()*2,len)
  }
  fitFont(c,text,W-210,68,'"Microsoft YaHei",sans-serif',600)
  drawSpaced(c,text,H/2,W-210,'#2b3c36',.12)
  for(const [x,y] of [[36,36],[W-36,36],[36,H-36],[W-36,H-36]])rivet(c,x,y,7,'#e3e6d6','#6d7466')
  return {canvas,roughness:.36,metalness:.05,emissive:.16,frame:'steel' as const,font:0}
}

const frameColors={brass:'#9d7a3e',steel:'#4d5a55',card:'#b8b19a'} as const

function inscription(text:string, width:number, kind:PlateKind='enamel') {
  const {canvas,roughness,metalness,emissive,frame}=plateTexture(text,kind)
  const tex=new T.CanvasTexture(canvas)
  tex.colorSpace=T.SRGBColorSpace
  tex.anisotropy=8
  const h=width*PLATE_H/PLATE_W
  const group=new T.Group()
  // 牌子有厚度，掠射角下才不像贴在墙上的贴纸
  const backing=new T.Mesh(
    new T.BoxGeometry(width+.032,h+.032,kind==='paper'?.006:.017),
    new T.MeshStandardMaterial({color:frameColors[frame],roughness:frame==='brass'?.42:.62,metalness:frame==='brass'?.72:.25}),
  )
  backing.position.z=kind==='paper'?-.005:-.012
  const face=new T.Mesh(
    new T.PlaneGeometry(width,h),
    new T.MeshStandardMaterial({
      map:tex, roughness, metalness,
      // 留一层很低的底光，暗处仍读得出字，但不会再像发光板
      emissive:0xffffff, emissiveMap:tex, emissiveIntensity:emissive,
      side:T.DoubleSide,
    }),
  )
  group.add(backing,face)
  return group
}

export class Scenery {
  root=new T.Group()
  blockers: Rect[]=[]
  objects=new Map<string,T.Group>()
  decks=new Map<string,ReplayStation>()
  readonly opticsSettings=opticsControls()
  private optics=new StoryWater(this.opticsSettings)
  water=this.optics.surfaces
  footfall(x:number,z:number,level:number,strength=.026,radius=.28){this.optics.footfall(x,z,level,strength,radius)}
  updateWater(eye:T.Vector3,levels:number[],dt:number){this.optics.update(this.act,eye,levels,this.blockers,dt)}
  waterHeight(x:number,z:number){return this.optics.ripples.sample(x,z)}
  waterDusk=this.optics.dusk
  waterStill=this.optics.stillness
  readonly sky:StorySky
  private filedCopy?:T.Mesh
  showFiledCopy(){if(this.filedCopy)this.filedCopy.visible=true}
  gate?:T.Mesh
  secret?:T.Mesh
  grate?:T.Group
  observation?:T.Mesh
  face?:T.Group
  hand?:T.Group
  flecks?:T.Points
  marker?:T.Mesh
  hatchDoor?:T.Object3D
  time={value:0}
  private prints=new Footprints(this.root,this.time)
  /** Trail left by someone who just came out of the water. */
  footprint(x:number,z:number,y:number,yaw:number){this.prints.add(x,y+.004,z,yaw,this.time.value)}
  depth={value:-.25}
  sideDepth={value:-.12}
  sunDirection={value:new T.Vector3(.1,1,-.325).normalize()}
  private batches=new Map<T.Material,T.Matrix4[]>()
  private block=new T.BoxGeometry()
  // Baked GI gain for the story acts. Historically fixed at PI; expose it so the
 // balance against direct sunlight can be measured rather than guessed.
 readonly bakedGain={value:Math.PI*Number(new URLSearchParams(location.search).get('giWeight')||1)}
  private propMaterials=new Set<T.Material>()
  updateDaylight(){updateWellCaps(this.root,this.sky.fill,this.bakedGain.value/Math.PI/.76)}
  private tile:T.MeshStandardMaterial
  private trim=new T.MeshStandardMaterial({color:'#a6a38b',metalness:.55,roughness:.40})
  private iron=new T.MeshStandardMaterial({color:'#365652',roughness:.72})
  private brass=new T.MeshStandardMaterial({color:'#bd9a5e',metalness:.74,roughness:.36})
  // 阀体是铸件，比立管亮一档，否则在暗场里和背后的黑管糊成一片
  private cast=new T.MeshStandardMaterial({color:'#4a5652',metalness:.42,roughness:.52})
  private orange=new T.MeshStandardMaterial({color:'#cb673b',roughness:.54})
  private glow=new T.MeshBasicMaterial({color:new T.Color(1.58,1.53,1.23)})
  constructor(public act:Act, private replayLibrary:T.Object3D, hallArchitecture:T.Object3D, surfaceLibrary:SurfaceLibrary, skyTexture:T.Texture, connected=false) {
    this.sky=new StorySky(act,skyTexture)
    this.sky.material.uniforms.uSunDirection=this.sunDirection
    this.root.add(this.sky)
    this.tile=makeCeramic(act,this.opticsSettings,this.time,this.depth,this.sideDepth,this.sunDirection,surfaceLibrary)
    const built=storyArchitecture(hallArchitecture,act,surfaceLibrary,{time:this.time,sun:this.sunDirection,gain:this.bakedGain,main:this.depth,side:this.sideDepth,controls:this.opticsSettings})
    this.root.add(built.root);this.blockers.push(...built.blockers)
    // Gain rides on emissive.r for built-in materials; keep it in sync here.
    for(const m of (built.root.userData.materials as T.MeshPhysicalMaterial[]|undefined)??[])m.emissive.r=this.bakedGain.value/40
    if(act==='hall')this.hall(connected)
    else if(act==='arcade')this.arcade()
    else this.shaft()
    for(const p of pieces[act])this.prop(p)
    this.root.add(conduits(act))
    this.flush()
    this.propMaterials=lightAtlasProps(this.root,built.root,this.bakedGain)
    for(const basin of basins[act])this.root.add(this.optics.add(act,basin,this.time,this.sunDirection,surfaceLibrary))
  }
  box(x:number,y:number,z:number,w:number,h:number,d:number,m:T.Material=this.tile,solid=false) {
    let batch=this.batches.get(m)
    if(!batch){batch=[];this.batches.set(m,batch)}
    batch.push(new T.Matrix4().makeScale(w,h,d).setPosition(x,y,z))
    if(solid)this.blockers.push([x-w/2,x+w/2,z-d/2,z+d/2])
  }
  private flush(){
    for(const [mat,matrices] of this.batches){
      const mesh=new T.InstancedMesh(this.block,mat,matrices.length)
      matrices.forEach((v,i)=>mesh.setMatrixAt(i,v))
      mesh.castShadow=mat!==this.glow;mesh.receiveShadow=true;mesh.computeBoundingSphere();this.root.add(mesh)
    }
    this.batches.clear()
  }
  private mesh(geo:T.BufferGeometry,mat:T.Material,x:number,y:number,z:number,parent:T.Object3D=this.root){
    const mesh=new T.Mesh(geo,mat); mesh.position.set(x,y,z)
    mesh.receiveShadow=true;mesh.castShadow=true;parent.add(mesh);return mesh
  }
  private sign(t:string,x:number,y:number,z:number,w:number,rot=0,kind:PlateKind='enamel'){
    const s=inscription(t,w,kind);s.position.set(x,y,z);s.rotation.y=rot
    this.root.add(s);return s
  }
  private slab(r:Rect,y:number,m=this.tile){
    this.box((r[0]+r[1])/2,y-.15,(r[2]+r[3])/2,r[1]-r[0],.30,r[3]-r[2],m)
  }
  private hall(connected:boolean){
    if(!connected)this.box(-1.28,1.08,32,1.52,2.16,.24)
    const ring=this.mesh(new T.TorusGeometry(.39,.095,12,36),this.orange,11.86,1.12,-18.4)
    ring.rotation.y=Math.PI/2
    this.box(11.92,1.60,-18.4,.16,.14,.07,this.iron)
    this.sign('01     日 光 厅',0,1.46,-21.9,2.25)
    this.sign('回水 / 尚未交接',-2.88,1.4,23.2,1.7,Math.PI/2)
    this.box(-3.5,-1.65,-16.89,2.8,1.38,.13,this.iron)
  }
  private arcade(){
    this.secret=this.mesh(new T.BoxGeometry(.24,3.4,2.8),this.tile,19,1.65,-20)
    this.gate=this.mesh(new T.BoxGeometry(6,3.2,.20),this.iron,0,1.6,-9.2)
    this.sign('压力平衡后通行',0,3.9,-9.2,2.4)
    this.sign('旧记录  →',2.7,1.5,-21.7,1.5)
    this.box(1.8,.32,-15,.92,.64,.64,this.iron)
  }
  private shaft(){
    if(this.act==='shaft'){
      this.box(-7.9,-.77,6.55,.75,.12,.48,this.trim)
      this.box(-8.05,-.52,6.83,.025,.18,.035,this.orange)
    }
    for(const x of [-.36,.36])this.box(x,22.6,7.35,.065,33.4,.065,this.trim)
    for(let y=6.05;y<39.3;y+=.36)this.box(0,y,7.35,.72,.05,.07,this.trim)
    this.sign('1989.06.14    8.0 m → 10.0 m',0,2.38,10.75,3.6,Math.PI,'brass')
    for(const x of [-1.18,1.18])this.box(x,-8.4,-8.3,.18,3.2,3.4,this.iron,true)
    this.box(0,-6.78,-8.3,2.55,.17,3.4,this.tile)
    this.box(-6,-7.4,-7.2,2.9,1.3,.16,this.iron)
    this.observation=this.mesh(new T.PlaneGeometry(2.64,1.12),new T.MeshBasicMaterial({color:'#b3c9b9'}),-6,-7.40,-7.09)
    this.sign('日光厅   −3.00',-6,-6.54,-7.05,1.6)
    this.mesh(new T.TorusGeometry(1.2,.12,12,36),this.trim,-7,-5.5,-4).rotation.x=Math.PI/2
    this.mesh(new T.SphereGeometry(1.22,24,12,0,Math.PI*2,0,Math.PI/2),new T.MeshBasicMaterial({color:'#c1e6d3',transparent:true,opacity:.16,side:T.DoubleSide}),-7,-5.5,-4)
    this.marker=this.mesh(new T.TorusGeometry(.5,.085,12,40),this.orange,6.25,1.35,8)
    this.root.add(suspendedMotes(this.depth,this.time))
    if(this.act==='memory'){
      this.face=new T.Group();this.face.position.set(1.7,-9.95,-8.4)
      this.mesh(new T.CapsuleGeometry(.25,.8,4,12),this.iron,0,.9,0,this.face)
      this.mesh(new T.SphereGeometry(.21,16,12),this.tile,0,1.67,0,this.face)
      this.face.rotation.y=Math.PI;this.root.add(this.face)
    }
  }
  private prop(p:Piece){
    const g=new T.Group();g.position.fromArray(p.p);this.root.add(g);this.objects.set(p.id,g)
    const local=(geo:T.BufferGeometry,m:T.Material,x=0,y=0,z=0)=>this.mesh(geo,m,x,y,z,g)
    if(p.kind==='valve'){
      // 阀组是 Blender 出的 GLB：阀体、法兰、阀盖、填料压盖、五辐手轮。
      // 里面有个叫 wheel 的空节点，转阀时靠它绕本地 Z 旋转。
      const unit=replayPart(this.replayLibrary,'ValveUnit')
      unit.traverse(o=>{
        if(!(o instanceof T.Mesh))return
        const m=Array.isArray(o.material)?o.material[0]:o.material
        o.material=m&&m.name==='brass'?this.brass:m&&m.name==='body'?this.cast:this.iron
      })
      g.add(unit)
    }else if(p.kind==='tape'){
      const pack=new T.Group()
      pack.add(replayPart(this.replayLibrary,'VHSCassette'),replayPart(this.replayLibrary,'OrangeSleeve'))
      pack.rotation.x=p.id==='01'?.08:.84
      g.add(pack)
      if(p.id==='00'){
        local(new T.BoxGeometry(.62,.30,.52),this.trim,0,-.40,0)
        this.blockers.push([p.p[0]-.31,p.p[0]+.31,p.p[2]-.26,p.p[2]+.26])
      }
    }else if(p.kind==='tv'){
      if(p.id==='tv3')g.rotation.y=-Math.PI/2
      this.decks.set(p.id,new ReplayStation(g,this.replayLibrary))
      if(p.id==='tv3'||p.id==='tv0'||p.id==='tv1'||p.id==='tv2'){
        const top=-.112
        local(new T.BoxGeometry(1.30,.055,.65),this.trim,0,top-.027,0)
        const h=p.p[1]+top-.055
        for(const x of [-.56,.56])for(const z of [-.25,.25])local(new T.BoxGeometry(.045,h,.045),this.iron,x,-p.p[1]+h/2,z)
      }
    }else if(p.kind==='record'){
      local(new T.BoxGeometry(.8,1.12,.10),this.iron)
      if(p.id==='lightcard'){
        local(new T.BoxGeometry(.054,.76,.055),this.trim,0,-.92,-.022)
        local(new T.BoxGeometry(.48,.07,.40),this.iron,0,-1.265,-.045)
        const paper=lightRecord();paper.position.z=.057;g.add(paper)
        this.filedCopy=lightRecord(true)
        this.filedCopy.position.set(.015,-.012,.061)
        this.filedCopy.rotation.z=-.024;this.filedCopy.visible=false;g.add(this.filedCopy)
        local(new T.BoxGeometry(.18,.052,.034),this.brass,0,.435,.075)
        this.blockers.push([p.p[0]-.41,p.p[0]+.41,p.p[2]-.21,p.p[2]+.21])
        return
      }
      // Boards away from the stand still need legs, or they hang in the air.
      const ground=floorAt(this.act,p.p[0],p.p[2]),drop=p.p[1]-.56-ground
      if(drop>.02){
        local(new T.BoxGeometry(.075,drop,.075),this.iron,0,-.56-drop/2,0)
        local(new T.BoxGeometry(.44,.035,.36),this.brass,0,ground-p.p[1]+.018,0)
      }
      local(new T.BoxGeometry(.7,.92,.025),this.tile,0,0,.067)
      local(new T.BoxGeometry(.26,.08,.06),this.brass,0,.45,.09)
    }else if(p.kind==='plate'||p.kind==='hatch'){
      if(p.kind==='hatch'){
        const hinge=new T.Group();hinge.position.set(-1.04,.39,.30);g.add(hinge)
        const door=this.mesh(new T.CylinderGeometry(1.02,1.02,.09,40),this.iron,1.04,0,0,hinge)
        door.rotation.x=Math.PI/2;this.hatchDoor=hinge
      }
      else if(p.id.startsWith('plate')){
        const frame=local(new T.TorusGeometry(.94,.10,8,36),this.iron,0,-.24,-.2)
        const bars=new T.Group();frame.add(bars)
        for(let i=-2;i<=2;i++)this.mesh(new T.BoxGeometry(.07,1.55,.075),this.trim,i*.31,0,0,bars)
        if(p.id==='plate1')this.grate=bars
      }
    }else if(p.kind==='slide'){
      local(new T.TorusGeometry(1.1,.18,14,48),this.orange)
    }else{
      for(const x of [-.36,.36])local(new T.CylinderGeometry(.05,.05,6.6,12),this.trim,x,-1.2,0)
      for(let i=0;i<18;i++)local(new T.BoxGeometry(.72,.055,.08),this.trim,0,i*.36-4.28,0)
    }
    if(p.kind!=='tv'&&p.id!=='01'){
      const size=p.kind==='tape'?.31:p.kind==='plate'?.5:p.kind==='valve'?.85:p.kind==='record'?1.05:.95
      // 磁带是纸标签，铭牌是铜的，阀门和舱口是搪瓷的
      const kind:PlateKind=p.kind==='tape'||p.kind==='record'?'paper':p.kind==='plate'?'brass':'enamel'
      const s=inscription(p.label,size,kind)
      const y=p.kind==='tape'?-.22:p.kind==='plate'?.86:p.kind==='valve'?.55:p.kind==='record'?.63:.34
      s.position.set(0,y,.21)
      g.add(s)
    }
    if(p.id.startsWith('pump')||p.id==='log')g.rotation.y=Math.PI
    if(p.id==='sealing')g.rotation.y=Math.PI/2
  }
  dispose(){
    this.prints.dispose()
    this.optics.dispose()
    const mats=new Set<T.Material>([this.tile,this.trim,this.iron,this.brass,this.cast,this.orange,this.glow,...this.propMaterials])
    const geos=new Set<T.BufferGeometry>([this.block])
    this.root.traverse(o=>{if(!o.userData.sharedReplayPart&&!o.userData.sharedStoryAsset&&(o instanceof T.Mesh||o instanceof T.Points)){geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);if(o instanceof T.InstancedMesh)o.dispose()}})
    for(const g of geos)g.dispose()
    for(const m of mats){const map=(m as T.MeshStandardMaterial).map;if(map&&!map.isRenderTargetTexture&&!this.propMaterials.has(m))map.dispose();m.dispose()}
  }
}

