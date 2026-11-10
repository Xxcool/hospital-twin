import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTrafficSimulation, trafficHeadway } from './traffic';
import type { Manifest } from './types';

const config = (JSON.parse(readFileSync('public/scene/manifest.json', 'utf8')) as Manifest)
  .ambientLife;
const curves = config.lanes.map(
  (lane) =>
    new THREE.CatmullRomCurve3(
      lane.points.map((p) => new THREE.Vector3(...p)),
      true,
      'centripetal',
    ),
);
const lengths = curves.map((curve) => curve.getLength());

test('13辆车持续按各自节奏行驶，停靠和跟车期间保持同车道安全间距', () => {
  assert.equal(config.vehicles.length, 13);
  const simulation = createTrafficSimulation(config.vehicles, lengths);
  const stopped = new Set<string>();
  for (let frame = 0; frame < 180 * 60; frame++) {
    simulation.update(1 / 60);
    for (const state of simulation.states) {
      assert.ok(Number.isFinite(state.distance) && state.speed >= 0);
      assert.ok(state.speed <= state.spec.cruise + 1e-6);
      if (state.waiting > 0) stopped.add(state.spec.node);
    }
    for (let lane = 0; lane < lengths.length; lane++) {
      const positions = simulation.states
        .filter((s) => s.spec.lane === lane)
        .map((s) => s.distance % lengths[lane])
        .sort((a, b) => a - b);
      positions.forEach((value, index) => {
        const next = positions[(index + 1) % positions.length];
        const gap = index + 1 === positions.length ? next + lengths[lane] - value : next - value;
        assert.ok(gap >= trafficHeadway - 0.02, `车道${lane}间距${gap}`);
      });
    }
  }
  assert.ok(stopped.size >= 3, '应观察到不同车辆停靠');
  assert.ok(simulation.states.every((s) => s.travelled > 100));
  assert.ok(new Set(simulation.states.map((s) => Math.round(s.travelled))).size > 5);
});

test('停靠后恢复行驶，暂停和后台长时间差不会造成瞬移', () => {
  const spec = {
    ...config.vehicles[0],
    lane: 0,
    ordinal: 0,
    stopFraction: 0.25,
    dwell: 2,
    lapsBetweenStops: 1,
  };
  const simulation = createTrafficSimulation([spec], [100]);
  let sawStop = false,
    resumed = false;
  for (let i = 0; i < 120 * 60; i++) {
    simulation.update(1 / 60);
    const state = simulation.states[0];
    if (state.waiting > 0) sawStop = true;
    if (sawStop && state.speed > 0.5) resumed = true;
  }
  assert.ok(sawStop && resumed);
  const before = simulation.states[0].distance;
  simulation.update(0);
  assert.equal(simulation.states[0].distance, before);
  simulation.update(3600);
  assert.ok(simulation.states[0].distance - before <= spec.cruise * 0.05 + 0.01);
});

test('30fps与60fps下相同时间的行驶距离接近，速度不依赖帧数', () => {
  const spec = { ...config.vehicles[0], ordinal: 0, stopFraction: 0.9 };
  const fast = createTrafficSimulation([spec], lengths);
  const slow = createTrafficSimulation([spec], lengths);
  for (let i = 0; i < 20 * 60; i++) fast.update(1 / 60);
  for (let i = 0; i < 20 * 30; i++) slow.update(1 / 30);
  assert.ok(Math.abs(fast.states[0].travelled - slow.states[0].travelled) < 0.2);
});

test('转弯时车身四角仍位于原有道路的内外边界之间', () => {
  const lanes = config.lanes;
  const inner: [number, number][] = [],
    outer: [number, number][] = [];
  lanes[0].points.forEach((point, index) => {
    const opposite = lanes[1].points[lanes[1].points.length - 1 - index];
    const center = new THREE.Vector3(...point)
      .add(new THREE.Vector3(...opposite))
      .multiplyScalar(0.5);
    const normal = new THREE.Vector3(...opposite).sub(new THREE.Vector3(...point)).normalize();
    const a = center.clone().addScaledVector(normal, -config.roadHalfWidth);
    const b = center.clone().addScaledVector(normal, config.roadHalfWidth);
    inner.push([a.x, a.z]);
    outer.push([b.x, b.z]);
  });
  const inside = (x: number, y: number, polygon: [number, number][]) => {
    let contained = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i],
        b = polygon[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
        contained = !contained;
    }
    return contained;
  };
  for (const curve of curves)
    for (let i = 0; i < 1000; i++) {
      const center = curve.getPointAt(i / 1000),
        direction = curve.getTangentAt(i / 1000);
      const side = new THREE.Vector3(-direction.z, 0, direction.x);
      for (const length of [-2.4, 2.4])
        for (const width of [-1.05, 1.05]) {
          const corner = center
            .clone()
            .addScaledVector(direction, length)
            .addScaledVector(side, width);
          assert.ok(
            inside(corner.x, corner.z, outer) && !inside(corner.x, corner.z, inner),
            `车身越出路面：${corner.x},${corner.z}`,
          );
        }
    }
});
