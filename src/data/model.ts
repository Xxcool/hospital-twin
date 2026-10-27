// 演示快照与区域身份的唯一消费入口；所有面板和场景共用同一时段快照。
import baseline from '../../docs/design/snapshot.json';

export const regions = [
  { id: 'outpatient', number: '01', name: '综合门诊', short: '门诊' },
  { id: 'emergency', number: '02', name: '急诊', short: '急诊' },
  { id: 'medtech', number: '03', name: '医技', short: '医技' },
  { id: 'inpatient', number: '04', name: '住院区', short: '住院区' },
  { id: 'children', number: '05', name: '儿童医院', short: '儿童医院' },
  { id: 'parking', number: '06', name: '停车楼', short: '停车楼' },
] as const;
export type RegionId = (typeof regions)[number]['id'];
// 仅描述当前模型与照片参照，不将未核实的建筑用途、床位或停车容量作为真实数据。
export const contextRegions = {
  medtech: {
    icon: 'grid',
    subtitle: '中央连接区',
    position: '位于入口大厅后方、两侧楼群之间',
    appearance: '低层体量与纵向玻璃连接廊',
    relation: '连接门诊入口与院区后部楼群',
    related: 'outpatient',
  },
  inpatient: {
    icon: 'building',
    subtitle: '右侧临床楼群',
    position: '当前院区视图右侧，向后延伸',
    appearance: '多栋较高板楼，横向窗带与浅色竖向构件',
    relation: '与中央医技区共同构成入口后的建筑组团',
    related: 'medtech',
  },
  children: {
    icon: 'peopleGroup',
    subtitle: '左侧临床楼群',
    position: '当前院区视图左侧，停车楼内侧',
    appearance: '较高板楼与连续窗带，保留入口侧立面轮廓',
    relation: '与门诊入口及中央连接区相邻',
    related: 'outpatient',
  },
  parking: {
    icon: 'building',
    subtitle: '左侧圆角建筑',
    position: '当前院区视图最左侧',
    appearance: '圆角端部、连续水平带与平屋面',
    relation: '作为左侧楼群和外围道路之间的空间参照',
    related: 'children',
  },
} as const;
export const periods = [
  { hour: '08:00', name: '开诊', minute: 480 },
  { hour: '10:00', name: '门诊集中', minute: 600 },
  { hour: '15:00', name: '午后回落', minute: 900 },
  { hour: '20:00', name: '急诊关注', minute: 1200 },
] as const;

export interface RegionFrame {
  waiting: number;
  medianWait: number;
  open: number;
  capacity: number;
  cumulative: number;
  observation?: { used: number; capacity: number };
  zones: { name: string; open: number; total: number }[];
}
export interface Frame {
  index: number;
  time: string;
  label: string;
  outpatient: RegionFrame;
  emergency: RegionFrame;
  total: { waiting: number; open: number; cumulative: number };
  trend: { time: string; outpatient: number; emergency: number }[];
}

// 四个确定性的演示情境，不冒充医院真实排班或经过校准的排队模型。
const profiles = [
  {
    opd: [72, 16, 32, 350],
    ed: [15, 9, 5, 70],
    observation: 12,
    trend: [
      [22, 13],
      [48, 16],
      [85, 18],
    ],
  },
  {
    opd: [
      baseline.outpatient.waitingPeople,
      baseline.outpatient.waitMedianMinutes,
      baseline.outpatient.openServicePoints,
      baseline.overview.cumulativeEncounters - 136,
    ],
    ed: [baseline.emergency.waitingPeople, 12, baseline.emergency.openServicePoints, 136],
    observation: baseline.emergency.observationOccupied,
    trend: baseline.arrivalTrend.outpatient.map((n, i) => [n, baseline.arrivalTrend.emergency[i]]),
  },
  {
    opd: [58, 14, 36, 2210],
    ed: [18, 10, 6, 258],
    observation: 14,
    trend: [
      [112, 23],
      [98, 24],
      [76, 21],
    ],
  },
  {
    opd: [12, 8, 8, 2398],
    ed: [38, 19, 8, 400],
    observation: 21,
    trend: [
      [38, 32],
      [23, 39],
      [12, 46],
    ],
  },
];

function splitZones(open: number, total: number, labels: string[]) {
  return labels.map((name, i) => ({
    name,
    total: Math.floor(total / labels.length) + (i < total % labels.length ? 1 : 0),
    open: Math.floor(open / labels.length) + (i < open % labels.length ? 1 : 0),
  }));
}

export function getFrame(index: number): Frame {
  const p = profiles[index];
  if (!p) throw new Error('未知演示时段');
  const period = periods[index];
  const outpatient: RegionFrame = {
    waiting: p.opd[0],
    medianWait: p.opd[1],
    open: p.opd[2],
    cumulative: p.opd[3],
    capacity: baseline.outpatient.configuredServicePoints,
    zones: splitZones(p.opd[2], baseline.outpatient.configuredServicePoints, [
      '接诊区 A',
      '接诊区 B',
      '接诊区 C',
      '接诊区 D',
    ]),
  };
  const emergency: RegionFrame = {
    waiting: p.ed[0],
    medianWait: p.ed[1],
    open: p.ed[2],
    cumulative: p.ed[3],
    capacity: baseline.emergency.configuredServicePoints,
    observation: { used: p.observation, capacity: baseline.emergency.observationCapacity },
    zones: splitZones(p.ed[2], baseline.emergency.configuredServicePoints, [
      '接诊区',
      '留观支持区',
    ]),
  };
  const hour = Number(period.hour.slice(0, 2));
  return {
    index,
    time: period.hour,
    label: period.name,
    outpatient,
    emergency,
    total: {
      waiting: outpatient.waiting + emergency.waiting,
      open: outpatient.open + emergency.open,
      cumulative: outpatient.cumulative + emergency.cumulative,
    },
    trend: p.trend.map((v, i) => ({
      time: `${String(hour - 2 + i).padStart(2, '0')}:00`,
      outpatient: v[0],
      emergency: v[1],
    })),
  };
}

export const isServiceRegion = (id: RegionId | null): id is 'outpatient' | 'emergency' =>
  id === 'outpatient' || id === 'emergency';
