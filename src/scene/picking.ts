type PointerSample = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'button'>;

export function createClickGesture() {
  const active = new Set<number>();
  let candidate: { id: number; x: number; y: number; dragged: boolean } | null = null;
  const distance = (event: PointerSample) =>
    candidate ? Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) : Infinity;
  return {
    down(event: PointerSample) {
      const first = active.size === 0;
      active.add(event.pointerId);
      // 多指一旦介入就取消本轮点击资格，剩余手指松开时不能重新变成点击。
      candidate =
        first && event.button === 0
          ? { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }
          : null;
    },
    move(event: PointerSample) {
      if (candidate?.id === event.pointerId && distance(event) > 6) candidate.dragged = true;
    },
    up(event: PointerSample) {
      const pick =
        active.has(event.pointerId) &&
        candidate?.id === event.pointerId &&
        event.button === 0 &&
        !candidate.dragged &&
        distance(event) <= 6;
      active.delete(event.pointerId);
      if (candidate?.id === event.pointerId) candidate = null;
      return pick;
    },
    cancel(event: Pick<PointerEvent, 'pointerId'>) {
      if (!active.delete(event.pointerId)) return;
      candidate = null;
    },
    clear() {
      active.clear();
      candidate = null;
    },
  };
}
