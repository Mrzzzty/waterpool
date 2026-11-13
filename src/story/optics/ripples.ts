import * as T from 'three'
import {ShallowWaterField} from '../../scene/shallowWater'
import {basins,basinIndex,floorAt,inside,type Act,type Rect} from '../rooms'

export function rippleControls(){return {
  uRippleMap:{value:null as T.Texture|null},uRippleBounds:{value:new T.Vector4()},
  uRippleActive:{value:0},uRippleCell:{value:.1875},
}}
type Controls=ReturnType<typeof rippleControls>
type Impulse={x:number;z:number;level:number;strength:number;radius:number}

/** One local field follows the listener. It sleeps once the room settles.
 * The same height and slopes feed displacement, refraction and light focusing.
 */
export class StoryRipples {
  private act:Act='hall'
  private active=-1
  private blockers:Rect[]=[]
  private pending:Impulse[]=[]
  readonly field=new ShallowWaterField((x,z,level)=>{
    if(basinIndex(this.act,x,z)!==this.active)return 0
    if(this.blockers.some(r=>inside(r,x,z)))return 0
    return Math.max(0,level-floorAt(this.act,x,z))
  })
  private data=new Uint16Array(this.field.size**2*4)
  private texture=new T.DataTexture(this.data,this.field.size,this.field.size,T.RGBAFormat,T.HalfFloatType)
  private accumulator=0
  private upload=0
  private wasActive=false
  constructor(private controls:Controls){
    this.texture.minFilter=this.texture.magFilter=T.LinearFilter
    this.texture.generateMipmaps=false;this.texture.needsUpdate=true
    this.texture.name='Story water / height, slopes, displaced water'
    controls.uRippleMap.value=this.texture
  }
  disturb(x:number,z:number,level:number,strength=.026,radius=.28){
    if(this.pending.length>=16)this.pending.shift()
    this.pending.push({x,z,level,strength,radius})
  }
  update(act:Act,eye:T.Vector3,levels:number[],blockers:Rect[],dt:number){
    let index=basinIndex(act,eye.x,eye.z)
    if(index<0){
      let nearest=Infinity
      basins[act].forEach((b,i)=>{
        const r=b.bounds,d=Math.hypot(Math.max(r[0]-eye.x,0,eye.x-r[1]),Math.max(r[2]-eye.z,0,eye.z-r[3]))
        if(d<nearest){nearest=d;index=i}
      })
    }
    const f=this.field
    if(index!==this.active||act!==this.act){f.clear();f.x=Infinity;this.active=index;this.act=act}
    this.blockers=blockers
    const level=levels[index],shifted=f.moveTo(eye.x,eye.z,level)
    const disturbed=this.pending.length>0
    for(const p of this.pending)if(basinIndex(act,p.x,p.z)===index&&Math.abs(p.level-level)<.1)f.disturb(p.x,p.z,p.strength,p.radius)
    this.pending.length=0
    this.accumulator=Math.min(this.accumulator+dt,.05)
    while(this.accumulator>=1/60){f.step();this.accumulator-=1/60}
    this.upload+=dt
    const awake=f.energy>0
    if(shifted||disturbed||(awake&&this.upload>=1/30)||this.wasActive!==awake){
      const n=f.size,h=f.height,d=f.depth,half=T.DataUtils.toHalfFloat
      for(let z=0;z<n;z++)for(let x=0;x<n;x++){
        const k=z*n+x,p=k*4,c=h[k]
        this.data[p]=half(c)
        this.data[p+1]=half(((x<n-1&&d[k+1]>.015?h[k+1]:c)-(x>0&&d[k-1]>.015?h[k-1]:c))/(2*f.cell))
        this.data[p+2]=half(((z<n-1&&d[k+n]>.015?h[k+n]:c)-(z>0&&d[k-n]>.015?h[k-n]:c))/(2*f.cell))
        this.data[p+3]=half(f.foam[k])
      }
      this.texture.needsUpdate=true;this.upload=0;this.wasActive=awake
    }
    this.controls.uRippleBounds.value.set(f.x,f.z,f.width,level)
    this.controls.uRippleActive.value=awake?1:0
  }
  sample(x:number,z:number){return this.field.sample(x,z)}
  dispose(){this.texture.dispose()}
}

export const rippleGLSL=/* glsl */`
uniform sampler2D uRippleMap;
uniform vec4 uRippleBounds;
uniform float uRippleActive,uRippleCell;
vec4 rippleAt(vec2 p){
  vec2 uv=(p-uRippleBounds.xy)/max(uRippleBounds.z,.001);
  if(uRippleActive<.5||any(lessThan(uv,vec2(.01)))||any(greaterThan(uv,vec2(.99))))return vec4(0.);
  return texture2D(uRippleMap,uv);
}
float rippleLevel(float level){return 1.-smoothstep(.015,.06,abs(level-uRippleBounds.w));}
vec3 rippleCurvature(vec2 p,float level){
  if(uRippleActive<.5||rippleLevel(level)<.01)return vec3(0.);
  vec2 dx=(rippleAt(p+vec2(uRippleCell,0.)).gb-rippleAt(p-vec2(uRippleCell,0.)).gb)/(2.*uRippleCell);
  vec2 dz=(rippleAt(p+vec2(0.,uRippleCell)).gb-rippleAt(p-vec2(0.,uRippleCell)).gb)/(2.*uRippleCell);
  return vec3(dx.x,dz.y,.5*(dx.y+dz.x))*rippleLevel(level);
}
`
