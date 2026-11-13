import * as T from 'three'

export type Wing='roam'|'story'
const frames={roam:{x:21.25,y:.2,z:4.3,s:1},story:{x:0,y:0,z:35.2,s:-1}} as const
export type Crossing={into:Wing;eye:T.Vector3;rotation:T.Quaternion;keys:Set<string>;sound:boolean}
// Both wings own the same two offset screens. The seam lies between them,
// facing ceramic in either direction; hysteresis permits turning back.
const walls=[
  [-2.08,-1.94,-3.2,3.2],[1.94,2.08,-3.2,3.2],
  [-.52,2.05,-3.2,-3.04],[-2.05,.52,3.04,3.2],
  [-.55,2.04,-1.12,-.94],[-2.04,.55,.94,1.12],
]
export function nearLobby(w:Wing,x:number,z:number,r=12){
  const f=frames[w];return Math.abs(x-f.x)<r&&Math.abs(z-f.z)<r
}
export function inLobby(w:Wing,x:number,z:number){
  const f=frames[w];return Math.abs(x-f.x)<2.08&&Math.abs(z-f.z)<3.23
}
export function lobbyBlocked(w:Wing,x:number,z:number){
  if(!nearLobby(w,x,z,3.6))return false
  const f=frames[w],u=(x-f.x)*f.s,v=(z-f.z)*f.s,r=.19
  return walls.some(([a,b,c,d])=>u>a-r&&u<b+r&&v>c-r&&v<d+r)
}
export function crossed(w:Wing,p:T.Vector3){
  const f=frames[w],u=(p.x-f.x)*f.s
  return Math.abs(p.z-f.z)<.78&&Math.abs(u)<.65&&(w==='roam'?u>.17:u<-.17)
}
export function rebase(w:Wing,c:T.PerspectiveCamera,keys:Set<string>,sound:boolean):Crossing {
  const into=w==='roam'?'story':'roam',a=frames[w],b=frames[into]
  const eye=new T.Vector3(b.x-(c.position.x-a.x),c.position.y+b.y-a.y,b.z-(c.position.z-a.z))
  const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI).multiply(c.quaternion)
  return {into,eye,rotation,keys:new Set(keys),sound}
}
export function makeLobby(w:Wing){
  const f=frames[w],root=new T.Group();root.name='North transfer / offset footbath'
  root.position.set(f.x,f.y,f.z);root.rotation.y=f.s===1?0:Math.PI
  const unit=new T.BoxGeometry(),wallMat=new T.ShaderMaterial({
    vertexShader:`varying vec3 p,n;void main(){vec4 q=instanceMatrix*vec4(position,1.);p=q.xyz;n=normal;gl_Position=projectionMatrix*modelViewMatrix*q;}`,
    fragmentShader:`varying vec3 p,n;void main(){vec2 uv=abs(n.y)>.5?p.xz:(abs(n.x)>.5?p.zy:p.xy);
      uv*=vec2(4.,6.);vec2 d=.5-abs(fract(uv)-.5);vec2 e=smoothstep(vec2(.014)-fwidth(uv)*.4,vec2(.029)+fwidth(uv)*.4,d);
      vec3 glaze=mix(vec3(.53,.59,.52),vec3(.21,.35,.32),1.-smoothstep(.93,.95,p.y));
      float slot=exp(-.45*dot(p.xz-vec2(-1.26,-2.9),p.xz-vec2(-1.26,-2.9)))+exp(-.43*dot(p.xz-vec2(1.26,2.9),p.xz-vec2(1.26,2.9)));
      float light=.18+.47*slot+.10*smoothstep(.1,2.3,p.y);
      gl_FragColor=vec4(glaze*light*(.76+.24*min(e.x,e.y)),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`})
  const mesh=new T.InstancedMesh(unit,wallMat,walls.length+2)
  walls.forEach(([a,b,c,d],i)=>mesh.setMatrixAt(i,new T.Matrix4().makeScale(b-a,2.65,d-c).setPosition((a+b)/2,1.325,(c+d)/2)))
  mesh.setMatrixAt(walls.length,new T.Matrix4().makeScale(4.16,.1,6.4).setPosition(0,-.035,0))
  mesh.setMatrixAt(walls.length+1,new T.Matrix4().makeScale(4.16,.15,6.4).setPosition(0,2.58,0));mesh.computeBoundingSphere();root.add(mesh)
  const sign=(name:string,x:number,z:number,rot:number)=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=116
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#c5cec0';ctx.fillRect(0,0,512,116)
    ctx.fillStyle='#354b47';ctx.font='36px "Microsoft YaHei", sans-serif';ctx.fillText(name,25,72)
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace
    const m=new T.Mesh(new T.PlaneGeometry(1.36,.31),new T.MeshBasicMaterial({map}))
    m.position.set(x,1.62,z);m.rotation.y=rot;root.add(m)
  }
  sign('北廊  /  日光厅　→',.66,-3.212,Math.PI);sign('←　更衣休息廊',-.68,3.212,0)
  return root
}
export function disposeLobby(root:T.Group){
  root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();o.material.map?.dispose();o.material.dispose();if(o instanceof T.InstancedMesh)o.dispose()}})
}
