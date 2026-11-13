import * as T from 'three'
import {Reflector} from 'three/addons/objects/Reflector.js'
import look from './bathLook.json'
import {captureSize} from '../scene/renderQuality'

/** One dominant ceramic wall. Other walls keep the baked, box-projected probes. */
export class BathWallReflection {
  readonly mesh:Reflector
  readonly ready={value:0}
  private readonly fallback=new T.DataTexture(new Uint8Array([0,0,0,255]),1,1)
  readonly uniforms:{bathWallMap:{value:T.Texture};bathWallMatrix:{value:T.Matrix4};bathWallReady:{value:number}}
  constructor(eye:T.Camera,enabled:()=>boolean){
    this.mesh=new Reflector(new T.PlaneGeometry(9.62,5.23),{textureWidth:1,textureHeight:1,multisample:0,clipBias:.001})
    this.fallback.needsUpdate=true
    this.mesh.getRenderTarget().texture.generateMipmaps=true
    this.mesh.getRenderTarget().texture.minFilter=T.LinearMipmapLinearFilter
    const mesh=this.mesh
    mesh.position.set(-11.15,2.135,26.99);mesh.rotation.y=Math.PI/2;mesh.renderOrder=-3
    const mat=mesh.material as T.ShaderMaterial
    mat.colorWrite=false;mat.depthWrite=false
    mesh.userData.excludeFromRefraction=true
    this.uniforms={bathWallMap:{value:mesh.getRenderTarget().texture},bathWallMatrix:{value:new T.Matrix4()},bathWallReady:this.ready}
    const inverseWorld=new T.Matrix4()
    // Reflect the same architectural glazing visible to the player. The bake's
    // area lights are illumination helpers, not additional visible fixtures.
    // Rebuilding them as reflection-only HDR quads put a second, much brighter
    // rectangle over the glazing, clipping grout on this wall and in the water.
    const render=mesh.onBeforeRender.bind(mesh),hidden:T.Object3D[]=[]
    const viewport=new T.Vector4(),lastView=new T.Matrix4(),lastProjection=new T.Matrix4()
    const world=new T.Color().fromArray(look.worldRadiance)
    let last=-Infinity
    mesh.onBeforeRender=(gl,scene,camera,geometry,material,group)=>{
      if(camera!==eye)return
      if(!enabled()||camera.position.x<=-11.13){this.ready.value=0;return}
      const now=performance.now()
      if(this.ready.value&&lastProjection.equals(camera.projectionMatrix)&&now-last<1000/30)return
      if(lastView.equals(camera.matrixWorld)&&lastProjection.equals(camera.projectionMatrix)&&now-last<150)return
      gl.getCurrentViewport(viewport)
      const [w,h]=captureSize(viewport.z,viewport.w,.6,1024,500000)
      const target=mesh.getRenderTarget()
      if(target.width!==w||target.height!==h)target.setSize(w,h)
      scene.traverse(o=>{if(o!==mesh&&o.visible&&((o as T.Object3D&{isReflector?:boolean}).isReflector||o.userData.skyBackdrop)){hidden.push(o);o.visible=false}})
      const background=scene.background;scene.background=world
      // Never bind the active render attachment as a sampler, even behind a
      // disabled shader branch: WebGL rejects that feedback loop for the draw.
      this.ready.value=0;this.uniforms.bathWallMap.value=this.fallback
      try{
        render(gl,scene,camera,geometry,material,group)
        // Reflector's matrix expects its own local plane coordinates. Receiver
        // shaders use world positions, so remove that final model transform.
        this.uniforms.bathWallMatrix.value.copy(mat.uniforms.textureMatrix.value).multiply(inverseWorld.copy(mesh.matrixWorld).invert())
        this.ready.value=1
        lastView.copy(camera.matrixWorld);lastProjection.copy(camera.projectionMatrix);last=now
      }finally{scene.background=background;this.uniforms.bathWallMap.value=target.texture;hidden.forEach(o=>o.visible=true);hidden.length=0}
    }
  }
  dispose(){
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose();(this.mesh.material as T.Material).dispose();this.mesh.getRenderTarget().dispose()
    this.fallback.dispose()
  }
}
