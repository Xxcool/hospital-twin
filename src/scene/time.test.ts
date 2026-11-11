import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNightTime } from './time';

test('设备本地时间18点至次日6点为夜景，跨午夜和日夜边界正确', () => {
  for (const [hour, minute, expected] of [
    [0, 0, true],
    [5, 59, true],
    [6, 0, false],
    [12, 0, false],
    [17, 59, false],
    [18, 0, true],
    [19, 0, true],
    [23, 59, true],
  ] as const) {
    assert.equal(isNightTime(new Date(2026, 10, 11, hour, minute)), expected, `${hour}:${minute}`);
  }
});
