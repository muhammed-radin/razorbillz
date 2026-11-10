import { Cpu, MapPin, PackageCheck, ShieldCheck, Headset, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal, SectionHeading } from "./Reveal";

export default function WhyRazorbillz() {
  const { t } = useTranslation();
  const features = [
    {
      icon: Zap,
      title: t("homepage.why.fastTitle"),
      text: t("homepage.why.fastText"),
      tint: "bg-amber-500/12 text-amber-600",
    },
    {
      icon: MapPin,
      title: t("homepage.why.keralaTitle"),
      text: t("homepage.why.keralaText"),
      tint: "bg-emerald-500/12 text-emerald-600",
    },
    {
      icon: ShieldCheck,
      title: t("homepage.why.genuineTitle"),
      text: t("homepage.why.genuineText"),
      tint: "bg-sky-500/12 text-sky-600",
    },
    {
      icon: Headset,
      title: t("homepage.why.supportTitle"),
      text: t("homepage.why.supportText"),
      tint: "bg-violet-500/12 text-violet-600",
    },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      <SectionHeading
        eyebrow={t("homepage.why.eyebrow")}
        title={t("homepage.why.title")}
        description={t("homepage.why.description")}
      />
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => (
          <Reveal key={f.title} delay={i * 80}>
            <Card className="h-full rounded-3xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group">
              <CardContent className="p-5 sm:p-6">
                <span className={`inline-grid size-11 place-items-center rounded-2xl ${f.tint} transition-transform group-hover:scale-110 group-hover:-rotate-6`}>
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.text}</p>
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120}>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5"><Cpu className="size-3.5" /> {t("homepage.why.chipBoards")}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5"><PackageCheck className="size-3.5" /> {t("homepage.why.chipReturns")}</span>
        </div>
      </Reveal>
    </section>
  );
}
