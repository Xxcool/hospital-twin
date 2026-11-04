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

test('扩展窗口保留界面比例，并同步扩展标签和相机安全区', async () => {
  const { getViewportLayout } = await import('../layout');
  const base = getViewportLayout(1920, 1080);
  assert.deepEqual(base.labels, { x: 428, y: 225, width: 1064, height: 605 });
  assert.deepEqual(base.focus, { x: 470, y: 285, width: 980, height: 530 });
  const wide = getViewportLayout(2560, 1080);
  assert.equal(wide.scale, base.scale);
  assert.equal(wide.focus.width - base.focus.width, 640);
  assert.equal(wide.labels.width - base.labels.width, 640);
  const short = getViewportLayout(1440, 810);
  const tall = getViewportLayout(1440, 900);
  assert.equal(tall.scale, short.scale);
  assert.equal(tall.focus.height - short.focus.height, 90);
  assert.equal(tall.labels.height - short.labels.height, 90);
  for (const layout of [base, wide, short, tall, getViewportLayout(1280, 720)]) {
    assert.equal(layout.logicalWidth * layout.scale, layout.width);
    assert.equal(layout.logicalHeight * layout.scale, layout.height);
    assert.ok(layout.focus.x > layout.labels.x);
    assert.ok(layout.focus.y > layout.labels.y);
    assert.ok(layout.focus.y + layout.focus.height < layout.labels.y + layout.labels.height);
    assert.equal(layout.focus.x + layout.focus.width / 2, layout.width / 2);
  }
});
