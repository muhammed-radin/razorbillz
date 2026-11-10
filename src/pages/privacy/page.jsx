import React from "react";
import { useTranslation } from "react-i18next";
import { Separator } from "@/components/ui/separator";
import { useStoreInfo } from "@/utils/store";

const PrivacyPolicyPage = () => {
  const { t } = useTranslation();
  const store = useStoreInfo();

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">{t("privacy.title")}</h1>
          <p className="text-muted-foreground text-lg">
            {t("privacy.lastUpdated")} {new Date().toLocaleDateString()}
          </p>
        </div>

        <Separator className="mb-8" />

        <div className="space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.introTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("privacy.introText")}
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.collectTitle")}</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium mb-2">{t("privacy.personalInfoTitle")}</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>{t("privacy.personalInfo1")}</li>
                  <li>{t("privacy.personalInfo2")}</li>
                  <li>{t("privacy.personalInfo3")}</li>
                  <li>{t("privacy.personalInfo4")}</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-medium mb-2">{t("privacy.usageInfoTitle")}</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>{t("privacy.usageInfo1")}</li>
                  <li>{t("privacy.usageInfo2")}</li>
                  <li>{t("privacy.usageInfo3")}</li>
                  <li>{t("privacy.usageInfo4")}</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Data Security & Encryption */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.securityTitle")}</h2>
            <div className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                {t("privacy.securityDesc")}
              </p>
              <div className="bg-muted p-4 rounded-lg">
                <h3 className="text-xl font-medium mb-2">{t("privacy.encryptionTitle")}</h3>
                <p className="text-muted-foreground">
                  {t("privacy.encryptionDesc")}
                </p>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <h3 className="text-xl font-medium mb-2">{t("privacy.backendTitle")}</h3>
                <p className="text-muted-foreground">
                  {t("privacy.backendDesc")}
                </p>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <h3 className="text-xl font-medium mb-2">{t("privacy.firebaseTitle")}</h3>
                <p className="text-muted-foreground">
                  {t("privacy.firebaseDesc")}
                </p>
              </div>
            </div>
          </section>

          {/* How We Use Your Information */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.useInfoTitle")}</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>{t("privacy.useInfo1")}</li>
              <li>{t("privacy.useInfo2")}</li>
              <li>{t("privacy.useInfo3")}</li>
              <li>{t("privacy.useInfo4")}</li>
              <li>{t("privacy.useInfo5")}</li>
              <li>{t("privacy.useInfo6")}</li>
              <li>{t("privacy.useInfo7")}</li>
            </ul>
          </section>

          {/* Data Sharing */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.sharingTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("privacy.sharingDesc")}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>{t("privacy.sharing1")}</li>
              <li>{t("privacy.sharing2")}</li>
              <li>{t("privacy.sharing3")}</li>
              <li>{t("privacy.sharing4")}</li>
            </ul>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.rightsTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("privacy.rightsDesc")}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>{t("privacy.rightsAccess")}</strong> {t("privacy.rightsAccessDesc")}</li>
              <li><strong>{t("privacy.rightsCorrection")}</strong> {t("privacy.rightsCorrectionDesc")}</li>
              <li><strong>{t("privacy.rightsDeletion")}</strong> {t("privacy.rightsDeletionDesc")}</li>
              <li><strong>{t("privacy.rightsPortability")}</strong> {t("privacy.rightsPortabilityDesc")}</li>
              <li><strong>{t("privacy.rightsOptOut")}</strong> {t("privacy.rightsOptOutDesc")}</li>
              <li><strong>{t("privacy.rightsRestrict")}</strong> {t("privacy.rightsRestrictDesc")}</li>
            </ul>
          </section>

          {/* Cookies and Tracking */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.cookiesTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("privacy.cookiesDesc")}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>{t("privacy.cookiesEssential")}</strong> {t("privacy.cookiesEssentialDesc")}</li>
              <li><strong>{t("privacy.cookiesPerformance")}</strong> {t("privacy.cookiesPerformanceDesc")}</li>
              <li><strong>{t("privacy.cookiesPreference")}</strong> {t("privacy.cookiesPreferenceDesc")}</li>
              <li><strong>{t("privacy.cookiesMarketing")}</strong> {t("privacy.cookiesMarketingDesc")}</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              {t("privacy.cookiesManage")}
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.retentionTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("privacy.retentionDesc")}
            </p>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.childrenTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("privacy.childrenDesc")}
            </p>
          </section>

          {/* International Transfers */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.transfersTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("privacy.transfersDesc")}
            </p>
          </section>

          {/* Policy Updates */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.updatesTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("privacy.updatesDesc")}
            </p>
          </section>

          {/* Contact Information */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("privacy.contactTitle")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("privacy.contactDesc")}
            </p>
            <div className="bg-muted p-6 rounded-lg space-y-2">
              <p><strong>{t("privacy.team")}</strong></p>
              <p>{t("privacy.email", { email: store.emailPrivacy })}</p>
            </div>
            <p className="text-muted-foreground mt-4">
              {t("privacy.commitment")}
            </p>
          </section>
        </div>

        <Separator className="mt-12 mb-8" />
        
        <div className="text-center text-muted-foreground">
          <p>{t("privacy.footerNote", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;