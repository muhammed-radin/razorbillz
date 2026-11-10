// server/middleware/rbacMiddleware.js
import { getAuthInstance } from "../auth.js";

// Middleware A: Protect Custom User Data Routes (Users access ONLY their own data)
export const requireAdmin = async (req, res, next) => {
  const session = await getAuthInstance().api.getSession({
    headers: req.headers,
  });
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  if (!session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userID = session.user?.id;

  if (!userID) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (session.user.isAnonymous === true) {
    return res.status(403).json({
      error: "Forbidden: Anonymous users cannot access this resource.",
    });
  }

  // Gate on the staff marker every non-shopper role has (owner, admin,
  // manager, productManager, orderManager, supportAgent). Demanding the whole
  // Better Auth `adminAc.statements` set here only ever matched `owner`
  // (custom roles intentionally do not grant `user:set-role` or
  // `impersonate-admins`), which locked every other staff role out of the
  // routes below. The real capability check lives in `requirePermission`,
  // which every admin route pairs with this middleware.
  const { success, error } = await getAuthInstance().api.userHasPermission({
    body: {
      userId: userID,
      permissions: {
        dashboard: ["view"],
      },
    },
  });

  if (error) {
    return res.status(500).json({
      error:
        "Internal Auth Error: " +
        error?.message +
        " - status: " +
        error?.statusText +
        " - code: " +
        error?.code,
    });
  }

  if (!success) {
    return res.status(403).json({
      error: "Forbidden: User does not have the required permission.",
    });
  }

  req.user = session.user;
  return next();
};

// Middleware B: Protect Admin Actions with specific granular capability flags
/**
 * The permission resources and their valid actions. Optional properties allow
 * callers to request only the resource needed by a route.
 *
 * @typedef {Object} PermissionMap
 * @property {("view")[]} [dashboard]
 * @property {("read"|"update"|"delete"|"ban"|"promote")[]} [customers]
 * @property {("create"|"read"|"update"|"delete"|"publish"|"archive")[]} [products]
 * @property {("create"|"read"|"update"|"delete")[]} [categories]
 * @property {("view"|"update"|"manage")[]} [inventory]
 * @property {("create"|"read"|"update"|"delete"|"cancel"|"fulfill"|"readOwn"|"cancelOwn"|"returnOwn")[]} [orders]
 * @property {("view"|"manage"|"refund"|"readOwn")[]} [payments]
 * @property {("view"|"update"|"manage"|"track")[]} [shipping]
 * @property {("view"|"approve"|"reject"|"manage"|"createOwn"|"readOwn")[]} [returns]
 * @property {("create"|"read"|"update"|"delete"|"publish")[]} [discounts]
 * @property {("read"|"approve"|"reject"|"delete"|"createOwn"|"updateOwn"|"deleteOwn")[]} [reviews]
 * @property {("view"|"respond"|"assign"|"close"|"update"|"create"|"readOwn"|"respondOwn")[]} [support]
 * @property {("view"|"export")[]} [analytics]
 * @property {("create"|"read"|"update"|"delete"|"publish")[]} [content]
 * @property {("view"|"update")[]} [settings]
 * @property {("view"|"create"|"update"|"delete"|"assign")[]} [roles]
 * @property {("view"|"assign"|"revoke")[]} [permissions]
 * @property {("view"|"export")[]} [reports]
 * @property {("view"|"manage")[]} [billing]
 * @property {("read"|"update")[]} [profile]
 * @property {("create"|"readOwn"|"updateOwn"|"deleteOwn")[]} [addresses]
 * @property {("view"|"manage"|"clear")[]} [cart]
 * @property {("view"|"manage")[]} [wishlist]
 * @property {("create")[]} [checkout]
 * @property {("read"|"create"|"update"|"delete")[]} [project]
 * @property {("create"|"list"|"get"|"update"|"delete"|"set-role"|"set-password"|"set-email"|"ban"|"impersonate")[]} [user]
 * @property {("list"|"revoke")[]} [session]
 *
 * @param {PermissionMap} permissions
 * @returns {import("express").RequestHandler}
 */

export const requirePermission = (permissions = {}) => {
  return async (req, res, next) => {
    const session = await getAuthInstance().api.getSession({
      headers: req.headers,
    });
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (!session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (session.user.isAnonymous === true) {
      return res.status(403).json({
        error: "Forbidden: Anonymous users cannot access this resource.",
      });
    }

    const userID = session.user?.id;

    if (!userID) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { success, error } = await getAuthInstance().api.userHasPermission({
      body: {
        userId: userID,
        permissions: permissions,
      },
    });

    if (error) {
      return res.status(500).json({
        error:
          "Internal Auth Error: " +
          error?.message +
          " - status: " +
          error?.statusText +
          " - code: " +
          error?.code,
      });
    }

    if (!success) {
      return res.status(403).json({
        error: "Forbidden: User does not have the required permission.",
      });
    }

    req.user = session.user;
    return next();
  };
};
