// DOM 标签的投影、建筑遮挡和布局；选中对象优先，放不下时隐藏，避免覆盖操作面板。
import * as THREE from 'three';
import { regions } from '../data/model';
import { isObjectVisible } from './resources';
import type { SceneProps } from './types';

export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const overlaps = (a: LabelRect, b: LabelRect, gap: number) =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y;

// 标签完整落入安全区；先就近向上避让，再尝试横向及下方位置，无解不强行堆叠。
export function placeLabel(
  anchor: { x: number; y: number },
  size: { width: number; height: number },
  safe: LabelRect,
  occupied: LabelRect[],
  gap: number,
): LabelRect | null {
  if (size.width > safe.width || size.height > safe.height) return null;
  const x = THREE.MathUtils.clamp(
    anchor.x - size.width / 2,
    safe.x,
    safe.x + safe.width - size.width,
  );
  const preferredY = THREE.MathUtils.clamp(
    anchor.y - size.height - gap,
    safe.y,
    safe.y + safe.height - size.height,
  );
  const row = size.height + gap;
  const columns = [x, x - size.width - gap, x + size.width + gap];
  const rows = [preferredY];
  for (let offset = row; offset <= safe.height + row; offset += row)
    rows.push(preferredY - offset, preferredY + offset);
  for (const y of rows)
    for (const candidateX of columns) {
      const candidate = { x: candidateX, y, ...size };
      if (
        candidate.x < safe.x ||
        y < safe.y ||
        candidate.x + size.width > safe.x + safe.width ||
        y + size.height > safe.y + safe.height
      )
        continue;
      if (!occupied.some((rect) => overlaps(candidate, rect, gap))) return candidate;
    }
  return null;
}

// 正交投影沿相机射线判遮挡，不以“相机位置到锚点”的透视射线替代。
export function isAnchorOccluded(
  id: string,
  point: THREE.Vector3,
  camera: THREE.Camera,
  meshes: THREE.Mesh[],
  raycaster = new THREE.Raycaster(),
): boolean {
  const projected = point.clone().project(camera);
  raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
  const anchorDistance = point.clone().sub(raycaster.ray.origin).dot(raycaster.ray.direction);
  const floorId = id.startsWith('floor_') ? id.slice('floor_'.length) : null;
  return raycaster.intersectObjects(meshes, false).some((hit) => {
    if (hit.distance >= anchorDistance - 0.5 || !isObjectVisible(hit.object)) return false;
    // 锚点允许嵌在自身屋顶或楼层；只由其他建筑/楼层遮挡它。
    if (floorId ? hit.object.userData.floorId === floorId : hit.object.userData.objectId === id)
      return false;
    const material = (hit.object as THREE.Mesh).material;
    return (Array.isArray(material) ? material : [material]).some(
      (m) => m.visible && (!m.transparent || m.opacity >= 0.5),
    );
  });
}

export function createLabelController(
  camera: THREE.Camera,
  model: THREE.Group,
  anchors: Map<string, THREE.Object3D>,
  labels: Map<string, HTMLButtonElement>,
  host: HTMLElement,
) {
  const world = new THREE.Vector3(),
    projected = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const meshes: THREE.Mesh[] = [];
  const buildingIds = new Set<string>(regions.map((region) => region.id));
  model.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      buildingIds.has(object.userData.objectId) &&
      !object.userData.zoneId
    )
      meshes.push(object);
  });
  return {
    update(p: SceneProps) {
      const { scale, left, top } = p.layout;
      const safe = {
        x: left + 428 * scale,
        y: top + 225 * scale,
        width: 1064 * scale,
        height: 605 * scale,
      };
      const hostRect = host.getBoundingClientRect();
      const occupied: LabelRect[] = [];
      // 使用真实 UI 边界，覆盖导航、楼层提示、工具栏、详情抽屉和弹窗。
      host
        .closest('.viewport')
        ?.querySelectorAll<HTMLElement>(
          '.top-nav,.scene-toolbar,.scene-tools,.floor-notice,.tour-caption,.detail-drawer,.performance-panel,.dialog-backdrop',
        )
        .forEach((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width && rect.height)
            occupied.push({
              x: rect.left - hostRect.left,
              y: rect.top - hostRect.top,
              width: rect.width,
              height: rect.height,
            });
        });
      model.updateWorldMatrix(true, true);
      const priority = (id: string) => (id === p.selected || id === `floor_${p.floor}` ? 1 : 0);
      const ordered = [...anchors].sort(([a], [b]) => priority(b) - priority(a));
      for (const [id, anchor] of ordered) {
        const label = labels.get(id);
        if (!label) continue;
        label.style.visibility = 'hidden';
        const floorLabel = id.startsWith('floor_');
        const permitted =
          p.mode === 'floor' ? floorLabel && (!p.zone || id === `floor_${p.floor}`) : !floorLabel;
        if (!permitted || !isObjectVisible(anchor)) continue;
        anchor.getWorldPosition(world);
        projected.copy(world).project(camera);
        if (
          projected.z < -1 ||
          projected.z > 1 ||
          Math.abs(projected.x) >= 1 ||
          Math.abs(projected.y) >= 1
        )
          continue;
        if (isAnchorOccluded(id, world, camera, meshes, raycaster)) continue;
        const anchorX = (projected.x * 0.5 + 0.5) * host.clientWidth;
        const anchorY = (-projected.y * 0.5 + 0.5) * host.clientHeight;
        // 引线端点也在窗口内，防止标签被夹回中央而引线穿过侧栏。
        if (
          anchorX < safe.x ||
          anchorX > safe.x + safe.width ||
          anchorY < safe.y ||
          anchorY > safe.y + safe.height
        )
          continue;
        const placement = placeLabel(
          { x: anchorX, y: anchorY },
          { width: label.offsetWidth, height: label.offsetHeight },
          safe,
          occupied,
          8 * scale,
        );
        if (!placement) continue;
        const { x, y, width, height } = placement;
        label.style.transform = `translate(${x}px,${y}px)`;
        const leader = label.querySelector<HTMLElement>('i')!;
        const dx = anchorX - (x + width / 2),
          dy = anchorY - (y + height);
        leader.style.left = `${width / 2}px`;
        leader.style.height = `${Math.hypot(dx, dy)}px`;
        leader.style.transformOrigin = 'top center';
        leader.style.transform = `rotate(${Math.atan2(-dx, dy)}rad)`;
        label.style.visibility = 'visible';
        occupied.push(placement);
      }
    },
  };
}
