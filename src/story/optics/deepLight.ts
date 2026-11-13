import * as T from 'three'

// Integrate a softly bounded column only along the underwater section of the
// visible ray. Its radius and offset follow the clerestory above the deep well.
export const deepLightGLSL=/* glsl */`
vec3 shaftScatter(vec3 eye,vec3 surface,float level){
  if(eye.y>=level)return vec3(0.);
  vec3 delta=surface-eye;float len=length(delta);vec3 dir=delta/max(len,.001);
  if(dir.y>.0001)len=min(len,(level-eye.y)/dir.y);
  vec2 offset=eye.xz-vec2(.15,3.75)-(level-eye.y)*vec2(.075,-.14);
  vec2 slope=dir.xz+dir.y*vec2(.075,-.14);
  float s2=max(.0001,dot(slope,slope)),closest=clamp(-dot(offset,slope)/s2,0.,len);
  vec2 nearest=offset+closest*slope;
  float path=min(len,4.1*inversesqrt(s2))*exp(-dot(nearest,nearest)*.23);
  float phase=.26+.74*pow(max(0.,dir.y),3.);
  return vec3(.027,.085,.076)*(1.-exp(-path*.23))*phase;
}`
export function suspendedMotes(level:{value:number},time:{value:number}){
  const geo=new T.BufferGeometry(),points=new Float32Array(72*3)
  let seed=8721
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  for(let i=0;i<points.length;i+=3){points[i]=(random()-.5)*6;points[i+1]=random();points[i+2]=(random()-.5)*6+3.75}
  geo.setAttribute('position',new T.BufferAttribute(points,3))
  const mat=new T.ShaderMaterial({uniforms:{level,time},transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`uniform float level,time;varying float strength;void main(){
      vec3 p=position;p.y=mix(-9.8,level-.08,fract(p.y+time*.002));
      p.xz+=.11*vec2(sin(time*.13+p.z),cos(time*.095+p.x));
      float dist=length(cameraPosition-p);
      strength=step(cameraPosition.y,level-.04)*exp(-dot(p.xz-vec2(.15,3.75),p.xz-vec2(.15,3.75))*.22)*exp(-dist*.14);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      gl_PointSize=clamp(13./max(1.,gl_Position.w),1.,2.8);}`,
    fragmentShader:`varying float strength;void main(){float r=length(gl_PointCoord-.5);gl_FragColor=vec4(.39,.70,.63,strength*.38*(1.-smoothstep(.08,.5,r)));}`})
  const cloud=new T.Points(geo,mat);cloud.frustumCulled=false;return cloud
}
