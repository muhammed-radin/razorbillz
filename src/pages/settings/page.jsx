import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Camera,
  Check,
  Eye,
  EyeOff,
  Globe,
  Key,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Palette,
  Monitor,
  ArrowRight,
  RotateCcw,
  Settings,
  Shield,
  Sun,
  Trash2,
  User,
  Phone,
  WifiOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { api } from "@/utils/api";
import { profileApi, settingsApi } from "@/services/shop";
import { decrypt, encrypt } from "@/utils/crypt";
import { useTheme } from "@/utils/theme-provider";
import { convertToWebp, uploadToCloudinary } from "@/utils/image-upload";
import { authClient } from "@/lib/auth-client";
import { StoreMeta } from "@/components/store-meta";
import { cn } from "@/lib/utils";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/* Validation (module-level — created once, never re-created on render) */
/* ------------------------------------------------------------------ */

const phoneErrorMessage =
  "Enter a valid international number, for example +91 1234567890";
const nameErrorMessage = "Name must be between 4 and 20 characters";
const passwordErrorMessage = "Password must be at least 8 characters";

const nameSchema = z
  .string()
  .trim()
  .min(4, nameErrorMessage)
  .max(20, nameErrorMessage);

const phoneSchema = z.string().refine((value) => {
  if (value === "") return true;
  const phoneNumber = parsePhoneNumberFromString(value);
  return Boolean(
    phoneNumber?.isValid() &&
    /^\+\d{1,3} \d+$/.test(value) &&
    !/[\s-]/.test(phoneNumber.nationalNumber),
  );
}, phoneErrorMessage);

/** 0–4 password score → ["Weak", "Fair", "Good", "Strong"] */
function passwordScore(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 4);
}

function normalizePhoneNumber(value) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";

  const digitsOnly = trimmedValue.replace(/\D/g, "");
  if (!digitsOnly) return trimmedValue.startsWith("+") ? "+" : "";

  const cleanedValue = `+${digitsOnly}`;
  const phoneNumber = parsePhoneNumberFromString(cleanedValue);
  if (phoneNumber?.isValid()) {
    return `+${phoneNumber.countryCallingCode} ${phoneNumber.nationalNumber}`;
  }

  return cleanedValue;
}

function getInitials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/* ------------------------------------------------------------------ */
/* Small presentational building blocks (memoized)                     */
/* ------------------------------------------------------------------ */

const FieldError = React.memo(function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
});

/** Accessible toggle row (Radix Switch keeps the native `switch` role). */
const ToggleRow = React.memo(function ToggleRow({
  id,
  checked,
  onChange,
  title,
  description,
  icon: Icon,
}) {
  return (
    <div
      className={cn(
        "flex items-start sm:items-center justify-between gap-3 sm:gap-4 rounded-xl p-3 sm:px-4 sm:py-3.5 transition-colors duration-200 motion-reduce:transition-none",
        "hover:bg-muted/40",
      )}
    >
      <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
        {Icon ? (
          <div className="mt-0.5 grid h-7 w-7 sm:h-8 sm:w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
          </div>
        ) : null}
        <div className="space-y-0.5 min-w-0">
          <Label
            htmlFor={id}
            className="cursor-pointer text-xs sm:text-sm font-medium"
          >
            {title}
          </Label>
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 sm:line-clamp-none">
            {description}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={title}
        /* larger thumb + track below sm for a comfortable touch target */
        className="mt-0.5 h-6 w-10 shrink-0 sm:mt-0 sm:h-5 sm:w-9 sm:p-0 [&>span]:h-5 [&>span]:w-5 sm:[&>span]:h-4 sm:[&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4 sm:data-[state=checked]:[&>span]:translate-x-4"
      />
    </div>
  );
});

const ThemeCard = React.memo(function ThemeCard({
  value,
  currentTheme,
  icon,
  label,
  onSelect,
}) {
  const isSelected = currentTheme === value;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={label}
      tabIndex={isSelected ? 0 : -1}
      onClick={() => onSelect(value)}
      className={cn(
        "group relative flex flex-col items-center gap-2 sm:gap-3 rounded-xl border-2 p-2.5 sm:p-4 outline-none transition-all duration-200 motion-reduce:transition-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isSelected
          ? "border-primary bg-primary/10 shadow-sm"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      {/* Mini theme preview */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none flex h-12 w-full max-w-[96px] sm:h-16 sm:w-24 overflow-hidden rounded-md border transition-colors",
          value === "dark"
            ? "bg-zinc-900 border-zinc-700"
            : value === "light"
              ? "bg-white border-zinc-200"
              : "bg-gradient-to-l from-white to-zinc-900 border-zinc-400",
        )}
      >
        <div
          className={cn(
            "w-1/3 p-1 sm:p-1.5",
            value !== "light" && "opacity-20",
          )}
        >
          <div className="h-1 w-full rounded bg-foreground/30" />
          <div className="mt-1 h-1 w-2/3 rounded bg-foreground/20" />
        </div>
        <div
          className={cn(
            "flex-1 bg-background p-1 sm:p-1.5",
            value === "dark" && "bg-zinc-800",
          )}
        >
          <div className="h-1 w-full rounded bg-foreground/20" />
          <div className="mt-1 h-1 w-1/2 rounded bg-foreground/30" />
          <div className="mt-1 h-1 w-3/4 rounded bg-foreground/20" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "transition-colors",
            isSelected ? "text-primary" : "text-muted-foreground",
          )}
        >
          {React.createElement(icon, {
            className: "h-3.5 w-3.5 sm:h-4 sm:w-4",
          })}
        </span>
        <span
          className={cn(
            "text-xs sm:text-sm font-medium truncate",
            isSelected && "text-primary",
          )}
        >
          {label}
        </span>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "absolute right-1.5 top-1.5 sm:right-2 sm:top-2 grid h-4 w-4 sm:h-5 sm:w-5 place-items-center rounded-full bg-primary text-primary-foreground transition-all duration-200 motion-reduce:transition-none",
          isSelected ? "scale-100 opacity-100" : "scale-0 opacity-0",
        )}
      >
        <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
      </span>
    </button>
  );
});

const PasswordMeter = React.memo(function PasswordMeter({ password }) {
  const { t } = useTranslation();
  const score = passwordScore(password);
  const labels = [
    t("settings.pwWeak", { defaultValue: "Weak" }),
    t("settings.pwWeak", { defaultValue: "Weak" }),
    t("settings.pwFair", { defaultValue: "Fair" }),
    t("settings.pwGood", { defaultValue: "Good" }),
    t("settings.pwStrong", { defaultValue: "Strong" }),
  ];
  const colors = [
    "bg-destructive",
    "bg-destructive",
    "bg-amber-500",
    "bg-lime-600",
    "bg-primary",
  ];

  return (
    <div>
      <div
        className="flex gap-1"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-label={t("settings.passwordStrength", {
          defaultValue: "Password strength",
        })}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
              i < score ? colors[score] : "bg-border",
            )}
          />
        ))}
      </div>
      <p aria-live="polite" className="mt-1 h-4 text-xs text-muted-foreground">
        {password ? labels[score] : ""}
      </p>
    </div>
  );
});

/** Password input with visibility toggle. */
const PasswordInput = React.memo(function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  describedById,
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Lock
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pl-10 pr-10 text-base lg:text-sm"
        aria-describedby={describedById}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-2 sm:h-8 sm:w-8"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const TABS = [
  { value: "profile", icon: User },
  { value: "notifications", icon: Bell },
  { value: "appearance", icon: Palette },
  { value: "security", icon: Shield },
];

const SettingsPage = () => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  /** Committed server snapshot (decrypted) to diff drafts against. */
  const [committed, setCommitted] = useState(null);
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    email: "",
    avatar: "",
  });
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const [pref, setPref] = useState(null);
  const [initialPref, setInitialPref] = useState(null);

  /** Picked avatar awaiting upload — { file, url } (webp-converted). */
  const [avatarPick, setAvatarPick] = useState(null);
  const avatarUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  /* Change-password local state */
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const hasLoadedRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const isMountedRef = useRef(true);

  /* ---------------------------------------------------------------- */
  /* Load — one parallel pass. Retries call this function directly instead */
  /* of changing effect dependencies, so renders never duplicate requests. */
  /* ---------------------------------------------------------------- */
  const loadSettings = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setLoadError(null);

    try {
      const [profileRes, prefsRes] = await Promise.allSettled([
        api.getUser(false, true),
        settingsApi.get(),
      ]);
      if (!isMountedRef.current) return;

      const failedRequest = [profileRes, prefsRes].find(
        (result) => result.status === "rejected",
      );
      if (failedRequest) {
        console.error("Failed to load settings:", failedRequest.reason);
        setLoadError(failedRequest.reason);
        setLoading(false);
        return;
      }

      if (profileRes.status === "fulfilled" && profileRes.value) {
        const u = profileRes.value;
        const next = {
          name: u.name ?? "",
          email: u.email ?? "",
          phone: normalizePhoneNumber(decrypt(u.phoneNumber ?? "")),
          avatar: u.image ? String(decrypt(u.image) ?? "") : "",
        };
        setCommitted(next);
        setDraft(next);
      }
      if (prefsRes.status === "fulfilled") {
        const p = prefsRes.value?.prefrences ?? prefsRes.value ?? {};
        const next = {
          language: p.language ?? i18n.language ?? "en",
          pushNotifications: p.pushNotificationEnabled ?? true,
          emailNotifications: p.emailNotificationsEnabled ?? true,
          orderUpdates: p.notificationEnabled ?? true,
        };
        setPref(next);
        setInitialPref(next);
        if (next.language && next.language !== i18n.language) {
          i18n.changeLanguage(next.language).catch(() => {});
        }
      }
      setLoading(false);
    } finally {
      loadInFlightRef.current = false;
    }
  }, [i18n]);

  useEffect(() => {
    isMountedRef.current = true;
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    loadSettings();

    return () => {
      isMountedRef.current = false;
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
    };
  }, [loadSettings]);

  /* ---------------------------------------------------------------- */
  /* Dirty diffing — zero requests when nothing changed                */
  /* ---------------------------------------------------------------- */
  const profileDirty = useMemo(() => {
    if (!committed) return false;
    return (
      draft.name !== committed.name ||
      draft.phone !== committed.phone ||
      Boolean(avatarPick)
    );
  }, [committed, draft, avatarPick]);

  const prefsDirty = useMemo(() => {
    if (!pref || !initialPref) return false;
    return (
      pref.language !== initialPref.language ||
      pref.emailNotifications !== initialPref.emailNotifications ||
      pref.pushNotifications !== initialPref.pushNotifications ||
      pref.orderUpdates !== initialPref.orderUpdates
    );
  }, [pref, initialPref]);

  const tabDirty = {
    profile: profileDirty || prefsDirty,
    notifications: prefsDirty,
    appearance: false, // theme applies instantly, no server save
    security: false,
  };

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const _pickAvatar = useCallback(
    async (file) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error(
          t("settings.invalidImage", {
            defaultValue: "Please choose an image file",
          }),
        );
        return;
      }
      try {
        const webp = await convertToWebp(file, { maxSize: 524, quality: 0.8 });
        const url = URL.createObjectURL(webp);
        setAvatarPick((prev) => {
          if (avatarUrlRef.current && avatarUrlRef.current !== prev?.url) {
            URL.revokeObjectURL(avatarUrlRef.current);
          }
          avatarUrlRef.current = url;
          return { file: webp, url };
        });
      } catch {
        toast.error(
          t("settings.imageFailed", {
            defaultValue: "Could not process that image",
          }),
        );
      }
    },
    [t],
  );

  const saveChanges = useCallback(async () => {
    api.clearSessionCache(); // reflect saved changes.
    if (!committed || saving) return;

    /* Validate before any request */
    const nameValidation = nameSchema.safeParse(draft.name.trim());
    if (!nameValidation.success) {
      const message =
        nameValidation.error.issues[0]?.message ?? nameErrorMessage;
      setNameError(message);
      toast.error(message);
      return;
    }
    const phoneValidation = phoneSchema.safeParse(draft.phone);
    if (!phoneValidation.success) {
      const message =
        phoneValidation.error.issues[0]?.message ?? phoneErrorMessage;
      setPhoneError(message);
      toast.error(message);
      return;
    }

    setSaving(true);
    try {
      /* Only changed data is sent — profile patch, settings save, or both. */
      const requests = [];
      let uploadedAvatarUrl = null;

      if (prefsDirty) {
        requests.push(
          settingsApi.save({
            language: pref.language,
            notificationEnabled: pref.orderUpdates,
            pushNotificationEnabled: pref.pushNotifications,
            emailNotificationsEnabled: pref.emailNotifications,
          }),
        );
      }

      if (profileDirty) {
        if (avatarPick) {
          uploadedAvatarUrl = await uploadToCloudinary(avatarPick.file);
        }
        const patch = {
          ...(nameValidation.data !== committed.name
            ? { name: encrypt(nameValidation.data) }
            : {}),
          ...(draft.phone && draft.phone !== committed.phone
            ? { phone: encrypt(draft.phone) }
            : {}),
          ...(uploadedAvatarUrl ? { avatar: uploadedAvatarUrl } : {}),
        };
        if (Object.keys(patch).length > 0) {
          requests.push(profileApi.update(patch));
        }
      }

      await Promise.all(requests);
      if (pref.language !== i18n.language) {
        await i18n.changeLanguage(pref.language).catch(() => {});
      }

      /* Refresh the cached session so the header/menu show new data */
      if (profileDirty) api.clearSessionCache();

      setInitialPref(pref ? { ...pref } : null);
      setCommitted((prev) => ({
        ...prev,
        name: draft.name.trim(),
        phone: draft.phone,
        ...(uploadedAvatarUrl ? { avatar: uploadedAvatarUrl } : {}),
      }));
      if (uploadedAvatarUrl) {
        setDraft((d) => ({ ...d, avatar: uploadedAvatarUrl }));
      }
      if (avatarPick) {
        if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
        avatarUrlRef.current = null;
        setAvatarPick(null);
      }
      toast.success(t("settings.saved", { defaultValue: "Settings saved" }));
    } catch {
      toast.error(
        t("common.error", { defaultValue: "Failed to save settings" }),
      );
    } finally {
      setSaving(false);
    }
  }, [
    t,
    i18n,
    committed,
    saving,
    draft,
    pref,
    avatarPick,
    prefsDirty,
    profileDirty,
  ]);

  const changePassword = useCallback(async () => {
    if (pwSaving) return;
    if (pw.next.length < 8) {
      toast.error(passwordErrorMessage);
      return;
    }
    if (pw.next !== pw.confirm) {
      toast.error(
        t("settings.passwordsDontMatch", {
          defaultValue: "Passwords don't match",
        }),
      );
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: pw.current,
        newPassword: pw.next,
        revokeOtherSessions: false,
      });
      if (error) {
        toast.error(
          error.message ||
            t("common.error", { defaultValue: "Something went wrong" }),
        );
        return;
      }
      setPw({ current: "", next: "", confirm: "" });
      toast.success(
        t("settings.passwordUpdated", {
          defaultValue: "Password updated successfully",
        }),
      );
    } finally {
      setPwSaving(false);
    }
  }, [pw, pwSaving, t]);

  const discardChanges = useCallback(() => {
    if (committed) {
      setDraft({ ...committed });
      setNameError("");
      setPhoneError("");
    }
    if (initialPref) {
      setPref({ ...initialPref });
    }
    if (avatarPick) {
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
      avatarUrlRef.current = null;
      setAvatarPick(null);
    }
    toast.info(
      t("settings.changesDiscarded", { defaultValue: "Changes discarded" }),
    );
  }, [committed, initialPref, avatarPick, t]);

  const signOutEverywhere = useCallback(async () => {
    try {
      const { error } = await authClient.revokeSessions();
      if (error) {
        toast.error(
          error.message ||
            t("common.error", { defaultValue: "Something went wrong" }),
        );
        return;
      }
      toast.success(
        t("settings.signedOutEverywhere", {
          defaultValue: "Signed out of all other devices",
        }),
      );
    } catch {
      toast.error(t("common.error", { defaultValue: "Failed to sign out" }));
    }
  }, [t]);

  /* ---------------------------------------------------------------- */
  /* Derived view data                                                 */
  /* ---------------------------------------------------------------- */

  const previewAvatar = avatarPick?.url ?? draft.avatar ?? "";
  const initials = getInitials(draft.name);

  const navTrigger = (tab) => (
    <TabsTrigger
      key={tab.value}
      value={tab.value}
      aria-label={t(`settings.${tab.value}`)}
      className={cn(
        "h-auto min-w-0 flex-1 lg:w-full justify-center lg:justify-start gap-1.5 sm:gap-3 whitespace-nowrap rounded-lg px-1 sm:px-3 py-2 text-[10px] sm:text-sm font-medium transition-all duration-200 motion-reduce:transition-none",
        "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        "hover:bg-background/60",
        "shrink-0",
      )}
    >
      <tab.icon
        className="hidden h-4 w-4 shrink-0 sm:block"
        aria-hidden="true"
      />
      <span className="truncate tracking-tight">{t(`settings.${tab.value}`)}</span>
      {tabDirty[tab.value] ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary motion-safe:animate-pulse"
        />
      ) : null}
    </TabsTrigger>
  );

  const saveBar = (
    <div
      aria-live="polite"
      className={cn(
        "sticky z-30 mt-6 w-full",
        /* sit clear of the fixed mobile bottom-nav (h-16 + safe-area) */
        "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6",
        "transition-all duration-300 motion-reduce:transition-none",
        profileDirty || prefsDirty
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <div className="flex w-full flex-col gap-3 rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-3.5 sm:pl-4">
        <p className="flex items-center gap-2 text-xs sm:text-sm font-medium text-foreground">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-amber-500 motion-safe:animate-pulse"
          />
          {t("settings.unsaved", { defaultValue: "You have unsaved changes" })}
        </p>
        <div className="flex items-center gap-2 sm:w-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={discardChanges}
            disabled={saving}
            className="h-9 min-w-0 flex-1 sm:h-9 sm:min-w-0 sm:flex-none text-xs sm:text-sm text-muted-foreground hover:text-foreground"
          >
            {t("common.discard", { defaultValue: "Discard" })}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={saveChanges}
            disabled={saving || (!profileDirty && !prefsDirty)}
            className="h-9 min-w-0 flex-1 gap-1.5 text-xs sm:h-9 sm:flex-1 sm:min-w-0 sm:text-sm font-medium lg:flex-none"
          >
            {saving ? (
              <>
                <Loader2
                  className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {t("common.saving", { defaultValue: "Saving..." })}
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t("settings.saveChange", { defaultValue: "Save Changes" })}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-background">
      <StoreMeta
        title={t("settings.title")}
        description={t("settings.subtitle")}
        noIndex
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:pb-12">
        <Breadcrumb aria-label="Breadcrumb">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">{t("nav.home")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("settings.title")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <header className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none">
          <div className="flex items-center gap-3.5">
            <div className="grid h-11 w-11 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Settings className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl md:text-3xl">
                {t("settings.title")}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t("settings.subtitle")}
              </p>
            </div>
          </div>
          {committed ? (
            <div className="flex lg:hidden items-center gap-3 rounded-xl border bg-card/60 p-2.5 pr-4 backdrop-blur-sm self-start sm:self-auto">
              <Avatar className="h-9 w-9 border border-primary/20">
                {previewAvatar ? (
                  <AvatarImage
                    src={previewAvatar}
                    alt={draft.name || t("settings.profilePicture")}
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{draft.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {draft.email}
                </p>
              </div>
            </div>
          ) : null}
        </header>

        {loading ? (
          <SettingsSkeleton />
        ) : loadError ? (
          <Card className="mt-6 sm:mt-8 w-full overflow-hidden border-destructive/20">
            <CardContent className="flex flex-col items-center gap-4 px-4 py-10 text-center sm:px-8 sm:py-14">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-destructive sm:h-16 sm:w-16">
                <WifiOff className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true" />
              </div>
              <div className="max-w-md space-y-1.5">
                <CardTitle className="text-base sm:text-lg">
                  {t("settings.loadErrorTitle", {
                    defaultValue: "Unable to load your settings",
                  })}
                </CardTitle>
                <CardDescription className="text-xs leading-5 sm:text-sm">
                  {t("settings.loadErrorDescription", {
                    defaultValue:
                      "Check your internet connection and try again. Your settings have not been changed.",
                  })}
                </CardDescription>
              </div>
              <Button
                type="button"
                onClick={() => {
                  loadSettings();
                }}
                className="w-full sm:w-auto"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t("common.retry", { defaultValue: "Try again" })}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="mt-6 sm:mt-8 gap-6 sm:gap-8 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 [animation-delay:100ms] lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start motion-reduce:animate-none"
          >
            {/* Navigation column — sticks under the fixed top navbar on mobile,
                becomes the sidebar column at lg */}
            <div className="space-y-4 max-lg:sticky max-lg:top-16 max-lg:z-30 lg:sticky lg:top-20">
              {committed ? (
                <Card className="hidden lg:block">
                  <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                    <Avatar className="h-20 w-20 border-2 border-primary/20">
                      {previewAvatar ? (
                        <AvatarImage
                          src={previewAvatar}
                          alt={draft.name || t("settings.profilePicture")}
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{draft.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {draft.email}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <TabsList
                aria-label={t("settings.title")}
                className="flex h-auto w-full gap-1 overflow-x-auto max-lg:scrollbar-none rounded-xl border bg-background/90 p-1.5 shadow-sm backdrop-blur-md lg:flex-col lg:overflow-visible lg:bg-muted/40 lg:shadow-none lg:backdrop-blur-none"
              >
                {TABS.map(navTrigger)}
              </TabsList>
            </div>

            {/* Content column */}
            <div className="mt-6 min-w-0 lg:mt-0">
              {/* ------------------------------------------------ Profile */}
              <TabsContent
                value="profile"
                className="mt-0 space-y-6 focus-visible:outline-none data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300 motion-reduce:animate-none"
              >
                {/* Avatar / picture card */}
                <Card className="overflow-hidden transition-shadow duration-300 hover:shadow-md motion-reduce:transition-none">
                  <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Camera
                        className="h-4 w-4 sm:h-5 sm:w-5 text-primary"
                        aria-hidden="true"
                      />
                      {t("settings.profilePicture")}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {t("settings.uploadProfilePicture")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 p-4 sm:p-6 pt-2 sm:pt-2">
                    <div className="group relative shrink-0">
                      <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-2 border-primary/20 transition-all duration-300 group-hover:border-primary/40 motion-reduce:transition-none">
                        {previewAvatar ? (
                          <AvatarImage
                            src={previewAvatar}
                            alt={draft.name || t("settings.profilePicture")}
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-xl sm:text-2xl font-semibold text-primary">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      {avatarPick ? (
                        <span className="absolute -left-1 top-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
                          webp
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          toast.info(
                            t("settings.uploadDisabled", {
                              defaultValue:
                                "Profile picture uploading is disabled by Admin",
                            }),
                          );
                          /*fileInputRef.current?.click() - currently disabled profile pic uploading */
                        }}
                        aria-label={t("settings.changePhoto")}
                        className="absolute -bottom-1 right-0 grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
                      >
                        <Camera
                          className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                          aria-hidden="true"
                        />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={() => {
                          // currently disabled profile pic uploading
                          // _pickAvatar(e.target.files?.[0])
                          toast.info(
                            t("settings.uploadDisabled", {
                              defaultValue:
                                "Profile picture uploading is disabled by Admin",
                            }),
                          );
                        }}
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0 flex-1 text-center sm:text-left">
                      <h3 className="truncate text-base sm:text-lg font-semibold">
                        {draft.name}
                      </h3>
                      <p className="mt-0.5 flex items-center justify-center sm:justify-start gap-1.5 truncate text-xs sm:text-sm text-muted-foreground">
                        <Mail
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        {draft.email}
                      </p>
                      <p className="mt-1 flex items-center justify-center sm:justify-start gap-1.5 text-xs sm:text-sm text-muted-foreground">
                        <Phone
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        {draft.phone ||
                          t("settings.noPhoneNumber", {
                            defaultValue: "No phone number provided",
                          })}
                      </p>
                      {avatarPick ? (
                        <p className="mt-2 text-xs font-medium text-primary">
                          {t("settings.uploadsOnSave", {
                            defaultValue: "New photo uploads when you save",
                          })}
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                {/* Personal info */}
                <Card>
                  <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <User
                        className="h-4 w-4 sm:h-5 sm:w-5 text-primary"
                        aria-hidden="true"
                      />
                      {t("settings.personalInfo")}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {t("settings.personalInfoDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 sm:space-y-5 p-4 sm:p-6 pt-2 sm:pt-2">
                    <div className="grid gap-4 sm:gap-5 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label
                          htmlFor="name"
                          className="text-xs sm:text-sm font-medium"
                        >
                          {t("settings.fullName")}
                        </Label>
                        <div className="relative">
                          <User
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <Input
                            id="name"
                            value={draft.name}
                            onChange={(e) => {
                              const name = e.target.value;
                              const validation = nameSchema.safeParse(
                                name.trim(),
                              );
                              setDraft((d) => ({ ...d, name }));
                              setNameError(
                                validation.success
                                  ? ""
                                  : (validation.error.issues[0]?.message ??
                                      nameErrorMessage),
                              );
                            }}
                            placeholder={t("settings.fullName")}
                            autoComplete="name"
                            aria-invalid={Boolean(nameError)}
                            aria-describedby={
                              nameError ? "name-error" : undefined
                            }
                            className={cn(
                              "pl-10 text-base lg:text-sm",
                              nameError &&
                                "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                        </div>
                        <FieldError id="name-error" message={nameError} />
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <Label
                          htmlFor="email"
                          className="text-xs sm:text-sm font-medium"
                        >
                          {t("settings.emailAddress")}
                        </Label>
                        <div className="relative">
                          <Mail
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <Input
                            id="email"
                            type="email"
                            value={draft.email}
                            readOnly
                            disabled
                            className="pl-10 text-base lg:text-sm"
                            aria-describedby="email-hint"
                          />
                        </div>
                        <p
                          id="email-hint"
                          className="text-[11px] sm:text-xs text-muted-foreground"
                        >
                          {t("settings.emailCannotChange", {
                            defaultValue: "Email address cannot be changed",
                          })}
                        </p>
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <Label
                          htmlFor="phone"
                          className="text-xs sm:text-sm font-medium"
                        >
                          {t("settings.phoneNumber")}
                        </Label>
                        <div className="relative">
                          <Phone
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <Input
                            id="phone"
                            type="tel"
                            value={draft.phone}
                            onChange={(e) => {
                              const phone = normalizePhoneNumber(
                                e.target.value,
                              );
                              const validation = phoneSchema.safeParse(phone);
                              setDraft((d) => ({ ...d, phone }));
                              setPhoneError(
                                validation.success
                                  ? ""
                                  : (validation.error.issues[0]?.message ??
                                      phoneErrorMessage),
                              );
                            }}
                            placeholder={t("settings.phoneNumberPlaceholder", {
                              defaultValue: "Enter your phone number",
                            })}
                            autoComplete="tel"
                            aria-invalid={Boolean(phoneError)}
                            aria-describedby={
                              phoneError ? "phone-error" : undefined
                            }
                            className={cn(
                              "pl-10 text-base lg:text-sm",
                              phoneError &&
                                "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                        </div>
                        <FieldError id="phone-error" message={phoneError} />
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <Label
                          htmlFor="language"
                          className="text-xs sm:text-sm font-medium"
                        >
                          {t("settings.language")}
                        </Label>
                        <Select
                          value={pref?.language}
                          onValueChange={(value) =>
                            setPref((p) => ({ ...p, language: value }))
                          }
                        >
                          <SelectTrigger
                            id="language"
                            className="w-full text-base lg:text-sm"
                          >
                            <Globe
                              className="h-4 w-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <SelectValue
                              placeholder={t("settings.selectLanguage")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="ml">മലയാളം</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator className="my-2 sm:my-3" />

                    <Link
                      to="/addressbook"
                      className="group flex items-center justify-between gap-3 sm:gap-4 rounded-xl border p-3.5 sm:p-4 outline-none transition-all duration-200 hover:border-primary/40 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div className="grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground motion-reduce:transition-none">
                          <MapPin
                            className="h-4 w-4 sm:h-5 sm:w-5"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs sm:text-sm font-semibold truncate">
                            {t("settings.addressBook")}
                          </h3>
                          <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
                            {t("settings.manageAddresses")}
                          </p>
                        </div>
                      </div>
                      <ArrowRight
                        className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-1 group-hover:text-primary motion-reduce:translate-x-0 motion-reduce:transition-none"
                        aria-hidden="true"
                      />
                    </Link>
                  </CardContent>
                </Card>

                {saveBar}
              </TabsContent>

              {/* ------------------------------------------- Notifications */}
              <TabsContent
                value="notifications"
                className="mt-0 space-y-6 focus-visible:outline-none data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300 motion-reduce:animate-none"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5" aria-hidden="true" />
                      {t("settings.notificationPreferences")}
                    </CardTitle>
                    <CardDescription>
                      {t("settings.notificationPreferencesDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <ToggleRow
                      id="emailNotifications"
                      checked={pref?.emailNotifications ?? true}
                      onChange={(checked) =>
                        setPref((p) => ({ ...p, emailNotifications: checked }))
                      }
                      title={t("settings.emailNotifications")}
                      description={t("settings.emailNotificationsDesc")}
                      icon={Mail}
                    />
                    <ToggleRow
                      id="pushNotifications"
                      checked={pref?.pushNotifications ?? true}
                      onChange={(checked) =>
                        setPref((p) => ({ ...p, pushNotifications: checked }))
                      }
                      title={t("settings.pushNotifications")}
                      description={t("settings.pushNotificationsDesc")}
                      icon={Bell}
                    />
                    <ToggleRow
                      id="orderUpdates"
                      checked={pref?.orderUpdates ?? true}
                      onChange={(checked) =>
                        setPref((p) => ({ ...p, orderUpdates: checked }))
                      }
                      title={t("settings.orderUpdates")}
                      description={t("settings.orderUpdatesDesc")}
                      icon={Shield}
                    />
                  </CardContent>
                </Card>

                {saveBar}
              </TabsContent>

              {/* ---------------------------------------------- Appearance */}
              <TabsContent
                value="appearance"
                className="mt-0 space-y-6 focus-visible:outline-none data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300 motion-reduce:animate-none"
              >
                <Card>
                  <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Palette
                        className="h-4 w-4 sm:h-5 sm:w-5 text-primary"
                        aria-hidden="true"
                      />
                      {t("settings.appearanceSettings")}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {t("settings.appearanceSettingsDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
                    <div
                      role="radiogroup"
                      aria-label={t("settings.theme")}
                      className="grid grid-cols-3 gap-2 sm:gap-4"
                    >
                      <ThemeCard
                        value="light"
                        currentTheme={theme}
                        icon={Sun}
                        label={t("settings.themeLight")}
                        onSelect={setTheme}
                      />
                      <ThemeCard
                        value="dark"
                        currentTheme={theme}
                        icon={Moon}
                        label={t("settings.themeDark")}
                        onSelect={setTheme}
                      />
                      <ThemeCard
                        value="system"
                        currentTheme={theme}
                        icon={Monitor}
                        label={t("settings.themeSystem")}
                        onSelect={setTheme}
                      />
                    </div>
                    <p className="mt-4 text-xs sm:text-sm text-muted-foreground">
                      {t("settings.themeLocal", {
                        defaultValue:
                          "Theme is saved instantly on this device — no save button needed.",
                      })}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ------------------------------------------------ Security */}
              <TabsContent
                value="security"
                className="mt-0 space-y-6 focus-visible:outline-none data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300 motion-reduce:animate-none"
              >
                <Card>
                  <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Key
                        className="h-4 w-4 sm:h-5 sm:w-5 text-primary"
                        aria-hidden="true"
                      />
                      {t("settings.changePassword")}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {t("settings.changePasswordDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 sm:space-y-5 p-4 sm:p-6 pt-2 sm:pt-2">
                    <div className="space-y-1.5 sm:space-y-2">
                      <Label
                        htmlFor="currentPassword"
                        className="text-xs sm:text-sm font-medium"
                      >
                        {t("settings.currentPassword")}
                      </Label>
                      <PasswordInput
                        id="currentPassword"
                        value={pw.current}
                        onChange={(value) =>
                          setPw((p) => ({ ...p, current: value }))
                        }
                        placeholder={t("settings.currentPasswordPlaceholder")}
                        autoComplete="current-password"
                      />
                    </div>

                    <div className="grid gap-4 sm:gap-5 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label
                          htmlFor="newPassword"
                          className="text-xs sm:text-sm font-medium"
                        >
                          {t("settings.newPassword")}
                        </Label>
                        <PasswordInput
                          id="newPassword"
                          value={pw.next}
                          onChange={(value) =>
                            setPw((p) => ({ ...p, next: value }))
                          }
                          placeholder={t("settings.newPasswordPlaceholder")}
                          autoComplete="new-password"
                        />
                        <PasswordMeter password={pw.next} />
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label
                          htmlFor="confirmPassword"
                          className="text-xs sm:text-sm font-medium"
                        >
                          {t("settings.confirmPassword")}
                        </Label>
                        <PasswordInput
                          id="confirmPassword"
                          value={pw.confirm}
                          onChange={(value) =>
                            setPw((p) => ({ ...p, confirm: value }))
                          }
                          placeholder={t("settings.confirmPasswordPlaceholder")}
                          autoComplete="new-password"
                          describedById={
                            pw.confirm && pw.next !== pw.confirm
                              ? "confirm-hint"
                              : undefined
                          }
                        />
                        {pw.confirm && pw.next !== pw.confirm ? (
                          <p
                            id="confirm-hint"
                            role="alert"
                            className="text-xs sm:text-sm text-destructive"
                          >
                            {t("settings.passwordsDontMatch", {
                              defaultValue: "Passwords don't match",
                            })}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <Button
                      onClick={changePassword}
                      disabled={
                        pwSaving ||
                        !pw.current ||
                        !pw.next ||
                        pw.next !== pw.confirm
                      }
                      className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm font-medium gap-2"
                    >
                      {pwSaving ? (
                        <>
                          <Loader2
                            className="h-4 w-4 animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                          {t("common.saving")}
                        </>
                      ) : (
                        <>
                          <Key className="h-4 w-4" aria-hidden="true" />
                          {t("settings.updatePassword")}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-destructive/25">
                  <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-destructive">
                      <Shield
                        className="h-4 w-4 sm:h-5 sm:w-5"
                        aria-hidden="true"
                      />
                      {t("settings.accountActions")}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {t("settings.accountActionsDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-2 sm:pt-2">
                    {/* Sign out everywhere — real action via better-auth */}
                    <div className="flex flex-col gap-3 rounded-xl border p-3.5 sm:p-4 transition-colors duration-200 hover:border-muted-foreground/30 sm:flex-row sm:items-center sm:justify-between motion-reduce:transition-none">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <LogOut className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium truncate">
                            {t("settings.signOutAll")}
                          </p>
                          <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 sm:line-clamp-none">
                            {t("settings.signOutAllDesc")}
                          </p>
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto shrink-0 h-8 sm:h-9 text-xs sm:text-sm"
                          >
                            {t("settings.signOutAllButton")}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-[90vw] sm:max-w-lg">
                          <AlertDialogHeader>
                            <AlertDialogMedia>
                              <LogOut className="h-6 w-6" aria-hidden="true" />
                            </AlertDialogMedia>
                            <AlertDialogTitle>
                              {t("settings.signOutAll")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("settings.signOutAllDesc")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                            <AlertDialogCancel>
                              {t("common.cancel")}
                            </AlertDialogCancel>
                            <AlertDialogAction onClick={signOutEverywhere}>
                              {t("settings.signOutAllButton")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    {/* Account deletion is not available server-side — honest UI */}
                    <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 sm:p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-destructive truncate">
                            {t("settings.deleteAccount")}
                          </p>
                          <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 sm:line-clamp-none">
                            {t("settings.deleteAccountDesc")}
                          </p>
                        </div>
                      </div>
                      <Link
                        to="/support"
                        className="inline-flex items-center justify-center rounded-md text-xs sm:text-sm font-medium text-destructive underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 py-1"
                      >
                        {t("common.contactSupport")}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
};

const SettingsSkeleton = () => (
  <div
    className="mt-6 sm:mt-8 gap-6 sm:gap-8 lg:grid lg:grid-cols-[280px_minmax(0,1fr)]"
    aria-hidden="true"
  >
    <div className="space-y-4 lg:sticky lg:top-20">
      <Skeleton className="hidden h-40 rounded-xl lg:block" />
      <div className="flex gap-2 overflow-x-auto lg:flex-col lg:space-y-2 scrollbar-none">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            className="h-10 w-28 shrink-0 rounded-lg lg:w-full"
          />
        ))}
      </div>
    </div>
    <div className="mt-6 space-y-6 lg:mt-0">
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  </div>
);

export default SettingsPage;
