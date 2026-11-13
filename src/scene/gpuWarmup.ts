import * as T from 'three'

// Yield past a paint, rather than chaining GPU work in the same microtask.
// Also runs in an unfocused desktop window, where rAF may be throttled.
export const nextPaint=()=>new Promise<void>(resolve=>{
  let done=false
  const finish=()=>{if(!done){done=true;clearTimeout(timer);resolve()}}
  const timer=setTimeout(finish,80)
  requestAnimationFrame(()=>setTimeout(finish,0))
})

type Drawable=T.Mesh|T.Points|T.Line
function proxy(object:Drawable,material:T.Material|T.Material[]=object.material){
  // Object3D.clone() would call Reflector's constructor, creating more targets.
  // Explicit proxies have no capture hooks and retain the original GPU buffers.
  let copy:Drawable
  if(object instanceof T.InstancedMesh){
    const mesh=new T.InstancedMesh(object.geometry,material,0)
    mesh.count=object.count;mesh.instanceMatrix=object.instanceMatrix;mesh.instanceColor=object.instanceColor
    copy=mesh
  }else if(object instanceof T.Points)copy=new T.Points(object.geometry,material)
  else if(object instanceof T.LineSegments)copy=new T.LineSegments(object.geometry,material)
  else if(object instanceof T.Line)copy=new T.Line(object.geometry,material)
  else copy=new T.Mesh(object.geometry,material)
  copy.matrixAutoUpdate=false;copy.matrix.copy(object.matrixWorld);copy.frustumCulled=false
  return copy
}

/** Upload one source texture at a time, then compile batches of material variants.
 * No render hooks/captures run here and no render-target textures are uploaded.
 * targetScene supplies the actual lighting and environment of the destination.
 */
export async function warmScene(gl:T.WebGLRenderer,root:T.Object3D,camera:T.Camera,targetScene:T.Scene,valid=()=>true){
  const textures=new Set<T.Texture>(),materials=new Set<T.Material>(),batches:Drawable[][]=[]
  const geometry=new Set<T.BufferGeometry>(),uploads:Drawable[]=[]
  root.updateWorldMatrix(true,true)
  root.traverse(object=>{
    if(!(object instanceof T.Mesh||object instanceof T.Points||object instanceof T.Line))return
    if(!geometry.has(object.geometry)||object instanceof T.InstancedMesh){geometry.add(object.geometry);uploads.push(object)}
    const list=Array.isArray(object.material)?object.material:[object.material]
    let fresh=false
    for(const material of list){
      if(materials.has(material))continue
      materials.add(material);fresh=true
      const add=(v:unknown)=>{if(v instanceof T.Texture&&!v.isRenderTargetTexture)textures.add(v)}
      Object.values(material).forEach(add)
      if(material instanceof T.ShaderMaterial)Object.values(material.uniforms).forEach(u=>add(u.value))
    }
    if(fresh){if(!batches.length||batches[batches.length-1].length===6)batches.push([]);batches[batches.length-1].push(object)}
  })
  for(const texture of textures){await nextPaint();if(!valid())return;gl.initTexture(texture)}
  // Upload actual vertex/index/instance buffers ahead of the first visible draw.
  // A tiny pass with cheap proxy materials does not run water/reflector callbacks.
  const target=new T.WebGLRenderTarget(8,8),basic=new T.MeshBasicMaterial(),dots=new T.PointsMaterial({size:.01}),lines=new T.LineBasicMaterial(),staging=new T.Scene()
  try{
    for(let i=0;i<uploads.length;i+=12){
      await nextPaint();if(!valid())return
      staging.clear();for(const object of uploads.slice(i,i+12))staging.add(proxy(object,object instanceof T.Points?dots:object instanceof T.Line?lines:basic))
      const previous=gl.getRenderTarget(),face=gl.getActiveCubeFace(),mip=gl.getActiveMipmapLevel()
      const shadows=gl.shadowMap.enabled,xr=gl.xr.enabled,clipping=gl.clippingPlanes
      try{gl.shadowMap.enabled=false;gl.xr.enabled=false;gl.clippingPlanes=[];gl.setRenderTarget(target);gl.clear();gl.render(staging,camera)}
      finally{gl.clippingPlanes=clipping;gl.shadowMap.enabled=shadows;gl.xr.enabled=xr;gl.setRenderTarget(previous,face,mip)}
    }
  }finally{target.dispose();basic.dispose();dots.dispose();lines.dispose();staging.clear()}
  for(const objects of batches){
    await nextPaint();if(!valid())return
    const group=new T.Group()
    // Share geometry/material without moving the live scene's objects or hooks.
    for(const object of objects)group.add(proxy(object))
    await gl.compileAsync(group,camera,targetScene)
    // Water/reflection passes enable one global clipping plane. Precompile that
    // variant too: a newly visible material used to block on its first capture.
    // Restore immediately after compilation is dispatched; the asynchronous
    // poll must not leave global clipping active in the live scene.
    if(objects.some(o=>(Array.isArray(o.material)?o.material:[o.material]).some(m=>m instanceof T.MeshStandardMaterial))){
      await nextPaint();if(!valid())return
      const previous=gl.clippingPlanes
      let compiled:Promise<T.Object3D>
      try{gl.clippingPlanes=[new T.Plane(new T.Vector3(0,-1,0),0)];compiled=gl.compileAsync(group,camera,targetScene)}
      finally{gl.clippingPlanes=previous}
      await compiled
    }
  }
}
