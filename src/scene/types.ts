// 场景边界契约：React 提供状态和事件，Three.js 模块只消费已提交的状态。
import type { Frame, RegionId } from '../data/model';
export type SceneMode = 'overview' | 'region' | 'tour' | 'floor' | 'rotate';
export interface Manifest {
  model: string;
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    orthoHeight: number;
  };
  tour: RegionId[];
  floors: {
    root: string;
    groups: Record<string, string>;
    explode: Record<string, number>;
    back: Record<string, number>;
  };
}
export interface PerformanceSample {
  fps: number;
  p95: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  loadMs: number;
  dpr: number;
}
export interface SceneHandle {
  home: () => void;
  focus: (id: RegionId) => void;
  zoom: (direction: number) => void;
}
export interface SceneProps {
  selected: RegionId | null;
  frame: Frame;
  mode: SceneMode;
  floor: 'f1' | 'f2';
  zone: 'waiting' | 'consultation' | null;
  night: boolean;
  layout: { scale: number; left: number; top: number };
  onSelect: (id: RegionId) => void;
  onTourRegion: (id: RegionId) => void;
  onManualNavigation: () => void;
  onPerformance: (sample: PerformanceSample) => void;
  onFloorSelect: (id: 'f1' | 'f2') => void;
}
