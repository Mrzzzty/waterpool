# 仓库导读（给 AI 阅读用）

本仓库是 **AUREOLE 池核** 的 Web 版：React 19 + @react-three/fiber + three.js 0.180 + Vite，Electron 只做桌面壳。目标是第一人称"池核 / Poolcore"探索空间。

## 先看这里

**整个仓库的纯文本代码只有约 1.2 MB（~32 万 token），二进制资产约 72 MB。**
如果要通读代码，请只读文本文件，跳过下面"不要读的文件"一节。

如果当前工具是按整包 zip 读取仓库，会被二进制资源撑爆，导致后面的源码读不全。更稳的做法有两种：

1. 关联 `source` 分支（只有文本代码，约 1 MB）；
2. 或按 raw 链接逐个读取，例如
   `https://raw.githubusercontent.com/Mrzzzty/waterpool/main/src/world/mapPlan.ts`

## 目录结构

```
src/
  App.tsx                    应用入口与 ?preview= 路由
  scene/                     主场景：相机、移动、水面、天空、材质、房间程序
  world/                     地图数据与编译：mapPlan → compileMap → GLB 装配
  story/                     剧情三幕（独立入口 story.html）
  connection/                区域间连通与门闸
  assets/                    运行时贴图与音效（二进制）
  world/assets/              建筑 GLB（二进制，约 12 MB）
public/
  assets/pool-surfaces/      池面 PBR 贴图（二进制）
  assets/open-surfaces/      干区贴图（二进制）
scripts/                     构建与资产生成脚本（Blender / GLB 打包）
docs/                        设计文档与调研
```

## 推荐阅读顺序

**1. 地图与程序化生成**

- `src/world/mapPlan.ts` — 全图唯一数据源：房间、门洞、水盆、实体、采光井、机位
- `src/world/compileMap.ts` — 把上面的数据切成墙、地板、开口
- `src/scene/liminalLayout.ts` — 运行时布局抽样（地面高度、水体范围）
- `src/scene/roomPrograms.ts` — 各房间的陈设与滑梯路径

**2. 渲染与水面**

- `src/scene/PoolWater.tsx` — 水面渲染、折射/反射捕获、与水场交互
- `src/world/AtlasMaterial.ts` — 建筑材质：顶点烘焙 GI 解码、法线强度分档、焦散
- `src/world/atlasAssets.ts` — 四组 GLB 的装配
- `src/scene/poolWaves.ts`、`src/scene/waterState.ts` — 波场与水位状态

**3. 光照与天空**

- `src/scene/DaylightSky.tsx` — 天空与太阳
- `src/scene/skyAppearance.ts` — 三个时段的外观参数
- `src/scene/surfaceLibrary.ts` — 区域贴图集

**4. 剧情（可选，与主场景独立）**

- `src/story/StoryMode.tsx` — 三幕流程
- `src/story/Inspection.ts` — 交互、存档、结算
- `src/story/StoryWater.ts`、`src/story/optics/*` — 剧情专用水面与光学

## 不要读的文件

这些是二进制资产，读出来是乱码，且体积占满上下文：

| 路径 | 说明 | 体积 |
|---|---|---|
| `src/world/assets/*.glb` | 建筑模型 | 12 MB |
| `src/story/assets/*` | 剧情 EXR 光照与道具 | 21 MB |
| `src/assets/**/*.png` | 运行时贴图 | 11 MB |
| `src/assets/audio/*.wav` | 脚步音效 | 0.5 MB |
| `public/assets/**` | PBR 贴图、示例模型 | 27 MB |
| `package-lock.json` | 依赖锁，无阅读价值 | 239 KB |

## 运行方式

```powershell
npm install
npm run dev      # 主场景，浏览器打开
npm run build    # tsc -b && vite build && node scripts/build-story.mjs
npm run desktop  # 构建后用 Electron 打开
```

主场景入口 `index.html`，剧情入口 `story.html`。`?preview=quiet` / `?preview=sample` 是内部对照模式。

## 已知边界

- 地图几何在 `mapPlan.ts` 里定义，实际网格由 Blender 导出，仓库不含 `.blend` 源文件。
- 光照是 Blender 端 Cycles 逐顶点烘焙，运行时只做解码；仓库不含烘焙工程。
- 水面用屏幕空间折射 + 反射探针，不是光追。
