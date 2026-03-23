import { appContext } from "./context.mjs";

export function showToast(message) {
  const { elements } = appContext;

  if (!elements.toast) {
    return;
  }

  elements.toast.textContent = message;
  elements.toast.classList.add("visible");

  if (appContext.toastTimer) {
    window.clearTimeout(appContext.toastTimer);
  }

  appContext.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2600);
}
