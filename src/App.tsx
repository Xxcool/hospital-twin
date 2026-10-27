// 已确认日夜与楼层v2的整屏入口；统一管理区域、回放时段与场景操作。
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CampusScene,
  type PerformanceSample,
  type SceneHandle,
  type SceneMode,
} from './scene/CampusScene';
import {
  contextRegions,
  getFrame,
  isServiceRegion,
  periods,
  regions,
  type RegionId,
} from './data/model';
import { Icon } from './components/Icon';
import { Trend } from './components/Trend';
import { AnimatedNumber } from './components/AnimatedNumber';

export default function App() {
  const [period, setPeriod] = useState(1);
  const [selected, setSelected] = useState<RegionId | null>('outpatient');
  const [mode, setMode] = useState<SceneMode>('overview');
  const [floor, setFloor] = useState<'f1' | 'f2'>('f1');
  const [night, setNight] = useState(false);
  // 回放时段决定默认日夜；手动预览保持到下一次时段切换。
  useEffect(() => {
    setNight(periods[period].minute >= 18 * 60);
  }, [period]);
  const [detail, setDetail] = useState(false);
  const [zone, setZone] = useState<'waiting' | 'consultation' | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [performanceSample, setPerformanceSample] = useState<PerformanceSample | null>(null);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [message, setMessage] = useState('');
  // 固定设计画布等比适配；设备像素比只由三维渲染器处理。
  const viewport = useRef<HTMLElement>(null);
  const [fit, setFit] = useState(() => {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    return {
      scale,
      left: (window.innerWidth - 1920 * scale) / 2,
      top: (window.innerHeight - 1080 * scale) / 2,
    };
  });
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const scale = Math.min(width / 1920, height / 1080);
      setFit({ scale, left: (width - 1920 * scale) / 2, top: (height - 1080 * scale) / 2 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scene = useRef<SceneHandle>(null);
  const frame = useMemo(() => getFrame(period), [period]);
  const region = regions.find((r) => r.id === selected);
  const regional = isServiceRegion(selected) ? frame[selected] : null;
  const context = selected && !isServiceRegion(selected) ? contextRegions[selected] : null;

  const home = () => {
    setZone(null);
    setMode('overview');
    setSelected('outpatient');
    setDetail(false);
    scene.current?.home();
  };
  const choose = (id: RegionId) => {
    setSelected(id);
    setDetail(false);
    setZone(null);
    setMode('region');
    scene.current?.focus(id);
  };
  const switchMode = (next: SceneMode) => {
    setZone(null);
    setDetail(false);
    if (next === 'overview') {
      home();
      return;
    }
    if (next === mode) {
      home();
      return;
    }
    if (next === 'floor') setSelected('outpatient');
    setMode(next);
  };
  const inspectZone = (target: 'waiting' | 'consultation') => {
    setZone(target);
    setDetail(false);
    setSelected('outpatient');
    setMode('floor');
  };
  const inspect = () => {
    if (!selected) return;
    setDetail(true);
    if (mode !== 'floor') {
      setMode('region');
      scene.current?.focus(selected);
    }
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled) await document.documentElement.requestFullscreen();
      else setMessage('预览容器不支持系统全屏，可在独立浏览器打开');
    } catch {
      setMessage('全屏未开启，请在浏览器中点击全屏按钮');
    }
  };
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () =>
        setPeriod((i) => {
          if (i === periods.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      4500,
    );
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetail(false);
        setShowInfo(false);
        setMessage('');
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  return (
    <main
      ref={viewport}
      className="viewport"
      data-theme={night ? 'night' : 'day'}
      style={{ '--label-unit': `${fit.scale}px` } as React.CSSProperties}
    >
      <section
        className="scene-stage"
        aria-label="院区交互场景"
        style={{ left: fit.left, top: fit.top, width: 1920 * fit.scale, height: 1080 * fit.scale }}
      >
        <CampusScene
          ref={scene}
          selected={selected}
          frame={frame}
          mode={mode}
          floor={floor}
          zone={zone}
          night={night}
          layout={{ scale: fit.scale, left: 0, top: 0 }}
          onSelect={choose}
          onTourRegion={setSelected}
          onManualNavigation={() => {
            if (mode === 'tour' || mode === 'rotate') setMode('overview');
          }}
          onFloorSelect={setFloor}
          onPerformance={setPerformanceSample}
        />
      </section>

      <div
        className="dashboard"
        style={{ left: fit.left, top: fit.top, transform: `scale(${fit.scale})` }}
      >
        <header className="screen-header glass">
          <div className="brand">
            <i />
            <h1>
              <span>同济医院光谷院区</span>
              <small>智慧运行中心</small>
            </h1>
          </div>
          <div className="header-kpis" aria-label="重点区域概览">
            {[
              {
                icon: 'peopleGroup',
                label: '累计接诊',
                value: frame.total.cumulative,
                unit: '人次',
              },
              { icon: 'people', label: '当前候诊', value: frame.total.waiting, unit: '人' },
              { icon: 'building', label: '开放服务点', value: frame.total.open, unit: '个' },
            ].map((k) => (
              <article className="overview-kpi" key={k.label}>
                <span className="kpi-icon">
                  <Icon name={k.icon} size={29} />
                </span>
                <div>
                  <span className="kpi-label">{k.label}</span>
                  <p>
                    <strong data-testid={k.label}>
                      <AnimatedNumber value={k.value} grouped />
                    </strong>
                    <span className="unit">{k.unit}</span>
                  </p>
                </div>
              </article>
            ))}
          </div>
          <div className="header-utilities">
            <span className="clock">
              <Icon name="clock" size={24} />
              <strong data-testid="active-time">{frame.time}</strong>
            </span>
            <button aria-label="项目说明" title="项目说明" onClick={() => setShowInfo(true)}>
              <Icon name="info" size={20} />
            </button>
            <button
              aria-label={fullscreen ? '退出全屏' : '全屏显示'}
              title={fullscreen ? '退出全屏' : '全屏显示'}
              onClick={toggleFullscreen}
            >
              <Icon name="focus" size={23} />
            </button>
          </div>
        </header>

        <nav className="top-nav glass" aria-label="区域视图">
          <button className={mode === 'overview' ? 'active' : ''} onClick={home}>
            院区总览
          </button>
          <button
            className={mode === 'region' && selected === 'outpatient' ? 'active' : ''}
            onClick={() => choose('outpatient')}
          >
            门诊
          </button>
          <button
            className={mode === 'region' && selected === 'emergency' ? 'active' : ''}
            onClick={() => choose('emergency')}
          >
            急诊
          </button>
        </nav>

        <aside className="left-rail" aria-label="区域与到诊导览">
          <section
            className={`navigation-card glass ${mode === 'floor' ? 'floor-navigation' : ''}`}
          >
            <h2>
              <Icon name={mode === 'floor' ? 'layers' : 'pin'} size={25} />
              {mode === 'floor' ? '楼层导览' : '院区导览'}
            </h2>
            {mode === 'floor' ? (
              <>
                <p className="floor-context">综合门诊 · 入口大厅</p>
                <div className="floor-list">
                  {(['f2', 'f1'] as const).map((id) => (
                    <button
                      key={id}
                      className={floor === id ? 'active' : ''}
                      aria-pressed={floor === id}
                      onClick={() => setFloor(id)}
                    >
                      <b>{id === 'f1' ? '1F' : '2F'}</b>示意<span>›</span>
                    </button>
                  ))}
                </div>
                <div className="floor-stack" aria-hidden="true">
                  <i className={floor === 'f2' ? 'active' : ''}>2F</i>
                  <i className={floor === 'f1' ? 'active' : ''}>1F</i>
                </div>
                <button className="back-campus" onClick={home}>
                  ‹　返回院区
                </button>
              </>
            ) : (
              <nav className="building-index" aria-label="建筑选择">
                {regions.map((r) => (
                  <button
                    key={r.id}
                    className={selected === r.id ? 'active' : ''}
                    aria-pressed={selected === r.id}
                    onClick={() => choose(r.id)}
                  >
                    <b>{r.number}</b>
                    {r.name}
                    <span>›</span>
                  </button>
                ))}
              </nav>
            )}
          </section>
          <section className="trend-card glass">
            <h2>
              <Icon name="chart" size={25} />
              分时到诊
            </h2>
            <div className="trend-caption">
              <span>前1小时到诊人次</span>
              <div className="chart-legend">
                <span className="outpatient">门诊</span>
                <span className="emergency">急诊</span>
              </div>
            </div>
            <Trend frame={frame} />
          </section>
        </aside>

        <aside className="right-rail" aria-label="区域运行详情">
          <section className="detail-card glass">
            <div className="card-heading">
              <h2>
                <Icon
                  name={context?.icon ?? (selected === 'emergency' ? 'cross' : 'stethoscope')}
                  size={25}
                />
                <span data-testid="selected-region">{region?.name ?? '区域详情'}</span>
              </h2>
              <span className="selected-tag">{mode === 'floor' ? '区域统计' : '已选中'}</span>
            </div>
            {regional ? (
              <>
                <div className="regional-metrics" aria-label="所选区域指标">
                  <div>
                    <Icon name="people" size={23} />
                    <span>{selected === 'emergency' ? '待接诊人数' : '候诊人数'}</span>
                    <p>
                      <strong>
                        <AnimatedNumber value={regional.waiting} />
                      </strong>
                      <small>人</small>
                    </p>
                  </div>
                  <div>
                    <Icon name="clock" size={23} />
                    <span>等候中位数</span>
                    <p>
                      <strong>
                        <AnimatedNumber value={regional.medianWait} />
                      </strong>
                      <small>分钟</small>
                    </p>
                    <small className="metric-note">近30分钟已开始接诊者</small>
                  </div>
                  <div>
                    <Icon name="building" size={23} />
                    <span>开放服务点</span>
                    <p>
                      <strong>
                        <AnimatedNumber value={regional.open} />
                      </strong>
                      <small>/ {regional.capacity}</small>
                    </p>
                  </div>
                </div>
                <section className="resource-section">
                  <div className="resource-heading">
                    <h3>资源分布示意</h3>
                    <span>内部空间为示意设计</span>
                  </div>
                  <div className="resource-counts">
                    <span>
                      <i />
                      开放 <b>{regional.open}</b>
                      <small>个</small>
                    </span>
                    <span>
                      <i />
                      未开放 <b>{regional.capacity - regional.open}</b>
                      <small>个</small>
                    </span>
                  </div>
                  <div className="resource-bar">
                    <span style={{ width: `${(regional.open / regional.capacity) * 100}%` }}>
                      {Math.round((regional.open / regional.capacity) * 100)}%
                    </span>
                    <small>{Math.round((1 - regional.open / regional.capacity) * 100)}%</small>
                  </div>
                </section>
                {selected === 'outpatient' ? (
                  <div className="zone-buttons" data-zone={zone ?? ''}>
                    <button
                      aria-pressed={zone === 'waiting'}
                      onClick={() => inspectZone('waiting')}
                    >
                      <Icon name="people" size={23} />
                      候诊区
                    </button>
                    <button
                      aria-pressed={zone === 'consultation'}
                      onClick={() => inspectZone('consultation')}
                    >
                      <Icon name="pin" size={23} />
                      接诊区
                    </button>
                  </div>
                ) : (
                  <button className="primary-button" onClick={inspect}>
                    急诊资源详情
                  </button>
                )}
                {zone && mode === 'floor' && (
                  <p className="zone-focus-note">
                    {zone === 'waiting'
                      ? `候诊空间示意 · ${regional.waiting}人候诊 · 等候中位数${regional.medianWait}分钟`
                      : `接诊空间示意 · 开放服务点${regional.open}/${regional.capacity}`}
                    <button onClick={() => setZone(null)}>查看整层</button>
                  </p>
                )}
              </>
            ) : (
              context && (
                <div className="context-detail">
                  <div className="context-banner">
                    <Icon name={context.icon} size={38} />
                    <div>
                      <small>院区空间导览</small>
                      <strong>{context.subtitle}</strong>
                    </div>
                  </div>
                  <dl className="context-facts">
                    <div>
                      <dt>空间位置</dt>
                      <dd>{context.position}</dd>
                    </div>
                    <div>
                      <dt>建筑特征</dt>
                      <dd>{context.appearance}</dd>
                    </div>
                    <div>
                      <dt>区域关联</dt>
                      <dd>{context.relation}</dd>
                    </div>
                  </dl>
                  <p className="context-source">
                    依据实景照片进行外观示意；内部功能、容量及运行数据尚未核实。
                  </p>
                  <button className="primary-button" onClick={() => choose(context.related)}>
                    前往{regions.find((r) => r.id === context.related)?.name}　›
                  </button>
                </div>
              )
            )}
          </section>
          <section className="emergency-card glass">
            <h2>
              <span className="cross-icon">
                <Icon name="cross" size={24} />
              </span>
              急诊
              <button
                className="subtle-button"
                onClick={() => choose('emergency')}
                aria-label="查看急诊详情"
              >
                ↗
              </button>
            </h2>
            <div className="emergency-metrics">
              <div>
                <span>待接诊</span>
                <p className="coral">
                  <Icon name="person" size={22} />
                  <strong>
                    <AnimatedNumber value={frame.emergency.waiting} />
                  </strong>
                  <small>人</small>
                </p>
              </div>
              <div>
                <span>留观占用</span>
                <p className="observation-value">
                  <Icon name="bed" size={22} />
                  <strong>
                    <AnimatedNumber value={frame.emergency.observation!.used} />
                  </strong>
                  <small>/ {frame.emergency.observation!.capacity}</small>
                </p>
              </div>
              <div>
                <span>开放服务点</span>
                <p className="service-value">
                  <Icon name="building" size={22} />
                  <strong>
                    <AnimatedNumber value={frame.emergency.open} />
                  </strong>
                  <small>/ {frame.emergency.capacity}</small>
                </p>
              </div>
            </div>
          </section>
        </aside>

        {mode === 'floor' && (
          <div className="floor-notice glass">
            <strong>
              {zone
                ? `${floor === 'f1' ? '1F' : '2F'} · ${zone === 'waiting' ? '候诊区' : '接诊区'}空间示意`
                : '门诊入口楼层示意'}
            </strong>
            <span>内部空间未核实，采用示意设计</span>
          </div>
        )}
        {mode === 'tour' && (
          <div className="tour-caption glass">
            <i />
            院区巡游 · {region?.name}
            <button onClick={home}>结束巡游</button>
          </div>
        )}
        <div className="scene-tools">
          <span className="compass glass" aria-label="北向指示">
            <svg viewBox="0 0 24 48" aria-hidden="true">
              <path d="M12 2 20 24H4Z" fill="#ff5138" />
              <path d="M4 24h16L12 46Z" fill="#1765ff" />
              <path d="M12 2v44l8-22Z" fill="#fff" opacity=".18" />
            </svg>
          </span>
          <div className="zoom-controls glass">
            <button aria-label="放大场景" onClick={() => scene.current?.zoom(1)}>
              ＋
            </button>
            <button aria-label="缩小场景" onClick={() => scene.current?.zoom(-1)}>
              −
            </button>
          </div>
        </div>
        <nav className="scene-toolbar glass" aria-label="场景操作">
          {[
            { id: 'overview', label: '总览', icon: 'eye' },
            { id: 'tour', label: '巡游', icon: 'tour' },
            { id: 'floor', label: '楼层', icon: 'layers' },
            { id: 'rotate', label: '旋转', icon: 'rotate' },
          ].map((b) => (
            <button
              key={b.id}
              className={mode === b.id ? 'active' : ''}
              aria-pressed={mode === b.id}
              onClick={() => switchMode(b.id as SceneMode)}
            >
              <Icon name={b.icon} size={24} />
              <span>{b.label}</span>
            </button>
          ))}
          <button
            aria-label={night ? '切换日间' : '切换夜间'}
            aria-pressed={night}
            onClick={() => setNight((v) => !v)}
          >
            <Icon name={night ? 'sun' : 'moon'} size={24} />
            <span>{night ? '日间' : '夜间'}</span>
          </button>
        </nav>
        <div className="scene-note">
          区域位置为示意表达{' '}
          <button onClick={() => setShowPerformance((v) => !v)} aria-expanded={showPerformance}>
            性能 {showPerformance ? '−' : '+'}
          </button>
        </div>
        {showPerformance && (
          <aside className="performance-panel glass" aria-label="场景性能">
            <strong>当前浏览器 · 实测</strong>
            {performanceSample ? (
              <dl>
                {[
                  ['帧率', `${performanceSample.fps} FPS`],
                  ['帧时间 P95', `${performanceSample.p95} ms`],
                  ['绘制调用', performanceSample.calls],
                  ['三角形', performanceSample.triangles.toLocaleString()],
                  ['模型加载', `${performanceSample.loadMs} ms`],
                  ['像素比', performanceSample.dpr.toFixed(2)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>正在采集…</p>
            )}
            <small>含当前光照与相机条件</small>
          </aside>
        )}

        <footer className="playback glass">
          <div className="playback-label">
            时段回放
            <button
              aria-label={playing ? '暂停回放' : '播放回放'}
              className="play-button"
              onClick={() => {
                if (!playing && period === 3) setPeriod(0);
                setPlaying((v) => !v);
              }}
            >
              <Icon name={playing ? 'pause' : 'play'} size={18} />
            </button>
          </div>
          <div className="period-track">
            {periods.map((p, i) => (
              <button
                key={p.hour}
                className={i === period ? 'active' : ''}
                aria-pressed={i === period}
                onClick={() => {
                  setPeriod(i);
                  setPlaying(false);
                }}
              >
                <span className="period-label">
                  <i />
                  <strong>{p.hour}</strong>
                  <span>{p.name}</span>
                </span>
              </button>
            ))}
          </div>
          <button className="home-button" onClick={home}>
            <Icon name="home" size={23} />
            返回总览
          </button>
        </footer>
        {message && (
          <button className="toast glass" onClick={() => setMessage('')}>
            {message} ×
          </button>
        )}
        {detail && selected && (
          <aside className="detail-drawer glass" role="dialog" aria-label={`${region?.name}详情`}>
            <header>
              <div>
                <span>空间与资源</span>
                <h2>{region?.name}</h2>
              </div>
              <button aria-label="关闭区域详情" onClick={() => setDetail(false)}>
                <Icon name="close" />
              </button>
            </header>
            <p className="drawer-time">
              当前时段 <strong>{frame.time}</strong>
              <span>{frame.label}</span>
            </p>
            <p className="drawer-note">以下分区为功能示意，不对应真实楼层和诊室号。</p>
            {regional?.zones.map((z) => (
              <div className="zone-detail" key={z.name}>
                <span>{z.name}</span>
                <strong>
                  {z.open}
                  <small> / {z.total}</small>
                </strong>
                <i>
                  <b style={{ width: `${(z.open / z.total) * 100}%` }} />
                </i>
              </div>
            ))}
            {!regional && <p className="drawer-note">此区域为院区背景参照，后续按实景逐区深化。</p>}
            <button
              className="primary-button"
              onClick={() => {
                setDetail(false);
                setSelected('outpatient');
                setMode('floor');
              }}
            >
              查看门诊入口楼层示意
            </button>
          </aside>
        )}
        {showInfo && (
          <div className="dialog-backdrop" onClick={() => setShowInfo(false)}>
            <section
              className="about-dialog glass"
              role="dialog"
              aria-modal="true"
              aria-label="项目说明"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="dialog-close"
                aria-label="关闭项目说明"
                onClick={() => setShowInfo(false)}
              >
                <Icon name="close" />
              </button>
              <span>项目说明</span>
              <h2>院区空间与运行演示</h2>
              <p>
                以公开资料及用户提供的实景照片为原型。运行数据均为演示配置，不代表同济医院真实运行情况。
              </p>
              <p>
                内部空间、楼层和未核实的区域位置采用示意设计。当前先验证门诊入口代表区域，其他建筑仍为院区上下文。
              </p>
              <button className="primary-button" onClick={() => setShowInfo(false)}>
                返回大屏
              </button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
