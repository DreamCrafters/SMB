import assert from "node:assert/strict";

export function startRowDrag(window, handle, to, heights) {
  assert.ok(handle, "drag handle exists");
  assert.equal(handle.disabled, false);
  const rows = Array.from(handle.closest('[data-reorder-row]').parentElement.children);
  const from = rows.indexOf(handle.closest('[data-reorder-row]'));
  let top = 0;
  const bounds = rows.map((row, index) => {
    const height = heights?.[index] ?? 60;
    const rect = { top, bottom: top + height, height };
    top += height;
    row.getBoundingClientRect = () => rect;
    return rect;
  });
  const endY = bounds[to].top + bounds[to].height * (to > from ? 0.75 : 0.25);
  let pending;
  const previousFrame = window.requestAnimationFrame;
  const previousCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (callback) => { pending = callback; return 1; };
  window.cancelAnimationFrame = () => { pending = undefined; };
  function pointer(target, type, y) {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    target.dispatchEvent(event);
  }
  pointer(handle, 'pointerdown', bounds[from].top + bounds[from].height / 2);
  pointer(window, 'pointermove', endY);
  pending?.(16);
  return {
    finish(type = 'pointerup') {
      if (type === 'Escape') window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
      else pointer(window, type, endY);
      window.requestAnimationFrame = previousFrame;
      window.cancelAnimationFrame = previousCancel;
    },
  };
}
