# 人车氛围资产重建

`build_ambient.py` 通过 Blender MCP 在 `Tongji_Current` 场景中重建人车，默认生成 13 辆独立车辆与 36 名多样化静态行人。原始 `CampusLife` 保留在源文件内并隐藏，建筑、楼层和锚点不参与重建。

在 Blender MCP 的 Python 执行入口中运行（将项目路径替换为本地绝对路径）：

```python
PROJECT_ROOT = "/absolute/path/to/hospital-twin"
from pathlib import Path
exec((Path(PROJECT_ROOT) / "tools/ambient/build_ambient.py").read_text())
```

先创建 `output/ambient-v2/`。脚本输出候选 `output/ambient-v2/tongji-ambient.blend`、`public/scene/tongji-ambient-preview.glb` 和路径配置 `output/ambient-v2/ambient-life.json`，不直接覆盖当前运行资产。`PERSON_LIMIT=4`、`MOVING_LIMIT=1` 可用于少量样件检查；正式导出使用默认值或显式设置 36/13。

在网页加载候选 GLB，并将候选配置传入 `createAmbientController`，检查车辆转向、轮轴、人物脚底及日夜材质。核对原建筑几何与 `objectId`、`floorId`、`zoneId` 和锚点保留后，备份当前文件，通过 Blender MCP 保存为 `assets/blender/tongji-current.blend`，将候选 GLB 替换为 `public/scene/tongji-current.glb`，同步 `manifest.json` 的 `ambientLife` 与网格统计，并将 `model` 的查询参数更新为 GLB 的 SHA-256 前12位（例如 `tongji-current.glb?v=内容摘要`），避免浏览器/CDN沿用上一版模型。删除公开目录内的候选，避免重复发布。

车道从原模型道路顶点提取，前端沿封闭曲线按弧长推进；每辆车的速度、变化周期、停留时长与间隔圈数在 manifest 中配置。`traffic.ts` 负责运动与跟车，`ambient.ts` 负责姿态、车轮和实例绘制。人物按材质合并，原始车辆节点仍用于计算变换，相同车辆部件通过 InstancedMesh 绘制。

执行 `npm test`、`npm run lint`、`npm run format:check`、`npm run build -- --base=/hospital-twin/`，并在浏览器核对总览、楼层、日夜和减少动态效果。当前人车仅为示意氛围，不代表真实交通或人流数据。
