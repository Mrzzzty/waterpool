// 通过 Blender 的 "MCP for Blender" 插件（默认 127.0.0.1:9876）执行命令。
// 用法：node scripts/blender-mcp.mjs <command> ['{"json":"params"}']
// 例：  node scripts/blender-mcp.mjs get_scene_info
//       node scripts/blender-mcp.mjs execute_blender_code '{"code":"print(1)"}'
import net from 'node:net'

const HOST = process.env.BLENDER_MCP_HOST || '127.0.0.1'
const PORT = Number(process.env.BLENDER_MCP_PORT || 9876)
const TIMEOUT = Number(process.env.BLENDER_MCP_TIMEOUT || 300000)

const command = process.argv[2]
if (!command) {
  console.error('用法：node scripts/blender-mcp.mjs <command> [params-json]')
  process.exit(2)
}

let params = {}
if (process.argv[3]) {
  try {
    params = JSON.parse(process.argv[3])
  } catch (error) {
    console.error('参数不是合法 JSON：', error.message)
    process.exit(2)
  }
}

const socket = net.connect(PORT, HOST)
socket.setNoDelay(true)

let buffer = ''
let settled = false

function finish(code, payload) {
  if (settled) return
  settled = true
  if (payload !== undefined) console.log(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2))
  socket.destroy()
  process.exit(code)
}

const timer = setTimeout(() => finish(1, '超时：Blender 没有在限定时间内返回'), TIMEOUT)

socket.on('connect', () => {
  socket.write(JSON.stringify({ type: command, params }))
})

socket.on('data', chunk => {
  buffer += chunk.toString('utf8')
  // 插件不保证以换行结尾，能整体解析成功就当作一帧响应
  try {
    const response = JSON.parse(buffer)
    clearTimeout(timer)
    if (response.status === 'error') finish(1, `Blender 报错：${response.message}`)
    else finish(0, response.result ?? response)
  } catch {
    // 还没收完，继续等
  }
})

socket.on('error', error => {
  clearTimeout(timer)
  finish(1, `连接失败：${error.message}`)
})

socket.on('close', () => {
  clearTimeout(timer)
  if (!settled) finish(1, `连接被关闭，未收到完整响应。已收到 ${buffer.length} 字节：${buffer.slice(0, 300)}`)
})
