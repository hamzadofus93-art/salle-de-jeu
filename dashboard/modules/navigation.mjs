import { PAGE_NAMES } from "../shared/config.mjs";
import { appContext } from "../shared/context.mjs";
import { userIsSudo } from "./session.mjs";

export function normalizePageName(pageName) {
  return PAGE_NAMES.includes(pageName) ? pageName : "home";
}

export function setActivePage(pageName, options = {}) {
  const { elements } = appContext;
  const { updateHash = true } = options;
  let nextPage = normalizePageName(pageName);

  if (nextPage === "accounts" && !userIsSudo()) {
    nextPage = "home";
  }

  elements.pageViews.forEach((pageView) => {
    const isActive = pageView.dataset.page === nextPage;

    pageView.hidden = !isActive;
    pageView.classList.toggle("is-active", isActive);
  });

  elements.pageTabs.forEach((pageTab) => {
    pageTab.classList.toggle("is-active", pageTab.dataset.pageTab === nextPage);
  });

  if (updateHash) {
    const nextHash = `#${nextPage}`;

    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }
}
