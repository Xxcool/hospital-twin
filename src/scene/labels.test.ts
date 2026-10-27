// 验证标签在有限窗口内避让、无解隐藏，以及建筑遮挡与隐藏对象的语义。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { isAnchorOccluded, placeLabel } from './labels';

test('同位置的标签避让且整体保持在安全区内，空间耗尽时隐藏', () => {
  const safe = { x: 100, y: 80, width: 200, height: 120 };
  const occupied = [{ x: 100, y: 80, width: 200, height: 30 }];
  const first = placeLabel({ x: 150, y: 120 }, { width: 80, height: 25 }, safe, occupied, 5);
  assert.ok(first);
  assert.ok(first.y >= 115);
  const second = placeLabel(
    { x: 150, y: 120 },
    { width: 80, height: 25 },
    safe,
    [...occupied, first],
    5,
  );
  assert.ok(second);
  assert.ok(
    second.y >= first.y + first.height + 5 ||
      second.x >= first.x + first.width + 5 ||
      second.x + second.width + 5 <= first.x,
  );
  assert.equal(placeLabel({ x: 150, y: 120 }, { width: 210, height: 25 }, safe, [], 5), null);
  assert.equal(placeLabel({ x: 150, y: 120 }, { width: 80, height: 25 }, safe, [safe], 5), null);
});

test('正交射线隐藏被其他建筑挡住的标签，忽略自身及已隐藏楼层', () => {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 2), material);
  mesh.position.set(5, 0, 10);
  mesh.userData.objectId = 'inpatient';
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  const point = new THREE.Vector3(5, 0, 0);
  assert.equal(isAnchorOccluded('outpatient', point, camera, [mesh]), true);
  assert.equal(isAnchorOccluded('inpatient', point, camera, [mesh]), false);
  group.visible = false;
  assert.equal(isAnchorOccluded('outpatient', point, camera, [mesh]), false);
  group.visible = true;
  mesh.userData.floorId = 'f1';
  assert.equal(isAnchorOccluded('floor_f1', point, camera, [mesh]), false);
  assert.equal(isAnchorOccluded('floor_f2', point, camera, [mesh]), true);
  material.transparent = true;
  material.opacity = 0.1;
  assert.equal(isAnchorOccluded('floor_f2', point, camera, [mesh]), false);
  mesh.geometry.dispose();
  material.dispose();
});
