import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatedNumber } from './AnimatedNumber';
import './SceneLoading.css';

export type LoadingPhase = 'resources' | 'scene' | 'ready';
const phases = [
  { id: 'resources', label: '资源载入', message: '正在载入院区资源' },
  { id: 'scene', label: '场景构建', message: '正在构建院区空间' },
  { id: 'ready', label: '全景呈现', message: '正在准备首帧画面' },
];
// 固定的装饰粒子只表现光场，不承载业务状态或下载进度。
const particles = Array.from({ length: 28 }, (_, index) => ({
  left: `${17 + ((index * 17) % 42)}%`,
  top: `${18 + ((index * 23) % 53)}%`,
  '--delay': `${-(index % 9) * 0.63}s`,
  '--duration': `${4 + (index % 5) * 0.7}s`,
  '--drift': `${(index % 2 ? 1 : -1) * (12 + (index % 4) * 8)}px`,
}));

export function SceneLoading({
  phase,
  downloaded,
  total,
  error,
  complete,
  onExited,
}: {
  phase: LoadingPhase;
  downloaded: number;
  total: number;
  error: string;
  complete: boolean;
  onExited: () => void;
}) {
  useEffect(() => {
    if (complete) return;
    const root = document.getElementById('root');
    if (!root) return;
    const wasInert = root.inert;
    root.inert = true;
    return () => {
      root.inert = wasInert;
    };
  }, [complete]);
  useEffect(() => {
    if (!complete) return;
    // 仅为已完成首帧的画面保留淡出时间，不延迟资源就绪或伪造加载进度。
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450;
    const timer = window.setTimeout(onExited, delay);
    return () => window.clearTimeout(timer);
  }, [complete, onExited]);

  const step = phases.findIndex((item) => item.id === phase);
  const resourcesLoaded = phase !== 'resources' || complete;
  const percent = resourcesLoaded
    ? 100
    : total > 0
      ? Math.min(100, Math.floor((downloaded / total) * 100))
      : null;
  const determinate = percent !== null;
  const message = error ? '院区资源暂未就绪' : complete ? '院区空间已就绪' : phases[step].message;

  return createPortal(
    <section
      className={`scene-loading ${complete ? 'scene-loading--complete' : ''} ${error ? 'scene-loading--error' : ''}`}
      data-loading-phase={complete ? 'complete' : phase}
      data-loaded-bytes={downloaded}
      data-total-bytes={total}
      aria-label="院区空间加载"
      aria-busy={!complete && !error}
    >
      <div className="sl-art" aria-hidden="true">
        <img
          className="sl-background"
          src={`${import.meta.env.BASE_URL}images/loading-campus-a.png`}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
        <div className="sl-curtain" />
        <div className="sl-particles">
          {particles.map((style, index) => (
            <i key={index} style={style as CSSProperties} />
          ))}
        </div>
        <svg className="sl-energy" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice">
          <path d="M1230 663C1088 762 608 737 363 637S210 494 411 396" />
        </svg>
      </div>
      <header className="sl-brand">
        <i aria-hidden="true" />
        <div>
          同济医院光谷院区<small>智慧运行中心</small>
        </div>
      </header>
      <h1 className="sl-headline">
        院区全景，
        <br />
        即将展开
      </h1>
      <div className="sl-bottom">
        <div className="sl-panel">
          <div className="sl-layers" aria-hidden="true">
            <img src={`${import.meta.env.BASE_URL}images/loading-layers.png`} alt="" />
          </div>
          <div className="sl-progress-body">
            <div className="sl-progress-head">
              <p className="sl-message" role={error ? 'alert' : 'status'}>
                {message}
              </p>
              <ol className="sl-steps" aria-label="加载阶段">
                {phases.map((item, index) => (
                  <li
                    key={item.id}
                    className={complete || index < step ? 'done' : index === step ? 'active' : ''}
                    aria-current={!complete && index === step ? 'step' : undefined}
                  >
                    <span className="sl-step-item">
                      <i aria-hidden="true">
                        {(complete || index < step) && (
                          <svg viewBox="0 0 24 24">
                            <path d="m6 12 4 4 8-8" />
                          </svg>
                        )}
                      </i>
                      <span>{item.label}</span>
                    </span>
                    {index < phases.length - 1 && (
                      <span className="sl-step-connector" aria-hidden="true" />
                    )}
                  </li>
                ))}
              </ol>
            </div>
            {error ? (
              <div className="sl-error-actions">
                <span>请检查网络后重新载入</span>
                <button type="button" onClick={() => location.reload()}>
                  重新载入 <span aria-hidden="true">↻</span>
                </button>
              </div>
            ) : (
              <div
                className={`sl-track ${determinate ? '' : 'sl-track--pending'}`}
                role="progressbar"
                aria-label="院区模型资源下载"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
                aria-valuetext={
                  complete
                    ? '院区空间已就绪'
                    : resourcesLoaded
                      ? '资源下载完成，正在准备场景画面'
                      : percent === null
                        ? '正在等待资源下载信息'
                        : `已下载 ${percent}%`
                }
              >
                {determinate && (
                  <i style={{ width: `${percent}%` }}>
                    <b />
                  </i>
                )}
              </div>
            )}
          </div>
          <div className="sl-readout" aria-hidden="true">
            <strong>
              {error || percent === null ? (
                '—'
              ) : complete ? (
                '100'
              ) : (
                <AnimatedNumber value={percent} />
              )}
            </strong>
            {!error && determinate && <span>%</span>}
            <small>
              {error
                ? '等待重试'
                : total > 0
                  ? `${(downloaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`
                  : resourcesLoaded
                    ? '资源下载完成'
                    : '正在准备资源'}
            </small>
          </div>
        </div>
        <p className="sl-disclaimer">数字孪生可视化演示 · 非官方系统</p>
      </div>
    </section>,
    document.fullscreenElement ?? document.body,
  );
}
