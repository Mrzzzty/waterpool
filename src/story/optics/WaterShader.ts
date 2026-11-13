import {type Basin} from '../rooms'
import {maps} from '../../world/mapPlan'
import {floatLiteral as f,rectLiteral as rect,type shoreline} from './shore'
import {deepLightGLSL} from './deepLight'
import {ceramicGLSL} from './ceramic'
import {poolLook} from './poolLook'
import {libraryGLSL} from '../../scene/surfaceLibrary'

export function basinShader(basin:Basin,edge:ReturnType<typeof shoreline>){
  const {well,bath,stairs}=edge
  const plan=maps[basin.mapAct??'hall']
  return /* glsl */`
  ${ceramicGLSL}
  ${libraryGLSL}
  ${well?deepLightGLSL:''}
  uniform float uTime,uWaterLevel,uStillness,uWellDusk,uSurveyTop,uSurveySpan;
  uniform vec3 uSun;
  uniform sampler2D uSurveyLight,uSurveyDepth,uSurveyDiffuse,uMirror;
  uniform samplerCube uInterior;
  uniform vec3 uInteriorOrigin;
  uniform float uInteriorReady;
  uniform sampler2D uRefraction,uRefractionDepth;
  uniform mat4 uRefractionVP,uRefractionInverse;
  uniform float uRefractionReady;
  varying vec3 vWorld;
  varying vec4 vReflection;
  ${edge.glsl}
  const float bed=${f(basin.bed)};
  vec2 atlasUV(vec2 p){return clamp(vec2((p.x-bounds.x)/(bounds.y-bounds.x),(bounds.w-p.y)/(bounds.w-bounds.z)),.002,.998);}
  float measuredBed(vec2 p){return uSurveyTop-texture2D(uSurveyDepth,atlasUV(p)).x*uSurveySpan;}
  struct Hit{float t;vec3 normal;};
  void boxHit(vec3 o,vec3 d,vec3 lo,vec3 hi,inout Hit h){
    vec3 inv=mix(vec3(-1.),vec3(1.),step(vec3(0.),d))/max(abs(d),vec3(.00001));
    vec3 a=(lo-o)*inv,b=(hi-o)*inv,entry=min(a,b),leave=max(a,b);
    float t=max(entry.x,max(entry.y,entry.z));
    if(t>.001&&t<h.t&&t<=min(leave.x,min(leave.y,leave.z))){
      h.t=t;h.normal=-sign(d)*(entry.x>=entry.y&&entry.x>=entry.z?vec3(1.,0.,0.):entry.y>=entry.z?vec3(0.,1.,0.):vec3(0.,0.,1.));
    }
  }
  float wellWall(vec3 o,vec3 dir){float a=dot(dir.xz,dir.xz),b=dot(o.xz,dir.xz);return (-b+sqrt(max(0.,b*b+a*(121.-dot(o.xz,o.xz)))))/max(a,.000001);}
  void arcHit(vec3 o,vec3 dir,vec2 center,float radius,float halfWidth,vec2 start,vec2 end,inout Hit hit){
    vec2 q=o.xz-center;float aa=dot(dir.xz,dir.xz),bb=dot(q,dir.xz);
    if(aa<.000001)return;
    for(int side=0;side<2;side++){
      float r=radius+(side==0?-halfWidth:halfWidth);
      float disc=bb*bb-aa*(dot(q,q)-r*r);
      if(disc<0.)continue;
      for(int root=0;root<2;root++){
        float t=(-bb+(root==0?-1.:1.)*sqrt(disc))/aa;
        vec2 p=q+dir.xz*t;
        if(t>.001&&t<hit.t&&cross2(start,p)>=0.&&cross2(p,end)>=0.){
          hit.t=t;hit.normal=vec3(p.x,0.,p.y)/r*(side==0?-1.:1.);
        }
      }
    }
    for(int side=0;side<2;side++){
      vec2 edge=side==0?start:end,normal=vec2(-edge.y,edge.x)*(side==0?-1.:1.);
      float denom=dot(dir.xz,normal);
      if(abs(denom)<.000001)continue;
      float t=-dot(q,normal)/denom,r=dot(q+dir.xz*t,edge);
      if(t>.001&&t<hit.t&&abs(r-radius)<=halfWidth){hit.t=t;hit.normal=vec3(normal.x,0.,normal.y);}
    }
  }
  Hit traceBasin(vec3 o,vec3 dir){
    Hit h;h.t=min(130.,(bed-o.y)/min(dir.y,-.0001));h.normal=vec3(0.,1.,0.);
    if(well){
      float t=wellWall(o,dir);
      if(t>.001&&t<h.t){h.t=t;h.normal=normalize(vec3(-o.x-dir.x*t,0.,-o.z-dir.z*t));}
    }else{
      vec2 side=mix(bounds.xz,bounds.yw,step(vec2(0.),dir.xz));
      vec2 t=(side-o.xz)/(mix(vec2(-1.),vec2(1.),step(vec2(0.),dir.xz))*max(abs(dir.xz),vec2(.00001)));
      if(t.x<h.t){h.t=t.x;h.normal=vec3(-sign(dir.x),0.,0.);}
      if(t.y<h.t){h.t=t.y;h.normal=vec3(0.,0.,-sign(dir.z));}
    }
    ${edge.solids.map(r=>'boxHit(o,dir,vec3('+[r[0],r[4],r[2]].map(f)+'),vec3('+[r[1],r[5],r[3]].map(f)+'),h);').join('\n')}
    // The wet arcades are true cylinders. Box proxies cut them as rectangles,
    // so the survey comparison in realReceiver fails at every curved edge and
    // the refraction falls back to a flat bed.
    ${edge.arcs.map(a=>'arcHit(o,dir,'+a+',h);').join('\n')}
    return h;
  }
  // Visible section of the handrail on the hall stair. Solve the finite cylinder
  // along the same ray as the ceramic so its two halves meet at the interface.
  void railHit(vec3 o,vec3 d,vec3 a,vec3 b,float radius,inout Hit h,inout bool steel){
    vec3 axis=b-a,off=o-a;float len2=dot(axis,axis),ad=dot(axis,d),ao=dot(axis,off);
    float A=len2-ad*ad,B=len2*dot(d,off)-ao*ad,C=len2*(dot(off,off)-radius*radius)-ao*ao;
    float disc=B*B-A*C;
    if(disc<0.||A<.00001)return;
    float t=(-B-sqrt(disc))/A,y=ao+t*ad;
    if(t>.001&&t<h.t&&y>0.&&y<len2){h.t=t;h.normal=normalize(off+d*t-axis*(y/len2));steel=true;}
  }
  ${`vec4 realReceiver(vec3 o,vec3 ray,float limit,out float travel){
    travel=limit;
    if(uRefractionReady<.5)return vec4(0.);
    vec2 uv=vec2(0.);vec3 surface=o;
    for(int i=0;i<4;i++){
      vec4 clip=uRefractionVP*vec4(o+ray*travel,1.);
      if(clip.w<=0.)return vec4(0.);
      uv=clip.xy/clip.w*.5+.5;
      if(any(lessThan(uv,vec2(.002)))||any(greaterThan(uv,vec2(.998))))return vec4(0.);
      float depth=texture2D(uRefractionDepth,uv).r;
      if(depth>=.99999)return vec4(0.);
      vec4 world=uRefractionInverse*vec4(uv*2.-1.,depth*2.-1.,1.);
      surface=world.xyz/world.w;
      travel=clamp(dot(surface-o,ray),.001,limit+1.);
    }
    float error=length(surface-(o+ray*travel));
    float valid=1.-smoothstep(.035,.16,error);
    valid*=smoothstep(.002,.035,min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y)));
    valid*=1.-smoothstep(uWaterLevel+.003,uWaterLevel+.025,surface.y);
    return vec4(texture2D(uRefraction,uv).rgb,valid);
  }`}
  vec3 receiver(vec3 o,vec3 ray,out float dist){
    Hit h=traceBasin(o,ray);
    // The orthographic survey supplies baked lighting and small objects. It is
    // world locked and shared by every viewing angle; no view-colour grab.
    vec3 hit=o+ray*h.t;
    float high=measuredBed(hit.xz);
    if(h.normal.y>.5&&high>hit.y+.035&&ray.y<-.04){
      float t=clamp((high-o.y)/ray.y,.001,h.t);
      vec3 test=o+ray*t;
      if(abs(measuredBed(test.xz)-test.y)<.12){hit=test;h.t=t;}
    }
    dist=max(.001,h.t);
    ${`float travel=dist;vec4 actual=vec4(0.);
    if(cameraPosition.y>=uWaterLevel)actual=realReceiver(o,ray,h.t,travel);
`}
    vec2 uv=atlasUV(hit.xz+h.normal.xz*.035);
    vec4 light=texture2D(uSurveyLight,uv);
    vec3 lit=light.rgb;
    // The survey is a floor-facing irradiance estimate. Preserve its local
    // shadow instead of mixing in a constant cyan light at every submerged wall.
    if(h.normal.y<.5)lit*=.62+.25*max(0.,dot(h.normal,uSun));
    Tile tile=tileAt(hit,h.normal,uSun,well);
    float lining=h.normal.y<.5?1.:1.-smoothstep(.65,.88,light.a);
    float lightMask=smoothstep(.035,.35,dot(lit,vec3(.21,.72,.07)));
    lit*=mix(vec3(1.),tile.shade*mix(vec3(1.),causticLight(hit,uWaterLevel,uSun,uTime),lightMask),lining);
    ${bath?`// The analytical fallback must use the same finish as the actual floor.
    vec3 an=abs(h.normal);
    vec2 finishMetres=an.y>.65?hit.xz:an.x>an.z?hit.zy:hit.xy;
    RegionalSurface finish=regionalSurface(0.,finishMetres,dFdx(finishMetres),dFdy(finishMetres));
    vec3 smoothLight=texture2DLodEXT(uSurveyDiffuse,uv,1.).rgb;
    if(h.normal.y<.5)smoothLight*=.62+.25*max(0.,dot(h.normal,uSun));
    vec3 textured=smoothLight*finish.color*vec3(.99,1.025,1.055)*causticLight(hit,uWaterLevel,uSun,uTime);
    lit=mix(lit,textured,uPoolLook*lining);`:''}
    float corner=exp(-max(0.,shore(hit.xz))*.95);
    lit+=vec3(.003,.015,.014)*corner*${bath?'(1.-uPoolLook)':'1.'};
    ${`vec3 fallback=lit*exp(-vec3(.288,.112,.156)*dist);
    // Keep derivatives for the ceramic fallback outside a divergent early
    // return. Otherwise neighbouring pixels disagree about the grout footprint.
    dist=mix(dist,max(.001,travel),actual.a);
    vec3 legacy=mix(fallback,actual.rgb*exp(-vec3(.288,.112,.156)*max(.001,travel)),actual.a);
    ${bath?`// This runtime captures unattenuated ceramic light. Coefficients are
    // calibrated for the single outgoing path, including the missing down-leg.
    // Use the solved ray distance; do not add a fixed apparent-depth lift.
    vec3 sigmaA=vec3(${poolLook.absorption}),sigmaS=vec3(${poolLook.scattering});
    vec3 sigmaT=sigmaA+sigmaS;
    vec3 transmittance=exp(-sigmaT*dist);
    vec3 hitPoint=o+ray*dist;
    vec3 smoothIrradiance=texture2DLodEXT(uSurveyDiffuse,atlasUV(hitPoint.xz),1.).rgb;
    vec3 source=mix(lit,actual.rgb,actual.a);
    vec3 radiance=source*transmittance+(sigmaS/sigmaT)*smoothIrradiance*(1.-transmittance);
    if(uRefractionDebug>.5)return mix(vec3(.9,.025,.035),vec3(.035,.35,.85),actual.a);
    return mix(legacy,radiance,uPoolLook);`:'return legacy;'}
    `}
  }
  // Box/cylinder projected lookup into the actual interior from just above water.
  vec3 aboveWater(vec3 o,vec3 ray){
    float roof=40.;vec4 room=${rect(basin.bounds)};
    ${plan.rooms.map(r=>`if(o.x>=${f(r.x0)}&&o.x<=${f(r.x1)}&&o.z>=${f(r.z0)}&&o.z<=${f(r.z1)}){roof=${f(r.ceiling)};room=vec4(${[r.x0,r.x1,r.z0,r.z1].map(f)});}`).join('\n')}
    float t=(roof-o.y)/max(ray.y,.00001);
    if(well)t=min(t,wellWall(o,ray));
    else{
      vec2 side=mix(room.xz,room.yw,step(vec2(0.),ray.xz));
      vec2 distance=(side-o.xz)/(mix(vec2(-1.),vec2(1.),step(vec2(0.),ray.xz))*max(abs(ray.xz),vec2(.00001)));
      t=min(t,min(distance.x,distance.y));
    }
    vec3 probeRay=o+max(t,.02)*ray-uInteriorOrigin;
    return uInteriorReady>.5?textureCube(uInterior,probeRay).rgb:vec3(.19,.22,.20);
  }
  void main(){
    vec2 p=vWorld.xz;float d=shore(p);
    if(d<-.004)discard;
    float look=poolLookAt(p),edgeWidth=mix(.035,${poolLook.meniscusWidth},look);
    float aa=max(.0006,fwidth(d)),wetEdge=exp(-max(d,0.)/edgeWidth);
    float waveFade=smoothstep(0.,.12,d);
    vec2 slope=waterGradient(p,uTime,uWaterLevel)*waveFade*(1.-uStillness);
    if(d<.12+aa){
      float eps=max(.002,min(.02,aa*.5));
      vec2 grad=vec2(shore(p+vec2(eps,0.))-shore(p-vec2(eps,0.)),shore(p+vec2(0.,eps))-shore(p-vec2(0.,eps)))/(2.*eps);
      grad/=max(1.,length(grad));
      float q=clamp(d/.12,0.,1.);
      slope+=grad*waterHeight(p,uTime,uWaterLevel)*6.*q*(1.-q)/.12*(1.-uStillness);
      slope-=grad*(mix(.00065,${poolLook.meniscusHeight},look)/edgeWidth)*wetEdge/(1.+pow(aa/edgeWidth,2.));
    }
    vec3 N=normalize(vec3(-slope.x,1.,-slope.y)),I=normalize(vWorld-cameraPosition);
    bool below=cameraPosition.y<uWaterLevel;
    vec3 normal=below?-N:N;
    float eta=below?uIOR:1./uIOR,c=clamp(-dot(I,normal),0.,1.);
    float cosT2=1.-eta*eta*(1.-c*c);
    vec3 R=reflect(I,normal),Tdir=refract(I,normal,eta);
    float ct=sqrt(max(cosT2,0.));
    vec2 F=vec2((eta*c-ct)/max(.00001,eta*c+ct),(c-eta*ct)/max(.00001,c+eta*ct));
    float Favg=cosT2<=0.?1.:clamp(.5*dot(F,F),0.,1.);
    vec3 col;float distanceInWater=0.;
    if(below){
      vec3 underside=receiver(vWorld,normalize(vec3(R.x,min(R.y,-.0001),R.z)),distanceInWater);
      col=underside;
      if(cosT2>0.)col=mix(aboveWater(vWorld,Tdir),underside,Favg);
      vec3 tr=exp(-vec3(.095,.040,.032)*length(cameraPosition-vWorld));
      col=col*tr+vec3(.012,.045,.048)*(1.-tr);
      ${well?'col+=shaftScatter(cameraPosition,vWorld,uWaterLevel);':''}
    }else{
      // Suppress the fine band in reflections; its full curvature still drives
      // caustics. The millimetre-scale long waves bend the skylight silhouette.
      vec2 reflectionSlope=slope-.65*capillaryGradient(p,uTime)*waveFade*(1.-uStillness);
      vec3 refractNormal=normalize(vec3(-slope.x*mix(1.,.7,look),1.,-slope.y*mix(1.,.7,look)));
      vec3 floorLight=receiver(vWorld,refract(I,refractNormal,1./uIOR),distanceInWater);
      ${bath?'if(uRefractionDebug>.5){gl_FragColor=vec4(floorLight,1.);return;}':''}
      // Keep architecture upright: vertical smear only, a quarter of it across.
      float reflectionScale=mix(.045,clamp(.18/max(c,.22),.18,.65),look);
      vec2 uv=vReflection.xy/max(vReflection.w,.0001)+reflectionSlope*vec2(${poolLook.reflectionAcross},1.)*reflectionScale;
      vec3 mirror=texture2D(uMirror,clamp(uv,.002,.998)).rgb;
      float fade=smoothstep(0.,.025,min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y)));
      mirror=mix(vec3(.15,.19,.17),mirror,fade);
      col=mix(floorLight,mirror,Favg);
      // The contact curve reflects actual room light via Fresnel above. No
      // unshadowed additive rim: that turned every wall into a white neon strip.
      col=mix(col,col*vec3(1.06,.84,.65)+vec3(.077,.026,.009)*(1.-exp(-distanceInWater*.23)),uWellDusk);
    }
    float farFog=1.-exp(-pow(max(0.,length(vWorld-cameraPosition)-24.)*.038,2.));
    gl_FragColor=vec4(mix(col,vec3(.00091,.00913,.01444),farFog),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`
}
