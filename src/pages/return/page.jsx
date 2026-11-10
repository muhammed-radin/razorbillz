import {
  RefreshCcw,
  AlertCircle,
  X,
  FileText,
  DollarSign,
  Package,
  Truck,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useStoreInfo } from "@/utils/store";

export default function Returns() {
  const { t } = useTranslation();
  const store = useStoreInfo();

  const returnEligibility = [
    t("return.eligibility1"),
    t("return.eligibility2"),
    t("return.eligibility3"),
    t("return.eligibility4"),
  ];

  const nonReturnableItems = [
    t("return.nonReturnable1"),
    t("return.nonReturnable2"),
    t("return.nonReturnable3"),
    t("return.nonReturnable4"),
  ];

  const returnSteps = [
    {
      number: "1",
      text: t("return.step1", { email: store.emailSupport }),
    },
    {
      number: "2",
      text: t("return.step2"),
    },
    {
      number: "3",
      text: t("return.step3"),
    },
  ];

  const importantNotes = [
    t("return.importantNote1"),
    t("return.importantNote2"),
    t("return.importantNote3"),
  ];

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-black/10 dark:text-gray-100">
      {/* Hero Section */}
      <div className="relative overflow-hidden border-b dark:border-neutral-700">
        <div className="absolute inset-0"></div>

        <div className="relative max-w-7xl mx-auto px-6 py-20">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 dark:text-white">
              {t("return.title")}
            </h1>
            <p className="text-xl max-w-3xl mx-auto leading-relaxed dark:text-gray-300">
              {t("return.subtitle")}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Return Eligibility */}
        <Card className="mb-12">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                <CheckCircle2 className="w-6 h-6 text-amber-600" />
              </div>
              <h2 className="text-3xl font-bold text-black dark:text-white">
                {t("return.eligibilityTitle")}
              </h2>
            </div>
            <p className="text-neutral-700 dark:text-gray-300 mb-4">
              {t("return.eligibilityDesc")}
            </p>
            <ul className="space-y-3">
              {returnEligibility.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                    <span className="text-amber-600 text-xs font-bold">✓</span>
                  </div>
                  <span className="text-neutral-700 dark:text-gray-300">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
            <Card className="mt-6 border-orange-200 bg-orange-50 dark:bg-orange-900/10 dark:border-orange-500/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-neutral-700 dark:text-gray-300">
                    <strong>
                      {t("return.eligibilityWarning")}
                    </strong>
                  </p>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        {/* Non-Returnable Items */}
        <Card className="mb-12 border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-500/30">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-red-100 flex items-center justify-center rounded-lg dark:bg-red-900/30">
                <X className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-3xl font-bold text-black dark:text-white">
                {t("return.nonReturnableTitle")}
              </h2>
            </div>
            <p className="text-neutral-700 dark:text-gray-300 mb-4">
              {t("return.nonReturnableDesc")}
            </p>
            <ul className="space-y-3">
              {nonReturnableItems.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <span className="text-neutral-700 dark:text-gray-300">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* How to Request a Return */}
        <Card className="mb-12">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                <FileText className="w-6 h-6 text-amber-600" />
              </div>
              <h2 className="text-3xl font-bold text-black dark:text-white">
                {t("return.howToRequest")}
              </h2>
            </div>
            <p className="text-neutral-700 dark:text-gray-300 mb-6">
              To initiate a return:
            </p>
            <div className="space-y-4 mb-6">
              {returnSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                    {step.number}
                  </div>
                  <p className="text-neutral-700 dark:text-gray-300 pt-1.5">
                    {step.text}
                  </p>
                </div>
              ))}
            </div>
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-500/30">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-neutral-800 dark:text-gray-200">
                  {t("return.approvalNote")}
                </p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Refunds */}
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                  <DollarSign className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-2xl font-bold text-black dark:text-white">
                  {t("return.refundsTitle")}
                </h2>
              </div>
              <ul className="space-y-3 mb-4">
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                    <span className="text-amber-600 text-xs font-bold">✓</span>
                  </div>
                  <span className="text-neutral-700 dark:text-gray-300">
                    {t("return.refundPoint1")}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                    <span className="text-amber-600 text-xs font-bold">✓</span>
                  </div>
                  <span className="text-neutral-700 dark:text-gray-300">
                    {t("return.refundPoint2")}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                    <span className="text-amber-600 text-xs font-bold">✓</span>
                  </div>
                  <span className="text-neutral-700 dark:text-gray-300">
                    {t("return.refundPoint3")}
                  </span>
                </li>
              </ul>
              <p className="text-sm text-neutral-600 dark:text-gray-400 italic">
                {t("return.refundShippingNote")}
              </p>
            </CardContent>
          </Card>

          {/* Replacement Option */}
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                  <Package className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-2xl font-bold text-black dark:text-white">
                  {t("return.replacementTitle")}
                </h2>
              </div>
              <p className="text-neutral-700 dark:text-gray-300">
                {t("return.replacementDesc")}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Return Shipping */}
        <Card className="mb-12">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                <Truck className="w-6 h-6 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold text-black dark:text-white">
                {t("return.returnShippingTitle")}
              </h2>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                  <span className="text-amber-600 text-xs font-bold">✓</span>
                </div>
                <span className="text-neutral-700 dark:text-gray-300">
                  {t("return.returnShippingPoint1")}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                  <span className="text-amber-600 text-xs font-bold">✓</span>
                </div>
                <span className="text-neutral-700 dark:text-gray-300">
                  {t("return.returnShippingPoint2")}
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Important Notes */}
        <Card className="mb-12 border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-500/30">
          <CardContent className="p-8">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-bold mb-4 text-black dark:text-white">
                  {t("return.importantNotesTitle")}
                </h3>
                <ul className="space-y-3">
                  {importantNotes.map((note, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="text-blue-600 font-bold">•</span>
                      <span className="text-neutral-700 dark:text-gray-300">
                        {note}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Need Help Section */}
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-500/30">
          <CardContent className="p-8 text-center">
            <h3 className="text-2xl font-bold mb-4 text-black dark:text-white">
              {t("return.needHelp")}
            </h3>
            <p className="text-neutral-700 dark:text-gray-300 mb-6">
              {t("return.needHelpDesc")}
            </p>
            <div className="flex items-center justify-center gap-2 mb-6">
              <Mail className="w-5 h-5 text-amber-600" />
              <a
                href={`mailto:${store.emailSupport}`}
                className="text-lg font-semibold text-amber-600 hover:text-amber-700"
              >
                {store.emailSupport}
              </a>
            </div>
            <p className="text-neutral-700 dark:text-gray-300">
              {t("shipping.happyToAssist")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
