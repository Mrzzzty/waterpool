// Blender 统一入口。默认走无界面批处理（-b），不依赖 GUI、不吃 socket、不受 shell 转义影响。
//
//   node scripts/blender.mjs info
//   node scripts/blender.mjs run tools/props.py [--blend scene.blend] [--factory]
//   node scripts/blender.mjs shot scene.blend out.png [--w 1760] [--h 1000] [--samples 96]
//
// 环境变量 BLENDER_PATH 可以覆盖可执行文件位置。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const CANDIDATES = [
  process.env.BLENDER_PATH,
  'D:/blender/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe',
  '/Applications/Blender.app/Contents/MacOS/Blender',
  '/usr/bin/blender',
]

function findBlender() {
  for (const candidate of CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

function parse(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i += 1
    }
  }
  return { positional, flags }
}

const blender = findBlender()
const { positional, flags } = parse(process.argv.slice(2))
const command = positional[0]

if (!blender) {
  console.error('找不到 Blender。设一个 BLENDER_PATH 环境变量指向 blender.exe 即可。')
  process.exit(2)
}

if (!command || command === 'info') {
  run(['-b', '--factory-startup', '-noaudio', '--python-expr',
    'import bpy,sys;print("VERSION",bpy.app.version_string);print("PY",sys.version.split()[0]);print("ENGINE",bpy.context.scene.render.engine)'])
} else if (command === 'run') {
  const script = positional[1]
  if (!script) fail('用法：blender.mjs run <script.py> [--blend x.blend] [--factory]')
  const args = ['-b', '--factory-startup', '-noaudio']
  if (flags.blend) args.splice(1, 1, resolve(flags.blend))
  args.push('--python', resolve(script))
  run(args)
} else if (command === 'shot') {
  const scene = positional[1]
  const out = positional[2]
  if (!scene || !out) fail('用法：blender.mjs shot <scene.blend> <out.png> [--w 1760] [--h 1000] [--samples 96]')
  shot(resolve(scene), resolve(out), flags)
} else if (command === 'export') {
  const scene = positional[1]
  const out = positional[2]
  if (!scene || !out) fail('用法：blender.mjs export <scene.blend> <out.glb> [--selected]')
  exportGlb(resolve(scene), resolve(out), flags)
} else {
  fail(`未知子命令：${command}`)
}

function fail(message) {
  console.error(message)
  process.exit(2)
}

function run(args) {
  const child = spawn(blender, args, { stdio: 'inherit' })
  child.on('exit', code => process.exit(code ?? 0))
  child.on('error', error => {
    console.error('启动失败：', error.message)
    process.exit(1)
  })
}

function shot(scene, out, flags) {
  const width = Number(flags.w || 1760)
  const height = Number(flags.h || 1000)
  const samples = Number(flags.samples || 96)
  const engine = flags.engine || 'BLENDER_EEVEE'
  mkdirSync(dirname(out), { recursive: true })

  const script = [
    'import bpy',
    'sc = bpy.context.scene',
    `sc.render.engine = ${JSON.stringify(engine)}`,
    `sc.render.resolution_x = ${width}`,
    `sc.render.resolution_y = ${height}`,
    'sc.render.resolution_percentage = 100',
    'sc.render.image_settings.file_format = "PNG"',
    'try:',
    `    sc.eevee.taa_render_samples = ${samples}`,
    'except Exception as exc:',
    '    print("eevee", exc)',
    `sc.render.filepath = ${JSON.stringify(out)}`,
    'if not sc.camera:',
    '    raise SystemExit("场景里没有相机")',
    'bpy.ops.render.render(write_still=True)',
    'print("SHOT", sc.render.filepath)',
  ].join('\n')

  const scriptPath = resolve('.work-backup/tmp/blender-shot.py')
  mkdirSync(dirname(scriptPath), { recursive: true })
  writeFileSync(scriptPath, script, 'utf8')
  run(['-b', scene, '-noaudio', '--python', scriptPath])
}

function exportGlb(scene, out, flags) {
  const selected = flags.selected ? 'True' : 'False'
  mkdirSync(dirname(out), { recursive: true })
  const script = [
    'import bpy',
    `path = ${JSON.stringify(out)}`,
    'bpy.ops.export_scene.gltf(',
    '    filepath=path,',
    '    export_format="GLB",',
    `    use_selection=${selected},`,
    '    export_apply=True,',
    '    export_yup=True,',
    '    export_cameras=False,',
    '    export_lights=False,',
    ')',
    'print("GLB", path)',
  ].join('\n')

  const scriptPath = resolve('.work-backup/tmp/blender-export.py')
  mkdirSync(dirname(scriptPath), { recursive: true })
  writeFileSync(scriptPath, script, 'utf8')
  run(['-b', scene, '-noaudio', '--python', scriptPath])
}
