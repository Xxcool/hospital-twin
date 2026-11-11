// 日夜只决定视觉光照；业务指标仍使用独立的演示快照。
export function isNightTime(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 18 || hour < 6;
}
