# 池核调研：概念、图片与本项目实现方向

最新方向见 [泳池优先改进计划](POOL_FIRST_PLAN.md)，已完成的开源实现研究见 [OPEN_SOURCE_STUDY.md](OPEN_SOURCE_STUDY.md)。主泳池、下水台阶和转角水道已完成首段实施，见 [POOL_FIRST_IMPLEMENTATION.md](POOL_FIRST_IMPLEMENTATION.md)。此前关于桥廊、楼层的方案以新计划为准。

调研日期：2026-11-04。范围：原作者作品与访谈、POOLS / Dreamcore 官方介绍和图片、Three.js 与烘焙光照文档，以及当前项目代码。本文是后续美术与渲染改造的依据；标为“建议”的尺寸和参数是本项目的设计起点，不是对参考图的实测值。

## 结论与本项目方向

当前场景的主要偏差是空间主题和光照层次：彩窗、圆台、石材拱框、墙裙分界和整齐的长廊叠加后，容易被读成装饰性浴场；削弱全局补光又使大片墙面失去可读性。继续增加材质细节，难以单独解决这个问题。

建议以 Jared Pike 的日光作品为主要视觉参照，以 POOLS 和 Dreamcore 的探索体验为交互参照：日光中的白瓷砖、可读的背光体块、被遮住的水路、局部尺度异常、极少的装饰。自然光为主、材质不自发光、漫射较少是本项目的美术约束；它们并不是整个池核流派的统一规则。

## 1. 概念：熟悉的泳池语言，失去日常用途的空间

“池核 / Poolcore / Poolrooms”在这里作为相互重叠的视觉语汇理解，不强行规定单一分类。Jared Pike 官方将 Dream Pools 描述为探索诡异怀旧感、梦与现实边界的无尽泳池环境，系列始于 2020 年，使用 Blender 和 LuxCore 渲染。[原作者项目页](https://www.jaredpike.art/projects/dream-pools/)

POOLS 官方将 Poolrooms、liminal spaces 等列为灵感，并将 Jared Pike 列为早期相关艺术家之一；不宜把整个概念归于某位唯一创始人，也不必把所有池核作品绑定到某一套 Backrooms 世界观。[POOLS 官方介绍](https://poolsthegame.com/)

对本项目有用的概括是：瓷砖、水、台阶等日常元素建立熟悉感，空无一人、用途不明的转角、被水占据的通路和异常尺度带来不确定感。恐怖程度可以变化，怪物和追逐并非必要组成。

## 2. 图片研究

以下为公开作品的视觉研究。作品权利属于各自作者；图片不作为游戏贴图、背景或模型资产使用。浏览器截图用于核对画面，原始来源均保留。

### A. Jared Pike：Dream Pool 12 — 主要光照与空间参照

[原作系列页](https://www.jaredpike.art/projects/dream-pools/) · [原图](https://www.jaredpike.art/images/dreampool12-wide.png)

![Dream Pool 12 — Jared Pike](https://www.jaredpike.art/images/dreampool12-wide.png)

以下是对实际图像的观察：

- 前景粗柱占据很大画面面积，遮住部分通路；远处只能看见局部墙面与入口。
- 墙、柱和水下表面共享瓷砖语言；顶面相对简洁，并非每一面都必须密铺砖。
- 直射阳光照亮了竖直墙面与柱子，形成白色体块；背光面保留灰绿层次。
- 水面既能透出池底，也反射柱体；水光出现在部分墙面和顶面，范围受空间影响。
- 大部分构件是简单体块，没有大量装饰性石材边框。

本项目应吸收：前景遮挡、局部明亮的竖直面、灰部可读性、连续瓷砖、水路延伸。当前中庭的亮度几乎集中在地面圆斑，墙体则大面积过暗，与这张参考有明显差距。

### B. Jared Pike：Dream Pool 3 — 垂直空间与水深参照

[原作系列页](https://www.jaredpike.art/projects/dream-pools/) · [原图](https://www.jaredpike.art/images/dreampool3.png)

![Dream Pool 3 — Jared Pike](https://www.jaredpike.art/images/dreampool3.png)

观察：螺旋楼梯逐渐没入水中，材质语言非常单纯，深度和水色承担主要叙事作用。最深处暗，而近处台阶、墙面与水下结构仍然清楚。

本项目应吸收：上下关系、水深梯度、看不见的终点。可以设计自己的下沉平台、转折台阶或局部低顶水道，不必逐件复刻原作楼梯。

### C. Tensori：POOLS 官方图片 — 可漫游布局参照

[官方图片集](https://poolsthegame.com/media/) · [所看原图](https://poolsthegame.com/pools-game-images/01.webp)

![POOLS 官方图片 — Tensori](https://poolsthegame.com/pools-game-images/01.webp)

观察：池体和周围通路彼此嵌套；顶面、柱子、墙和地面统一贴砖。栏杆、椅子等日常物件很少，但能说明身体尺度。它的整体曝光、色偏和柔化程度与本项目偏好不同，主要借鉴空间组织和材质连续性。

### D. Dreamcore：Dreampools — 连通关系参照

开发者将该区域描述为由坡道、楼梯、走廊连接的室内泳池环境，混合开阔房间、暗角与带童年意味的局部空间，鼓励自由探索。[Dreamcore 官方说明与截图](https://www.dreamcoregame.com/)

本项目可借鉴：干湿区域相接、低顶与高顶转换、路径回环、熟悉空间的局部变形。正式实现时，每个转角都要承担视线或路线变化。

## 3. 原作者的工作方法

Jared Pike 在访谈中提到：通常从 24 或 35 mm 镜头、眼部或腰部高度的相机开始，用灰模组织构图，再增加细节；画面同时保留日照和暗部，遮挡与无法看到的转角很重要。[2025 年作者访谈](https://scare-me.beehiiv.com/p/interview-artist-jared-pike-on-dream-pools-and-the-allure-of-liminal-spaces)

据此建议，本项目先确定几个实际行走时会遇到的画面，再决定墙、柱和入口位置。静态作品可以只构造镜头看到的部分；可漫游场景则需要在转角后接上新的、有变化的空间，不能直接复制单张图的布景方式。

## 4. 对当前项目的具体诊断

以下为本项目代码和现有截图的分析，不是对所有池核作品的规定。

### 4.1 空间主题

当前圆形天井、中心圆台、放射状彩窗和石材拱框形成了过强的中心与仪式感。大面积灰泥上墙、青绿腰线和石材收口又加强了建筑装修风格。

建议：降低中心圆台与彩窗的视觉主导性；核心区域回到统一瓷砖体块。拱门可以保留，但应与矩形开口、低顶通道、转角和错位柱子混合使用。石材与装饰只作为少数局部细节。

### 4.2 光照

src/scene/DreamPoolScene.tsx 当前使用一盏方向光与强度 0.045 的环境贴图。src/scene/assets.ts 的 createLightVisibility() 提供接触遮蔽、彩窗可见性和水域遮罩，并没有计算太阳经过表面反弹后的间接光。

因此，当前“窗边亮、其他地方几乎同样暗”的结果，不能只靠继续调低环境强度改善。

建议：太阳仍是主要来源；增加由实际受光位置决定、衰减较快的局部间接光。靠近日照区的背光墙应能读出砖纹与体积，深处再进入黑暗。

### 4.3 贴图与材质

现有颜色、法线、粗糙度、柱面展开和过滤设置可复用。问题主要在材质组织：独立的石材拱框、深腰线和灰泥上墙，把统一的泳池表面拆成了装饰分区。

建议先在核心样段统一浅色细砖，降低砖缝对比，保留轻微倒角和釉面变化。可从 10–20 cm 瓷砖测试起步；这只是本项目建议，参考图不能提供可靠的绝对尺寸。不要通过堆积污渍、划痕或高强度法线来补偿空间构图。

### 4.4 水体

现有 Fresnel、深度吸收、折射和平面反射可以保留。后续重点是让水色、水深和建筑轮廓的关系更清楚，并让水域在视线上延伸到门洞或转角后方。

当前焦散只在水下受光表面增强。参考中的墙面/顶面水光，未来需要单独建立“阳光照到水面，再反射到附近表面”的受控近似；不能直接给墙体加恒定亮色。

### 4.5 相机与界面

当前相机 fov 为 58 度。Three.js 的该字段是垂直视角，不是镜头毫米数。建议用 setFocalLength() 及实际画幅统一摄影尺度，先在样段试 28–35 mm 的构图，再兼顾漫游舒适度。[Three.js PerspectiveCamera](https://threejs.org/docs/pages/PerspectiveCamera.html)

界面目前已在漫游时隐藏，这是可保留的部分。研究截图和入场视图可进一步减轻大标题、区域介绍等对画面的覆盖，便于直接观察建筑与水面。

## 5. 适合当前 Three.js 项目的实现路线

### 5.1 静态建筑烘焙间接光，实时保留太阳与水面

POOLS 开发者在官方 itch.io 页面答复中明确推荐学习烘焙光照、光照探针/自适应探针体积、反射探针和后处理，并表示其 Unity 画面不依赖付费商店插件。这是开发者的实践建议，不代表已公开游戏每一处的内部参数。[开发者原始答复](https://tensori.itch.io/pools)

对于这个项目，建议：

1. 在灰模阶段确定窗口位置、太阳方向与主要通路。
2. 对静态墙体、柱子、池底和台阶建立独立、无重叠的光照 UV。
3. 离线烘焙低强度、局部的间接光；实时太阳负责直射、阴影与材质高光，避免把直射光重复计算两次。
4. 将烘焙结果接入 Three.js 的 lightMap；动态水面继续使用当前反射/折射方案。
5. 细调时先看白模与灰阶层次，最后再加少量动态水光。

Blender 官方说明 Cycles 可以将光照烘焙为纹理，并区分 Direct、Indirect 等贡献；Three.js 的 lightMap 接口用于预烘焙照明。[Blender 烘焙文档](https://docs.blender.org/manual/en/latest/render/cycles/baking.html?highlight=render+baking) · [Three.js MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)

这是一条建议实施路线，本轮没有执行离线烘焙，也没有验证其性能收益。

### 5.2 当前代码接入时的要点

- BoxBatch 复用单位立方体几何并通过实例矩阵缩放。不同墙体不能不加区分地共享同一份烘焙 UV，否则会重复错误的光照。
- 可将静态建筑合并后展开光照 UV，或者为每个实例提供光照图集偏移/缩放；保留另一套按米重复的瓷砖 UV。
- 当前安装的 Three.js 会从 material.lightMap.channel 选择 UV 属性。若采用 uv1 作为光照 UV，要显式选择对应通道，不能沿用旧教程中的字段假设。[Texture.channel 官方说明](https://threejs.org/docs/pages/Texture.html#channel)
- 颜色贴图与法线/粗糙度数据保持正确的色彩空间，烘焙数据不要再次作为普通颜色贴图做错误的伽马转换。
- 需要增加离线烘焙与资产更新流程。当前仅检查了 PATH 和常见 Blender 安装目录，未在这些位置找到 Blender；这不等于排除了其他安装位置。

### 5.3 声音与探索

POOLS 官方强调房间变化时声音和回声也随之改变，并采用无背景音乐、少界面干扰的体验。[POOLS 官方说明](https://poolsthegame.com/)

本项目已有默认静音、区域回声与涉水减速，可继续沿用。后续更值得打磨脚步、涉水、滴水的空间距离感，而不是增加密集事件提示。

## 6. 下一阶段的具体样段

先完成一组相连的空间，作为美术标准，再推广到五区域：

1. **低顶入口**：视线被墙角挡住，只能看见一部分较亮水面。
2. **侧向采光浅水厅**：粗柱与半墙错位，日光照到一段竖直墙面和池底，阴影保留可读纹理。
3. **转折水廊**：入口略偏轴线，经过一次转角后改变顶高或水深，保留远处未完全暴露的空间。

尺寸只作为灰模起点：入口顶高约 2.5–2.9 m，浅水厅约 3.5–4.8 m，窄通道约 1.4–2.0 m 宽；最终以相机画幅、身体尺度、碰撞和实际构图共同校准。它们不是池核的规定尺寸。

优先顺序：空间构图与遮挡 → 日光和局部反弹 → 统一贴砖 → 水体细节 → 声音与少量物件。

## 7. 最小验收

只检查能影响方向判断的内容：

- 一个视角能同时读到亮部、可读灰部和深处暗部。
- 主要通路不会从入口全部暴露；转角后有真实、可达的空间变化。
- 不依靠灯带、彩窗装饰或强泛光，也能建立明确的池核观感。
- 近处的砖缝和水深清楚，远处没有明显摩尔纹、重复阴影条纹或异常发亮。
- 三个样段之间可以完成一段短漫游；性能在前台实际设备上测量，不用后台截图推断 FPS。

本轮为资料与设计研究，没有修改场景代码或执行构建测试。参考图像已通过浏览器实际查看，研究记录保留在 .work-backup/research-pike-03.png、research-pike-12.png 和 research-pools-01.png。


## 8. 实施进展：Blender 样段已落地（2026-11-04）

以上研究方向现已用于三个相连空间的 Blender 工程和网页默认场景。20 cm 连续浅砖、低顶入口、侧窗、粗柱和转角水廊已建模；完成 Cycles 主厅参考渲染，并以独立 UV 烘焙无本色间接光。GLB 和线性 EXR 接入 Three.js，实时太阳与水面继续运行。资产、布局、相机和太阳参数保存在 public/assets/poolcore-sample，源工程在 art/poolcore-sample。

本文原有“建议”“本轮未烘焙”等表述保留为调研当时的记录。当前实施范围是三区样段；正式大地图和进一步美术细化可沿此流程扩展。Blender 离线水体与网页实时水体采用不同实现，不能将参考渲染直接视作浏览器截图。


## 七区环路与可见太阳（2026-11-04）

开工前复核了原作者与游戏官方资料：[Jared Pike / Dream Pools](https://www.jaredpike.art/projects/dream-pools/)、[POOLS 官方介绍](https://poolsthegame.com/)、[POOLS 官方图片页](https://poolsthegame.com/media/)、[Dreamcore 官方 Dreampools 介绍](https://www.dreamcoregame.com/)。Pike 以无尽泳池与熟悉空间的异常感构成梦境；POOLS 以房间变化、探索和声学变化推动体验；Dreamcore 明确强调坡道、台阶和走廊构成连接。这些资料用于空间研究，没有把作品图片当成项目贴图。

本次保留原主厅，新增高顶回声柱厅、带宽大下水台阶的阶梯池厅、无顶向阳水庭，以及接回主厅东岸的 L 形回流长廊。不同区域靠尺度、遮挡、明暗和水深变化区分，全部保留统一瓷砖材质。照明仍为室外太阳、真实开口与克制的漫反射，不增加发光墙壁或装饰灯。

太阳盘使用与真实方向光一致的方向，晨昼暮色彩沿用已实现的约 8 分钟循环；云层单独缓慢漂移。露天水庭提供能直接看到太阳的视点。太阳方向仍固定，新增间接光仍为 Cycles 静态烘焙。


## 开源研究与模块化重构（2026-11-04）

本次将网络研究用于实际代码，保留 React Three Fiber / Three.js、现有 UI、七区导航和时间循环。

- [marian42/wavefunctioncollapse](https://github.com/marian42/wavefunctioncollapse)（MIT）：借鉴模块连接口、邻接约束和可调房型的思路。本项目实现四个带固定种子变化的池室，连接口宽 3.6 m，统一生成高差过渡；没有移植 Unity 代码，也不声称实现完整 WFC 求解器。
- [pablostanley/vackrooms](https://github.com/pablostanley/vackrooms)（源码 MIT）：借鉴地标、转折和限制同时绘制内容的组织方式。本次建筑按空间分批以参与视锥剔除，移动查询采用空间桶；没有实现其无限区块流送，也未复制源码或另有授权的音频。
- [jeantimex/threejs-water](https://github.com/jeantimex/threejs-water)（MIT）：参考微分面积法的焦散原理。原创共享正弦波场用于水面波高、法线与折射光线投影，256² 半精度纹理记录投影面积比。保留现有镜像反射和场景深度捕获；没有移植其波动方程模拟器或池形专用求交代码。
- [Makarov 多层池核](https://github.com/MakarovDs777/Procedural-generation-of-the-backrooms-python)：只参考多层、错位与压缩/释放的空间组合；没有确认明确开源许可，因此未复制源码或资产。

具体成果：6.48 m 第二层步道跨越主厅并伸入柱厅，3.60 m 桥面与下方水路保留；0.90 m 开场观景台便于同时看见水面和上下层。西侧三个空间组成额外回环，远端四个池室采用不同宽度、位置、池底和顶高。全场 26 个空间体，平面约 60×160 m，最高可达步道与最低池底相差 7.44 m。

几何采用坐标压缩体积并集和贪心外表面合并，去除墙、桥、楼板之间的内部面；栏墙放在楼板承托范围内。统一世界坐标铺砖，细化砖缝、湿润粗糙度与水线。静态接触遮蔽只调制间接光，建筑仍不自发光。

实现边界：地图有限；生成发生在加载阶段；天空环境近似间接光；焦散按水下 0.9 m 的参考接收平面计算，对其他深度及竖直墙面仍属近似；没有完成新的 Blender 模型导出或烘焙。

验证限制在构建、scripts/check-modular-layout.mjs 和短主厅预览。脚本检查 22 个观景点/地标及七区环路，并用实际移动控制器验证悬空楼梯上下行。主厅最终预览没有记录页面/着色器错误；额外视点截图因浏览器控制上下文失效未完成，没有继续扩大测试。实际截图为 art/poolcore-sample/browser-modular-main.png。未获得有效前台 FPS 样本，不能据此声称稳定 60 FPS。

## 2026-11-13 补充调研：外部定义与视觉语汇复核

本轮以外部公开资料复核池核定义与视觉语汇，作为美术方向依据；图片不入库。Aesthetics Wiki 将 Poolcore 定义为 liminal spaces 的子类，"eerie yet peaceful"；Wikipedia 的 The Poolrooms 描述为看似无限的 pristine 白瓷砖室内泳池迷宫。二者与本项目"熟悉泳池语言、失去日常用途"的概括一致。

外部资料强化的可操作语汇：统一浅色瓷砖连续铺贴与简单体块；重复与对称（repeating tiles、reflections、empty lanes）抓住视线；水既透底又反射、水深梯度叙事；warm sunlight 是 Pike 所称的 "uncanny formula"（designboom 访谈），直射照亮竖直墙面/柱、背光保留灰绿层次；前景遮挡与转角后变化；局部尺度异常；24–35mm、眼/腰高相机（Pike 访谈）。声音上无背景音乐、房间变化→回声变化、distant echoes/low hum（POOLS）。

对本项目的映射：统一瓷砖+HQ 法线、Cycles 烘焙+低角度太阳、水体折射/反射/焦散、区域回声、遮挡回环、房间建筑化均已落地。仍缺口（按收益）：①墙面/顶面水光（阳光照水面再反射到附近表面的受控近似，目前焦散只在水下）；②背光墙灰部砖纹与体积可读性；③用 setFocalLength 统一 28–35mm 摄影尺度；④脚步/涉水/滴水的空间距离感。保持少装饰，避免退回装饰性浴场。

来源：[Aesthetics Wiki · Poolcore](https://aesthetics.fandom.com/wiki/Poolcore)、[Wikipedia · The Poolrooms](https://en.wikipedia.org/wiki/The_Poolrooms)、[Jared Pike · Dream Pools](https://www.jaredpike.art/projects/dream-pools/)、[Pike 访谈 · scare-me](https://scare-me.beehiiv.com/p/interview-artist-jared-pike-on-dream-pools-and-the-allure-of-liminal-spaces)、[designboom · Pike](https://www.designboom.com/art/diving-3d-artist-jared-pike-imaginary-liminal-interiors-pool-dreamscapes-02-18-2024/)、[POOLS](https://poolsthegame.com/)、[Dreamcore](https://www.dreamcoregame.com/)、[POOLS · itch.io](https://tensori.itch.io/pools)。

