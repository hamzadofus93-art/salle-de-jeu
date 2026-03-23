let renderApp = () => {};

export function registerRender(nextRender) {
  renderApp = nextRender;
}

export function rerender() {
  renderApp();
}
