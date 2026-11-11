// validate keys with env vars
//  Currently not used this file, deprecated in favor of Server/utils/env.js
export function validateApiKeys(req, res, next) {
  if (process.env.NODE_ENV === "development") {
    next();
    return 0;
  }

  // Skip for better auth endpoints
  if (req.path.startsWith("/api/auth")) {
    next();
    return 0;
  }

  if (req.headers["server-api-key"] === process.env.SERVER_API_KEY) {
    if (req.headers["actions-api-key"] === process.env.ACTION_ACCESS_TOKEN) {
      next();
    } else {
      res.status(403).json({ message: "Forbidden: Invalid Actions API Key" });
      res.end();
      return;
    }
  } else {
    res.status(403).json({ message: "Forbidden: Invalid API Key" });
    res.end();
    return;
  }
}

export default { validateApiKeys };
