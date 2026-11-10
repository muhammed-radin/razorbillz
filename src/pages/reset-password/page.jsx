import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import AuthLayout from "@/components/auth/auth-layout";
import GoogleLogo from "@/components/auth/google-logo";
import PasswordStrength from "@/components/auth/password-strength";
import onUserGoogleSignIn from "@/utils/hooks/googleProviderSignIn";
import { authClient } from "@/lib/auth-client";
import { origin } from "@shared/utils/route-util";

const ResetPasswordPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Extract Token from URL (handles HashRouter query & root URL query) ──
  const initialToken = useMemo(() => {
    const fromParams = searchParams.get("token");
    if (fromParams) return fromParams;
    if (typeof window !== "undefined") {
      const fromWindow = new URLSearchParams(window.location.search).get("token");
      if (fromWindow) return fromWindow;
    }
    return "";
  }, [searchParams]);

  // Mode: "reset" (set new password with token) or "forgot" (request reset email)
  const [mode, setMode] = useState(initialToken ? "reset" : "forgot");
  const [tokenValue, setTokenValue] = useState(initialToken);

  // States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formShake, setFormShake] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState("");
  const [isResetSuccess, setIsResetSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Synchronize token if query parameter changes
  useEffect(() => {
    if (initialToken) {
      setTokenValue(initialToken);
      setMode("reset");
    }
  }, [initialToken]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Check if session already active (authenticated non-anonymous users don't need reset password)
  useEffect(() => {
    authClient.getSession().then(({ data: session }) => {
      if (session?.user && !session.user.isAnonymous) {
        navigate("/");
      }
    });
  }, [navigate]);

  // ── 1. Validation Schema for Requesting Reset Link ──
  const emailSchema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .min(1, t("auth.emailRequired", { defaultValue: "Email is required" }))
          .email(
            t("auth.validationEmail", {
              defaultValue: "Please enter a valid email address",
            }),
          ),
      }),
    [t],
  );

  const emailForm = useForm({
    defaultValues: { email: "" },
    resolver: zodResolver(emailSchema),
  });

  // ── 2. Validation Schema for Setting New Password ──
  const passwordSchema = useMemo(
    () =>
      z
        .object({
          token: z
            .string()
            .min(1, "Reset token is required to set a new password"),
          newPassword: z
            .string()
            .min(
              1,
              t("auth.passwordRequired", {
                defaultValue: "New password is required",
              }),
            )
            .min(
              8,
              t("auth.validationPassword", {
                defaultValue: "Password must be at least 8 characters long",
              }),
            )
            .regex(
              /[A-Z]/,
              t("auth.validationPasswordUppercase", {
                defaultValue:
                  "Password must contain at least one uppercase letter",
              }),
            )
            .regex(
              /[a-z]/,
              t("auth.validationPasswordLowercase", {
                defaultValue:
                  "Password must contain at least one lowercase letter",
              }),
            )
            .regex(
              /[0-9]/,
              t("auth.validationPasswordNumber", {
                defaultValue: "Password must contain at least one number",
              }),
            )
            .regex(
              /[@$!%*?&#]/,
              t("auth.validationPasswordSpecial", {
                defaultValue:
                  "Password must contain at least one special character",
              }),
            ),
          confirmPassword: z
            .string()
            .min(
              1,
              t("auth.confirmPasswordRequired", {
                defaultValue: "Confirm password is required",
              }),
            ),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: t("auth.passwordsDoNotMatch", {
            defaultValue: "Passwords do not match",
          }),
          path: ["confirmPassword"],
        }),
    [t],
  );

  const passwordForm = useForm({
    defaultValues: {
      token: initialToken || "",
      newPassword: "",
      confirmPassword: "",
    },
    resolver: zodResolver(passwordSchema),
  });

  // Keep password form's token in sync if changed
  useEffect(() => {
    if (tokenValue) {
      passwordForm.setValue("token", tokenValue);
    }
  }, [tokenValue, passwordForm]);

  const watchedPassword = passwordForm.watch("newPassword");

  // Trigger shake animation on form errors
  const triggerShake = useCallback(() => {
    setFormShake(true);
    setTimeout(() => setFormShake(false), 600);
  }, []);

  // ── Submit: Request Reset Link ──
  const onRequestResetLink = useCallback(
    async (values) => {
      setIsSubmitting(true);
      const email = values.email.trim();

      toast.promise(
        async () => {
          const redirectTo = origin().path("/reset-password").hashPathURL();
          const { error } = await authClient.forgotPassword({
            email,
            redirectTo,
          });

          if (error) {
            throw error;
          }
          return email;
        },
        {
          loading: t("auth.sendingResetLink", {
            defaultValue: "Sending reset link...",
          }),
          success: (sentEmail) => {
            setIsSubmitting(false);
            setEmailSentTo(sentEmail);
            setResendCooldown(60);
            return t("auth.resetLinkSent", {
              defaultValue: "Reset link sent! Please check your inbox.",
            });
          },
          error: (err) => {
            setIsSubmitting(false);
            triggerShake();
            const message =
              err?.message ||
              err?.error?.message ||
              (typeof err === "string" ? err : null) ||
              t("auth.forgotPasswordError", {
                defaultValue: "Failed to send reset link. Please try again.",
              });
            return message;
          },
        },
      );
    },
    [t, triggerShake],
  );

  // ── Submit: Reset Password with Token ──
  const onResetPassword = useCallback(
    async (values) => {
      setIsSubmitting(true);

      toast.promise(
        async () => {
          const { error } = await authClient.resetPassword({
            newPassword: values.newPassword,
            token: values.token.trim(),
          });

          if (error) {
            throw error;
          }
          return true;
        },
        {
          loading: t("auth.resettingPassword", {
            defaultValue: "Updating password...",
          }),
          success: () => {
            setIsSubmitting(false);
            setIsResetSuccess(true);
            return t("auth.passwordResetSuccess", {
              defaultValue: "Password reset successfully!",
            });
          },
          error: (err) => {
            setIsSubmitting(false);
            triggerShake();
            const message =
              err?.message ||
              err?.error?.message ||
              (typeof err === "string" ? err : null) ||
              "Failed to reset password. The token may be invalid or expired.";
            return message;
          },
        },
      );
    },
    [t, triggerShake],
  );

  // ── Resend Reset Email ──
  const handleResend = useCallback(async () => {
    if (!emailSentTo || resendCooldown > 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const redirectTo = origin().path("/reset-password").hashPathURL();
      const { error } = await authClient.forgotPassword({
        email: emailSentTo,
        redirectTo,
      });

      if (error) throw error;
      setResendCooldown(60);
      toast.success(
        t("auth.resetLinkSent", {
          defaultValue: "A fresh reset link has been dispatched.",
        }),
      );
    } catch (err) {
      toast.error(
        err?.message ||
          t("auth.forgotPasswordError", {
            defaultValue: "Failed to resend email. Please try again.",
          }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [emailSentTo, resendCooldown, isSubmitting, t]);

  // ── Google OAuth Sign In ──
  const handleGoogleSignIn = useCallback(() => {
    setIsSubmitting(true);
    onUserGoogleSignIn(setIsSubmitting);
  }, []);

  // Compute Layout Titles
  const layoutTitles = useMemo(() => {
    if (isResetSuccess) {
      return {
        title: t("auth.passwordResetSuccess", {
          defaultValue: "Password Reset Complete",
        }),
        subtitle: t("auth.passwordResetSuccessDesc", {
          defaultValue:
            "Your password has been successfully reset. You can now log in with your new credentials.",
        }),
        seo: "Password Reset Complete",
      };
    }
    if (emailSentTo) {
      return {
        title: t("auth.resetLinkSent", {
          defaultValue: "Check Your Email",
        }),
        subtitle: t("auth.resetLinkSentDesc", {
          defaultValue:
            "If an account exists with this email, a password reset link has been sent.",
        }),
        seo: "Reset Link Dispatched",
      };
    }
    if (mode === "reset") {
      return {
        title: t("auth.setNewPassword", {
          defaultValue: "Set New Password",
        }),
        subtitle: t("auth.setNewPasswordDesc", {
          defaultValue: "Enter and confirm your new password below.",
        }),
        seo: "Set New Password",
      };
    }
    return {
      title: t("auth.forgotPasswordTitle", {
        defaultValue: "Forgot Password?",
      }),
      subtitle: t("auth.forgotPasswordDesc", {
        defaultValue:
          "Enter your email address and we'll send you a link to reset your password.",
      }),
      seo: "Reset Password",
    };
  }, [isResetSuccess, emailSentTo, mode, t]);

  return (
    <AuthLayout
      type="reset-password"
      title={layoutTitles.title}
      subtitle={layoutTitles.subtitle}
      seoTitle={layoutTitles.seo}
    >
      <div className="space-y-3 sm:space-y-4">
        {/* ════════════════════════════════════════════════════════════
            STATE 1: SUCCESSFUL PASSWORD RESET
           ════════════════════════════════════════════════════════════ */}
        {isResetSuccess ? (
          <div className="w-full py-4 flex flex-col items-center text-center space-y-4 animate-[auth-fade-in_0.3s_ease-out]">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Sparkles className="w-3 h-3" />
              </div>
            </div>

            <div className="space-y-1.5 max-w-sm">
              <p className="text-sm font-medium text-foreground">
                Credentials successfully secured
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("auth.passwordResetSuccessDesc", {
                  defaultValue:
                    "Your password has been updated. You can now use your new password to sign in securely.",
                })}
              </p>
            </div>

            <div className="w-full pt-2">
              <Button
                size="lg"
                className="w-full h-10 gap-2 font-semibold text-xs sm:text-sm shadow-sm"
                onClick={() => navigate("/login")}
              >
                <LogIn className="h-4 w-4" />
                <span>{t("auth.backToLogin", { defaultValue: "Proceed to Log In" })}</span>
              </Button>
            </div>
          </div>
        ) : emailSentTo ? (
          /* ════════════════════════════════════════════════════════════
              STATE 2: EMAIL SENT (CONFIRMATION & RESEND)
             ════════════════════════════════════════════════════════════ */
          <div className="w-full py-3 flex flex-col items-center text-center space-y-4 animate-[auth-fade-in_0.3s_ease-out]">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Mail className="w-8 h-8" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="space-y-1.5 max-w-sm">
              <p className="text-xs sm:text-sm text-foreground font-medium">
                Sent to:{" "}
                <span className="font-semibold text-primary underline underline-offset-2">
                  {emailSentTo}
                </span>
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Click the recovery link in the message to set your new password.
                If you don&apos;t see it within a few minutes, check your spam folder.
              </p>
            </div>

            <div className="w-full space-y-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full h-10 gap-2 text-xs sm:text-sm border-border/80"
                onClick={handleResend}
                disabled={resendCooldown > 0 || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw
                    className={`h-4 w-4 ${resendCooldown > 0 ? "" : "group-hover:rotate-180 transition-transform"}`}
                  />
                )}
                <span>
                  {resendCooldown > 0
                    ? `Resend available in ${resendCooldown}s`
                    : "Resend Reset Link"}
                </span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setEmailSentTo("");
                  setMode("forgot");
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                <span>
                  {t("auth.tryDifferentEmail", {
                    defaultValue: "Use a different email address",
                  })}
                </span>
              </Button>
            </div>
          </div>
        ) : mode === "reset" ? (
          /* ════════════════════════════════════════════════════════════
              STATE 3: SET NEW PASSWORD FORM (WITH TOKEN)
             ════════════════════════════════════════════════════════════ */
          <div className="space-y-3 sm:space-y-4 animate-[auth-fade-in_0.3s_ease-out]">
            <Form {...passwordForm}>
              <form
                className={`space-y-2.5 sm:space-y-3.5 ${formShake ? "auth-shake" : ""}`}
                onSubmit={passwordForm.handleSubmit(onResetPassword)}
                noValidate
                aria-label="Set new password form"
              >
                {/* Token Field (Collapsible or visible if token missing from query) */}
                {!initialToken && (
                  <FormField
                    control={passwordForm.control}
                    name="token"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold">
                          Reset Token
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
                            <Input
                              type="text"
                              placeholder="Paste reset token from email"
                              className="pl-9 h-9 sm:h-10 text-xs sm:text-sm rounded-lg bg-background border-border/80 focus-visible:ring-1 transition-all"
                              disabled={isSubmitting}
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                setTokenValue(e.target.value);
                              }}
                            />
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                )}

                {/* New Password */}
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">
                        {t("auth.newPassword", { defaultValue: "New Password" })}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
                          <Input
                            type={showNewPassword ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder={t("auth.newPasswordPlaceholder", {
                              defaultValue: "Enter new password",
                            })}
                            className="pl-9 pr-9 h-9 sm:h-10 text-xs sm:text-sm rounded-lg bg-background border-border/80 focus-visible:ring-1 transition-all"
                            disabled={isSubmitting}
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-ring"
                            tabIndex={-1}
                            aria-label={
                              showNewPassword
                                ? t("auth.hidePassword", { defaultValue: "Hide password" })
                                : t("auth.showPassword", { defaultValue: "Show password" })
                            }
                          >
                            {showNewPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                {/* Password Strength Meter (from signup feature set) */}
                <PasswordStrength password={watchedPassword} />

                {/* Confirm Password */}
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">
                        {t("auth.confirmPassword", {
                          defaultValue: "Confirm Password",
                        })}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder={t("auth.confirmPasswordPlaceholder", {
                              defaultValue: "Re-enter new password",
                            })}
                            className="pl-9 pr-9 h-9 sm:h-10 text-xs sm:text-sm rounded-lg bg-background border-border/80 focus-visible:ring-1 transition-all"
                            disabled={isSubmitting}
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-ring"
                            tabIndex={-1}
                            aria-label={
                              showConfirmPassword
                                ? t("auth.hidePassword", { defaultValue: "Hide password" })
                                : t("auth.showPassword", { defaultValue: "Show password" })
                            }
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                {/* Security Badge */}
                <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>256-bit Hash Protection</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setEmailSentTo("");
                    }}
                    className="text-primary hover:underline underline-offset-2"
                  >
                    Need a fresh link?
                  </button>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-9 sm:h-10 gap-2 mt-2 font-semibold text-xs sm:text-sm shadow-sm transition-all duration-200"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  <span>
                    {isSubmitting
                      ? t("auth.resettingPassword", {
                          defaultValue: "Resetting password...",
                        })
                      : t("auth.resetPassword", {
                          defaultValue: "Update Password",
                        })}
                  </span>
                </Button>
              </form>
            </Form>
          </div>
        ) : (
          /* ════════════════════════════════════════════════════════════
              STATE 4: REQUEST RESET LINK FORM (EMAIL INPUT + GOOGLE)
             ════════════════════════════════════════════════════════════ */
          <div className="space-y-3 sm:space-y-4 animate-[auth-fade-in_0.3s_ease-out]">
            {/* ── Signin Feature: Quick Google OAuth ── */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full gap-2.5 h-10 text-xs sm:text-sm font-medium border-border/80 hover:bg-accent/60 hover:text-accent-foreground shadow-sm transition-all duration-200"
              disabled={isSubmitting}
              onClick={handleGoogleSignIn}
              aria-label={t("auth.continueWithGoogle", {
                defaultValue: "Continue with Google",
              })}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleLogo />
              )}
              <span>
                {t("auth.continueWithGoogle", {
                  defaultValue: "Continue with Google",
                })}
              </span>
            </Button>

            {/* ── Divider ── */}
            <div className="relative my-2 sm:my-3 flex items-center justify-center">
              <Separator className="w-full" />
              <span className="absolute bg-background px-3 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("auth.or", { defaultValue: "OR SEND EMAIL LINK" })}
              </span>
            </div>

            {/* Email form */}
            <Form {...emailForm}>
              <form
                className={`space-y-2.5 sm:space-y-3.5 ${formShake ? "auth-shake" : ""}`}
                onSubmit={emailForm.handleSubmit(onRequestResetLink)}
                noValidate
                aria-label="Request reset link form"
              >
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">
                        {t("auth.email", { defaultValue: "Registered Email" })}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
                          <Input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            placeholder={t("auth.emailPlaceholder", {
                              defaultValue: "you@example.com",
                            })}
                            className="pl-9 h-9 sm:h-10 text-xs sm:text-sm rounded-lg bg-background border-border/80 focus-visible:ring-1 transition-all"
                            disabled={isSubmitting}
                            aria-required="true"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                {/* Sub-actions & Token manual entry toggle */}
                <div className="flex items-center justify-between pt-0.5 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Instant Link Dispatch</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMode("reset")}
                    className="text-primary hover:underline underline-offset-2 font-medium"
                  >
                    Already have a token?
                  </button>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-9 sm:h-10 gap-2 mt-2 font-semibold text-xs sm:text-sm shadow-sm transition-all duration-200"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  <span>
                    {isSubmitting
                      ? t("auth.sendingResetLink", {
                          defaultValue: "Sending reset link...",
                        })
                      : t("auth.sendResetLink", {
                          defaultValue: "Send Reset Link",
                        })}
                  </span>
                </Button>
              </form>
            </Form>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            FOOTER SWITCHERS: LOGIN & SIGNUP HOOKS
           ════════════════════════════════════════════════════════════ */}
        <div className="pt-2 text-center space-y-1.5 border-t border-border/40">
          <p className="text-xs sm:text-sm text-muted-foreground">
            {t("auth.alreadyHaveAccount", {
              defaultValue: "Remember your password?",
            })}{" "}
            <Link
              to="/login"
              className="font-semibold text-foreground underline underline-offset-4 hover:text-primary transition-colors ml-1"
            >
              {t("auth.logIn", { defaultValue: "Log in" })}
            </Link>
          </p>

          <p className="text-xs text-muted-foreground/80">
            {t("auth.dontHaveAccount", {
              defaultValue: "Don't have an account?",
            })}{" "}
            <Link
              to="/signup"
              className="font-medium text-foreground hover:underline underline-offset-4 transition-colors ml-1"
            >
              {t("auth.createAccount", { defaultValue: "Create account" })}
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default ResetPasswordPage;
