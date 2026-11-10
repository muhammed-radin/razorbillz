import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main className="relative isolate flex min-h-[70vh] w-full items-center justify-center overflow-hidden px-4 py-16 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -left-24 top-1/4 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -right-24 bottom-1/4 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <Card className="w-full max-w-xl overflow-hidden border-primary/10 bg-card/80 shadow-2xl shadow-primary/5 backdrop-blur-sm">
        <CardContent className="flex flex-col items-center px-6 py-12 text-center sm:px-12 sm:py-16">
          <div className="relative mb-8">
            <div className="absolute inset-0 scale-150 rounded-full bg-primary/10 blur-xl" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-primary/15 bg-primary/10">
              <span className="text-4xl font-black tracking-tighter text-primary">
                404
              </span>
            </div>
          </div>

          <span className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Page not found
          </span>
          <h1 className="max-w-md text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("notfound.message")}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
            The page may have moved, or the link you followed may be out of
            date. Let&apos;s get you back on track.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button size="lg" className="w-full sm:w-auto" asChild>
              <Link to="/">
                <Home className="h-4 w-4" />
                {t("notfound.goHome")}
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
              asChild
            >
              <Link to="/search">
                <Search className="h-4 w-4" />
                {t("nav.search")}
              </Link>
            </Button>
          </div>

          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("common.back")}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

export default NotFoundPage;
