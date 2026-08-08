import assert from "node:assert/strict";
import test from "node:test";
import {
  markToastExiting,
  prependToast,
  removeToast,
  shouldToastAutoDismiss,
} from "../.test-build/src/services/toastStack.js";

const firstToast = {
  id: 1,
  title: "Первое",
  message: "Первое уведомление",
  state: "visible",
};
const secondToast = {
  id: 2,
  title: "Второе",
  message: "Второе уведомление",
  state: "visible",
};

test("new notifications are prepended to the vertical toast stack", () => {
  assert.deepEqual(prependToast([firstToast], secondToast), [
    secondToast,
    firstToast,
  ]);
});

test("toast exit and removal preserve the remaining stack order", () => {
  const exitingStack = markToastExiting([secondToast, firstToast], 2);

  assert.deepEqual(exitingStack, [
    { ...secondToast, state: "exiting" },
    firstToast,
  ]);
  assert.deepEqual(removeToast(exitingStack, 2), [firstToast]);
});

test("only the welcome notification closes automatically", () => {
  assert.equal(shouldToastAutoDismiss("Добро пожаловать"), true);
  assert.equal(shouldToastAutoDismiss("Совет директоров"), false);
  assert.equal(shouldToastAutoDismiss("Просрочено поручение"), false);
  assert.equal(shouldToastAutoDismiss("Сохранено"), false);
});
