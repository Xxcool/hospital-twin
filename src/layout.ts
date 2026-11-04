export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportLayout {
  width: number;
  height: number;
  scale: number;
  logicalWidth: number;
  logicalHeight: number;
  labels: ViewportRect;
  focus: ViewportRect;
}

// 设计尺寸只决定界面比例，窗口多出的空间留给场景；相机与标签共用同一组面板边界。
export function getViewportLayout(width: number, height: number): ViewportLayout {
  const scale = Math.min(width / 1920, height / 1080);
  const labels = {
    x: 428 * scale,
    y: 225 * scale,
    width: width - 856 * scale,
    height: height - 475 * scale,
  };
  return {
    width,
    height,
    scale,
    logicalWidth: width / scale,
    logicalHeight: height / scale,
    labels,
    focus: {
      x: labels.x + 42 * scale,
      y: labels.y + 60 * scale,
      width: labels.width - 84 * scale,
      height: labels.height - 75 * scale,
    },
  };
}
