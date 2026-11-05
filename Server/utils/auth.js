// server/auth.js
import { APIError, betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin, anonymous } from "better-auth/plugins";
import { UserModel } from "../models/schema/user.js";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { decrypt, decryptStrict, encrypt } from "./crypt.js";
import mongoose, { Mongoose } from "mongoose";
import {
  ErrorEvent,
  evt,
  Evts,
  SessionEvent,
  UserEvent,
} from "./events.manage.js";
import {
  applyBasicBetterAuthDataToUser,
  generateBasicBetterAuthData,
  migrateOldUserToNewUser,
} from "./auth.migrate.js";
import { ac, ecommerceRoles } from "./permissions.js";
import sendEmail from "./mailer.js";
import storeConfig from "../shared/store.config.js";
import { stripServerOwnedFields } from "./schemaMapper.js";
import { db } from "./db.js";

let authInstance = null;

/* Session records do not always embed the user, so resolve the guest
 * flag once per session lifecycle event. Guests must never be counted
 * as logged-in users or get a lastLogin timestamp. */
async function resolveSessionGuest(sessionData) {
  if (sessionData?.user?.isAnonymous || sessionData?.isAnonymous) return true;

  const userId = sessionData?.userId || sessionData?.user?.id;
  if (!userId) return false;

  try {
    // Better Auth stores the authoritative user record (including
    // isAnonymous) in its own validation collection. Guest users are
    // intentionally absent from the app "users" collection, so querying
    // UserModel alone always reports them as logged-in.
    const record = await db.db
      .collection("users_validation")
      .findOne({ $or: [{ _id: userId }, { id: userId }] });
    return Boolean(record?.isAnonymous);
  } catch {
    return false;
  }
}

export default function createAuth(db) {
  if (authInstance) {
    return authInstance;
  }

  authInstance = betterAuth({
    database: mongodbAdapter(
      // Extract the raw MongoClient from your Mongoose connection pool
      db,
    ),
    onAPIError: {
      onError: async (error, context) => {
        evt.fire(
          Evts.ERROR,
          new ErrorEvent({
            type: Evts.ERROR,
            error: error.message || "Unknown error",
            errorCode: error.code || 500,
            data: error,
          }),
        );
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (userData, context) => {
            return {
              data: {
                ...userData,
                ...generateBasicBetterAuthData(userData, null, true),
              },
            };
          },
          after: async (userData, context) => {
            const resolvedUserId = userData.id || userData._id?.toString();

            if (!resolvedUserId) {
              throw new Error("User ID not found");
            }

            const normalizedUserData = {
              ...userData,
              id: resolvedUserId,
            };

            // Create a new user in the UserModel if the user is not anonymous,
            // guest to permanent user migration will be handled in the onLinkAccount hook of the anonymous plugin
            if (userData?.isAnonymous === false) {
              const createdUser = await UserModel.create({
                id: resolvedUserId,
                email: userData.email,
                emailVerified: userData.emailVerified,
                name: userData.name,
                image: userData.image,
                role: "user",
                isActive: true,
                providedBy: userData.providedBy || "local",
                preservedOldUserId: userData.preservedOldUserId || null,
              });

              await applyBasicBetterAuthDataToUser(
                resolvedUserId,
                generateBasicBetterAuthData(
                  normalizedUserData,
                  userData.preservedOldUserId || null,
                ),
                false,
                true, // Exclude our collections during this update, becuase we are already creating the user in our collections above
              );
            }

            // Trigger event after user creation
            evt.fire(
              Evts.USER_REGISTERED,
              new UserEvent({
                type: Evts.USER_REGISTERED,
                user: userData,
                isGuest: userData?.isAnonymous || false,
                userId: resolvedUserId,
              }),
            );

            return { data: { ...userData } };
          },
        },
        delete: {
          after: async (userData, context) => {
            await UserModel.deleteOne({ id: userData.id });
            evt.fire(
              Evts.USER_DELETED,
              new UserEvent({
                type: Evts.USER_DELETED,
                user: userData,
                isGuest: userData?.isAnonymous || false,
                userId: userData.id,
              }),
            );
          },
        },
        update: {
          after: async (userData, context) => {
            const safeFields = stripServerOwnedFields(userData);
            if (Object.keys(safeFields).length > 0) {
              await UserModel.updateOne(
                { id: userData.id },
                { $set: safeFields },
              );
            }
            evt.fire(
              Evts.USER_PROFILE_UPDATED,
              new UserEvent({
                type: Evts.USER_PROFILE_UPDATED,
                user: userData,
                isGuest: userData?.isAnonymous || false,
                userId: userData.id,
              }),
            );
          },
        },
      },
      session: {
        create: {
          after: async (sessionData, context) => {
            const isGuest = await resolveSessionGuest(sessionData);
            evt.fire(
              Evts.USER_LOGGED_IN,
              new SessionEvent({
                type: Evts.USER_LOGGED_IN,
                session: sessionData,
                isGuest,
              }),
            );
            evt.fire(
              Evts.SITE_VIEWED,
              new SessionEvent({
                type: Evts.SITE_VIEWED,
                session: sessionData,
                isGuest,
              }),
            );
          },
        },
        delete: {
          after: async (sessionData, context) => {
            evt.fire(
              Evts.USER_LOGGED_OUT,
              new SessionEvent({
                type: Evts.USER_LOGGED_OUT,
                session: sessionData,
              }),
            );
          },
        },
        update: {
          after: async (sessionData, context) => {
            // Session updates are refreshes/expiry bumps, not fresh
            // logins: only record a site view so login analytics and
            // lastLogin stay accurate.
            evt.fire(
              Evts.SITE_VIEWED,
              new SessionEvent({
                type: Evts.SITE_VIEWED,
                session: sessionData,
                isGuest: await resolveSessionGuest(sessionData),
              }),
            );
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // 1. Target email sign-in and sign-up endpoints
        if (ctx.path === "/sign-in/email" || ctx.path === "/sign-up/email") {
          if (ctx.body && typeof ctx.body.password === "string") {
            try {
              // 2. Decrypt client-encrypted password back to plain text
              const plainPassword = decryptStrict(ctx.body.password);

              // 3. Mutate request body before Better Auth validates or hashes
              ctx.body.password = plainPassword;
            } catch (error) {
              evt.fire(
                Evts.ERROR,
                new ErrorEvent({
                  type: Evts.ERROR,
                  error: "Password decryption failed",
                  errorCode: 400,
                  data: { path: ctx.path },
                }),
              );
              throw new Error("Password decryption failed");
            }
          }
        }

        let session = await getSessionFromCtx(ctx);

        let evtType = null;
        if (ctx.path === "/sign-out") {
          evtType = Evts.USER_LOGGED_OUT_REQUEST;
        } else if (ctx.path === "/reset-password") {
          evtType = Evts.USER_PASSWORD_CHANGED;
        } else if (ctx.path === "/update-password") {
          evtType = Evts.USER_PASSWORD_CHANGED;
        }

        const isSessionFound = !!session;
        if (isSessionFound && evtType) {
          evt.fire(
            evtType,
            new UserEvent({
              type: evtType,
              user: session?.user || null,
              isGuest: session?.user?.isAnonymous || false,
              userId: session?.user?.id || null,
            }),
          );
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Null
      }),
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: false, // Disable automatic email verification on sign-up
      sendVerificationEmail: async ({ user, url, token }, request) => {
        sendEmail({
          email: decrypt(user.email),
          subject: "Verify your email for " + storeConfig.brand.name.en,
          templateName: "verification.ejs",
          variables: {
            appName: storeConfig.brand.name.en,
            verificationType: "link",
            verificationUrl: url,
            code: "",
            expiryMinutes: 15,
            logoUrl: storeConfig.assets.ogLogo32,
            name: decrypt(user.name) || decrypt(user.email).split("@")[0],
          },
        });
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      onExistingUserSignUp: async ({ user }, req) => {
        // Custom logic for handling existing users during sign-up
        sendEmail({
          email: decrypt(user.email),
          subject: "Sign-up attempt with your email",
          templateName: "signup-attempt.ejs",
          variables: {
            appName: storeConfig.brand.name.en,
            logoUrl: storeConfig.assets.ogLogo32,
            email: decrypt(user.email),
            name: decrypt(user.name),
            actionUrl: process.env.FRONTEND_URL,
            actionLabel: "Go to " + storeConfig.brand.name.en,
          },
        });
        throw new APIError(
          "BAD_REQUEST",
          "User already exists. Please log-in instead.",
          {
            status: 400,
          },
          400,
        );
      },

      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 15 * 60, // 15 minutes in seconds
      sendResetPassword: async ({ user, url }, request) => {
        sendEmail({
          email: decrypt(user.email),
          subject: "Reset your " + storeConfig.brand.name.en + " password",
          templateName: "reset-password.ejs",
          variables: {
            appName: storeConfig.brand.name.en,
            email: decrypt(user.email),
            name: decrypt(user.name),
            logoUrl: storeConfig.assets.ogLogo32,
            actionUrl: url,
            actionLabel: "Reset password",
            expiryMinutes: 15,
          },
        });
      },
    },
    plugins: [
      anonymous({
        emailDomainName:
          "guest." + storeConfig.brand.name.en.toLowerCase() + ".app",
        generateName: () =>
          decrypt(`Guest-${Math.floor(Math.random() * 100000)}`),
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          // Convert createdAt to a timestamp (handle potential string/Date types)
          const userCreatedTime = new Date(newUser.user.createdAt).getTime();
          const now = Date.now();

          // Check that the user was created within the last 20 seconds
          const userAge = now - userCreatedTime;
          const isNewUser =
            Number.isFinite(userCreatedTime) && userAge >= 0 && userAge < 20000;

          // Sign-Up guest means their user flow be like:
          // USer first chooses as Guest -> Sign-Up (new user) - migrate guest data to new user
          if (isNewUser) {
            await migrateOldUserToNewUser(
              anonymousUser?.user,
              newUser?.user,
              true,
            );
            // Safe to fully overwrite or set initial state
          } else {
            // This is Log-In guest means their user flow be like:
            // Guest -> Log-In (existing user) - migrate guest data to existing user
            await migrateOldUserToNewUser(
              anonymousUser?.user,
              newUser?.user,
              false,
            );
            // Be careful not to overwrite existing user data (e.g., don't overwrite their existing cart)
            // You might want to append items instead of replacing them
          }
        },
      }),
      admin({
        adminRoles: ["admin", "owner"],
        defaultRole: "user",
        ac: ac,
        roles: ecommerceRoles,
      }),
    ],
    account: {
      accountLinking: {
        updateUserInfoOnLink: true, // Update user info when linking accounts
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        scope: ["openid", "email", "profile"],
        prompt: "select_account consent",

        mapProfileToUser: async (profile) => {
          // Guarantee a non-empty name string to satisfy DB validation
          const nameFallback = encrypt(
            profile.name ||
              `${profile.given_name || ""} ${profile.family_name || ""}`.trim() ||
              profile.email.split("@")[0],
          );

          const profilePicture = encrypt(
            profile.picture ||
              "https://api.dicebear.com/10.x/glyphs/svg?borderRadius=45&seed=" +
                encodeURIComponent(nameFallback),
          );

          return {
            ...generateBasicBetterAuthData(profile, null),
            email: profile.email,
            emailVerified: profile.email_verified,
            name: nameFallback,
            image: profilePicture,
            profilePicture, // override generateBasicBetterAuthData's null image with the profile picture from Google
            role: "user",
            providedBy: "google",
          };
        },
      },
    },
    user: {
      modelName: "users_validation", // Ensure this matches your Mongoose model name
      additionalFields: {
        profilePicture: {
          type: String,
          default: "",
          required: false,
          input: true,
          returned: true,
          fieldName: "profilePicture", // Ensure this matches the field name in your Mongoose model
        },
        providedBy: {
          type: String,
          defaultValue: "local",
          required: false,
          input: true,
          returned: true,
          fieldName: "providedBy", // Ensure this matches the field name in your Mongoose model
        },
        preservedOldUserId: {
          type: String,
          defaultValue: null,
          required: false,
          input: false,
          returned: true,
          fieldName: "preservedOldUserId", // Ensure this matches the field name in your Mongoose model
        },
      },
      fields: {
        image: "profilePicture", // Map the "image" field to "profilePicture" in your Mongoose model
      },
    },

    advanced: {
      database: {
        generateId: () => {
          return new mongoose.Types.ObjectId().toString();
        }, // Set "false" to use MongoDB's default ObjectId, or "uuid" to use UUIDs
      },
      /* Secure cross-site cookies in production only. On plain-http
       * dev origins (http://localhost) browsers drop Secure cookies,
       * which silently breaks sessions and locks guests in an
       * auth-modal loop. SameSite=lax + non-secure is correct for
       * same-site http dev; production keeps strict cross-site cookies. */
      defaultCookieAttributes:
        process.env.NODE_ENV === "production"
          ? {
              sameSite: "none",
              secure: true,
            }
          : {
              sameSite: "lax",
              secure: false,
            },
    },
    trustedOrigins: [process.env.FRONTEND_URL],
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
  });

  return authInstance;
}

export function getAuthInstance() {
  return createAuth(mongoose.connection);
}
