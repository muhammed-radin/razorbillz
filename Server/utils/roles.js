/* Back-compat entry point: the canonical role list lives in
 * Server/shared so the client can import the exact same set. */
export {
  STAFF_ROLES,
  isStaffRole,
  isStaffUser,
  isShopperRole,
  default,
} from "../shared/utils/roles.js";
