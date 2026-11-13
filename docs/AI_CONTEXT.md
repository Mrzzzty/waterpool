# 仓库导读（给 AI 阅读用）

本仓库是 **AUREOLE 池核** 的 Web 版：React 19 + @react-three/fiber + three.js 0.180 + Vite，Electron 只做桌面壳。目标是第一人称"池核 / Poolcore"探索空间。

## 先看这里

**整个仓库的纯文本代码只有约 1.2 MB（~32 万 token），二进制资产约 72 MB。**
如果要通读代码，请只读文本文件，跳过下面"不要读的文件"一节。

如果当前工具是按整包 zip 读取仓库，会被二进制资源撑爆，导致后面的源码读不全。请按 raw 链接逐个读取，例如
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

## 已删除的模块（不要再假设它们存在）

以下几点曾多次误导外部评审，因为它们看起来像现役系统，实际从未接入运行时：

| 曾经的文件 | 真实状态 |
|---|---|
| `src/story/bakedBathLighting.ts` | 无任何调用，构建时被 tree-shake。`BATH_HDR_LIGHTING` 只在此处定义，因此所有 `#ifdef BATH_HDR_LIGHTING` 分支从不编译 |
| `src/story/BathWallReflection.ts` | 从未实例化，主隔断墙没有实时平面反射 |
| `src/story/assets/bath-light-*.exr` | 伊始没有任何代码加载，只是烘焙中间产物 |
| `src/story/assets/bath-probe-*.exr`、`bath-probe-visibility.*` | 只有上面那个未接入的模块引用 |

**剧情模式的实际光照路径是 `storyArchitecture` → `prepareAtlas`，读顶点色 `color`，与 `world/` 同一套逐顶点 Cycles 烘焙。项目里不存在已跑通的纹素级 lightmap。**

## 真实在用的部分

- 顶点烘焙 GI：`src/world/AtlasMaterial.ts`（`atlasGI² × 4` 解码）
- 水面光学：`src/story/StoryWater.ts` + `src/story/optics/WaterShader.ts`（Reflector 镜像、四次屏幕空间折射迭代、同源浅波焦散）
- 瓷砖材质：`src/story/optics/TileShader.ts` + `ceramic.ts`
- AgX 显示：`src/story/BlenderDisplay.tsx`（65³ 3D LUT，两处挂载）

## 渲染诊断开关

| 参数 / 环境变量 | 作用 |
|---|---|
| `?gi=off` | 把烘焙 GI 权重归零，隔离直射光 |
| `?giWeight=2` | 缩放烘焙 GI 权重，默认 1（等价原设计 π） |
| `?sunMul=0.5` | 缩放剧情场景方向光强度 |
| `POOL_GI_PASSES=0` | 重新导出时控制 GI 平滑遍数 |
| `POOL_LIGHT_PROBE=1` | 截图脚本额外输出运行时灯光列表 |
| `POOL_GI_PROBE=1` | 截图脚本输出材质的编译期 uniform |

### 一个必须知道的坑

**three.js 不会上传内置材质在 `onBeforeCompile` 里新增的自定义 uniform。** `materialProperties.uniforms` 只来自 `ShaderLib[shaderID].uniforms`，所以 `shader.uniforms.myValue = {value}` 在 JS 侧读得到、GPU 侧恒为 0。

烘焙 GI 的增益曾因此长期失效：`irradiance += atlasLight * atlasGain` 中的 `atlasGain` 永远是 0，Cycles 烘焙实际上从未参与着色。现在的做法是把增益编码进内建 uniform：

```glsl
irradiance += atlasLight * (emissive.r * 40.);   // emissive.r 存 gain/40
totalEmissiveRadiance = vec3(0.);                 // 紧随其后清零，避免发光
```

- Blender 倒角：`scripts/blender_current_scene.py` 的 12 mm BEVEL

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
