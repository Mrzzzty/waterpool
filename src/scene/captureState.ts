import * as THREE from 'three'
// Shared only with the main-camera depth pass. Volumes are excluded from both water captures.
export const captureExcluded=new Set<THREE.Object3D>()
export const captureUniforms={
 uOpaqueDepth:{value:null as THREE.DepthTexture|null},uScreenSize:{value:new THREE.Vector2(1,1)},
 uCameraNear:{value:.08},uCameraFar:{value:180},uHasDepth:{value:0},
}
