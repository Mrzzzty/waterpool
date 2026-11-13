import * as T from 'three'

const screenWidth = 1.208
const screenHeight = screenWidth * 9 / 16

// The GLB's meshes are shared between rooms. Its empty nodes are the physical
// glass plane and the mouth of the tape transport, authored in Blender.
export function replayPart(library: T.Object3D, name: string) {
  const original = library.getObjectByName(name)
  if (!original) throw new Error('Missing playback model part: ' + name)
  const instance = original.clone(true)
  instance.traverse(child => { child.userData.sharedReplayPart = true })
  return instance
}

export class ReplayStation {
  readonly glass: T.Object3D
  readonly mouth: T.Object3D
  private cassette: T.Object3D
  private through: T.Mesh
  private uniforms = {
    uTime: { value: 0 }, uFrame: { value: null as T.Texture | null },
    uSignal: { value: 0 }, uThrough: { value: 0 }, uAspect: { value: 16 / 9 },
  }

  constructor(readonly root: T.Group, library: T.Object3D) {
    const machine = replayPart(library, 'ReplayStation')
    this.glass = machine.getObjectByName('GlassCentre')!
    this.mouth = machine.getObjectByName('CassetteMouth')!
    root.add(machine)
    this.cassette = replayPart(library, 'VHSCassette')
    this.cassette.visible = false
    this.mouth.add(this.cassette)

    const fragmentShader = `
      uniform sampler2D uFrame;
      uniform float uTime, uSignal, uThrough, uAspect;
      varying vec2 vUv; varying vec4 vClip;
      void main() {
        vec2 raster = floor(vUv * vec2(416., 234.));
        float field = floor(uTime * 22.);
        float grain = fract(sin(dot(mod(raster, 173.), vec2(17.13, 61.91)) + mod(field, 71.) * 2.3) * 4521.63);
        float band = exp(-28. * abs(fract(vUv.y - uTime * .18) - .5));
        float snow = .045 + .43 * grain * grain + .045 * band;
        vec2 screenUV = vClip.xy / vClip.w * .5 + .5;
        vec2 crop = min(vec2(1.), vec2((16./9.) / uAspect, uAspect / (16./9.)));
        vec2 imageUV = mix((vUv-.5)*crop+.5, screenUV, uThrough);
        imageUV.x += band * .002 * (1. - uThrough);
        vec3 frame = texture2D(uFrame, clamp(imageUV, 0., 1.)).rgb;
        vec3 playback = frame * (1. - .075 * (1. - uThrough) * sin(vUv.y * 740.)) + grain * .016 * (1. - uThrough);
        gl_FragColor = vec4(mix(snow * vec3(.92,.98,1.), playback, uSignal), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
    const material = (fullscreen: boolean) => new T.ShaderMaterial({
      uniforms: this.uniforms, fragmentShader,
      vertexShader: 'varying vec2 vUv; varying vec4 vClip; void main(){vUv=uv; vClip='
        + (fullscreen ? 'vec4(position.xy,0.,1.)' : 'projectionMatrix*modelViewMatrix*vec4(position,1.)')
        + ';gl_Position=vClip;}',
      depthWrite: !fullscreen, depthTest: !fullscreen,
    })
    const screen = new T.Mesh(new T.PlaneGeometry(screenWidth, screenHeight), material(false))
    this.glass.add(screen)
    // For the last near-clip distance the lens is inside the screen housing.
    // Keep showing the very same frame until the eye crosses the glass.
    this.through = new T.Mesh(new T.PlaneGeometry(2, 2), material(true))
    this.through.frustumCulled = false
    this.through.renderOrder = 100
    this.through.visible = false
    root.add(this.through)
  }

  setTime(t: number) { this.uniforms.uTime.value = t }

  load(frame: T.Texture, aspect: number) {
    this.uniforms.uFrame.value = frame
    this.uniforms.uAspect.value = aspect
    this.uniforms.uSignal.value = 0
    this.uniforms.uThrough.value = 0
    this.through.visible = false
  }

  insert(seconds: number) {
    const align = T.MathUtils.smootherstep(seconds, .65, 1.50)
    const seat = T.MathUtils.smootherstep(seconds, 1.50, 2.30)
    this.cassette.visible = seconds >= .65 && seat < 1
    this.cassette.position.set(.15 * (1-align), .13 * (1-align), .13 + .42*(1-align) - seat*.25)
    this.cassette.rotation.set(.13*(1-align), -.16*(1-align), -.08*(1-align))
    this.uniforms.uSignal.value = T.MathUtils.smoothstep(seconds, 2.38, 3.16)
  }

  crossGlass(distance: number, near: number) {
    this.uniforms.uThrough.value = 1 - T.MathUtils.smootherstep(distance, .19, .64)
    this.through.visible = distance < near * 1.22
  }

  idle() {
    this.cassette.visible = false
    this.through.visible = false
    this.uniforms.uSignal.value = 0
    this.uniforms.uThrough.value = 0
    this.uniforms.uFrame.value = null
  }
}

export class TapeShot {
  elapsed = 0
  startedSound = false
  readonly duration: number
  private eye: T.Vector3
  private rotation: T.Quaternion
  private slot: T.Vector3
  private glass: T.Vector3
  private deskEye: T.Vector3
  private screenEye: T.Vector3
  private forward: T.Vector3
  private look = new T.Vector3()
  private aimed = new T.Quaternion()
  private matrix = new T.Matrix4()

  constructor(readonly deck: ReplayStation, readonly tape: string, readonly enterMemory: boolean,
    camera: T.PerspectiveCamera, lines: number) {
    this.eye = camera.position.clone()
    this.rotation = camera.quaternion.clone()
    this.slot = deck.mouth.getWorldPosition(new T.Vector3())
    this.glass = deck.glass.getWorldPosition(new T.Vector3())
    this.forward = deck.glass.getWorldDirection(new T.Vector3())
    this.deskEye = this.slot.clone().addScaledVector(this.forward, 1.22)
    this.deskEye.y += .43
    this.screenEye = this.glass.clone().addScaledVector(this.forward, 1.38)
    this.duration = 2.4 + lines * 4.6 + 1.45
  }

  update(camera: T.PerspectiveCamera, dt: number) {
    this.elapsed = Math.min(this.elapsed + dt, this.duration)
    const t = this.elapsed
    this.deck.insert(t)
    const approach = T.MathUtils.smootherstep(t, 0, 1.25)
    camera.position.lerpVectors(this.eye, this.deskEye, approach)
    this.look.copy(this.slot)
    if (t > 2.3) {
      const tilt = T.MathUtils.smootherstep(t, 2.3, 4.25)
      camera.position.lerpVectors(this.deskEye, this.screenEye, tilt)
      this.look.lerp(this.glass, tilt)
    }
    if (this.enterMemory && t > 4.25) {
      const glide = T.MathUtils.smootherstep(t, 4.25, this.duration)
      const distance = T.MathUtils.lerp(1.38, -.055, glide)
      camera.position.copy(this.glass).addScaledVector(this.forward, distance)
      this.look.copy(camera.position).sub(this.forward)
      this.deck.crossGlass(distance, camera.near)
    }
    this.matrix.lookAt(camera.position, this.look, camera.up)
    this.aimed.setFromRotationMatrix(this.matrix)
    camera.quaternion.slerpQuaternions(this.rotation, this.aimed, approach)
    if (!this.enterMemory && t > this.duration - 1.35) {
      const back = T.MathUtils.smootherstep(t, this.duration-1.35, this.duration)
      camera.position.lerp(this.eye, back)
      camera.quaternion.slerp(this.rotation, back)
    }
    camera.updateMatrixWorld()
  }
}

