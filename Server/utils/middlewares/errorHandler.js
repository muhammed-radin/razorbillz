import { randomUUID } from "node:crypto";
import { HttpError } from "../../utils/httpError.js";

/* Assign a request id for log correlation + error responses. */
export function requestId(req, _res, next) {
  req.requestId =
    req.headers["x-request-id"] ?? `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  next();
}

/* Wrap async route handlers so rejections reach the error middleware. */
export const ah = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/* 404 for unknown /api routes (JSON, not HTML). */
export function apiNotFound(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `No route: ${req.method} ${req.originalUrl}`,
      requestId: req.requestId,
    },
  });
}

/* Central error handler — must be mounted LAST in app.js.
 * HttpError -> structured client response. Anything else -> 500
 * with full detail in server logs only (never stack to client). */
export function errorHandler(err, req, res, _next) {
  const requestId = req?.requestId ?? "unknown";
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
        requestId,
      },
    });
  }
  // Mongoose validation / duplicate key mapped safely.
  if (err?.name === "ValidationError") {
    return res.status(422).json({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Validation failed.",
        requestId,
      },
    });
  }
  if (err?.code === 11000) {
    return res.status(409).json({
      success: false,
      error: {
        code: "CONFLICT",
        message: "Duplicate record.",
        requestId,
      },
    });
  }
  console.error(`[error:${requestId}]`, err?.message ?? err);
  const status = Number(err?.status) >= 400 ? err.status : 500;
  return res.status(status).json({
    success: false,
    error: {
      code: status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
      message:
        status >= 500
          ? "Something went wrong. Please try again."
          : (err?.message ?? "Request failed."),
      requestId,
    },
  });
}

export default { requestId, ah, apiNotFound, errorHandler };
