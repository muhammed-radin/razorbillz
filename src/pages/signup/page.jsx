import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { decrypt, encrypt, encryptStrict } from "@/utils/crypt";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient, resendVerification } from "@/lib/auth-client";
import onUserGoogleSignIn from "@/utils/hooks/googleProviderSignIn";
import { Eye, EyeOff, Loader2, Mail, User, UserPlus, Lock } from "lucide-react";
import GoogleLogo from "@/components/auth/google-logo";
import AuthLayout from "@/components/auth/auth-layout";
import PasswordStrength from "@/components/auth/password-strength";
import { api } from "@/utils/api";
import { alert } from "@/components/dialog-alert-provider";

const SignUpPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formShake, setFormShake] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const sessionChecked = useRef(false);

  // ── Memoized Validation Schema ──
  const formSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(
          2,
          t("auth.validationName", {
            defaultValue: "Name must be at least 2 characters long",
          }),
        ),
        email: z.string().email(
          t("auth.validationEmail", {
            defaultValue: "Please enter a valid email address",
          }),
        ),
        password: z
          .string()
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
      }),
    [t],
  );

  const form = useForm({
    defaultValues: { email: "", password: "", name: "" },
    resolver: zodResolver(formSchema),
  });

  const watchedPassword = form.watch("password");

  const openVerificationModal = (email) => {
    email = decrypt(email || form.getValues("email"));
    alert.info({
      title: t("auth.verifyEmailTitle", {
        defaultValue: "Verify Your Email",
      }),
      description: t("auth.verifyEmailDescription", {
        // No mail sent yet on sign up automatically; so the user must click the button to send it.
        // This is a security measure to prevent abuse and spam.
        defaultValue:
          "A verification email needs to be sent to your email address. Please click the button below to send it. Check your inbox and follow the instructions to verify your account. If you don't see the email, check your spam folder.",
      }),
      buttonText: t("auth.resendEmail", {
        defaultValue: "Send Mail",
      }),
      secondaryButtonText: t("auth.cancel", {
        defaultValue: "Reject",
      }),
      onClose: (confirmed) => {
        if (confirmed) {
          resendVerification(email);
        } else {
          toast.warning(
            t("auth.verificationEmailNotSentWarning", {
              defaultValue:
                "You won't be able to log in until you verify your email.",
            }),
          );
          toast.info(
            t("auth.verificationEmailNotSent", {
              defaultValue:
                "Verification email not sent. You can request at Login page.",
            }),
          );
        }
      },
    });
  };

  // ── Submit handler ──
  const submitForm = useCallback(
    (data) => {
      if (!agreeTerms) {
        toast.error(
          "Please agree to the Terms of Service to create an account.",
        );
        return;
      }

      toast.promise(
        () =>
          new Promise((resolveui, rejectui) => {
            authClient.signUp
              .email(
                {
                  email: data.email,
                  password: data.password,
                  name: data.name,
                  provider: "local",
                  image: encrypt(
                    "https://api.dicebear.com/10.x/glyphs/svg?borderRadius=45&seed=" +
                      encodeURIComponent(data.name),
                  ),
                },
                {
                  onSuccess: (payload) => {
                    if (payload.response.status === 200) {
                      resolveui(
                        t("auth.signupSuccess", {
                          defaultValue: "Sign-up Successful",
                        }),
                      );
                      api.clearSessionCache(); // clear session cache to ensure fresh session data

                      authClient
                        .getSession()
                        .then(({ data: session, error }) => {
                          if (session?.user) {
                            navigate("/");
                          } else {
                            navigate("/login");
                          }
                          if (error) navigate("/login");
                        })
                        .catch(() => navigate("/login"));
                    } else {
                      rejectui(
                        t("auth.signupFailed", {
                          defaultValue: "Sign-up Failed",
                        }),
                      );
                    }
                  },
                  onError: (error) => rejectui(error),
                },
              )
              .then(({ error, data }) => {
                if (data && data.user && data.user.emailVerified === false) {
                  openVerificationModal(data.user.email);
                }
                if (error) rejectui(error);
              })
              .catch((error) => rejectui(error));
          }),
        {
          loading: t("auth.signingUp", { defaultValue: "Signing up..." }),
          success: (msg) => {
            setIsSubmitting(false);
            return `${msg}`;
          },
          error: (err) => {
            setIsSubmitting(false);
            setFormShake(true);
            setTimeout(() => setFormShake(false), 600);
            const message =
              err?.message ||
              err?.error?.message ||
              (typeof err === "string" && err) ||
              err?.error?.statusText ||
              (typeof err?.error === "string" && err?.error) ||
              "Unknown error";
            return t("auth.signupFailed", {
              error: message,
              defaultValue: `Sign-up failed: ${message}`,
            });
          },
        },
      );
    },
    [t, navigate, agreeTerms],
  );

  const onSubmit = useCallback(
    (data) => {
      const encrypted = {
        email: data.email,
        password: encryptStrict(data.password),
        name: encrypt(data.name),
      };
      setIsSubmitting(true);
      submitForm(encrypted);
    },
    [submitForm],
  );

  // ── Google Sign-In handler ──
  const handleGoogleSignIn = useCallback(() => {
    setIsSubmitting(true);
    onUserGoogleSignIn(setIsSubmitting);
  }, []);

  // ── Auto-redirect if already logged in ──
  useEffect(() => {
    if (sessionChecked.current) return;
    sessionChecked.current = true;

    authClient.getSession().then(({ data: session }) => {
      if (session?.user && !session.user.isAnonymous) {
        navigate("/");
      }
    });
  }, [navigate]);

  return (
    <AuthLayout
      type="signup"
      title={t("auth.signupTitle", { defaultValue: "Sign up for RazorBillz" })}
      subtitle="Join in seconds to access order tracking and member pricing."
      seoTitle={t("auth.signupTitle", { defaultValue: "Sign Up" })}
    >
      <div className="space-y-2.5 sm:space-y-3.5">
        {/* ── Google OAuth Button ── */}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full gap-2.5 h-9 sm:h-10 text-xs sm:text-sm font-medium border-border/80 hover:bg-accent/60 hover:text-accent-foreground shadow-sm transition-all duration-200"
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
        <div className="relative my-1.5 sm:my-2.5 flex items-center justify-center">
          <Separator className="w-full" />
          <span className="absolute bg-background px-3 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("auth.or", { defaultValue: "OR" })}
          </span>
        </div>

        {/* ── Sign-Up Form ── */}
        <Form {...form}>
          <form
            className={`space-y-2 sm:space-y-2.5 ${formShake ? "auth-shake" : ""}`}
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            aria-label="Sign up form"
          >
            {/* Full Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] sm:text-xs font-semibold">
                    {t("auth.fullName", { defaultValue: "Full Name" })}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
                      <Input
                        type="text"
                        autoComplete="name"
                        placeholder={t("auth.fullNamePlaceholder", {
                          defaultValue: "Your Full Name",
                        })}
                        className="pl-9 h-9 sm:h-9.5 text-xs sm:text-sm rounded-lg bg-background border-border/80 focus-visible:ring-1 transition-all"
                        disabled={isSubmitting}
                        aria-required="true"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />

            {/* Email Address */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] sm:text-xs font-semibold">
                    {t("auth.email", { defaultValue: "Email" })}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
                      <Input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder={t("auth.emailPlaceholder", {
                          defaultValue: "Email address",
                        })}
                        className="pl-9 h-9 sm:h-9.5 text-xs sm:text-sm rounded-lg bg-background border-border/80 focus-visible:ring-1 transition-all"
                        disabled={isSubmitting}
                        aria-required="true"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />

            {/* Password */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] sm:text-xs font-semibold">
                    {t("auth.password", { defaultValue: "Password" })}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder={t("auth.passwordPlaceholder", {
                          defaultValue: "Create a password",
                        })}
                        className="pl-9 pr-9 h-9 sm:h-9.5 text-xs sm:text-sm rounded-lg bg-background border-border/80 focus-visible:ring-1 transition-all"
                        disabled={isSubmitting}
                        aria-required="true"
                        aria-describedby="signup-password-strength"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-ring"
                        tabIndex={-1}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <div id="signup-password-strength">
                    <PasswordStrength password={watchedPassword} />
                  </div>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />

            {/* Terms of Service Checkbox */}
            <div className="pt-1">
              <label
                htmlFor="agree-terms"
                className="flex items-start gap-2 text-[11px] sm:text-xs text-muted-foreground cursor-pointer select-none"
              >
                <Checkbox
                  id="agree-terms"
                  checked={agreeTerms}
                  onCheckedChange={(val) => setAgreeTerms(!!val)}
                  disabled={isSubmitting}
                  className="rounded mt-0.5"
                />
                <span className="leading-snug">
                  I accept the{" "}
                  <Link
                    to="/terms"
                    className="text-foreground underline underline-offset-2 hover:text-primary"
                  >
                    Terms
                  </Link>{" "}
                  &{" "}
                  <Link
                    to="/privacy"
                    className="text-foreground underline underline-offset-2 hover:text-primary"
                  >
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              size="lg"
              className="w-full h-9 sm:h-10 gap-2 mt-1.5 font-semibold text-xs sm:text-sm shadow-sm transition-all duration-200"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              <span>
                {t("auth.continueWithEmail", {
                  defaultValue: "Create Free Account",
                })}
              </span>
            </Button>
          </form>
        </Form>

        {/* ── Login switch link ── */}
        <div className="pt-1.5 text-center">
          <p className="text-xs sm:text-sm text-muted-foreground">
            {t("auth.alreadyHaveAccount", {
              defaultValue: "Already have an account?",
            })}{" "}
            <Link
              to="/login"
              className="font-semibold text-foreground underline underline-offset-4 hover:text-primary transition-colors ml-1"
            >
              {t("auth.logIn", { defaultValue: "Log in" })}
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default SignUpPage;
