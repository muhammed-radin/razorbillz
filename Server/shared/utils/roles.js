/* =========================================================
 * Shared role classification.
 *
 * Better Auth stores one role string per user. Shoppers are
 * "user" (or the legacy "customer"); every other known role is
 * staff and may open the admin console.
 * ========================================================= */

export const STAFF_ROLES = Object.freeze([
  "owner",
  "admin",
  "manager",
  "productManager",
  "orderManager",
  "supportAgent",
]);

const STAFF_ROLE_SET = new Set(STAFF_ROLES);

export function isStaffRole(role) {
  return typeof role === "string" && STAFF_ROLE_SET.has(role);
}

export function isStaffUser(user) {
  return Boolean(user && isStaffRole(user.role));
}

export function isShopperRole(role) {
  return role === "user" || role === "customer" || !isStaffRole(role);
}

export default { STAFF_ROLES, isStaffRole, isStaffUser, isShopperRole };
