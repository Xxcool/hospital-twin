import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClickGesture } from './picking';

const pointer = (pointerId = 1, clientX = 100, clientY = 100, button = 0) => ({
  pointerId,
  clientX,
  clientY,
  button,
});

test('左键点击与6px以内抖动允许拾取，终点超出阈值与右键不拾取', () => {
  const gesture = createClickGesture();
  gesture.down(pointer());
  assert.equal(gesture.up(pointer()), true);
  gesture.down(pointer());
  gesture.move(pointer(1, 106));
  assert.equal(gesture.up(pointer(1, 106)), true);
  gesture.down(pointer());
  assert.equal(gesture.up(pointer(1, 107)), false);
  gesture.down(pointer(1, 100, 100, 2));
  assert.equal(gesture.up(pointer(1, 100, 100, 2)), false);
  gesture.down(pointer());
  assert.equal(gesture.up(pointer(1, 100, 100, 2)), false);
});

test('拖远后返回起点仍是拖拽，下一次独立点击恢复', () => {
  const gesture = createClickGesture();
  gesture.down(pointer());
  gesture.move(pointer(1, 130));
  gesture.move(pointer(1, 102));
  assert.equal(gesture.up(pointer(1, 102)), false);
  gesture.down(pointer());
  assert.equal(gesture.up(pointer()), true);
});

test('抬起必须与按下的pointerId配对，无关指针不会移动或结束候选点击', () => {
  const gesture = createClickGesture();
  assert.equal(gesture.up(pointer()), false);
  gesture.down(pointer());
  gesture.move(pointer(2, 200));
  assert.equal(gesture.up(pointer(2)), false);
  assert.equal(gesture.up(pointer()), true);
});

test('双指交错与第三指介入都不拾取，全部结束后才能重新点击', () => {
  for (const order of [
    [1, 2],
    [2, 1],
  ]) {
    const gesture = createClickGesture();
    gesture.down(pointer(1));
    gesture.down(pointer(2));
    assert.equal(gesture.up(pointer(order[0])), false);
    gesture.down(pointer(3));
    assert.equal(gesture.up(pointer(3)), false);
    assert.equal(gesture.up(pointer(order[1])), false);
    gesture.down(pointer(4));
    assert.equal(gesture.up(pointer(4)), true);
  }
});

test('取消、失去捕获或窗口失焦后清理状态，不留下误拾取资格', () => {
  const gesture = createClickGesture();
  gesture.down(pointer());
  gesture.cancel(pointer());
  assert.equal(gesture.up(pointer()), false);
  gesture.down(pointer());
  gesture.clear();
  assert.equal(gesture.up(pointer()), false);
  gesture.down(pointer(1));
  gesture.down(pointer(2));
  gesture.cancel(pointer(1));
  assert.equal(gesture.up(pointer(2)), false);
  gesture.down(pointer(3));
  assert.equal(gesture.up(pointer(3)), true);
});
