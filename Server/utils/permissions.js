/**
 * Better Auth e-commerce roles and permissions.
 *
 * Install/use with the Better Auth Admin plugin:
 *
 * import { admin as adminPlugin } from "better-auth/plugins";
 * import { ac, ecommerceRoles } from "./ecommerce-permissions";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     adminPlugin({
 *       ac,
 *       roles: ecommerceRoles,
 *       defaultRole: "user",
 *       adminRoles: ["owner", "admin"],
 *     }),
 *   ],
 * });
 *
 * Also configure adminClient({ ac, roles: ecommerceRoles }) in your auth client.
 * Check permissions on the server too; frontend checks are not security controls.
 */

import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Every available resource/action pair must be declared here before it can be
 * assigned to a role. `as const` preserves Better Auth's permission types.
 */
export const statement = {
  // Keep Better Auth's built-in Admin plugin permissions available.
  ...defaultStatements,

  dashboard: ["view"],
  customers: ["read", "update", "delete", "ban", "promote"],
  products: ["create", "read", "update", "delete", "publish", "archive"],
  categories: ["create", "read", "update", "delete"],
  inventory: ["view", "update", "manage"],
  orders: [
    "create",
    "read",
    "update",
    "delete",
    "cancel",
    "fulfill",
    "readOwn",
    "cancelOwn",
    "returnOwn",
  ],
  payments: ["view", "manage", "refund", "readOwn"],
  shipping: ["view", "update", "manage", "track"],
  returns: ["view", "approve", "reject", "manage", "createOwn", "readOwn"],
  discounts: ["create", "read", "update", "delete", "publish"],
  reviews: [
    "read",
    "approve",
    "reject",
    "delete",
    "createOwn",
    "updateOwn",
    "deleteOwn",
  ],
  support: [
    "view",
    "respond",
    "assign",
    "close",
    "update",
    "create",
    "readOwn",
    "respondOwn",
  ],
  analytics: ["view", "export"],
  content: ["create", "read", "update", "delete", "publish"],
  settings: ["view", "update"],
  roles: ["view", "create", "update", "delete", "assign"],
  permissions: ["view", "assign", "revoke"],
  reports: ["view", "export"],
  billing: ["view", "manage"],
  profile: ["read", "update"],
  addresses: ["create", "readOwn", "updateOwn", "deleteOwn"],
  cart: ["view", "manage", "clear"],
  wishlist: ["view", "manage"],
  checkout: ["create"],
};

export const ac = createAccessControl(statement);

/** Full access, including Better Auth user/session administration. */
export const owner = ac.newRole({
  ...adminAc.statements,
  dashboard: ["view"],
  customers: ["read", "update", "delete", "ban", "promote"],
  products: ["create", "read", "update", "delete", "publish", "archive"],
  categories: ["create", "read", "update", "delete"],
  inventory: ["view", "update", "manage"],
  orders: [
    "create",
    "read",
    "update",
    "delete",
    "cancel",
    "fulfill",
    "readOwn",
    "cancelOwn",
    "returnOwn",
  ],
  payments: ["view", "manage", "refund", "readOwn"],
  shipping: ["view", "update", "manage", "track"],
  returns: ["view", "approve", "reject", "manage", "createOwn", "readOwn"],
  discounts: ["create", "read", "update", "delete", "publish"],
  reviews: [
    "read",
    "approve",
    "reject",
    "delete",
    "createOwn",
    "updateOwn",
    "deleteOwn",
  ],
  support: [
    "view",
    "respond",
    "assign",
    "close",
    "update",
    "create",
    "readOwn",
    "respondOwn",
  ],
  analytics: ["view", "export"],
  content: ["create", "read", "update", "delete", "publish"],
  settings: ["view", "update"],
  roles: ["view", "create", "update", "delete", "assign"],
  permissions: ["view", "assign", "revoke"],
  reports: ["view", "export"],
  billing: ["view", "manage"],
  profile: ["read", "update"],
  addresses: ["create", "readOwn", "updateOwn", "deleteOwn"],
  cart: ["view", "manage", "clear"],
  wishlist: ["view", "manage"],
  checkout: ["create"],
});

/** Store-wide administration, without role assignment or owner-level settings. */
export const admin = ac.newRole({
  user: [
    "create",
    "list",
    "ban",
    "impersonate",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
  dashboard: ["view"],
  customers: ["read", "update", "delete", "ban"],
  products: ["create", "read", "update", "delete", "publish", "archive"],
  categories: ["create", "read", "update", "delete"],
  inventory: ["view", "update", "manage"],
  orders: ["read", "update", "delete", "cancel", "fulfill"],
  payments: ["view", "manage", "refund"],
  shipping: ["view", "update", "manage", "track"],
  returns: ["view", "approve", "reject", "manage"],
  discounts: ["create", "read", "update", "delete", "publish"],
  reviews: ["read", "approve", "reject", "delete"],
  support: ["view", "respond", "assign", "close", "update"],
  analytics: ["view", "export"],
  content: ["create", "read", "update", "delete", "publish"],
  settings: ["view", "update"],
  reports: ["view", "export"],
  billing: ["view"],
});

/** Day-to-day operations; cannot change system settings or assign roles. */
export const manager = ac.newRole({
  dashboard: ["view"],
  customers: ["read"],
  products: ["read", "update", "publish", "archive"],
  categories: ["create", "read", "update"],
  inventory: ["view", "update", "manage"],
  orders: ["read", "update", "cancel", "fulfill"],
  payments: ["view"],
  shipping: ["view", "update", "manage", "track"],
  returns: ["view", "approve", "reject", "manage"],
  discounts: ["create", "read", "update", "publish"],
  reviews: ["read", "approve", "reject"],
  support: ["view", "respond", "assign", "close"],
  analytics: ["view"],
  content: ["create", "read", "update", "publish"],
  reports: ["view"],
});

/** Product catalog and stock only. */
export const productManager = ac.newRole({
  dashboard: ["view"],
  products: ["create", "read", "update", "publish", "archive"],
  categories: ["create", "read", "update", "delete"],
  inventory: ["view", "update", "manage"],
  reviews: ["read"],
  analytics: ["view"],
});

/** Order processing, fulfilment, shipping, and returns. */
export const orderManager = ac.newRole({
  dashboard: ["view"],
  customers: ["read"],
  orders: ["read", "update", "cancel", "fulfill"],
  payments: ["view"],
  shipping: ["view", "update", "manage", "track"],
  returns: ["view", "approve", "reject", "manage"],
  support: ["view"],
  reports: ["view"],
});

/** Customer support access without payment refunds or role management. */
export const supportAgent = ac.newRole({
  dashboard: ["view"],
  customers: ["read", "update"],
  orders: ["read"],
  shipping: ["view", "track"],
  returns: ["view"],
  support: ["view", "respond", "assign", "close"],
});

/** Default signed-in shopper role. Own-record actions still need server checks. */
export const user = ac.newRole({
  products: ["read"],
  categories: ["read"],
  reviews: ["read", "createOwn", "updateOwn", "deleteOwn"],
  orders: ["create", "readOwn", "cancelOwn", "returnOwn"],
  payments: ["readOwn"],
  returns: ["createOwn", "readOwn"],
  support: ["create", "readOwn", "respondOwn"],
  profile: ["read", "update"],
  addresses: ["create", "readOwn", "updateOwn", "deleteOwn"],
  cart: ["view", "manage", "clear"],
  wishlist: ["view", "manage"],
  checkout: ["create"],
  content: ["read"],
});

/** Pass this object to both Better Auth's server and client plugin configs. */
export const ecommerceRoles = {
  owner,
  admin,
  manager,
  productManager,
  orderManager,
  supportAgent,
  user,
};
