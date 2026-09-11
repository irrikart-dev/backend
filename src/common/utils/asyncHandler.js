// wraps an async route handler so a rejected promise reaches errorHandler.js via next(err)
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
