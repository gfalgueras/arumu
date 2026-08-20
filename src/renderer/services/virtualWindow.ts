/**
 * Windowing maths for the data grid's virtual scrolling.
 *
 * Pure so it can be tested without mounting the component or a browser: the
 * grid renders only `[start, end)` and pads above and below with spacer rows
 * so the scrollbar still spans the whole page of rows.
 */

export interface VirtualWindow {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
}

export interface WindowInput {
  rowCount: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
  /** Extra rows rendered off-screen each way, to hide scroll latency. */
  overscan: number;
}

export function computeWindow({
  rowCount,
  rowHeight,
  scrollTop,
  viewportHeight,
  overscan,
}: WindowInput): VirtualWindow {
  // Before the viewport has been measured, render everything rather than
  // guessing — a wrong guess here shows a blank grid on first paint.
  if (rowCount === 0 || rowHeight <= 0 || viewportHeight <= 0) {
    return { start: 0, end: rowCount, padTop: 0, padBottom: 0 };
  }

  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight);

  const start = Math.max(0, first - overscan);
  const end = Math.min(rowCount, first + visible + overscan);

  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: Math.max(0, (rowCount - end) * rowHeight),
  };
}
