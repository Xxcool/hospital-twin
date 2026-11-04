import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import './SceneLoading.css';

export type LoadingPhase = 'resources' | 'scene' | 'ready';
const phases = [
  { id: 'resources', label: '载入院区资源', detail: '读取建筑模型与空间信息' },
  { id: 'scene', label: '构建数字空间', detail: '准备建筑、材质与场景光影' },
  { id: 'ready', label: '呈现院区全景', detail: '等待三维场景首帧就绪' },
];

export function SceneLoading({
  phase,
  downloaded,
  total,
  error,
  night,
}: {
  phase: LoadingPhase;
  downloaded: number;
  total: number;
  error: string;
  night: boolean;
}) {
  const patternId = useId();
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const wasInert = root.inert;
    root.inert = true;
    return () => {
      root.inert = wasInert;
    };
  }, []);
  const step = phases.findIndex((item) => item.id === phase);
  const determinate = phase === 'resources' && total > 0;
  const percent = total > 0 ? Math.min(100, Math.floor((downloaded / total) * 100)) : 0;

  // 脱离场景裁切与固定大屏缩放，独立适配整个浏览器视口。
  return createPortal(
    <section
      className={`scene-loading ${error ? 'scene-loading--error' : ''}`}
      data-theme={night ? 'night' : 'day'}
      data-loading-phase={phase}
      aria-label="院区空间加载"
      aria-busy={!error}
    >
      <header className="sl-header">
        <div className="sl-brand">
          <span className="sl-mark" aria-hidden="true">
            ＋
          </span>
          <span>
            同济医院光谷院区<small>智慧运行中心</small>
          </span>
        </div>
        <div className="sl-header-note">
          <span aria-hidden="true" />
          {error ? '资源准备中断' : '正在准备院区空间'}
        </div>
      </header>
      <div className="sl-layout">
        <div className="sl-copy">
          <div className="sl-kicker">
            <span>空间序章</span>
            <span aria-hidden="true">CAMPUS / 01</span>
          </div>
          <h1>
            {error ? (
              <>
                空间暂未就绪<span>稍后再试一次</span>
              </>
            ) : (
              <>
                正在展开<span>院区数字空间</span>
              </>
            )}
          </h1>
          <p className="sl-description">
            从建筑到空间，从全景到细节。
            <br />
            一座院区的运行图景，即将呈现。
          </p>
          <div className="sl-readout">
            <div className="sl-value" aria-hidden="true">
              {error
                ? '!'
                : determinate
                  ? String(percent).padStart(2, '0')
                  : String(step + 1).padStart(2, '0')}
              <span>{determinate && !error ? '%' : error ? '' : '/ 03'}</span>
            </div>
            <div className="sl-readout-detail">
              <span>{error ? '加载已暂停' : determinate ? '空间资源下载' : '当前准备阶段'}</span>
              <small>
                {determinate && !error
                  ? `${(downloaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`
                  : error
                    ? '请检查网络后重新载入'
                    : '首次进入，请稍候'}
              </small>
            </div>
          </div>
          <div
            className={`sl-track ${determinate || error ? '' : 'sl-track--pending'}`}
            role={error ? undefined : 'progressbar'}
            aria-label="院区资源准备"
            aria-valuemin={error ? undefined : 0}
            aria-valuemax={error ? undefined : 100}
            aria-valuenow={determinate && !error ? percent : undefined}
          >
            {determinate && !error && <i style={{ width: `${percent}%` }} />}
          </div>
          <p className="sl-status" role={error ? 'alert' : 'status'}>
            {error ? '院区资源未能完成载入。请重试。' : phases[step].detail}
          </p>
          {error && (
            <button className="sl-retry" type="button" onClick={() => location.reload()}>
              重新载入 <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
        <div className="sl-map" aria-hidden="true">
          <div className="sl-map-top">
            <span>院区空间索引</span>
            <span>SPATIAL ATLAS</span>
          </div>
          <div className="sl-map-drawing">
            <svg viewBox="0 0 660 620" fill="none">
              <defs>
                <pattern
                  id={patternId}
                  width="7"
                  height="7"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <path d="M0 0v7" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <g className="sl-plan" transform="translate(75 50) rotate(-22 260 260)">
                <path className="sl-boundary" d="M24 72h292l31 34h138v379H24Z" />
                <path
                  className="sl-road"
                  d="M-20 33h349l35 35h160v458H-20ZM-20 343h544M316 68v458"
                />
                <path
                  className="sl-landscape"
                  d="M50 95h70v59H50Zm314 40h92v69h-92ZM50 382h92v77H50Zm302 11h105v66H352Z"
                />
                <g className="sl-trees">
                  <circle cx="67" cy="114" r="9" />
                  <circle cx="98" cy="133" r="9" />
                  <circle cx="380" cy="153" r="10" />
                  <circle cx="432" cy="180" r="10" />
                  <circle cx="68" cy="405" r="10" />
                  <circle cx="119" cy="439" r="9" />
                  <circle cx="375" cy="432" r="10" />
                  <circle cx="434" cy="415" r="10" />
                </g>
                <path
                  className="sl-building-shadow"
                  d="M161 100h126v186H161Zm-98 85h75v100H63Zm294 53h103v90H357ZM174 384h114v90H174Z"
                />
                <path
                  className="sl-building"
                  d="M151 90h126v176H151Zm-98 85h75v100H53Zm294 53h103v90H347ZM164 374h114v90H164Z"
                />
                <path
                  className="sl-hatch"
                  style={{ fill: `url(#${patternId})` }}
                  d="M158 97h112v24H158Zm0 138h112v24H158ZM60 182h61v20H60Zm294 53h89v20h-89ZM171 437h100v20H171Z"
                />
                <path
                  className="sl-walls"
                  d="M158 128h112m-112 34h112m-112 34h112m-112 34h112M184 128v102m53-102v102m-40-133v24m31-24v24M60 209h61m-61 30h61m-34-30v59m267-6h89m-89 24h89m-48-48v73M171 381h100m-100 25h100m-100 25h100m-62-50v50m31-50v50"
                />
                <path className="sl-connector" d="M128 221h23m126 0h35v51h35m-121-6v49h61v104h-9" />
                <path className="sl-courtyard" d="M183 153h62v65h-62Z" />
                <path className="sl-cross" d="M207 176h15m-7-7v15" />
                <g className="sl-route">
                  <path d="M7 344h308V194h174" />
                  <circle cx="315" cy="344" r="6" />
                  <circle cx="489" cy="194" r="4" />
                </g>
                <path
                  className="sl-measure"
                  d="M25 561h460M25 555v12m460-12v12M550 107v378m-6-378h12m-12 378h12"
                />
                <g className="sl-plan-numbers">
                  <text x="204" y="294">
                    01
                  </text>
                  <text x="70" y="302">
                    02
                  </text>
                  <text x="387" y="347">
                    03
                  </text>
                  <text x="205" y="493">
                    04
                  </text>
                </g>
              </g>
              <g className="sl-callout">
                <path d="M320 128h108l28-28h142" />
                <circle cx="320" cy="128" r="3" />
                <text x="478" y="90">
                  建筑空间
                </text>
                <path d="M372 447h95l27 27h104" />
                <circle cx="372" cy="447" r="3" />
                <text x="508" y="498">
                  院区脉络
                </text>
              </g>
            </svg>
          </div>
          <div className="sl-map-bottom">
            <span>
              <i /> 建筑 · 连廊 · 院区
            </span>
            <span>空间关系示意</span>
          </div>
        </div>
      </div>
      <footer className="sl-footer">
        <ol className="sl-steps" aria-label="加载阶段">
          {phases.map((item, index) => (
            <li
              key={item.id}
              className={index < step ? 'done' : index === step ? 'active' : ''}
              aria-current={index === step ? 'step' : undefined}
            >
              <span className="sl-step-number" aria-hidden="true">
                {index < step ? '✓' : `0${index + 1}`}
              </span>
              <span>{item.label}</span>
              <i aria-hidden="true" />
            </li>
          ))}
        </ol>
        <div className="sl-disclaimer">
          数字孪生可视化演示<span>非官方系统</span>
        </div>
      </footer>
    </section>,
    document.body,
  );
}
