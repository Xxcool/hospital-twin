// 同一业务快照驱动折线过渡、测点提示和键盘焦点，不生成独立随机曲线。
import { useEffect, useRef, useState } from 'react';
import type { Frame } from '../data/model';

type Point = { outpatient: number; emergency: number };
export function Trend({ frame }: { frame: Frame }) {
  const [points, setPoints] = useState<Point[]>(frame.trend);
  const displayed = useRef(points);
  const [hovered, setHovered] = useState<number | null>(null);
  useEffect(() => {
    const start = displayed.current.map((p) => ({ ...p }));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      displayed.current = frame.trend;
      setPoints(frame.trend);
      return;
    }
    const began = performance.now();
    let raf = 0;
    const animate = (now: number) => {
      const t = Math.min(1, (now - began) / 750),
        eased = 1 - (1 - t) ** 3;
      const next = frame.trend.map((p, i) => ({
        outpatient: start[i].outpatient + (p.outpatient - start[i].outpatient) * eased,
        emergency: start[i].emergency + (p.emergency - start[i].emergency) * eased,
      }));
      displayed.current = next;
      setPoints(next);
      if (t < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [frame.trend]);
  const w = 350,
    h = 210,
    left = 33,
    top = 24,
    bottom = 30;
  const max = Math.max(
    180,
    Math.ceil(Math.max(...frame.trend.flatMap((v) => [v.outpatient, v.emergency])) / 60) * 60,
  );
  const px = (i: number) => left + 24 + (i * (w - left - 46)) / 2;
  const py = (n: number) => top + (h - top - bottom) * (1 - n / max);
  return (
    <div className="trend-visual" onPointerLeave={() => setHovered(null)}>
      <svg
        className="trend-chart"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${frame.time}前一小时门急诊到诊趋势`}
      >
        <defs>
          <linearGradient id="arrival-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".13" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const n = (max * i) / 3;
          return (
            <g key={i}>
              <line x1={left} x2={w - 4} y1={py(n)} y2={py(n)} className="chart-grid" />
              <text x={left - 8} y={py(n) + 5} textAnchor="end" className="axis-text">
                {n}
              </text>
            </g>
          );
        })}
        <g className="outpatient">
          <path
            d={`M ${px(0)} ${py(0)} L ${points.map((p, i) => `${px(i)} ${py(p.outpatient)}`).join(' L ')} L ${px(2)} ${py(0)} Z`}
            fill="url(#arrival-area)"
          />
        </g>
        {(['outpatient', 'emergency'] as const).map((key) => (
          <g key={key} className={key}>
            <polyline
              points={points.map((p, i) => `${px(i)},${py(p[key])}`).join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={px(i)} cy={py(p[key])} r={hovered === i ? 6 : 4} fill="currentColor" />
                <text x={px(i)} y={py(p[key]) - 11} textAnchor="middle" className="point-text">
                  {Math.round(p[key])}
                </text>
              </g>
            ))}
          </g>
        ))}
        {frame.trend.map((p, i) => (
          <g
            key={p.time}
            tabIndex={0}
            role="button"
            aria-label={`${p.time}，门诊${p.outpatient}，急诊${p.emergency}`}
            onPointerEnter={() => setHovered(i)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
          >
            {hovered === i && (
              <line x1={px(i)} x2={px(i)} y1={top} y2={py(0)} className="chart-guide" />
            )}
            <rect x={px(i) - 35} y={top - 15} width="70" height={h - top} fill="transparent" />
            <text x={px(i)} y={h - 7} textAnchor="middle" className="axis-text">
              {p.time}
            </text>
          </g>
        ))}
      </svg>
      {hovered !== null && (
        <div
          className="chart-tooltip"
          role="status"
          style={{ left: `${Math.min(67, Math.max(2, hovered * 35))}%` }}
        >
          <strong>{frame.trend[hovered].time}</strong>
          <span>
            <i className="outpatient" />
            门诊<b>{frame.trend[hovered].outpatient}</b>人次
          </span>
          <span>
            <i className="emergency" />
            急诊<b>{frame.trend[hovered].emergency}</b>人次
          </span>
        </div>
      )}
    </div>
  );
}
