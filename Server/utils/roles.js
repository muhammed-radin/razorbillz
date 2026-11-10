/* =========================================================
 * Shared role classification.
 *
 * Better Auth stores one role string per user. Every non-shopper
 * role is staff for the purpose of reading customer-scoped records
 * (orders, shipments, support tickets); destructive/administrative
 * actions still go through requireAdmin + requirePermission.
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

export default { STAFF_ROLES, isStaffRole, isStaffUser };
