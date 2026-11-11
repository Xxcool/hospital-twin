import { useEffect, useState } from 'react';
import { Icon } from './Icon';

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const pad = (value: number) => String(value).padStart(2, '0');

// 时钟独立更新，避免每秒重新渲染三维场景和业务面板。
export function LocalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(() => {
      if (!document.hidden) update();
    }, 1000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return (
    <time className="clock" dateTime={now.toISOString()} title="设备本地时间，与模拟回放时段独立">
      <span className="clock-date" data-testid="local-date">
        {now.getFullYear()}-{pad(now.getMonth() + 1)}-{pad(now.getDate())}
        <span>{weekdays[now.getDay()]}</span>
      </span>
      <span className="clock-time">
        <Icon name="clock" size={23} />
        <strong data-testid="local-time">
          {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
        </strong>
      </span>
    </time>
  );
}
