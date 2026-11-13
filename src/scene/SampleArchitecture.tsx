import { useEffect, useMemo } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import * as THREE from 'three'
import type { DayCycle } from './daylightCycle'

const assetRoot = '/assets/poolcore-sample'
export default function SampleArchitecture({ cycle }: { cycle: DayCycle }) {
  const { gl } = useThree()
  const gltf = useLoader(GLTFLoader, `${assetRoot}/architecture.glb`)
  const indirect = useLoader(EXRLoader, `${assetRoot}/indirect.exr`)
  const resources = useMemo(() => {
    const lightMap = indirect.clone()
    lightMap.channel = 1
    lightMap.flipY = false
    // EXRLoader decodes scanlines bottom-up; glTF exports V in top-down image space.
    lightMap.repeat.y = -1
    lightMap.offset.y = 1
    lightMap.colorSpace = THREE.LinearSRGBColorSpace
    lightMap.minFilter = THREE.LinearFilter
    lightMap.magFilter = THREE.LinearFilter
    lightMap.generateMipmaps = false
    lightMap.needsUpdate = true
    const scene = gltf.scene.clone(true), materials = new Set<THREE.Material>()
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      if (!object.geometry.getAttribute('uv1')) throw new Error(`Missing lightmap UVs: ${object.name}`)
      object.castShadow = true
      object.receiveShadow = true
      const configure = (source: THREE.Material) => {
        const material = source.clone()
        materials.add(material)
        if (material instanceof THREE.MeshStandardMaterial) {
          // Diffuse Indirect bake has no albedo and no direct sunlight.
          // Cycles' unit-albedo outgoing diffuse radiance is irradiance / PI.
          material.lightMap = lightMap
          material.lightMapIntensity = Math.PI * cycle.indirectScale
          // This scales/tints a static indirect bake; it is not recomputed GI.
          material.onBeforeCompile = shader => {
            shader.uniforms.uIndirectTint = { value: cycle.indirectTint }
            shader.fragmentShader = 'uniform vec3 uIndirectTint;\n' + shader.fragmentShader
            shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>',
              THREE.ShaderChunk.lights_fragment_maps.replace(
                'lightMapTexel.rgb * lightMapIntensity', 'lightMapTexel.rgb * lightMapIntensity * uIndirectTint'))
          }
          material.customProgramCacheKey = () => 'poolcore-indirect-daycycle-v1'
          material.emissive.set(0)
          material.emissiveIntensity = 0
          material.shadowSide = THREE.DoubleSide
          for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
            if (texture) { texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy()); texture.needsUpdate = true }
          }
          material.needsUpdate = true
        }
        return material
      }
      object.material = Array.isArray(object.material) ? object.material.map(configure) : configure(object.material)
    })
    return { scene, materials, lightMap }
  }, [gltf, indirect, gl, cycle])
  useFrame(() => {
    resources.materials.forEach(material => {
      if (material instanceof THREE.MeshStandardMaterial) material.lightMapIntensity = Math.PI * cycle.indirectScale
    })
  }, -3.5)
  useEffect(() => {
    gl.shadowMap.needsUpdate = true
    return () => { resources.materials.forEach(material => material.dispose()); resources.lightMap.dispose() }
  }, [resources, gl])
  // Geometry and PBR maps belong to the loader cache; only our cloned materials are disposed here.
  return <primitive object={resources.scene} dispose={null} />
}


