/* =========================================================
 * Typed HTTP errors. New/updated endpoints throw these; the
 * central error middleware renders { success:false, error:{ code,
 * message, requestId } } without leaking internals.
 * Legacy routes keep their { code, error } shape for compat.
 * ========================================================= */

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const err = (status, code, message) => (details) =>
  new HttpError(status, code, message, details);

export const Errors = {
  badRequest: (message = "Invalid request.", details) =>
    new HttpError(400, "BAD_REQUEST", message, details),
  validation: (message = "Validation failed.", details) =>
    new HttpError(422, "VALIDATION_FAILED", message, details),
  unauthorized: (message = "Authentication required.") =>
    new HttpError(401, "UNAUTHORIZED", message),
  forbidden: (message = "Access denied.") =>
    new HttpError(403, "FORBIDDEN", message),
  notFound: (message = "Resource not found.") =>
    new HttpError(404, "NOT_FOUND", message),
  conflict: (message = "Resource conflict.", details) =>
    new HttpError(409, "CONFLICT", message, details),
  rateLimited: (message = "Too many requests, slow down.") =>
    new HttpError(429, "RATE_LIMITED", message),
  paymentConfigMissing: () =>
    new HttpError(
      503,
      "PAYMENT_CONFIGURATION_MISSING",
      "Online payment is temporarily unavailable. Please try Cash on Delivery or come back later.",
    ),
  paymentFailed: (message = "Payment could not be completed.") =>
    new HttpError(502, "PAYMENT_FAILED", message),
  shipmentFailed: (message = "Courier operation failed.") =>
    new HttpError(502, "SHIPMENT_FAILED", message),
  upstream: (message = "Upstream service failed.") =>
    new HttpError(502, "UPSTREAM_FAILED", message),
  internal: (message = "Something went wrong.") =>
    new HttpError(500, "INTERNAL_ERROR", message),
};

export { err };
export default HttpError;
