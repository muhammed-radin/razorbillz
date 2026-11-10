import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StoreMeta } from "@/components/store-meta";
import { useStoreInfo } from "@/utils/store";
import {
  Package,
  Shield,
  MapPin,
  Zap,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RazorbillzAbout() {
  const [hoveredCard, setHoveredCard] = useState(null);
  const { t } = useTranslation();
  const store = useStoreInfo();

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-black/10 dark:text-gray-100">
      <StoreMeta
        title={t("about.title")}
        description={`Learn about ${store.name}, our mission to provide quality products across categories with a focus on accessibility and affordability.`}
        keywords={`about us, ${store.name}, products, shopping, mission, vision, quality`}
      />
      {/* Header*/}
      <div className="relative overflow-hidden border-b dark:border-neutral-700">
        <div className="absolute inset-0"></div>
        
        <div className="relative max-w-7xl  mx-auto px-6 py-20">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 dark:text-white">
              {t("about.title")}
            </h1>

            <div className="max-w-3xl mx-auto space-y-4">
              <p className="text-xl leading-relaxed dark:text-gray-300">
                {t("about.subtitle")}
              </p>
              <div className="flex items-center justify-center gap-3 text-amber-600">
                <MapPin className="w-5 h-5" />
                <span className=" font-medium">
                  {t("about.nationwide")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mission Statement */}
      <div className="relative border-b dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6 dark:text-white">
                {t("about.ideaTitle")}
              </h2>
              <p className="text-xl leading-relaxed mb-4 dark:text-gray-300">
                {t("about.ideaSubtitle")}{" "}
                <span className="text-amber-600 font-semibold">
                  {t("about.accessibleAffordable")}
                </span>
                .
              </p>
              <p className="leading-relaxed dark:text-gray-300">
                {t("about.ideaDesc")}
              </p>
            </div>

            <div className="relative">
              <div className="relative border border-neutral-200 p-8 rounded-lg dark:border-neutral-700 dark:bg-black/10">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-amber-100 flex items-center justify-center flex-shrink-0 rounded dark:bg-amber-900/30">
                      <Package className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1 dark:text-white">
                        {t("about.qualityTitle")}
                      </h3>
                      <p className="text-sm dark:text-gray-300">
                        {t("about.qualityDesc")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-amber-100 flex items-center justify-center flex-shrink-0 rounded dark:bg-amber-900/30">
                      <Shield className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1 dark:text-white">
                        {t("about.selectionTitle")}
                      </h3>
                      <p className="text-sm dark:text-gray-300">
                        {t("about.selectionDesc")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-amber-100 flex items-center justify-center flex-shrink-0 rounded dark:bg-amber-900/30">
                      <TrendingUp className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1  dark:text-white">
                        {t("about.pricingTitle")}
                      </h3>
                      <p className="text-sm  dark:text-gray-300">
                        {t("about.pricingDesc")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What Sets Us Apart */}
      <div className="relative border-neutral-200 border-b dark:border-neutral-700">
        <div className="relative max-w-7xl mx-auto px-6 py-16">
          <div className="text-center mb-12 ">
            <h2 className="text-4xl font-bold  text-black dark:text-white">
              {t("about.setsApart")}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 ">
            {[
              {
                title: t("about.feature1Title"),
                description: t("about.feature1Desc"),
                icon: Package,
              },
              {
                title: t("about.feature2Title"),
                description: t("about.feature2Desc"),
                icon: TrendingUp,
              },
              {
                title: t("about.feature3Title"),
                description: t("about.feature3Desc"),
                icon: Zap,
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredCard(idx)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className={`relative bg-white border border-neutral-200 p-8 rounded-lg transition-all duration-300 dark:border-neutral-700 dark:bg-black/10 ${hoveredCard === idx ? "shadow-lg dark:shadow-amber-500/20" : ""}`}
                  style={{
                    transform:
                      hoveredCard === idx
                        ? "translateY(-8px)"
                        : "translateY(0)",
                    borderColor: hoveredCard === idx ? "#f59e0b" : "",
                  }}
                >
                  <div className="w-14 h-14 bg-amber-100 flex items-center justify-center mb-6 rounded dark:bg-amber-900/30">
                    <Icon className="w-7 h-7 text-amber-600" strokeWidth={2} />
                  </div>
                  <h3 className="text-xl font-bold mb-3  text-black dark:text-white">
                    {feature.title}
                  </h3>
                  <p className="leading-relaxed  text-neutral-600 dark:text-gray-300">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Customer Trust */}
      <div className="relative border-neutral-200 border-b dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <div className="bg-neutral-50 border border-neutral-200 p-8 rounded-lg dark:bg-black/10 dark:border-neutral-700">
                <div className="space-y-6">
                  <div className="flex items-center gap-4 pb-4 border-neutral-200 border-b dark:border-neutral-700">
                    <CheckCircle2 className="w-6 h-6 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="font-semibold  text-black dark:text-white">
                        {t("about.trustPoint1")}
                      </div>
                      <div className="text-sm  text-neutral-600 dark:text-gray-300">
                        {t("about.trustPoint1Sub")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pb-4 border-neutral-200 border-b dark:border-neutral-700">
                    <CheckCircle2 className="w-6 h-6 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="font-semibold  text-black dark:text-white">
                        {t("about.trustPoint2")}
                      </div>
                      <div className="text-sm  text-neutral-600 dark:text-gray-300">
                        {t("about.trustPoint2Sub")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pb-4 border-neutral-200 border-b dark:border-neutral-700">
                    <CheckCircle2 className="w-6 h-6 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="font-semibold  text-black dark:text-white">
                        {t("about.trustPoint3")}
                      </div>
                      <div className="text-sm  text-neutral-600 dark:text-gray-300">
                        {t("about.trustPoint3Sub")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <CheckCircle2 className="w-6 h-6 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="font-semibold  text-black dark:text-white">
                        {t("about.trustPoint4")}
                      </div>
                      <div className="text-sm  text-neutral-600 dark:text-gray-300">
                        {t("about.trustPoint4Sub")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 md:order-2">
              <h2 className="text-2xl md:text-4xl font-bold mb-6  text-black dark:text-white">
                {t("about.trustTitle")}
              </h2>
              <p className="text-lg md:text-xl leading-relaxed mb-6  text-neutral-700 dark:text-gray-300">
                {t("about.trustSubtitle")}
              </p>
              <p className="leading-relaxed  text-neutral-600 dark:text-gray-300">
                {t("about.trustDesc")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mission Statement Banner */}
      <div className="relative overflow-hidden bg-neutral-100 dark:bg-black/10">
        <div className="relative max-w-7xl mx-auto px-6 py-16 text-center">
          <h2 className="text-xl md:text-4xl font-bold mb-6 max-w-4xl mx-auto leading-tight  text-black dark:text-white">
            {t("about.bannerTitle")}
          </h2>
          <div className="flex items-center justify-center gap-3 text-amber-600  font-medium">
            <span>{t("about.bannerBadge")}</span>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="relative border-neutral-200 border-t dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="text-xl font-bold mb-2  text-black dark:text-white">
                {t("about.ctaTitle")}
              </div>
              <p className=" text-neutral-600 dark:text-gray-300">
                {t("about.ctaDesc")}
              </p>
            </div>
            <Button className="transition-all duration-300  semibold">
              {t("about.ctaButton")}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
