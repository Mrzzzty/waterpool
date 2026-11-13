# 池核开源实现研究与接入方案

后续实施更新：首段泳池重构已接入本文的部分方法，见 [POOL_FIRST_IMPLEMENTATION.md](POOL_FIRST_IMPLEMENTATION.md)。以下正文保留研究完成时的状态与选型判断。

记录日期：2026-11-04。设计依据：[以泳池为中心的改进计划](POOL_FIRST_PLAN.md)。

状态：已取得 3 个 Git 仓库的研究检出和 Vackrooms 的 15 个固定提交文件，阅读了以下核心实现与许可证。源码研究完成；本轮没有将上游代码接入运行场景，没有安装新依赖，也没有改动现有 UI、池体几何或水材质。后文“采用”“接入”均指下一阶段方案。

## 1. 研究结论

最应借鉴的是几套数据之间的一致性：同一条池岸轮廓生成池体、岸边和碰撞；同一套波形驱动水面、折射和焦散；空间连接以明确的开口和可达路线约束。当前场景的首要改造仍然是释放完整主泳池，让台阶、池底深浅和转角水道构成画面。

开源演示的视觉效果通常有明确适用范围。单个规则池的解析求交、固定池深的水色和整片平面的焦散，不能直接等同于多房间、多水深、带柱子和墙体遮挡的池核光学。下面按实际代码记录适用条件。

## 2. 已取得的源码与版本

下载清单和逐文件 SHA-256 见 [research/sources.lock.json](../research/sources.lock.json)，本地目录说明见 [research/README.md](../research/README.md)。

- **jeantimex/threejs-water**：提交 `f35a700a16fe386beac997806ed4471018c93ef7`。本地 `research/upstream/threejs-water`，浅克隆、稀疏检出 `src`、`public` 及根目录文件。MIT；许可证同时保留 Evan Wallace（2011）与 Yong Su（2026）署名。
- **evanw/webgl-water**：提交 `73eda8be832b649367b25ea5690c1f0181bb56ad`。本地 `research/upstream/webgl-water`，浅克隆。核心 JS 文件头明确声明 MIT 和 Evan Wallace 署名；未发现单独 LICENSE 文件，不据此推断所有 JPG 素材的独立授权。
- **marian42/wavefunctioncollapse**：提交 `8750c537e6c8f95806ba709e2ae5d940fd51bff3`。本地 `research/upstream/wavefunctioncollapse`，浅克隆、稀疏检出 `Assets/Code`、`Packages` 及 Git cone 模式带入的祖先目录文件。MIT，Marian Kleineberg（2018）。
- **pablostanley/vackrooms**：提交 `ccd3313417eb0a8d7500e96f99a03f2167ffeeba`。Git 部分克隆未能展开源码，保留在 `research/upstream/vackrooms`，不视为完整可用检出。实际研究使用 `research/snapshots/vackrooms-ccd3313` 的 15 个源码、说明和许可证文件，均从同一固定提交的 raw URL 下载。该快照不能直接运行整个应用。源码 MIT，Pablo Stanley（2026）；音频另见第 8 节。

三个研究检出的 Git 工作区状态已检查，无本轮源码修改。没有运行这些仓库的安装、开发、部署或测试脚本。这里记录的是静态源码研究，不声称已复现各演示的运行表现。

## 3. 水面研究：Evan Wallace 与 ThreeJS Water

### 3.1 效果来自共享波场

[原版 water.js](https://github.com/evanw/webgl-water/blob/73eda8be832b649367b25ea5690c1f0181bb56ad/water.js) 使用两张 256×256 纹理交替读写。R 通道记录水面高度，G 通道记录竖直速度，BA 记录法线的水平分量。四邻域高度差推动速度，再更新高度；局部扰动写进同一波场。

[新版 WaveSimulation.frag](https://github.com/jeantimex/threejs-water/blob/f35a700a16fe386beac997806ed4471018c93ef7/src/shaders/WaveSimulation.frag) 和 [WaterNormal.frag](https://github.com/jeantimex/threejs-water/blob/f35a700a16fe386beac997806ed4471018c93ef7/src/shaders/WaterNormal.frag) 延续该方法，并考虑池宽、池长对采样间距的影响。

这使一圈涟漪同时改变镜面反射、透水视线和聚光位置。若水面波纹与水底光斑各自播放无关动画，就会缺少这种对应关系。

源码核对：新版 `Water.ts` 的一处注释把 G 描述成“上一帧高度”，但实际更新 shader 的 G 是速度。本报告以 shader 运算为准。

**本项目接入：**

- 当前 `poolWaves.ts` 已共享解析波形与梯度，`WaterCaustics.ts` 已使用它；保留这一统一入口。
- 第一阶段可先叠加少量脚步涟漪，水面和焦散读取同一扰动。GPU 高度场作为近处主池的后续候选。
- 上游每次动画更新固定做两次波传播，见 [WaterApp.ts](https://github.com/jeantimex/threejs-water/blob/f35a700a16fe386beac997806ed4471018c93ef7/src/app/WaterApp.ts)。移植时应改为固定时间步和有限补帧，避免波速随显示帧率变化。
- 不把一张 256×256 高度场直接拉伸覆盖整个约 160 m 长场景。若接入模拟，需要限定近场范围或按水域组织；异形岸线还需要水域遮罩和边界处理。
- 这是高度场水面方法，不是完整三维流体求解器。

### 3.2 焦散关键在接收面

[原版 renderer.js](https://github.com/evanw/webgl-water/blob/73eda8be832b649367b25ea5690c1f0181bb56ad/renderer.js) 与新版 [RoundedBoxCaustics.vert](https://github.com/jeantimex/threejs-water/blob/f35a700a16fe386beac997806ed4471018c93ef7/src/shaders/RoundedBoxCaustics.vert) 将平水面和波动水面的折射光线投到池体边界，再将其编码到焦散纹理。[对应 fragment shader](https://github.com/jeantimex/threejs-water/blob/f35a700a16fe386beac997806ed4471018c93ef7/src/shaders/RoundedBoxCaustics.frag) 用映射前后局部面积的比值近似聚光亮度。

当前项目已有带分母保护和亮度限制的面积比实现；主要限制是投影接收深度固定为 0.9 m。把对比度继续调高不会让其他深度自动正确。

**本项目接入：**

1. 从池盆数据取得真实池底、踏步深度和湿区遮罩。
2. 先让主池底与台阶获得对应深度的聚光投影，乘上太阳照入和建筑遮挡的结果。
3. 墙面水光单独处理接收方向与遮挡；初期近似明确标注，不能用一张固定平面图宣称任意表面物理正确。
4. 不复制上游无保护的 `oldArea / newArea`。继续控制尖峰、远处闪烁与更新频率。

### 3.3 圆角池与复杂网格有不同边界

新版 README 用 SDF 概括圆角池，但当前 [RoundedBoxWaterAbove.frag](https://github.com/jeantimex/threejs-water/blob/f35a700a16fe386beac997806ed4471018c93ef7/src/shaders/RoundedBoxWaterAbove.frag) 实际通过直边、四个圆弧与 Y 范围做解析求交；环面结对象另有 SDF 步进。该 shader 仍然假设一个有宽、长、深度和圆角半径的池体，不能直接覆盖互通的任意池室。

[MeshWaterRayTracing.ts](https://github.com/jeantimex/threejs-water/blob/f35a700a16fe386beac997806ed4471018c93ef7/src/water/MeshWaterRayTracing.ts) 用 `three-mesh-bvh` 构建三角形层次结构和属性纹理。[MeshWaterOptics.glsl](https://github.com/jeantimex/threejs-water/blob/f35a700a16fe386beac997806ed4471018c93ef7/src/shaders/MeshWaterOptics.glsl) 查询实例中的最近命中，插值法线与 UV；此实现对同一网格复用层次结构，实例变化主要是平移，并绑定其对象着色逻辑。它没有自动解决整个房间的材质、阴影和全场景反射。

上游水面 Fresnel 使用艺术化底值 0.25 和三次幂，当前项目已使用更接近空气—水界面的 0.0204 与五次幂。没有必要为了复用演示而覆盖本项目这部分。

**判断：** 学习统一几何和光学坐标的方法；首轮继续使用已有场景捕获与平面反射，复杂网格 BVH 光学等主池构图确定后再评估。

## 4. Vackrooms：泳池轮廓比楼层数量更值得借鉴

### 4.1 从同一轮廓生成可见池体与可走边界

[pool-shape.ts](https://github.com/pablostanley/vackrooms/blob/ccd3313417eb0a8d7500e96f99a03f2167ffeeba/src/lib/game/pool-shape.ts) 将泳池组织为局部米制坐标中的多边形，提供矩形、L 形、圆角等轮廓及偏移、点在多边形内判断。

[pool-build.ts](https://github.com/pablostanley/vackrooms/blob/ccd3313417eb0a8d7500e96f99a03f2167ffeeba/src/lib/game/pool-build.ts) 从该轮廓生成：

- 带池洞的干岸与池底；
- 连续挤出的池沿/池壁；
- 与池沿分段对应的凸碰撞体；
- 裁到池内的细分水面。

它的价值在于数据一致。这个快照的池底仍统一为 -1.4 m、水面为 -0.18 m，不能视为已经解决多水深。水网格通过把外部顶点拉到轮廓、删除全干三角形近似裁切，也需要检查凹角和狭窄通道。

**本项目接入：** 新增明确的池盆描述，池岸轮廓、水位、池底剖面、入水台阶和湿/干连接口属于同一份数据。保持现有外墙合并去内部面的能力，补上池壁、池沿及水域边界的统一生成。现有轴对齐碰撞不能直接精确表示圆弧池沿，首个样段先采用可控的矩形、转角和少量倒角；曲线碰撞作为后续能力。

不照搬该项目的蹦床、球池、桥和密集柱廊；我们的主池需保留连续水面，造型复杂度由泳池构图决定。

### 4.2 水深吸收与共享倒影

[pool-water.ts](https://github.com/pablostanley/vackrooms/blob/ccd3313417eb0a8d7500e96f99a03f2167ffeeba/src/lib/game/pool-water.ts) 的 WebGPU 分支读取场景颜色和深度，排除折射采样落到水前物体的情况；用视线方向比例把视空间 Z 深度换算为近似的视线水中长度。同一水位的池共享一个平面反射器。

该文件的 WebGL 降级分支没有同样的场景捕获，而是假定 1.22 m 池深并绘制近似光照。因此不能把它的所有水面能力笼统当成当前 WebGL/R3F 可直接替换的组件。

**本项目接入：**

- 继续共享已有场景颜色/深度捕获与同水位平面反射。
- 当前 `materials.ts` 用原始 UV 的视空间深度差进行吸收，再用扰动 UV 取颜色。下一步统一折射后的深度与颜色采样，并对斜视光程作修正；仍注明屏幕空间方法的画外信息限制。
- 池沿保持浅水可透、斜视可反射；深处吸收增强，从视觉上读出池底起伏。
- 若以后出现不同水位，再按可见水位组织反射预算，避免每池无条件各渲染一次场景。

[water-ripples.ts](https://github.com/pablostanley/vackrooms/blob/ccd3313417eb0a8d7500e96f99a03f2167ffeeba/src/lib/game/water-ripples.ts) 用 8 个可复用的环形扰动槽记录位置、时间和强度。可以借鉴这种有上限的交互涟漪管理。水纹传播和池岸反射属于另一层能力，不能把环形动画等同于水动力模拟。

### 4.3 先保证路线，再做空间变化

[maze.ts](https://github.com/pablostanley/vackrooms/blob/ccd3313417eb0a8d7500e96f99a03f2167ffeeba/src/lib/game/maze.ts) 先通过深度优先生成连通骨架，再打开房间区域。相邻块的通口由同一条全局边的坐标与种子决定，避免加载顺序改变门的位置；部分房间收口时还检查关闭一条边是否切断路径。

**本项目接入：** 首轮采用手工编排的有限池室回环。明确主池、浅阶池、转角水道和远端亮池之间的连接，再对非关键细节作少量变化。将来扩展模块时，连接口至少包含宽度、底部高度、水位、通行类型与朝向；出口双方引用同一个接口描述。

[acoustics.ts](https://github.com/pablostanley/vackrooms/blob/ccd3313417eb0a8d7500e96f99a03f2167ffeeba/src/lib/game/acoustics.ts) 将房间回声和脚下干湿分类与空间位置、池岸轮廓及脚部高度关联。可以沿用这种结构，在主池、低水道和偏厅间改变回声与脚步响应。视觉样段确定后再接入声音。

## 5. Wave Function Collapse：借鉴约束，不自动生成多层楼

重点阅读：

- [Module.cs](https://github.com/marian42/wavefunctioncollapse/blob/8750c537e6c8f95806ba709e2ae5d940fd51bff3/Assets/Code/WaveFunctionCollapse/Module.cs)：按连接标识、方向、旋转与镜像规则判断模块是否吻合。
- [ModuleData.cs](https://github.com/marian42/wavefunctioncollapse/blob/8750c537e6c8f95806ba709e2ae5d940fd51bff3/Assets/Code/WaveFunctionCollapse/ModuleData.cs)：预计算可能邻居，支持禁止邻居和可行走面约束。
- [AbstractMap.cs](https://github.com/marian42/wavefunctioncollapse/blob/8750c537e6c8f95806ba709e2ae5d940fd51bff3/Assets/Code/WaveFunctionCollapse/AbstractMap.cs)：选择低熵位置、传播约束、冲突时回退；提供显式 `EnforceWalkway`。
- [OcclusionCulling.cs](https://github.com/marian42/wavefunctioncollapse/blob/8750c537e6c8f95806ba709e2ae5d940fd51bff3/Assets/Code/Culling/OcclusionCulling.cs)：通过房间门户组织可见性，可作为后续大场景裁剪参考。

算法能约束“这些接口是否能拼上”，美术仍要决定“这里是否应该是一片完整泳池、何处需要低顶和转角”。本项目先预留池室路线，再生成相容边界，并对实际通行做必要检查。不能只凭局部邻接相容，就宣称整张地图具有所需游览路线。

Unity/C# 代码不会直接加入 React 构建。先把连接规则映射到现有 `poolModules.ts`，不为首个样段引入完整 WFC 运行时。门户裁剪也需要覆盖反射相机可见内容，不能只按主相机裁掉镜中建筑。

## 6. 库与包的取舍

用户已授权为效果选用库和包。以下是基于本次源码的技术取舍，不构成新的确认流程。

### 直接使用当前依赖完成第一阶段

继续使用 React Three Fiber、Three.js、Drei 和现有 postprocessing。池体轮廓、挤出、材质、共享反射与有上限的涟漪不要求先更换渲染器。

当前项目声明 Three `~0.180.0`；ThreeJS Water 声明 `^0.184.0`，Vackrooms 声明 `^0.186.0`。上游包配置不是本项目兼容性证明；采用算法时先用当前 API 实现，只有实际功能要求才做版本迁移。

### three-mesh-bvh：有条件采用

[官方仓库](https://github.com/gkjohnson/three-mesh-bvh) 提供网格射线查询加速。当前 Drei 已传递安装 `three-mesh-bvh 0.8.3`，其本地 peer 范围为 Three >= 0.159.0；本项目目前未将它声明为直接依赖。ThreeJS Water 使用的是 `^0.9.14`。

如果异形池沿碰撞、静态几何查询或局部光学确实采用其 API，应将核验过的版本显式列为直接依赖，不能依赖传递安装碰巧存在。版本范围相容不代表 GPU shader 接口和效果已经验证。首个轴对齐池体样段无需为了“高级”而强制加入 BVH。

### three-bvh-csg：只作为局部建模候选

[官方说明](https://github.com/gkjohnson/three-bvh-csg) 将其标为实验性实现，常规实体布尔要求闭合、无穿插的输入，并说明数值边界可能产生不完整结果。

用于静态圆弧池洞或局部复杂切口时，可以在生成阶段计算并缓存；简单池盆优先用轮廓、挤出与连续表面生成，避免在每帧做布尔运算。主池重构并不依赖这个包，尚未安装。

### Drei Caustics：适合局部试验

已检查当前安装的 `node_modules/@react-three/drei/core/Caustics.js`：它有前/后法线和焦散目标，通过光线与接收平面相交构造投影，默认 `frames=1`、`resolution=2024`。动态效果需要持续更新，默认分辨率也有明确成本。

可以用于少量局部玻璃实验，不能直接包裹整片泳池就替代多深度池底和墙面的焦散。本项目已有更明确的水波与焦散共享入口，优先在其上改造。

### 暂缓

完整 WebGPU/TSL 迁移、全场景路径追踪、每池独立反射、完整流体模拟和全图随机 WFC 均不作为第一阶段前提。主池构图、清楚的入水台阶和真实水深会更早改善当前画面。

## 7. 对当前代码的接入顺序

以下为下一阶段任务，尚未实施：

1. **池体定义与首个样段**：从 `liminalLayout.ts` 中分离池岸/池底描述，拟新增 `poolBasins.ts`。先完成主泳池、下水宽台阶和转角水道，移除主厅遮挡水面的高架桥层。
2. **统一几何与通行**：让 `LiminalArchitecture.tsx`、`solidSurface.ts`、`poolModules.ts` 共享池盆边界，形成连续池壁/池沿，并输出可通行的浅阶和岸线。
3. **水面与深度**：`PoolWater.tsx` 根据显式水域生成水面；`materials.ts` 改善折射采样和光程。避免继续仅以“房间地板低于水位”推断整个泳池。
4. **焦散与互动**：`WaterCaustics.ts` 对接池深与受光，`poolWaves.ts` 接入有限数量涟漪；保留降级路径与共享捕获。
5. **身体感与声音**：`movement.ts` 和 `FirstPersonRig.tsx` 先完成浅水减速、入水/出水与视点变化。开放深水前补好浮游/水中移动，声音干湿判定使用同一池体数据。
6. **扩展池室**：三个固定视角与通行样段成立后，才应用接口规则扩展偏池和回环。

第一阶段以当前依赖为主；如实际实现需要新包，记录引入原因、版本、许可证和增量成本后直接在授权范围内接入。

## 8. 来源、素材与验证界限

- 研究目录不进入运行时引用；源码若改编进 `src`，将对应 MIT 文本及署名纳入项目第三方说明，文件中标记改编出处和提交。
- Vackrooms 的 `public/audio/README.md` 说明 Kenney RPG 音效为 CC0；水中脚步来自用户提供的录音，`water/README.md` 只描述切分和处理，没有给出同样的开放授权。此轮只下载了说明文件，没有把其音效接入本项目。
- POOLS、Dreamcore 和 Jared Pike 的作品作为审美参考；不将公开展示等同于可复制源码或可自由使用资产。
- 本轮只核对源码内容、提交、许可证与本地文件清单。没有运行上游应用、生产构建或大批测试。
- 后续只做与变更有关的必要构建、一次短通行检查、三个固定视角与代表性前台帧时间采样。60 FPS 是目标，尚无此次改造的实测结果。



## 2026-11-04 补充：窗景、物件过亮与可直接复用资源

本轮重新查询原作者/维护方页面，并阅读本地 Three.js 0.180 的环境光与 BPCEM 源码。结论是当前完成度同时受几何、美术构图、材质标定和受光一致性影响。只把原有几何交给 Blender 烘焙，不会自动变成精细场景。

### 已实际接入

1. [Poly Haven White Plaster 02](https://polyhaven.com/a/white_plaster_02)，作者 Rob Tuytel，[CC0](https://polyhaven.com/license)。下载 Diffuse、OpenGL Normal、Roughness 的 2K 原文件，校验官方 MD5，并记录 SHA-256。实际观察发现原始材质偏粗、偏灰，基色因此按浅色涂装重新标定，保留低对比的原始细节；法线强度控制为 0.35。原图保留于 `research/assets/white_plaster_02/`，运行时打包为法线 RGB/粗糙度 A，来源说明位于 `public/assets/open-surfaces/manifest.json`。两张运行时图片约 10.7 MB，不能将高清素材描述为无成本提升。Powered by Poly Haven。
2. [Three.js 官方 BPCEM 示例](https://threejs.org/examples/webgpu_materials_envmaps_bpcem.html)及 [源码](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_materials_envmaps_bpcem.html)。依照现有 MIT 代码的射线与房间盒体求交方法，适配到当前 WebGL GLSL，使用绝对包围盒与实际探针中心；无需为此迁移到 WebGPU。`fixtureLighting.ts` 仅修正镜面反射方向，物件漫反射改为读取同位置的 Cycles 烘焙，去掉局部环境贴图的重复漫反射项。它无法精确处理非盒形房间的所有遮挡。

### 可继续评估的模型包；本轮没有导入

- [Cenji Backrooms Level 37 / Poolrooms Kit](https://cenjiyt.itch.io/backrooms-level-37-poolrooms)：作者页面列出 61 个资源、52 个建筑部件、8 个设施及 1 个水面片，包含曲墙、圆角池沿、下水台阶、窗洞和池梯；GLB/FBX 游戏资产可免费下载，完整 Blender 源工程为付费项。作者的自定义许可允许用于个人/商业项目及修改，不允许把原始或修改后的资源重新打包为独立素材包。它属于可复用素材包，不是 MIT/CC0 开源项目。本轮未购买、未下载、未评价其在本项目里的最终质量。
- [3DAssets.dev Backrooms and Liminal Spaces Kit](https://3dassets.dev/packs/liminal-spaces-kit)：提供方标注 CC0、94 个 GLB，包含池厅、池梯、拱门、排水格栅和更衣凳。页面同时标明这些文件使用了生成式 AI。接口实际请求返回 HTTP 403，因此本轮未取得文件，也未验证模型质量或几何收口；仅保留为候选，不宣称已经应用。
- [Vackrooms](https://github.com/pablostanley/vackrooms)：代码为 MIT，仍适合参考泳池轮廓、连通规则和有预算的水面实现。已有本地研究快照，不把其整个游戏或不属于 MIT 的音频搬入项目。
- [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)：作为后续静止观景/离线对照方向保留。本轮未安装、未集成；不能将渐进收敛的路径追踪等同于当前水面、自定义材质与漫游都能稳定 60 FPS。

### 美术上仍需解决的部分

当前主厅比例和池沿轮廓仍比较简单，柱、窗、入口与水道尽端的构图需要按关键镜头精细制作；采光庭解决视线穿帮，统一烘焙解决受光脱节，二者都不等于已经达到高质量艺术作品。下一轮优先评估并制作一个完整主厅样板：曲面池沿、连续压顶、清晰窗套和墙角收口、具有遮挡层次的转角水道，再把通过目视验收的部件用于其他房间。避免再次用增加楼层或物品数量代替这些工作。


## 2026-11-05：实际采用的交互水面实现

重新阅读 [Evan Wallace / WebGL Water](https://madebyevan.com/webgl-water/) 及已有本地 `research/upstream/webgl-water/water.js`。其核心是高度/速度场的相邻格点传播与阻尼，再从高度差求法线。当前项目采用相同数值思路，改写为小型 CPU 局部场，并加入本项目池盆/台阶深度、池壁和柱子遮挡、网格平移、多水位隔离、定额水滴，以及现有 R3F 水面/焦散共享采样。MIT 署名保留于第三方说明，构建产物附带 `public/licenses/evan-wallace-webgl-water-MIT.txt`。

再次核对 [Cenji Poolrooms Kit](https://cenjiyt.itch.io/backrooms-level-37-poolrooms) 及下载说明，仍作为建筑模块候选。本轮主厅拱口、窗洞收口和池沿为项目自制，没有下载、购买或声称导入该资源包。其 4 m 模块与现有池盆/通行布局并不完全对齐，本轮优先把当前几何做连贯，避免仅增加陌生模块。

## 2026-11-06：池核视觉语言与用户提供的 Argon 水体参考

本节为研究补充，不表示以下建议已接入场景。重新阅读原作者访谈、开发者官网、社区创作条目和当前项目水体源码；同时检查用户提供的 HTML，并在独立本地预览中实际查看水上平视、浅滩俯视两个预设。没有修改运行时场景、安装依赖或运行构建/压力测试；没有得出 60 FPS 的性能结论。

### 池核、阈限空间与后室的关系

- [Jared Pike / Dream Pools](https://www.jaredpike.art/projects/dream-pools/) 是持续自 2020 年的数字作品系列，作者标注使用 Blender 与 LuxCore。它提供池室的视觉参考，不是可直接搬入 Three.js 的开源游戏场景。
- [Jared Pike 访谈，2025-06-05](https://scare-me.beehiiv.com/p/interview-artist-jared-pike-on-dream-pools-and-the-allure-of-liminal-spaces)：作者从接近眼部或腰部高度的 24/35 mm 机位构图，先做灰模，再决定是否深化；利用阳光、暗区与遮挡，让观众想象水域延伸的去向。他也明确说到，单张作品镜头外的结构可以是不完整的。对本项目的推论是：学习人的视点和遮挡节奏，同时为可漫游场景补齐背面、转角及实际连通关系。
- [POOLS 官方说明](https://pools-game.com/)强调迷路、暗处、狭窄空间与异常建筑造成的不安；声音和回声随房间变化，涉水会减速。对本项目可借鉴的是空间与身体反馈，不需要据此删除现有剧情和巡检 UI。[官方图集](https://pools-game.com/media/)可作为连续探索场景的视觉对照。
- [Dreamcore 官方介绍](https://www.dreamcoregame.com/)中的 Dreampools 通过坡道、台阶和走廊连接开放池室与暗角；Liminal Hotel 则使用风格转变和回环路径。对本项目的推论是：旧泳池与极简区可以突变，但应由同一条水道、连续池沿或视线线索维持关联。
- [Backrooms Wikidot / Level 37](https://backrooms-wiki.wikidot.com/level-37)描写白瓷砖、蓝绿水、难以解释的尺度与连接、沉入水中的台阶。这是社区的虚构设定，并非池核统一标准；其中异常水质与声音叙述不能当成真实物理依据。

设计判断：熟悉的设施建立可信度，少量结构异常打破对整体用途和去向的理解。保留下水踏步、溢水沟、池梯、深度标线和淋浴区；让异常发生在过长的池岸、被柱墙遮住的转角、消失在深水的台阶、相似但不完全相同的返回路径。高度变化优先来自池底、踏步、局部顶高和受控制的水位差，而不是增加建筑楼层。开放连通且静止的水面应保持同一高度；不同水位需要堰、闸门、跌水或独立池盆说明边界。

采光以有出处的窗洞/天窗为主，保留受光区、间接光区和看不清的远端。墙面受水色反照可以有轻微变化，但不应整体呈自发光青色。贴图按空间功能分区，用池沿压顶、墙裙、阴角或门槛完成材质交接；重复的白瓷砖仍可构成主要秩序，不需要每面墙更换花色。声音先建立有来源的脚步、拍水、滴水和房间混响，再考虑少量异常。

### Argon 示例：检查范围与实际实现

用户文件：`C:/Users/Mrzzz/Downloads/interactive_visual_im_994dee749bf84902.html`。原文件未修改；为预览只在忽略目录 `.work-backup/research-argon/` 制作去掉外层 Markdown 围栏的副本。水上/俯视截图分别为该目录的 `eye.png`、`top.png`。水下分支完成源码阅读，没有完成水下视角目视检查。

示例使用 Three.js r146、OrbitControls 和自定义 GLSL；当前项目使用不同版本和渲染管线。页面标题中的“三平面”“GI”等词不能替代实际算法核对。

1. **波纹**：约第 1831 行的 `getWaveHeight` 叠加四组正弦/余弦，再用有限差分计算法线。它提供连贯的形变，没有流体传播或人物扰动。各项振幅绝对值之和为 0.0315 m，是静态基础波的数学上界，不是实测波高。
2. **折射与水色**：约第 2221 行的 `traceSubmergedPool` 用折射光线和固定池底、墙面、三组台阶及四根柱子的盒体求交；约第 1999 行的 `applyBeerLambert` 按水中光程计算 RGB 指数吸收，再加入艺术化散射颜色。水下命中点复用瓷砖函数，让入水前后的瓷砖样式保持关联。这是值得参考的主体方法。
3. **反射**：约第 2344 行的 `reflectedRoom` 由反射方向混合两种颜色，没有捕获实际房间；水下斯涅尔窗内部同样主要是颜色渐变。它无法直接反映当前项目的真实窗、墙、门洞与任意物件。
4. **焦散与补光**：约第 1867 行的 `evalChromaticCaustics` 使用 Voronoi 图案与 RGB 偏移，没有由上述波场求解光线聚焦；青色反弹光按高度/法线近似，不能视为实际多次反弹 GI。
5. **水线与光束**：约第 2385 行向水线直接加上青白颜色，附带最大约 0.14 m 范围的亮边；光束使用透明加法混合的柱形网格。实看水上与俯视画面，这些强化使水域很醒目，同时也出现明显的整圈亮边和偏强青光，不适合照搬到当前项目。
6. **适用边界**：解析求交针对约 6.4×6.4 m 的固定房间，几何尺寸同时写在 JS 和 GLSL 中。扩展到多房间、曲墙、不同池底和任意物件时需要统一场景数据；不能把这段硬编码 shader 当成通用池核水体。页面上的 GI 通量等数值是演示计算，不是实测照明或画质指标。

### 与当前项目对照后的采用方向

核对 `src/story/optics/WaterShader.ts`、`src/story/optics/ceramic.ts`、`src/story/StoryWater.ts` 后，剧情区已经具备折射方向、光程吸收、真实场景颜色/深度采样、平面反射，以及共享波场和人物扰动。它们仍有画面一致性和采样边界需要改善，但不能把“已有算法”误写成下一轮待添加的新功能。

- **借鉴水的可读性**：用同一组主池、入水台阶、转角视角对齐浅水清晰度、折射形变、波纹尺度和深水颜色。示例基础波振幅上界约 31.5 mm，当前剧情区基础波约 3.65 mm，二者都未计交互扰动；这一差异能解释部分形变强弱，但不能直接把所有池的振幅放大约九倍。优先局部调主池，并同步检查倒影稳定性。
- **保留真实反射路径**：继续修正实际窗墙倒影及折射命中，避免用示例的颜色渐变覆盖已有捕获。台阶边缘、柱子入水处和扶手跨水线处应保持几何与材质连续。
- **保留波场一致性**：继续参考 [Evan Wallace / WebGL Water](https://madebyevan.com/webgl-water/) 的高度场、法线和焦散协同思路。当前 `ceramic.ts` 已让焦散读取同一基础波和局部涟漪；改善接收面受光和幅度，不另叠一层与波纹无关的亮斑动画。
- **使用克制的湿润过渡**：借鉴湿区变暗及粗糙度变化，水线高光应依赖环境和视角，避免重引入已移除的整圈自发光亮边。
- **保持性能边界**：优先一个代表性主池样段；近处保证折射/接触细节，远处降低模拟与捕获负担。这次只做研究和两个视角预览，不据此承诺复杂场景稳定 60 FPS。

建议后续顺序：先定主池与转角的灰模构图和光暗关系，再调整同一视角下的水深/台阶可读性，随后处理材质交接与局部湿润细节，最后将成立的规则扩展到其他池室。此顺序是研究结论，尚未执行新一轮场景改造。
