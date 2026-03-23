import { elements } from "./dom.mjs";
import { loadState } from "../state/store.mjs";

export const appContext = {
  elements,
  state: loadState(),
  toastTimer: null,
  activeSession:
    window.Auth?.guardCurrentPage?.() || window.Auth?.getSession?.() || null,
};
