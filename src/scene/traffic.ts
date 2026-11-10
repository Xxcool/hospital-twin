export interface VehicleSpec {
  node: string;
  lane: number;
  ordinal: number;
  cruise: number;
  rhythm: number;
  phase: number;
  stopFraction: number;
  dwell: number;
  lapsBetweenStops: number;
}
export interface VehicleState {
  spec: VehicleSpec;
  distance: number;
  travelled: number;
  speed: number;
  waiting: number;
  nextStop: number;
}
export const trafficHeadway = 7;
const wrap = (distance: number, length: number) => ((distance % length) + length) % length;

// 独立的氛围交通时钟；不改变接诊、候诊等业务快照，也不把帧率当车速。
export function createTrafficSimulation(specs: VehicleSpec[], lengths: number[]) {
  let elapsed = 0;
  const states: VehicleState[] = specs.map((spec) => {
    const count = specs.filter((other) => other.lane === spec.lane).length;
    const length = lengths[spec.lane];
    const distance = (spec.ordinal / count + 0.05) * length;
    let nextStop = (Math.floor(distance / length) + spec.stopFraction) * length;
    if (nextStop <= distance + trafficHeadway) nextStop += spec.lapsBetweenStops * length;
    return { spec, distance, travelled: 0, speed: 0, waiting: 0, nextStop };
  });
  return {
    states,
    update(delta: number) {
      // 后台恢复或慢帧只推进小步，避免跨越车道、站点或前车。
      const dt = Math.max(0, Math.min(delta, 0.05));
      if (!dt) return;
      elapsed += dt;
      const distances = states.map((state) => state.distance);
      states.forEach((state, index) => {
        const { spec } = state;
        const length = lengths[spec.lane];
        if (state.waiting > 0) {
          state.waiting = Math.max(0, state.waiting - dt);
          if (state.waiting === 0) state.nextStop += length * spec.lapsBetweenStops;
          return;
        }
        let gap = length;
        states.forEach((other, otherIndex) => {
          if (index !== otherIndex && other.spec.lane === spec.lane)
            gap = Math.min(gap, wrap(distances[otherIndex] - distances[index], length));
        });
        const remaining = Math.max(0, state.nextStop - state.distance);
        const cruise =
          spec.cruise *
          (0.88 + 0.12 * Math.sin((elapsed * Math.PI * 2) / spec.rhythm + spec.phase));
        const target = Math.min(
          cruise,
          Math.sqrt(2 * 1.4 * remaining),
          Math.max(0, (gap - trafficHeadway) / 1.4),
        );
        const speed = Math.max(
          0,
          state.speed + Math.max(-3 * dt, Math.min(1.4 * dt, target - state.speed)),
        );
        const step = Math.min(speed * dt, remaining, Math.max(0, gap - trafficHeadway));
        state.distance += step;
        state.travelled += step;
        state.speed = step / dt;
        if (remaining - step < 0.01) {
          state.distance = state.nextStop;
          state.speed = 0;
          state.waiting = spec.dwell;
        }
      });
    },
  };
}
