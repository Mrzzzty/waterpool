import * as T from 'three'

export const lightRecordLines = [
  '1991 年 5 月 12 日　北井采光复测。',
  '14:00　晴，水底可见窗格。日照角一栏空着。',
  '16:30　换表复测。背面的铅笔印很重，还是空着。',
]

// The player can read the card at the stand or hold the existing 2× zoom.
export const filedRecordLines = [
  '归档副联。日期还是五月十二日。',
  '14:00，六十五度。16:30，也是六十五度。',
  '角度用打字机补过。下面的原表连压痕都没有。',
]

export function lightRecord(filed=false){
  const canvas=document.createElement('canvas')
  canvas.width=576;canvas.height=712
  const ink=canvas.getContext('2d')!
  ink.fillStyle=filed?'#c8d3c6':'#dbd8c4';ink.fillRect(0,0,576,712)
  ink.strokeStyle='#69817b';ink.lineWidth=2;ink.strokeRect(24,24,528,664)
  const print=(value:string,x:number,y:number,size:number,color='#364b48')=>{
    ink.fillStyle=color;ink.font=`${size}px "Microsoft YaHei",sans-serif`;ink.fillText(value,x,y)
  }
  print(filed?'设施科　／　归档副联':'设施科　／　北井',48,88,24);print('采 光 复 测',44,170,54)
  print('1991.05.12',46,223,24)
  const columns=[44,174,305,531]
  for(const x of columns){ink.beginPath();ink.moveTo(x,276);ink.lineTo(x,493);ink.stroke()}
  for(const y of [276,339,416,493]){ink.beginPath();ink.moveTo(44,y);ink.lineTo(531,y);ink.stroke()}
  for(const [i,t] of ['时刻','天气','日照角'].entries())print(t,columns[i]+17,319,24)
  print('14:00',57,390,30);print('晴',193,390,28)
  print('16:30',57,468,30);print('晴',193,468,28)
  if(filed){print('65°',336,390,30,'#715658');print('65°',336,468,30,'#715658')}
  print(filed?'复核意见　／　沿用原馆数值':'复核意见　／　更换仪器再测',46,553,25)
  print('归档附件　录像带 01',46,637,24,'#7b5043')
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace
  return new T.Mesh(new T.PlaneGeometry(.70,.86),new T.MeshStandardMaterial({map:texture,roughness:.92,emissiveMap:texture,emissive:'#88816e'}))
}
