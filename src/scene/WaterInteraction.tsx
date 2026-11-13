import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { waterDepth, waterLevelAt, solids, roundColumns } from './layout'
import { poolBasins } from './poolBasins'
import { ShallowWaterField } from './shallowWater'
import { rippleUniforms, waterImpulses, waterReset, type WaterImpulse } from './poolWaves'
import { captureExcluded } from './captureState'
import type { Quality } from './PoolWater'

/** One 128 x 128 field and one bounded droplet batch; no additional scene capture. */
export default function WaterInteraction({quality}:{quality:Quality}){
  const resources=useMemo(()=>{
    const field=new ShallowWaterField((x,z,level)=>{
      if(waterLevelAt(x,z)!==level)return 0
      const depth=waterDepth(x,z);if(depth<=.015)return 0
      if(solids.some(s=>s.bottom<level&&s.top>level&&x>=s.x0&&x<=s.x1&&z>=s.z0&&z<=s.z1))return 0
      if(roundColumns.some(c=>c.top>level&&Math.hypot(c.x-x,c.z-z)<c.radius))return 0
      return depth
    })
    const data=new Uint16Array(field.size*field.size*4)
    const texture=new THREE.DataTexture(data,field.size,field.size,THREE.RGBAFormat,THREE.HalfFloatType)
    texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true
    texture.name='Local physical water / height, slopes, foam'
    const geometry=new THREE.SphereGeometry(1,8,6)
    const material=new THREE.MeshStandardMaterial({color:'#c2dfdf',roughness:.08,metalness:0,transparent:true,opacity:.38,depthWrite:false})
    const mesh=new THREE.InstancedMesh(geometry,material,96);mesh.name='Water impact droplets';mesh.receiveShadow=true;mesh.count=0;mesh.frustumCulled=false
    mesh.userData.excludeFromRoomReflection=true
    const drops=Array.from({length:96},()=>({x:0,y:0,z:0,vx:0,vy:0,vz:0,life:0,total:1,level:0,size:.02}))
    return {field,data,texture,geometry,material,mesh,drops,next:0,matrix:new THREE.Matrix4(),quaternion:new THREE.Quaternion(),position:new THREE.Vector3(),scale:new THREE.Vector3(),accumulator:0,upload:0,lastEnergy:0,serial:waterReset.serial}
  },[])
  useEffect(()=>{
    rippleUniforms.uInteraction.value=resources.texture;captureExcluded.add(resources.mesh)
    return()=>{captureExcluded.delete(resources.mesh);if(rippleUniforms.uInteraction.value===resources.texture){rippleUniforms.uInteraction.value=null;rippleUniforms.uInteractionEnabled.value=0}resources.texture.dispose();resources.geometry.dispose();resources.material.dispose();resources.mesh.dispose()}
  },[resources])
  useFrame(({camera},rawDelta)=>{
    const r=resources,dt=Math.min(rawDelta,.05),field=r.field
    if(r.serial!==waterReset.serial){field.clear();r.drops.forEach(d=>d.life=0);r.serial=waterReset.serial}
    let level=waterLevelAt(camera.position.x,camera.position.z)
    if(level===undefined){
      let nearest=Infinity
      for(const pool of poolBasins)for(const b of pool.footprint){
        const distance=Math.hypot(Math.max(b.x0-camera.position.x,0,camera.position.x-b.x1),Math.max(b.z0-camera.position.z,0,camera.position.z-b.z1))
        if(distance<nearest){nearest=distance;level=pool.level}
      }
    }
    const shifted=field.moveTo(camera.position.x,camera.position.z,level??0)
    const spawn=(e:WaterImpulse)=>{
      const count=Math.min(quality==='low'?6:24,Math.ceil(e.splash*22))
      for(let i=0;i<count;i++){
        const d=r.drops[r.next++%r.drops.length],seed=Math.sin(r.next*12.9898)*43758.5453,random=seed-Math.floor(seed)
        const angle=i*2.399963+r.next*.17,speed=.15+e.splash*(.35+random*.85)
        d.x=e.x+Math.cos(angle)*.12;d.z=e.z+Math.sin(angle)*.12;d.y=e.level+.025;d.level=e.level
        d.vx=Math.cos(angle)*speed+e.vx*.15;d.vz=Math.sin(angle)*speed+e.vz*.15;d.vy=.45+e.splash*(.6+random*1.3)
        d.total=d.life=.28+e.splash*.30;d.size=.003+random*.005
      }
    }
    const disturbed=waterImpulses.length>0
    for(const e of waterImpulses){if(Math.abs(e.level-field.level)<.02)field.disturb(e.x,e.z,e.strength,e.radius);if(e.splash>0)spawn(e)}
    waterImpulses.length=0
    r.accumulator=Math.min(r.accumulator+dt,.05)
    while(r.accumulator>=1/60){field.step();r.accumulator-=1/60}
    r.upload+=dt
    if(shifted||disturbed||(field.energy>0&&r.upload>=1/(quality==='low'?20:30))||(r.lastEnergy>0&&field.energy===0)){
      const n=field.size,h=field.height,d=field.depth,half=THREE.DataUtils.toHalfFloat
      for(let z=0;z<n;z++)for(let x=0;x<n;x++){
        const k=z*n+x,p=k*4,c=h[k]
        r.data[p]=half(c)
        r.data[p+1]=half(((x<n-1&&d[k+1]>.015?h[k+1]:c)-(x>0&&d[k-1]>.015?h[k-1]:c))/(2*field.cell))
        r.data[p+2]=half(((z<n-1&&d[k+n]>.015?h[k+n]:c)-(z>0&&d[k-n]>.015?h[k-n]:c))/(2*field.cell))
        r.data[p+3]=half(field.foam[k])
      }
      r.texture.needsUpdate=true;r.upload=0;r.lastEnergy=field.energy
    }
    rippleUniforms.uInteractionBounds.value.set(field.x,field.z,field.width,field.level)
    rippleUniforms.uInteractionEnabled.value=field.energy>0?1:0
    let count=0
    for(const d of r.drops){
      if(d.life<=0)continue
      d.life-=dt;d.vy-=9.81*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt
      if(d.y<=d.level||d.life<=0){d.life=0;continue}
      const s=d.size*Math.min(1,d.life/.10)
      r.position.set(d.x,d.y,d.z);r.scale.set(s,s*(1+Math.abs(d.vy)*.4),s)
      r.matrix.compose(r.position,r.quaternion,r.scale);r.mesh.setMatrixAt(count++,r.matrix)
    }
    r.mesh.count=count;if(count)r.mesh.instanceMatrix.needsUpdate=true
  },-1.8)
  return <primitive object={resources.mesh} dispose={null}/>
}
