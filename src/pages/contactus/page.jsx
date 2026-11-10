import {
  Mail,
  Phone,
  MapPin,
  MessageSquare,
  Clock,
  HelpCircle,
  Package,
  CreditCard,
  Truck,
  RefreshCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { StoreMeta } from "@/components/store-meta";
import { useStoreInfo } from "@/utils/store";

export default function ContactUs() {
  const { t } = useTranslation();
  const store = useStoreInfo();

  const contactMethods = [
    {
      icon: Mail,
      title: t("contact.emailSupport"),
      detail: store.emailSupport,
      description: t("contact.emailSupportDesc"),
    },
    {
      icon: Phone,
      title: t("contact.phoneSupport"),
      detail: store.phoneSupport,
      description: t("contact.phoneSupportDesc"),
      time: t("contact.phoneSupportHours"),
    },
    {
      icon: MapPin,
      title: t("contact.officeAddress"),
      detail: store.name,
      description: store.address.line2 || "",
      address: store.address.cityStatePin,
      country: store.address.country,
    },
  ];

  const faqTopics = [
    { icon: Package, label: t("contact.faqOrderStatus") },
    { icon: CreditCard, label: t("contact.faqPayments") },
    { icon: Truck, label: t("contact.faqShipping") },
    { icon: RefreshCcw, label: t("contact.faqReturns") },
  ];

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-black/10 dark:text-gray-100">
      <StoreMeta
        title={t("contact.title")}
        description={t("contact.subtitle")}
        keywords={`contact us, ${store.name}, support, email, phone, address, contact form`}
      />
      {/* Hero Section */}
      <div className="relative overflow-hidden border-b dark:border-neutral-700">
        <div className="absolute inset-0"></div>

        <div className="relative max-w-7xl mx-auto px-6 py-20">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 dark:text-white">
              {t("contact.title")}
            </h1>
            <p className="text-xl max-w-3xl mx-auto leading-relaxed dark:text-gray-300">
              {t("contact.subtitle")}
            </p>
            <p className="text-lg mt-4 dark:text-gray-300">
              {t("contact.responseNote")}
            </p>
          </div>
        </div>
      </div>

      {/* Contact Methods */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {contactMethods.map((method, idx) => {
            const Icon = method.icon;
            return (
              <Card
                key={idx}
                className="hover:border-amber-500 transition-colors"
              >
                <CardContent className="p-8">
                  <div className="w-14 h-14 bg-amber-100 flex items-center justify-center mb-6 rounded-lg dark:bg-amber-900/30">
                    <Icon className="w-7 h-7 text-amber-600" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-black dark:text-white">
                    {method.title}
                  </h3>
                  <p className="text-lg font-semibold text-amber-600 mb-2">
                    {method.detail}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-gray-300">
                    {method.description}
                  </p>
                  {method.address && (
                    <p className="text-sm text-neutral-600 dark:text-gray-300 mt-1">
                      {method.address}
                    </p>
                  )}
                  {method.country && (
                    <p className="text-sm text-neutral-600 dark:text-gray-300 mt-1">
                      {method.country}
                    </p>
                  )}
                  {method.time && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-neutral-600 dark:text-gray-300">
                      <Clock className="w-4 h-4" />
                      <span>{method.time}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Service Area Banner */}
        <Card className="mb-16 border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-500/30">
          <CardContent className="p-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                <MapPin className="w-7 h-7 text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-1 text-black dark:text-white">
                  {t("contact.serviceArea")}
                </h3>
                <p className="text-lg font-semibold text-amber-600">
                  {t("contact.serviceAreaTitle")}
                </p>
                <p className="text-sm text-neutral-700 dark:text-gray-300 mt-1">
                  {t("contact.serviceAreaDesc")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Form Section */}
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                <MessageSquare className="w-6 h-6 text-amber-600" />
              </div>
              <h2 className="text-3xl font-bold text-black dark:text-white">
                {t("contact.formTitle")}
              </h2>
            </div>
            <p className="text-lg leading-relaxed mb-4 dark:text-gray-300">
              {t("contact.formDesc")}
            </p>
            <p className="text-sm text-neutral-600 dark:text-gray-300">
              {t("contact.formResponseTime")}
            </p>

            {/* Need Help Faster Section */}
            <Card className="mt-8 border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-500/30">
              <CardContent className="p-6">
                <div className="flex items-start gap-3 mb-4">
                  <HelpCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-lg font-bold mb-2 text-black dark:text-white">
                      {t("contact.helpFaster")}
                    </h3>
                    <p className="text-sm text-neutral-700 dark:text-gray-300 mb-4">
                      {t("contact.helpFasterDesc")}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 ml-9">
                  {faqTopics.map((topic, idx) => {
                    const Icon = topic.icon;
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span className="text-sm text-neutral-700 dark:text-gray-300">
                          {topic.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Form */}
          <Card>
            <CardContent className="p-8">
              <form className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("contact.nameLabel")}</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your full name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t("contact.emailLabel")}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">{t("contact.phoneLabel")}</Label>
                  <Input id="phone" type="tel" placeholder="+91 XXXXXXXXXX" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orderId">{t("contact.orderIdLabel")}</Label>
                  <Input
                    id="orderId"
                    type="text"
                    placeholder="e.g., RB-12345"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">{t("contact.subjectLabel")}</Label>
                  <Input
                    id="subject"
                    type="text"
                    placeholder="Brief subject of your inquiry"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">{t("contact.messageLabel")}</Label>
                  <Textarea
                    id="message"
                    placeholder={t("contact.messagePlaceholder")}
                    className="min-h-[150px]"
                    required
                  />
                </div>

                <Button type="submit" className="w-full">
                  {t("contact.sendMessage")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Banner */}
      <div className="relative overflow-hidden bg-neutral-100 dark:bg-black/10 border-t dark:border-neutral-700">
        <div className="relative max-w-7xl mx-auto px-6 py-12 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-black dark:text-white">
            {t("contact.thankYou")}
          </h2>
          <p className="text-lg text-neutral-700 dark:text-gray-300 max-w-2xl mx-auto">
            {t("contact.thankYouDesc")}
          </p>
        </div>
      </div>
    </div>
  );
}
