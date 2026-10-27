// 正交相机取景与过渡：统一处理建筑、展开楼层和分区的中央安全区。
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { RegionId } from '../data/model';
import type { Manifest, SceneProps } from './types';
interface CameraContext {
  manifest: Manifest | null;
  controls: OrbitControls | null;
  model: THREE.Group | null;
  floorRoot: THREE.Object3D | null;
  floorGroups: Map<string, THREE.Object3D>;
}
export function createCameraController(
  camera: THREE.OrthographicCamera,
  element: HTMLElement,
  getProps: () => SceneProps,
  getContext: () => CameraContext,
) {
  const goalPosition = new THREE.Vector3(),
    goalTarget = new THREE.Vector3();
  let goalZoom = 1,
    animating = false;
  const reset = () => {
    const { manifest, controls } = getContext();
    if (!manifest || !controls) return;
    goalPosition.fromArray(manifest.camera.position);
    goalTarget.fromArray(manifest.camera.target);
    goalZoom = 1;
    animating = true;
  };
  const focus = (id: RegionId, tour = false) => {
    const { manifest, controls, model } = getContext();
    if (!manifest || !controls) return;
    const building = model?.getObjectByName(id);
    if (!building) return;
    building.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(building);
    if (bounds.isEmpty()) return;
    const direction = (
      id === 'outpatient' && !tour
        ? new THREE.Vector3(16, 90, 250)
        : new THREE.Vector3(tour && id === 'children' ? -75 : 65, 145, 240)
    ).normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const center = bounds.getCenter(new THREE.Vector3());
    let halfWidth = 0,
      halfHeight = 0;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new THREE.Vector3(x, y, z).sub(center);
          halfWidth = Math.max(halfWidth, Math.abs(corner.dot(right)));
          halfHeight = Math.max(halfHeight, Math.abs(corner.dot(up)));
        }
    // 所选建筑完整进入中央安全区；邻近建筑仍作为背景，可由侧栏遮挡。
    const scale = getProps().layout.scale;
    const pixelsPerUnit = element.clientHeight / (camera.top - camera.bottom);
    goalZoom =
      Math.min(
        tour ? 1.2 : 1.55,
        (980 * scale) / (2 * halfWidth * pixelsPerUnit),
        (530 * scale) / (2 * halfHeight * pixelsPerUnit),
      ) * 0.92;
    goalTarget
      .copy(center)
      .addScaledVector(up, (550 * scale - element.clientHeight / 2) / (pixelsPerUnit * goalZoom));
    goalPosition.copy(goalTarget).addScaledVector(direction, 280);
    animating = true;
  };
  // 按展开终态的包围盒取景，预留两侧面板、顶部导航和底部工具栏。
  const fitFloors = () => {
    const { manifest, controls, model, floorRoot, floorGroups } = getContext();
    if (!manifest || !floorRoot || !controls) return;
    const saved = [...floorGroups].map(([id, group]) => ({
      id,
      group,
      position: group.position.clone(),
    }));
    for (const { id, group } of saved) {
      group.position.y = manifest.floors.explode[id];
      group.position.z = -manifest.floors.back[id];
    }
    floorRoot.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(floorRoot);
    for (const { group, position } of saved) group.position.copy(position);
    floorRoot.updateWorldMatrix(true, true);
    if (bounds.isEmpty()) return;
    const zone = getProps().zone;
    const zoneMesh = zone ? model?.getObjectByName(`zone_${getProps().floor}_${zone}`) : null;
    if (zoneMesh) {
      const zoneBounds = new THREE.Box3().setFromObject(zoneMesh);
      const center = zoneBounds.getCenter(new THREE.Vector3());
      const group = floorGroups.get(getProps().floor)!;
      center.y += manifest.floors.explode[getProps().floor] - group.position.y + 1.5;
      const direction = new THREE.Vector3(0, 200, 220).normalize();
      const up = new THREE.Vector3(0, direction.z, -direction.y);
      goalZoom = 2.35;
      const pixelsPerUnit = element.clientHeight / (camera.top - camera.bottom);
      goalTarget
        .copy(center)
        .addScaledVector(
          up,
          (540 * getProps().layout.scale - element.clientHeight / 2) / (pixelsPerUnit * goalZoom),
        );
      goalPosition.copy(goalTarget).addScaledVector(direction, 280);
      animating = true;
      return;
    }
    const direction = new THREE.Vector3(8, 145, 250).normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const center = bounds.getCenter(new THREE.Vector3());
    // 楼层切换对准对应层，仍保留另一层作空间参照。
    const selectedGroup = floorGroups.get(getProps().floor);
    if (selectedGroup) {
      const floorCenter = new THREE.Box3()
        .setFromObject(selectedGroup)
        .getCenter(new THREE.Vector3());
      floorCenter.y += manifest.floors.explode[getProps().floor] - selectedGroup.position.y;
      center.lerp(floorCenter, 0.4);
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const v = new THREE.Vector3(x, y, z).sub(center);
          minX = Math.min(minX, v.dot(right));
          maxX = Math.max(maxX, v.dot(right));
          minY = Math.min(minY, v.dot(up));
          maxY = Math.max(maxY, v.dot(up));
        }
    const { scale, top } = getProps().layout;
    const pixelsPerUnit = element.clientHeight / (camera.top - camera.bottom);
    goalZoom =
      Math.min(
        (1000 * scale) / ((maxX - minX) * pixelsPerUnit),
        (540 * scale) / ((maxY - minY) * pixelsPerUnit),
      ) * 0.92;
    // 安全区中心位于逻辑画布y=575，补偿全视口与UI居中的位置差。
    goalTarget
      .copy(center)
      .addScaledVector(
        up,
        (top + 550 * scale - element.clientHeight / 2) / (pixelsPerUnit * goalZoom),
      );
    goalPosition.copy(goalTarget).addScaledVector(direction, 270);
    animating = true;
  };
  return {
    reset,
    focus,
    fitFloors,
    cancel() {
      animating = false;
    },
    zoom(n: number) {
      const { controls } = getContext();
      goalZoom = THREE.MathUtils.clamp(camera.zoom * (n > 0 ? 1.18 : 0.85), 0.65, 2.7);
      goalPosition.copy(camera.position);
      if (controls) goalTarget.copy(controls.target);
      animating = true;
    },
    update(dt: number) {
      const { controls } = getContext();
      if (!animating || !controls) return;
      const a = 1 - Math.exp(-Math.min(dt, 50) / (getProps().mode === 'tour' ? 600 : 180));
      camera.position.lerp(goalPosition, a);
      controls.target.lerp(goalTarget, a);
      camera.zoom = THREE.MathUtils.lerp(camera.zoom, goalZoom, a);
      camera.updateProjectionMatrix();
      if (
        camera.position.distanceTo(goalPosition) < 0.08 &&
        Math.abs(camera.zoom - goalZoom) < 0.001
      )
        animating = false;
    },
  };
}
