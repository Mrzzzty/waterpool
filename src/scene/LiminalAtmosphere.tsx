import { WINDOW_COURT_DEPTH, windowCourtTop } from './windowLightwells'
import { useEffect,useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { windows, sun } from './layout'
import { worldUniforms } from './materials'
import { captureExcluded,captureUniforms } from './captureState'
import type { Quality } from './PoolWater'
import type { DayCycle } from './daylightCycle'

const beamFragment=/* glsl */`
 uniform sampler2D uOpaqueDepth;
 uniform vec2 uScreenSize;
 uniform float uCameraNear,uCameraFar,uHasDepth,uStrength,uTime,uSteps;
 uniform vec3 uSunColor;
 uniform mat4 uWorldToBeam;
 varying vec3 vBeamWorld;
 #include <packing>
 void main(){
  if(uHasDepth<.5)discard;
  vec3 ray=normalize(vBeamWorld-cameraPosition);
  vec3 origin=(uWorldToBeam*vec4(cameraPosition,1.)).xyz;
  vec3 direction=(uWorldToBeam*vec4(ray,0.)).xyz;
  vec3 inv=sign(direction+vec3(.000001))/max(abs(direction),vec3(.000001));
  vec3 a=(-.5-origin)*inv,b=(.5-origin)*inv;
  vec3 lo=min(a,b),hi=max(a,b);
  float entry=max(0.,max(lo.x,max(lo.y,lo.z))),exit=min(hi.x,min(hi.y,hi.z));
  float depth=texture2D(uOpaqueDepth,gl_FragCoord.xy/uScreenSize).x;
  float sceneZ=-perspectiveDepthToViewZ(depth,uCameraNear,uCameraFar);
  float rayZ=max(-(viewMatrix*vec4(ray,0.)).z,.001);
  exit=min(exit,sceneZ/rayZ);
  if(exit<=entry)discard;
  float integral=0.;
  // A bounded 4/6/8 sample integration inside a window-sized volume, clipped by scene depth.
  for(int i=0;i<8;i++){
   if(float(i)>=uSteps)break;
   float t=mix(entry,exit,(float(i)+.5)/uSteps);
   vec3 p=origin+direction*t;
   float edge=(1.-smoothstep(.30,.5,abs(p.x)))*(1.-smoothstep(.30,.5,abs(p.y)));
   float falloff=1.-smoothstep(.25,.5,p.z);
   float dust=.88+.12*sin(p.x*18.+p.y*14.+uTime*.22);
   integral+=edge*falloff*dust;
  }
  float scatter=(1.-exp(-(exit-entry)*integral/uSteps*.025))*uStrength;
  float distanceFade=exp(-entry*.017);
  gl_FragColor=vec4(uSunColor*vec3(.96,1.,1.04)*distanceFade,scatter*.9);
 }
`
export function WindowLightShafts({cycle,quality}:{cycle:DayCycle;quality:Quality}){
 const resources=useMemo(()=>{
  const group=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,1),materials:THREE.ShaderMaterial[]=[]
  for(const window of windows.filter(w=>w.axis==='x'&&w.at>0)){
   const bottom=Math.max(window.bottom,windowCourtTop(window.top)-WINDOW_COURT_DEPTH*sun.direction[1]/sun.direction[0])
   const z=(window.from+window.to)/2,height=(bottom+window.top)/2
   const start=new THREE.Vector3(window.at-.04,height,z),travel=new THREE.Vector3(...sun.direction).multiplyScalar(-(height-.1)/sun.direction[1])
   const matrix=new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,window.to-window.from-.16),new THREE.Vector3(0,window.top-bottom-.16,0),travel)
   matrix.setPosition(start.addScaledVector(travel,.5))
   const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,side:THREE.BackSide,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{...worldUniforms,...captureUniforms,uWorldToBeam:{value:matrix.clone().invert()},uSunColor:{value:cycle.sunColor},uStrength:{value:cycle.directScale},uSteps:{value:8}},
    vertexShader:`varying vec3 vBeamWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vBeamWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:beamFragment})
   const mesh=new THREE.Mesh(geometry,material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(matrix);mesh.renderOrder=20
   group.add(mesh);materials.push(material)
  }
  return{group,geometry,materials}
 },[cycle])
 useFrame(()=>{resources.materials.forEach(m=>{m.uniforms.uStrength.value=cycle.directScale;m.uniforms.uSteps.value=quality==='high'?8:quality==='balanced'?6:4})},-3.2)
 useEffect(()=>{captureExcluded.add(resources.group);return()=>{captureExcluded.delete(resources.group);resources.geometry.dispose();resources.materials.forEach(m=>m.dispose())}},[resources])
 return <primitive object={resources.group} dispose={null}/>
}

export default function LiminalAtmosphere({quality}:{quality:Quality}){
 const resources=useMemo(()=>{
  const group=new THREE.Group(),orbGeometry=new THREE.SphereGeometry(1,20,12)
  const orbMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   uniforms:worldUniforms,
   vertexShader:`uniform float uTime;varying vec3 vNormalW,vView;varying float vPulse;
    void main(){vec3 center=instanceMatrix[3].xyz;float seed=center.z*.23;vPulse=.82+.18*sin(uTime*.75+seed);
    vec3 p=position*(1.+.055*sin(uTime*.75+seed));vec4 world=modelMatrix*instanceMatrix*vec4(p,1.);
    world.y+=sin(uTime*.35+seed)*.14;vNormalW=normalize(mat3(modelMatrix)*normal);vView=normalize(cameraPosition-world.xyz);
    gl_Position=projectionMatrix*viewMatrix*world;}`,
   fragmentShader:`varying vec3 vNormalW,vView;varying float vPulse;
    void main(){float rim=pow(1.-abs(dot(normalize(vNormalW),normalize(vView))),2.4);
    vec3 color=mix(vec3(.65,1.1,1.25),vec3(1.2,.82,1.12),rim);
    gl_FragColor=vec4(color*1.25,(.055+rim*.25)*vPulse);}`})
  const positions=[[-15,.7,-89,.12]]
  const orbs=new THREE.InstancedMesh(orbGeometry,orbMaterial,positions.length)
  positions.forEach(([x,y,z,r],i)=>orbs.setMatrixAt(i,new THREE.Matrix4().makeScale(r,r,r).setPosition(x,y,z)))
  orbs.instanceMatrix.needsUpdate=true;orbs.computeBoundingSphere();group.add(orbs)
  let seed=97;const random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646}
  const points=new Float32Array(320*3)
  for(let i=0;i<320;i++){points[i*3]=(random()-.5)*13;points[i*3+1]=random()*6;points[i*3+2]=-48-random()*52}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3))
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,uniforms:worldUniforms,
   vertexShader:`uniform float uTime;varying float vAlpha;
    void main(){vec3 p=position;p.y=mod(p.y+uTime*.035,6.);p.x+=sin(uTime*.17+p.z)*.12;
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp(18./max(-mv.z,1.),1.,2.5);vAlpha=.3*smoothstep(0.,1.,p.y)*(1.-smoothstep(3.8,6.,p.y))*exp(-length(mv.xyz)*.025);}`,
   fragmentShader:`varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(1.2,1.4,1.5,pow(1.-d,2.)*vAlpha);}`})
  const dust=new THREE.Points(geometry,material);dust.frustumCulled=false;group.add(dust)
  return{group,orbGeometry,orbMaterial,geometry,material,orbs}
 },[])
 useEffect(()=>{resources.geometry.setDrawRange(0,quality==='high'?160:quality==='balanced'?90:40);resources.orbs.count=quality==='low'?0:1},[resources,quality])
 useEffect(()=>()=>{resources.orbs.dispose();resources.orbGeometry.dispose();resources.orbMaterial.dispose();resources.geometry.dispose();resources.material.dispose()},[resources])
 return <primitive object={resources.group} dispose={null}/>
}
