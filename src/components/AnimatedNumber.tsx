// 数值只在业务快照变更时过渡，不通过随机跳动冒充实时数据。
import { useEffect, useRef, useState } from 'react';

export function AnimatedNumber({ value, grouped = false }: { value: number; grouped?: boolean }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current,
      started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 650);
      current.current = Math.round(from + (value - from) * (1 - (1 - t) ** 3));
      setShown(current.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{grouped ? shown.toLocaleString() : shown}</>;
}
