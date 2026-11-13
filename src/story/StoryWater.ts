import * as T from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { captureSize } from '../scene/renderQuality'
import {captureBudget} from './captureBudget'
import type {Act,Basin,Rect} from './rooms'
import {StoryRipples,rippleGLSL} from './optics/ripples'
import {shoreline} from './optics/shore'
import {basinShader} from './optics/WaterShader'
import {ceramicGLSL,type OpticsControls} from './optics/ceramic'
import look from './bathLook.json'
import {poolLook,poolLookGLSL} from './optics/poolLook'
import type {SurfaceLibrary} from '../scene/surfaceLibrary'

export class StoryWater {
  readonly surfaces:Reflector[]=[]
  readonly dusk={value:0}
  readonly stillness={value:0}
  readonly ripples:StoryRipples
  private targets:T.WebGLRenderTarget[]=[]
  private viewport=new T.Vector4()
  constructor(private controls:OpticsControls){this.ripples=new StoryRipples(controls)}
  footfall(x:number,z:number,level:number,strength=.026,radius=.28){this.ripples.disturb(x,z,level,strength,radius)}
  update(act:Act,eye:T.Vector3,levels:number[],blockers:Rect[],dt:number){this.ripples.update(act,eye,levels,blockers,dt)}
  add(act:Act,basin:Basin,time:{value:number},sun:{value:T.Vector3},library:SurfaceLibrary){
    const [west,east,north,south]=basin.bounds,width=east-west,length=south-north
    const cx=(east+west)/2,cz=(north+south)/2
    const edge=shoreline(act,basin),geom=edge.geometry
    const surface=new Reflector(geom,{textureWidth:1,textureHeight:1,multisample:0,clipBias:.003})
    surface.rotation.x=-Math.PI/2;surface.position.set(cx,basin.initial,cz);surface.renderOrder=1
    const material=surface.material as T.ShaderMaterial,mirror=surface.getRenderTarget()
    mirror.texture.generateMipmaps=true
    mirror.texture.minFilter=T.LinearMipmapLinearFilter
    const w=Math.max(96,Math.round(512*width/Math.max(width,length))),h=Math.max(96,Math.round(512*length/Math.max(width,length)))
    const survey=new T.WebGLRenderTarget(w,h,{type:T.HalfFloatType})
    survey.depthTexture=new T.DepthTexture(w,h,T.UnsignedIntType)
    this.targets.push(survey)
    // A small, infrequent diffuse-only pass supplies scatter illumination without
    // multiplying grout into the source term. Only the shallow bath needs it.
    const diffuse=edge.bath?new T.WebGLRenderTarget(Math.max(32,Math.round(w/4)),Math.max(32,Math.round(h/4)),{type:T.HalfFloatType}):null
    if(diffuse){diffuse.texture.generateMipmaps=true;diffuse.texture.minFilter=T.LinearMipmapLinearFilter;this.targets.push(diffuse)}
    const refraction=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType})
    if(refraction){
      refraction.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType)
      refraction.texture.generateMipmaps=true
      refraction.texture.minFilter=T.LinearMipmapLinearFilter
      this.targets.push(refraction)
    }
    const refractionVP=new T.Matrix4(),refractionInverse=new T.Matrix4()
    const refractionEye=new T.PerspectiveCamera()
    const underwaterClip=new T.Plane(new T.Vector3(0,-1,0),basin.initial)
    const excluded:T.Object3D[]=[]
    const bathWorld=new T.Color().fromArray(look.worldRadiance)
    const interior=new T.WebGLCubeRenderTarget(160,{type:T.HalfFloatType,generateMipmaps:false})
    this.targets.push(interior)
    const probe=new T.CubeCamera(.06,100,interior)
    probe.coordinateSystem=T.WebGLCoordinateSystem;probe.updateCoordinateSystem()
    let face=6,lastProbe=-Infinity,probeLevel=-Infinity
    const top=new T.OrthographicCamera(-width/2,width/2,length/2,-length/2,.015,24)
    top.up.set(0,0,-1)
    Object.assign(material.uniforms,this.controls,{
      uTime:time,uSun:sun,uWaterLevel:{value:basin.initial},uStillness:this.stillness,uWellDusk:this.dusk,
      uSurveyLight:{value:survey.texture},uSurveyDepth:{value:survey.depthTexture},uSurveyTop:{value:0},uSurveySpan:{value:1},
      uSurveyDiffuse:{value:diffuse?.texture??survey.texture},
      regionalColor:{value:library.color},regionalDetail:{value:library.detail},
      uMirror:{value:mirror.texture},uInterior:{value:interior.texture},uInteriorOrigin:{value:probe.position},uInteriorReady:{value:0}
      ,uRefraction:{value:refraction?.texture??survey.texture},uRefractionDepth:{value:refraction?.depthTexture??survey.depthTexture},
      uRefractionVP:{value:refractionVP},uRefractionInverse:{value:refractionInverse},uRefractionReady:{value:0}
    })
    material.vertexShader=`
      uniform mat4 textureMatrix;uniform float uTime,uStillness,uWaterLevel;
      ${edge.glsl}
      varying vec3 vWorld;varying vec4 vReflection;
      ${rippleGLSL}
      ${poolLookGLSL}
      ${ceramicGLSL.slice(ceramicGLSL.indexOf('const float breathRate'),ceramicGLSL.indexOf('vec2 tileRandom'))}
      void main(){
        vWorld=(modelMatrix*vec4(position,1.)).xyz;
        float edge=shore(vWorld.xz);
        float look=poolLookAt(vWorld.xz);
        // The centimetre-wide meniscus belongs in the fragment normal. Raising
        // sparse vertices makes a toothed rim where the shore cuts a large cell.
        vWorld.y+=waterHeight(vWorld.xz,uTime,uWaterLevel)*smoothstep(0.,.12,edge)*(1.-uStillness);
        vReflection=textureMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
      }`
    material.fragmentShader=basinShader(basin,edge)
    material.side=T.DoubleSide
    this.surfaces.push(surface)
    const reflect=surface.onBeforeRender.bind(surface),vis:boolean[]=[]
    let sampledLevel=-Infinity,sampledAt=-Infinity,lastReflection=-Infinity
    const lastView=new T.Matrix4(),lastProjection=new T.Matrix4()
    surface.onBeforeRender=(gl,scene,eye,geometry,mat,group)=>{
      if(!(eye instanceof T.PerspectiveCamera)||!eye.userData.inspectionEye)return
      const budget=captureBudget(gl)
      const captureClock=performance.now()/1000
      const level=surface.position.y;material.uniforms.uWaterLevel.value=level
      const capture=Math.abs(sampledLevel-level)>.075||Math.abs(time.value-sampledAt)>6
      const above=eye.position.y>=level
      const moved=!lastView.equals(eye.matrixWorld)||!lastProjection.equals(eye.projectionMatrix)
      // Capture pacing uses wall time: pause menus and fixed-view reviews can
      // still change the camera while the simulation clock remains frozen.
      const elapsed=captureClock-lastReflection
      const resized=!lastProjection.equals(eye.projectionMatrix)
      const refresh=above&&(capture||resized||(moved&&elapsed>=budget.interval)||elapsed>.16)
      if(!above&&face===6&&(Math.abs(time.value-lastProbe)>20||Math.abs(level-probeLevel)>.9)){
        face=0;lastProbe=time.value;probeLevel=level
        probe.position.set(T.MathUtils.clamp(eye.position.x,west+.6,east-.6),level+.22,T.MathUtils.clamp(eye.position.z,north+.6,south-.6))
        probe.updateMatrixWorld(true)
      }
      const drawFace=!above&&face<6
      if(!capture&&!refresh&&!drawFace)return
      const previous=gl.getRenderTarget(),shadows=gl.shadowMap.autoUpdate,xr=gl.xr.enabled
      this.surfaces.forEach((s,i)=>{vis[i]=s.visible;s.visible=false})
      gl.shadowMap.autoUpdate=false;gl.xr.enabled=false
      try{
        if(refraction&&above&&refresh){
          gl.getCurrentViewport(this.viewport)
          const [rw,rh]=captureSize(this.viewport.z,this.viewport.w,budget.scale,budget.edge,budget.pixels)
          if(refraction.width!==rw||refraction.height!==rh)refraction.setSize(rw,rh)
          // A guard band captures the floor just outside the player's view;
          // refracted rays often land there, especially at the lower screen edge.
          refractionEye.copy(eye,false);refractionEye.zoom=eye.zoom*.78;refractionEye.updateProjectionMatrix()
          refractionEye.userData.inspectionEye=false
          refractionVP.multiplyMatrices(refractionEye.projectionMatrix,refractionEye.matrixWorldInverse)
          refractionInverse.copy(refractionVP).invert()
          const clips=gl.clippingPlanes,background=scene.background
          underwaterClip.constant=level+.003
          scene.traverse(o=>{if(o.visible&&o.userData.excludeFromRefraction){excluded.push(o);o.visible=false}})
          try{
            gl.clippingPlanes=[underwaterClip];scene.background=null
            gl.setRenderTarget(refraction);gl.clear();gl.render(scene,refractionEye)
            material.uniforms.uRefractionReady.value=1
          }finally{
            gl.clippingPlanes=clips;scene.background=background
            excluded.forEach(o=>o.visible=true);excluded.length=0
            gl.setRenderTarget(previous)
          }
        }
        if(capture){
          top.position.set(cx,level+.012,cz);top.lookAt(cx,level-1,cz);top.far=level-basin.bed+.6
          top.updateProjectionMatrix();top.updateMatrixWorld()
          material.uniforms.uSurveyTop.value=top.position.y-top.near
          material.uniforms.uSurveySpan.value=top.far-top.near
          this.controls.uSurvey.value=1
          gl.setRenderTarget(survey);gl.clear();gl.render(scene,top);gl.setRenderTarget(previous)
          if(diffuse){
            this.controls.uSurvey.value=2
            gl.setRenderTarget(diffuse);gl.clear();gl.render(scene,top);gl.setRenderTarget(previous)
          }
          this.controls.uSurvey.value=0;sampledAt=time.value;sampledLevel=level
        }
        if(drawFace){
          // One face per frame when submerged; the upward ray then sees the
          // real frame, curtain and daylight beyond the ceiling.
          const fog=scene.fog instanceof T.Fog?scene.fog:null
          const near=fog?.near,far=fog?.far
          try{
            if(fog){fog.near=24;fog.far=62}
            gl.setRenderTarget(interior,face);gl.clear();gl.render(scene,probe.children[face] as T.Camera)
          }finally{if(fog){fog.near=near!;fog.far=far!}gl.setRenderTarget(previous)}
          if(++face===6)material.uniforms.uInteriorReady.value=1
        }
        if(refresh){
          gl.getCurrentViewport(this.viewport)
          const [mw,mh]=captureSize(this.viewport.z,this.viewport.w,budget.mirrorScale,budget.mirrorEdge,budget.mirrorPixels)
          if(mirror.width!==mw||mirror.height!==mh)mirror.setSize(mw,mh)
          const background=scene.background
          if(edge.bath){
            scene.background=bathWorld
            scene.traverse(o=>{if(o.visible&&o.userData.skyBackdrop){excluded.push(o);o.visible=false}})
          }
          try{reflect(gl,scene,eye,geometry,mat,group)}finally{
            scene.background=background;excluded.forEach(o=>o.visible=true);excluded.length=0
          }
          lastView.copy(eye.matrixWorld);lastProjection.copy(eye.projectionMatrix);lastReflection=captureClock
        }
      }finally{
        this.controls.uSurvey.value=0;gl.setRenderTarget(previous);gl.xr.enabled=xr;gl.shadowMap.autoUpdate=shadows
        this.surfaces.forEach((s,i)=>{s.visible=vis[i]})
      }
    }
    return surface
  }
  dispose(){
    this.ripples.dispose()
    for(const t of this.targets)t.dispose()
    for(const s of this.surfaces){
      s.getRenderTarget().dispose()
      s.geometry?.dispose()
      const material=s.material
      if(Array.isArray(material))material.forEach(m=>m?.dispose());else material?.dispose()
    }
  }
}
