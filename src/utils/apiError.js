/* Central frontend error mapping. Backend HttpErrors arrive as
 * { success:false, error:{ code, message } }; legacy routes send
 * { code, error }. Never surface raw internals to customers. */

export function apiErrorInfo(err) {
  const status = err?.response?.status ?? null;
  const body = err?.response?.data ?? {};
  const code = body?.error?.code ?? body?.code ?? null;
  const message =
    body?.error?.message ?? (typeof body?.error === "string" ? body.error : null) ??
    (typeof body?.message === "string" ? body.message : null);
  return { status, code, message };
}

export function friendlyError(err, fallback = "Something went wrong.") {
  const { status, code, message } = apiErrorInfo(err);
  if (status === 401) return "Session expired. Please sign in again.";
  if (status === 403)
    return "You don't have permission for this action.";
  if (status === 404) return "Not found — it may have been removed.";
  if (status === 409)
    return message ?? "This was already processed. Refresh to see the result.";
  if (status === 422) return message ?? "This action isn't allowed right now.";
  if (status === 429)
    return "Too many requests — wait a moment and retry.";
  if (code === "PAYMENT_CONFIGURATION_MISSING") {
    return "Online payment is temporarily unavailable. Try Cash on Delivery.";
  }
  if (status !== null && status >= 500) {
    return "Server trouble — please retry shortly.";
  }
  if (!status) return "Network error — check your connection and retry.";
  return message ?? fallback;
}

export default { apiErrorInfo, friendlyError };
