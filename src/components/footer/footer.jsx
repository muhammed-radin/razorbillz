import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Globe,
  AtSign,
  Play,
  Share2,
  MapPin,
  Phone,
  Mail,
  Send,
  ShieldCheck,
  Truck,
  BadgeCheck,
  ChevronRight,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Logo } from "../logo";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useStoreInfo } from "@/utils/store";

export const Footer = () => {
  const { t } = useTranslation();
  const store = useStoreInfo();
  const [email, setEmail] = useState("");

  const socialLinks = [
    { icon: AtSign, label: "Instagram", href: store.social.instagram },
    { icon: Play, label: "YouTube", href: store.social.youtube },
    { icon: Globe, label: "Website", href: store.social.website },
    { icon: Share2, label: "WhatsApp", href: store.social.whatsapp },
  ].filter((s) => s.href);

  const columns = [
    {
      title: t("footer.shop"),
      links: [
        {
          title: t("footer.phones"),
          href: "/search?transform=true&category=phones",
        },
        {
          title: t("footer.laptops"),
          href: "/search?transform=true&category=laptops",
        },
        {
          title: t("footer.audio"),
          href: "/search?transform=true&category=audio",
        },
        {
          title: t("footer.gaming"),
          href: "/search?transform=true&category=gaming",
        },
        {
          title: t("footer.components"),
          href: "/search?transform=true&category=components",
        },
        { title: t("footer.allCategories"), href: "/categories" },
      ],
    },
    {
      title: t("footer.quickLinks"),
      links: [
        { title: t("footer.home"), href: "/" },
        { title: t("footer.wishlist"), href: "/wishlist" },
        { title: t("footer.cart"), href: "/cart" },
        { title: t("footer.profile"), href: "/settings" },
      ],
    },
    {
      title: t("footer.customerSupport"),
      links: [
        { title: t("footer.orderTracking"), href: "/order" },
        { title: "Customer Care", href: "/support" },
        { title: t("footer.returnRefunds"), href: "/return" },
        { title: t("footer.shippingInfo"), href: "/shipping" },
        { title: t("footer.contactUs"), href: "/contact" },
      ],
    },
    {
      title: t("footer.companyInfo"),
      links: [
        { title: t("footer.aboutUs"), href: "/about" },
        { title: t("footer.privacyPolicy"), href: "/privacy" },
        { title: t("footer.termsConditions"), href: "/terms" },
      ],
    },
  ];

  return (
    <footer className="border-t bg-muted/20 pb-20 md:pb-0">
      {/* Newsletter band */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10">
        <div className="relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-8">
          <div className="absolute -top-16 -right-16 size-56 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 size-56 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-[1.2fr_1fr] items-center">
            <div>
              <Badge className="rounded-full">
                {t("footer.newsletterBadge")}
              </Badge>
              {/* h2: the footer is a top-level landmark, and on pages whose
               * deepest heading is an h1 (404, reset-password) an h3 here
               * would skip a level. */}
              <h2 className="mt-3 text-xl sm:text-2xl font-extrabold tracking-tight">
                {t("footer.newsletterTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("footer.newsletterDesc")}
              </p>
            </div>
            <form
              className="flex gap-2 rounded-2xl border bg-background p-2 shadow-sm"
              onSubmit={(e) => {
                e.preventDefault();
                if (!email.includes("@"))
                  return toast.error(t("footer.invalidEmail"));
                toast.success(t("footer.subscribed", { brand: store.name }));
                setEmail("");
              }}
            >
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button
                type="submit"
                className="rounded-xl shrink-0"
                aria-label={t("footer.subscribe")}
              >
                <Send className="size-4 sm:mr-1.5" />
                <span className="hidden sm:inline">
                  {t("footer.subscribe")}
                </span>
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Main columns */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 grid gap-10 md:grid-cols-[1.3fr_2fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground leading-relaxed">
            {store.tagline}
          </p>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p className="inline-flex items-center gap-2">
              <MapPin className="size-4" /> {store.address.cityState}
            </p>
            <p className="flex items-center gap-2">
              <Phone className="size-4" />
              <a
                href={`tel:${store.phone.replace(/[^+\d]/g, "")}`}
                className="hover:text-foreground"
              >
                {store.phone}
              </a>
            </p>
            <p className="flex items-center gap-2">
              <Mail className="size-4" />
              <a
                href={`mailto:${store.emailCare}`}
                className="hover:text-foreground"
              >
                {store.emailCare}
              </a>
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            {socialLinks.map((s) => (
              <a
                key={s.label}
                aria-label={s.label}
                href={s.href}
                target={s.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="grid size-10 place-items-center rounded-2xl border bg-background transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <s.icon className="size-4" />
              </a>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["UPI", "Visa", "Mastercard", "COD", "GST invoice"].map((p) => (
              <Badge key={p} variant="secondary" className="rounded-full">
                {p}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.title}>
                    <Link
                      to={l.href}
                      className="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="size-3 opacity-0 -ml-4 transition-all group-hover:opacity-100 group-hover:ml-0" />
                      {l.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-background px-4 py-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Truck className="size-3.5 text-emerald-600" />{" "}
            {t("footer.trustDispatch")}
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-600" />{" "}
            {t("footer.trustGenuine")}
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="size-3.5 text-emerald-600" />{" "}
            {t("footer.trustReturns")}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Separator className="mt-6" />
        <div className="py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            &copy; {new Date().getFullYear()} {store.legalName}.{" "}
            {t("footer.allRightsReserved")}
          </span>
          <span className="inline-flex items-center gap-3">
            <Link to="/privacy" className="hover:text-foreground">
              {t("footer.privacy")}
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              {t("footer.terms")}
            </Link>
            <Link to="/shipping" className="hover:text-foreground">
              {t("footer.shipping")}
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
};
