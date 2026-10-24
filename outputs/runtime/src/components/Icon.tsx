// 业务图标采用实心剪影，场景操作采用统一线性图标，与已确认方案保持一致。
export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    layers: <><path d="m2 7 10-5 10 5-10 5ZM2 12l10 5 10-5M2 17l10 5 10-5"/></>,
    tour: <><path d="M4 16H2v-5l3-1 2-5h10l2 5 3 1v5h-3M8 16h8M5 10h14"/><circle cx="6" cy="16" r="2"/><circle cx="18" cy="16" r="2"/></>,
    moon: <path d="M20 15A9 9 0 0 1 9 3 9 9 0 1 0 20 15Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
    stethoscope: <><path d="M5 3v7a5 5 0 0 0 10 0V3M3 3h4m6 0h4M10 15v3a4 4 0 0 0 8 0v-3"/><circle cx="18" cy="12" r="3"/></>,
    home: <path fill="currentColor" stroke="none" d="m1 11 11-9 5 4V3h3v5l3 3-2 2-1-1v10h-6v-7h-4v7H4V12l-1 1Z"/>,
    peopleGroup: <g fill="currentColor" stroke="none"><circle cx="12" cy="6" r="3.5"/><circle cx="4" cy="9" r="2.6"/><circle cx="20" cy="9" r="2.6"/><path d="M6 22v-7a6 6 0 0 1 12 0v7ZM0 21v-6a4 4 0 0 1 5-3v9Zm19 0v-9a4 4 0 0 1 5 3v6Z"/></g>,
    people: <g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="4"/><path d="M2 22v-6a7 7 0 0 1 14 0v6ZM17 10a3.5 3.5 0 1 0-2-6 6 6 0 0 1 0 5Zm1 12v-6c0-2-.5-3-1-4 4-1 6 2 6 5v5Z"/></g>,
    building: <path fill="currentColor" stroke="none" fillRule="evenodd" d="M3 2h13v8h5v11h2v2H1v-2h2Zm3 3v2h2V5Zm5 0v2h2V5ZM6 10v2h2v-2Zm5 0v2h2v-2ZM6 15v2h2v-2Zm5 0v2h2v-2Zm-3 5v3h3v-3Zm10-7v2h1v-2Zm0 4v2h1v-2Z"/>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/></>,
    cross: <><path fill="currentColor" stroke="none" d="M8 1h8a3 3 0 0 1 3 3v1h1a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-1v1a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-1H4a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h1V4a3 3 0 0 1 3-3Z"/><path stroke="white" strokeWidth="3" d="M12 6v12M6 12h12"/></>,
    person: <><circle cx="12" cy="6" r="4"/><path d="M4 21v-4a8 8 0 0 1 16 0v4Z"/></>,
    bed: <><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/><path d="M3 3v19M3 16h18v6M3 12h18v4M11 8h7a3 3 0 0 1 3 3v1H11Z"/></>,
    chart: <g fill="currentColor" stroke="none"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="2" width="4" height="19" rx="1"/></g>,
    focus: <><path d="M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5"/><circle cx="12" cy="12" r="4"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 10v7m0-11v1"/></>,
    play: <path d="m8 4 12 8-12 8Z"/>,
    pause: <><path d="M8 4v16M16 4v16"/></>,
    rotate: <><path d="M21 9A9 9 0 1 0 21 16M21 3v6h-6"/></>,
    close: <path d="m5 5 14 14M19 5 5 19"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.building}</svg>;
}
