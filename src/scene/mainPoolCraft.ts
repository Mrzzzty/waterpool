import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { windows } from './layout'

/** Authored main-hall junctions. One baked batch; no lights or floating decals. */
export function buildMainPoolCraft(){
  const parts:THREE.BufferGeometry[]=[]
  const add=(source:THREE.BufferGeometry,finish:number)=>{
    const g=source.index?source.toNonIndexed():source;if(g!==source)source.dispose()
    const n=g.getAttribute('position').count
    g.setAttribute('aFinish',new THREE.Float32BufferAttribute(new Float32Array(n).fill(finish),1))
    g.setAttribute('aFinishBase',new THREE.Float32BufferAttribute(new Float32Array(n).fill(.24),1))
    g.setAttribute('aOcclusion',new THREE.Float32BufferAttribute(new Float32Array(n).fill(1),1));parts.push(g)
  }
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,finish=3)=>
    add(new RoundedBoxGeometry(w,h,d,2,Math.min(.025,w/4,h/4,d/4)).translate(x,y,z),finish)
  for(const w of windows.filter(w=>w.axis==='x'&&w.at===8&&w.from>-12&&w.to<8)){
    const mid=(w.from+w.to)/2,width=w.to-w.from,height=w.top-w.bottom
    // A deep tapered reveal catches a gradient from the exterior court.
    const corners=[
      [[7.68,w.bottom-.18,w.from-.18],[8.14,w.bottom,w.from],[8.14,w.top,w.from],[7.68,w.top+.18,w.from-.18]],
      [[7.68,w.top+.18,w.to+.18],[8.14,w.top,w.to],[8.14,w.bottom,w.to],[7.68,w.bottom-.18,w.to+.18]],
      [[7.68,w.top+.18,w.from-.18],[8.14,w.top,w.from],[8.14,w.top,w.to],[7.68,w.top+.18,w.to+.18]],
      [[7.68,w.bottom-.18,w.to+.18],[8.14,w.bottom,w.to],[8.14,w.bottom,w.from],[7.68,w.bottom-.18,w.from-.18]],
    ]
    for(const quad of corners){
      const g=new THREE.BufferGeometry(),v=[...quad[0],...quad[1],...quad[2],...quad[0],...quad[2],...quad[3]]
      g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2));g.computeVertexNormals();add(g,2)
    }
    for(const z of [w.from-.23,w.to+.23])box(.10,height+.56,.10,7.68,(w.bottom+w.top)/2,z)
    box(.10,.10,width+.56,7.68,w.top+.23,mid)
    box(.65,.11,width+.64,7.87,w.bottom-.23,mid)
  }
  // Rounded tiled wall-to-deck coves: restrained scale, above the dry bank only.
  for(const x of [-7.85,7.85]){
    const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(.15,0)
    shape.quadraticCurveTo(0,0,0,.15);shape.closePath()
    const g=new THREE.ExtrudeGeometry(shape,{depth:19.5,curveSegments:12,bevelEnabled:false})
    if(x>0)g.rotateY(Math.PI)
    g.translate(x,.245,x>0?7.75:-11.75);add(g,1)
  }
  // A quiet stone threshold follows the two portal jambs; the water port stays open.
  for(const x of [2.04,7.96])box(.14,1.12,.86,x,.80,-12)
  const result=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());return result
}
