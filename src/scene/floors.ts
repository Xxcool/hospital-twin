// 楼层与分区可见性、展开动画；对象 ID 来自 Blender 清单，不复制业务状态。
import * as THREE from 'three';
import type { Manifest, SceneProps } from './types';
export function createFloorController(model: THREE.Group, manifest: Manifest) {
  const root = model.getObjectByName(manifest.floors.root);
  const hall = model.getObjectByName('outpatient');
  if (!root || !hall) throw new Error('模型缺少门诊楼层映射');
  const groups = new Map<string, THREE.Object3D>();
  for (const [id, name] of Object.entries(manifest.floors.groups)) {
    const node = model.getObjectByName(name);
    if (!node) throw new Error(`楼层组缺失：${id}`);
    groups.set(id, node);
  }
  root.visible = false;
  let lastState = '';
  return {
    root,
    groups,
    update(p: SceneProps) {
      const state = `${p.mode}/${p.zone}/${p.floor}`;
      if (state !== lastState) {
        root.visible = p.mode === 'floor';
        hall.visible = p.mode !== 'floor';
        for (const id of ['medtech', 'children', 'inpatient', 'parking', 'emergency']) {
          const context = model.getObjectByName(id);
          if (context) context.visible = !(p.mode === 'floor' && p.zone);
        }
        // 隐藏的定位面也从拾取与标识遮挡计算中排除。
        model.traverse((o) => {
          if (o.userData.zoneId)
            o.visible =
              p.mode === 'floor' && o.userData.zoneId === p.zone && o.userData.floorId === p.floor;
        });
        lastState = state;
      }
      if (p.mode !== 'floor') return;
      for (const [id, group] of groups) {
        group.visible = !p.zone || id === p.floor;
        group.position.y = THREE.MathUtils.lerp(
          group.position.y,
          manifest.floors.explode[id],
          0.09,
        );
        group.position.z = THREE.MathUtils.lerp(group.position.z, -manifest.floors.back[id], 0.09);
      }
    },
  };
}
