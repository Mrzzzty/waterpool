import plan from './quietBath.json'
import {bathWalls} from './bathGeometry'

const f=(value:number)=>value.toFixed(5)
const box=(bounds:number[],bottom:number,top:number)=>
  [[bounds[0],bottom,bounds[2]],[bounds[1],top,bounds[3]]]
const lowRoofs=plan.ceilingZones.flatMap(zone=>{
  const [l,r,n,s]=zone.bounds
  const xs=[...new Set([l,r,...plan.lightWells.flatMap(w=>w.bounds.slice(0,2)).filter(x=>x>l&&x<r)])].sort((a,b)=>a-b)
  const zs=[...new Set([n,s,...plan.lightWells.flatMap(w=>w.bounds.slice(2,4)).filter(z=>z>n&&z<s)])].sort((a,b)=>a-b)
  const cells:number[][][]=[]
  for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++){
    const x=(xs[i-1]+xs[i])/2,z=(zs[j-1]+zs[j])/2
    if(!plan.lightWells.some(w=>x>w.bounds[0]&&x<w.bounds[1]&&z>w.bounds[2]&&z<w.bounds[3]))cells.push(box([xs[i-1],xs[i],zs[j-1],zs[j]],zone.ceiling,4.75))
  }
  return cells
})
export const bathOccluders=[
  ...bathWalls.map(bounds=>box(bounds,-.48,bounds[0]<-23&&bounds[2]<28?9.6:4.75)),
  ...plan.landings.map(r=>box(r,-.48,r[4])),
  ...plan.lightWells.flatMap(w=>{
    const [x0,x1,z0,z1]=w.bounds,midX=(x0+x1)/2,midZ=(z0+z1)/2
    const base=plan.ceilingZones.find(c=>midX>=c.bounds[0]&&midX<=c.bounds[1]&&midZ>=c.bounds[2]&&midZ<=c.bounds[3])?.ceiling??4.75
    return [[x0-.16,x0,z0,z1],[x1,x1+.16,z0,z1],[x0,x1,z0-.16,z0],[x0,x1,z1,z1+.16]].map(r=>box(r,base,w.top))
  }),...lowRoofs,
].flat()

// The same partitions and circular screen that bound the water also occlude
// glossy rays. A room-sized box alone can project a skylight through a wall.
export const bathProbeGeometryGLSL=/* glsl */`
uniform vec3 bathOccluders[${bathOccluders.length}];
uniform int bathOccluderCount;
void bathBoxHit(vec3 o,vec3 d,vec3 lo,vec3 hi,inout float nearest){
  vec3 inv=mix(vec3(-1.),vec3(1.),step(vec3(0.),d))/max(abs(d),vec3(.00001));
  vec3 a=(lo-o)*inv,b=(hi-o)*inv;
  vec3 enter=min(a,b),leave=max(a,b);
  float t=max(enter.x,max(enter.y,enter.z));
  if(t>.015&&t<nearest&&t<min(leave.x,min(leave.y,leave.z)))nearest=t;
}
float bathRayDistance(vec3 o,vec3 d){
  vec3 lo=vec3(-29.,-.48,22.18),hi=vec3(-3.,9.9,38.);
  vec3 inv=mix(vec3(-1.),vec3(1.),step(vec3(0.),d))/max(abs(d),vec3(.00001));
  vec3 exitAt=max((lo-o)*inv,(hi-o)*inv);
  float nearest=max(.02,min(exitAt.x,min(exitAt.y,exitAt.z)));
  // A uniform-sized loop avoids compiling hundreds of expanded copies of the
  // box solver in every physical-material lobe and capture variant.
  for(int i=0;i<bathOccluderCount;i++)bathBoxHit(o,d,bathOccluders[i*2],bathOccluders[i*2+1],nearest);
  ${plan.partitions.map(w=>{
    const coordinate=w.axis==='x'?'x':'z',along=w.axis==='x'?'z':'x'
    return [w.at-w.thick/2,w.at+w.thick/2].map(at=>`{
      float t=(${f(at)}-o.${coordinate})/(abs(d.${coordinate})<.00001?.00001:d.${coordinate});
      vec3 p=o+d*t;
      float q=(p.${along}-(${f((w.lo+w.hi)/2)}))/${f((w.hi-w.lo)/2)};
      float crown=${f(w.sill)}+${f(w.rise)}*sqrt(max(0.,1.-q*q));
      if(t>.015&&t<nearest&&p.${along}>=${f(w.from)}&&p.${along}<=${f(w.to)}
        &&p.y>=crown&&p.y<4.75)nearest=t;
    }`).join('\n')
  }).join('\n')}
  ${plan.arcWalls.map(a=>`{
    vec2 q=o.xz-vec2(${a.center.map(f)});float aa=dot(d.xz,d.xz),bb=dot(q,d.xz);
    for(int side=0;side<2;side++){
      float radius=${f(a.radius)}+(side==0?-1.:1.)*${f(a.thickness/2)};
      float disc=bb*bb-aa*(dot(q,q)-radius*radius);
      if(disc>=0.&&aa>.000001){
        for(int root=0;root<2;root++){
          float t=(-bb+(root==0?-1.:1.)*sqrt(disc))/aa;
          vec3 p=o+d*t;vec2 radial=p.xz-vec2(${a.center.map(f)});
          float angle=mod(atan(radial.y,radial.x)+6.28318531,6.28318531);
          if(t>.015&&t<nearest&&p.y>=-.48&&p.y<=${f(a.top)}
            &&angle>=${f(a.start*Math.PI/180)}&&angle<=${f(a.end*Math.PI/180)})nearest=t;
        }
      }
    }
  }`).join('\n')}
  // The roof has three recessed light wells and several genuinely low soffits.
  if(d.y>.00001){
    float t=(4.75-o.y)/d.y;vec3 p=o+d*t;bool opening=false;
    ${[...plan.lightWells,...plan.ceilingZones].map(z=>`opening=opening||(p.x>=${f(z.bounds[0])}&&p.x<=${f(z.bounds[1])}&&p.z>=${f(z.bounds[2])}&&p.z<=${f(z.bounds[3])});`).join('\n')}
    if(!opening&&t>.015)nearest=min(nearest,t);
    // Low ceilings are already split around the apertures in lowRoofs. Adding
    // their full rectangles again would cap a light well at the lower soffit.
    ${plan.lightWells.map(z=>({bounds:z.bounds,top:z.top})).map(z=>`{
      float t=(${f(z.top)}-o.y)/d.y;vec3 p=o+d*t;
      if(t>.015&&p.x>=${f(z.bounds[0])}&&p.x<=${f(z.bounds[1])}&&p.z>=${f(z.bounds[2])}&&p.z<=${f(z.bounds[3])})nearest=min(nearest,t);
    }`).join('\n')}
  }
  return nearest;
}
float bathProbeVisibility(vec3 origin,vec3 hit){
  vec3 delta=hit-origin;float distance=length(delta);
  float blocker=bathRayDistance(origin,delta/max(distance,.001));
  return 1.-smoothstep(.06,.24,distance-blocker);
}
`
