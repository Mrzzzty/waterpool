// Metres, radians and linear light throughout. The same joint layout is sampled
// on the actual mesh and at the refracted/reflected hit on that mesh.
import {rippleControls,rippleGLSL} from './ripples'
import bathPlan from '../quietBath.json'
import look from '../bathLook.json'
import {poolLookControls,poolLookGLSL} from './poolLook'

export const defaults={ior:1.333,tilt:.65,dispersion:.35}
export function opticsControls(){
  return {...rippleControls(),...poolLookControls(),uIOR:{value:defaults.ior},uTileTilt:{value:defaults.tilt},uDispersion:{value:defaults.dispersion},uSurvey:{value:0}}
}
export type OpticsControls=ReturnType<typeof opticsControls>
export const swellPhase=2*Math.PI*.2

export const ceramicGLSL=/* glsl */`
${rippleGLSL}
${poolLookGLSL}
uniform float uIOR,uTileTilt,uDispersion;
const float breathRate=1.25663706;
float swell(vec2 p,float t){return .0008*sin(dot(p,vec2(.55,.32))+t*breathRate);}
vec2 waterGradient(vec2 p,float t,float level){
  float look=poolLookAt(p);
  vec2 a=mix(vec2(1.17,.76),vec2(1.85,.9),look),b=mix(vec2(-1.32,2.23),vec2(-1.1,1.7),look),c=mix(vec2(3.51,-1.24),vec2(12.6,-8.4),look);
  return mix(.0018,.0024,look)*a*cos(dot(p,a)+t*mix(.53,1.25663706,look))+mix(.0008,.0011,look)*b*cos(dot(p,b)-t*mix(.41,1.12,look))
    +mix(.00025,.00018,look)*c*cos(dot(p,c)+t*mix(.67,4.084,look))+.0008*vec2(.55,.32)*cos(dot(p,vec2(.55,.32))+t*breathRate)
    +rippleAt(p).gb*rippleLevel(level);
}
float waterHeight(vec2 p,float t,float level){
  float look=poolLookAt(p);
  return mix(.0018,.0024,look)*sin(dot(p,mix(vec2(1.17,.76),vec2(1.85,.9),look))+t*mix(.53,1.25663706,look))
    +mix(.0008,.0011,look)*sin(dot(p,mix(vec2(-1.32,2.23),vec2(-1.1,1.7),look))-t*mix(.41,1.12,look))
    +.00025*(1.-look)*sin(dot(p,vec2(3.51,-1.24))+t*.67)+swell(p,t)+rippleAt(p).r*rippleLevel(level);
}
vec2 capillaryGradient(vec2 p,float t){return poolLookAt(p)*.00018*vec2(12.6,-8.4)*cos(dot(p,vec2(12.6,-8.4))+t*4.084);}
vec2 tileRandom(vec2 id){
  vec3 q=fract(vec3(id.xyx)*vec3(.1031,.1030,.0973));q+=dot(q,q.yzx+33.33);
  return fract((q.xx+q.yz)*q.zy);
}
struct Tile{float face;float shade;vec3 tilt;};
Tile tileAt(vec3 p,vec3 n,vec3 lightDir,bool roundWell){
  vec3 an=abs(n);
  vec3 axisU=an.y>.65||an.z>=an.x?vec3(1.,0.,0.):vec3(0.,0.,1.);
  vec3 axisV=an.y>.65?vec3(0.,0.,1.):vec3(0.,1.,0.);
  vec2 metres=vec2(dot(p,axisU),dot(p,axisV));
  if(roundWell&&an.y<.65&&length(p.xz)>10.9){
    axisU=normalize(vec3(p.z,0.,-p.x));
    metres.x=11.*atan(p.x,p.z);
  }
  ${bathPlan.arcWalls.map(a=>`{
    vec2 q=p.xz-vec2(${a.center.map(n=>n.toFixed(5))});
    float r=length(q);
    if(an.y<.2&&p.y<${a.top.toFixed(5)}&&abs(r-${a.radius.toFixed(5)})<${(a.thickness/2+.04).toFixed(5)}&&abs(dot(normalize(q),n.xz))>.96){
      axisU=normalize(vec3(-q.y,0.,q.x));metres.x=r*atan(q.y,q.x);
    }
  }`).join('\n')}
  vec2 size=vec2(${look.tileSize.toFixed(5)});
  vec2 uv=metres/size, cell=fract(uv)-.5;
  vec2 edge=(.5-abs(cell))*size;
  vec2 aa=clamp(fwidth(metres),vec2(.00015),size*.45);
  vec2 face=smoothstep(vec2(${(look.groutHalfWidth-.0005).toFixed(5)})-aa*.5,vec2(${(look.groutHalfWidth+.0005).toFixed(5)})+aa*.5,edge);
  float detail=1.-smoothstep(.08,.45,max(aa.x/size.x,aa.y/size.y));
  vec2 rand=tileRandom(floor(uv));
  vec2 lightUV=vec2(dot(lightDir,axisU),dot(lightDir,axisV));
  vec2 bevel=(1.-smoothstep(vec2(.0015),vec2(.0035)+aa,edge))*sign(cell);
  float cavity=max(0.,dot(bevel,lightUV))*.12;
  Tile tile;
  tile.face=mix(.97,min(face.x,face.y),detail);
  tile.shade=mix(.984,mix(.53,1.,tile.face)*(.987+rand.x*.026)*(1.-cavity),detail);
  vec2 deflection=(rand-.5)*2.*tan(radians(uTileTilt))*tile.face+bevel*.085;
  tile.tilt=(axisU*deflection.x+axisV*deflection.y)*detail;
  return tile;
}
// Determinant of the horizontal ray mapping (paraxial caustic approximation).
// The cap and the wavelength footprint keep distant grout free of bright lines.
float focusAt(vec2 q,float t,float depth,float eta,vec3 ripple){
  float look=poolLookAt(q);
  vec2 a=mix(vec2(1.17,.76),vec2(1.85,.9),look),b=mix(vec2(-1.32,2.23),vec2(-1.1,1.7),look),c=mix(vec2(3.51,-1.24),vec2(12.6,-8.4),look);
  float k=depth*(1.-1./eta);
  vec3 w=-mix(vec3(.0018,.0008,.00025),vec3(.0024,.0011,.00018),look)*sin(vec3(dot(q,a)+t*mix(.53,1.25663706,look),dot(q,b)-t*mix(.41,1.12,look),dot(q,c)+t*mix(.67,4.084,look)));
  float xx=dot(w,vec3(a.x*a.x,b.x*b.x,c.x*c.x)),zz=dot(w,vec3(a.y*a.y,b.y*b.y,c.y*c.y));
  float xz=dot(w,vec3(a.x*a.y,b.x*b.y,c.x*c.y));
  vec2 bdir=vec2(.55,.32);float breath=-.0008*sin(dot(q,bdir)+t*breathRate);
  xx+=ripple.x+breath*bdir.x*bdir.x;zz+=ripple.y+breath*bdir.y*bdir.y;xz+=ripple.z+breath*bdir.x*bdir.y;
  float convergence=1./max(.12,(1.+k*xx)*(1.+k*zz)-k*k*xz*xz);
  return mix(clamp(convergence,.73,1.72),boundedCaustics(1.+(convergence-1.)*10.),look);
}
vec3 causticLight(vec3 hit,float level,vec3 towardsLight,float time){
  float depth=clamp(level-hit.y,0.,6.);
  vec3 ray=refract(-towardsLight,vec3(0.,1.,0.),1./uIOR);
  vec2 source=hit.xz-ray.xz*depth/max(.12,-ray.y);
  // Light and image rays sample the same wavefield, including player wakes.
  vec2 width=fwidth(source);
  float visibility=1.-smoothstep(.08,.35,max(width.x,width.y));
  vec2 shift=vec2(.024,-.017)*depth*uDispersion;
  vec3 ripple=rippleCurvature(source,level);
  float green=focusAt(source,time,depth,uIOR,ripple);
  vec3 focus=vec3(green);
  if(uDispersion>.001)focus=vec3(focusAt(source+shift,time,depth,uIOR,ripple),green,focusAt(source-shift,time,depth,uIOR,ripple));
  return mix(vec3(1.),focus,visibility*.82*(1.-uNoCaustics)*smoothstep(.015,.20,depth));
}
`
