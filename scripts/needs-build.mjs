// 判断 dist 是否比源码旧。退出码 0 = 无需构建，1 = 需要构建。
// 启动脚本用它决定是直接拉起窗口还是先跑一次 npm run build。
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const STAMP = 'dist/index.html'
const WATCH_DIRS = ['src']
const WATCH_FILES = ['index.html', 'story.html', 'vite.config.ts', 'package.json']

let built
try {
  built = statSync(STAMP).mtimeMs
} catch {
  console.log('还没有构建产物')
  process.exit(1)
}

let newest = 0
let newestFile = ''

function note(file) {
  const time = statSync(file).mtimeMs
  if (time > newest) {
    newest = time
    newestFile = file
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else note(full)
  }
}

for (const dir of WATCH_DIRS) walk(dir)
for (const file of WATCH_FILES) {
  try {
    note(file)
  } catch {}
}

if (newest > built) {
  console.log(`源码有更新：${newestFile}`)
  process.exit(1)
}

process.exit(0)
