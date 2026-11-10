import { getAuthInstance } from "./auth.js";
import { buildMirrorUserFields } from "./crypto/emailVault.js";

export const syncUserDataFromAuth = async (userId) => {
  return new Promise((resolve, reject) => {
    getAuthInstance()
      .api.getUser({
        query: {
          id: userId,
        },
      })
      .then((user) => {
        if (!user) {
          reject(`User with ID ${userId} not found in auth system.`);
          return;
        }

        /* Vault the mirror too: sealed email/name/phone + blind-index
         * tokens (eq/prefix/grams) so admin search works on ciphertext.
         * Non-vaulted fields pass through as-is. */
        db.collection("users")
          .updateOne(
            { id: userId },
            {
              $set: {
                ...buildMirrorUserFields(user),
                role: user.role,
                emailVerified: user.emailVerified,
                banned: user.banned,
                updatedAt: user.updatedAt,
              },
            },
          )
          .then(() => {
            console.log(`User data synced for user ID: ${userId}`);
            resolve();
          })
          .catch((err) => {
            console.error(
              `Error syncing user data for user ID: ${userId}`,
              err,
            );
            reject(err);
          });
      })
      .catch((err) => {
        console.error(
          `Error fetching user from auth for user ID: ${userId}`,
          err,
        );
        reject(err);
      });
  });
};
