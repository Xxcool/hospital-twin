// 验证跨面板共用口径与资源分区守恒，避免分项与总览独立造数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFrame, periods } from './model';

test('每个时段总览等于区域分项，资源分区守恒', () => {
  periods.forEach((_, i) => {
    const f = getFrame(i);
    assert.equal(f.total.waiting, f.outpatient.waiting + f.emergency.waiting);
    assert.equal(f.total.open, f.outpatient.open + f.emergency.open);
    assert.equal(f.total.cumulative, f.outpatient.cumulative + f.emergency.cumulative);
    for (const region of [f.outpatient, f.emergency]) {
      assert.equal(
        region.zones.reduce((n, z) => n + z.open, 0),
        region.open,
      );
      assert.equal(
        region.zones.reduce((n, z) => n + z.total, 0),
        region.capacity,
      );
      assert.ok(region.open <= region.capacity);
    }
    assert.deepEqual(f, getFrame(i));
  });
});

test('10:00与已确认设计快照一致，累计量跨时段递增', () => {
  assert.deepEqual(getFrame(1).total, { waiting: 172, open: 48, cumulative: 1286 });
  assert.equal(getFrame(1).outpatient.medianWait, 26);
  assert.deepEqual(getFrame(1).emergency.observation, { used: 18, capacity: 24 });
  assert.ok(
    periods.every((_, i) => !i || getFrame(i).total.cumulative > getFrame(i - 1).total.cumulative),
  );
  assert.throws(() => getFrame(-1));
});
