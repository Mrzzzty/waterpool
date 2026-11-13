import type {WebGLRenderer} from 'three'
import type {Quality} from '../scene/PoolWater'

const selected=new WeakMap<WebGLRenderer,Quality>()
export function setCaptureQuality(renderer:WebGLRenderer,quality:Quality){selected.set(renderer,quality)}
const budgets={
  high:{interval:1/30,scale:.9,edge:1920,pixels:2073600,mirrorScale:.8,mirrorEdge:1536,mirrorPixels:1179648},
  balanced:{interval:1/24,scale:.72,edge:1280,pixels:921600,mirrorScale:.65,mirrorEdge:1024,mirrorPixels:655360},
  low:{interval:1/18,scale:.55,edge:960,pixels:518400,mirrorScale:.5,mirrorEdge:768,mirrorPixels:393216},
} as const
export function captureBudget(renderer:WebGLRenderer){return budgets[selected.get(renderer)??'high']}
