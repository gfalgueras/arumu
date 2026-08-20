import { describe, it, expect } from 'vitest';
import { computeWindow } from '../../src/renderer/services/virtualWindow';

const base = { rowHeight: 25, viewportHeight: 500, overscan: 10 };

describe('computeWindow', () => {
  it('renders everything before the viewport is measured', () => {
    const w = computeWindow({ ...base, rowCount: 1000, scrollTop: 0, viewportHeight: 0 });
    expect(w).toEqual({ start: 0, end: 1000, padTop: 0, padBottom: 0 });
  });

  it('handles an empty page', () => {
    const w = computeWindow({ ...base, rowCount: 0, scrollTop: 0 });
    expect(w.start).toBe(0);
    expect(w.end).toBe(0);
  });

  it('renders only the visible slice plus overscan at the top', () => {
    const w = computeWindow({ ...base, rowCount: 1000, scrollTop: 0 });
    expect(w.start).toBe(0);
    // 500 / 25 = 20 visible, + 10 overscan
    expect(w.end).toBe(30);
    expect(w.padTop).toBe(0);
    expect(w.padBottom).toBe((1000 - 30) * 25);
  });

  it('pads above and below when scrolled into the middle', () => {
    const w = computeWindow({ ...base, rowCount: 1000, scrollTop: 5000 });
    // row 200 is first visible; 10 rows of overscan above
    expect(w.start).toBe(190);
    expect(w.end).toBe(230);
    expect(w.padTop).toBe(190 * 25);
    expect(w.padBottom).toBe((1000 - 230) * 25);
  });

  it('keeps total height constant regardless of scroll position', () => {
    const total = 1000 * 25;
    for (const scrollTop of [0, 1234, 9999, 24_000]) {
      const w = computeWindow({ ...base, rowCount: 1000, scrollTop });
      const rendered = (w.end - w.start) * 25;
      expect(w.padTop + rendered + w.padBottom).toBe(total);
    }
  });

  it('clamps at the bottom without overrunning the row count', () => {
    const w = computeWindow({ ...base, rowCount: 1000, scrollTop: 1000 * 25 });
    expect(w.end).toBe(1000);
    expect(w.padBottom).toBe(0);
    expect(w.start).toBeLessThan(w.end);
  });

  it('ignores negative scrollTop from overscroll bounce', () => {
    const w = computeWindow({ ...base, rowCount: 1000, scrollTop: -200 });
    expect(w.start).toBe(0);
    expect(w.padTop).toBe(0);
  });

  it('renders every row when the page is shorter than the viewport', () => {
    const w = computeWindow({ ...base, rowCount: 5, scrollTop: 0 });
    expect(w.start).toBe(0);
    expect(w.end).toBe(5);
    expect(w.padTop).toBe(0);
    expect(w.padBottom).toBe(0);
  });
});
