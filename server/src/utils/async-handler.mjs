export function asyncHandler(handler) {
  return async function wrappedHandler(request, response, next) {
    try {
      await handler(request, response, next);
    } catch (error) {
      next(error);
    }
  };
}
