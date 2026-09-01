/** An error carrying an HTTP status, so routes can `throw` instead of branching. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
  static badRequest(msg, details) { return new HttpError(400, msg, details); }
  static unauthorized(msg = 'Not authenticated') { return new HttpError(401, msg); }
  static forbidden(msg = 'Not allowed') { return new HttpError(403, msg); }
  static notFound(msg = 'Not found') { return new HttpError(404, msg); }
  static conflict(msg, details) { return new HttpError(409, msg, details); }
}
