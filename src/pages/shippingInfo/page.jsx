import { Package, Clock, Truck, MapPin, IndianRupee, Search, Shield, AlertCircle, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useStoreInfo } from '@/utils/store';

export default function RazorbillzShipping() {
  const { t } = useTranslation();
  const store = useStoreInfo();

  const processingSteps = [
    t('shipping.step1'),
    t('shipping.step2'),
    t('shipping.step3'),
    t('shipping.step4')
  ];

  const deliveryFactors = [
    t('shipping.factor1'),
    t('shipping.factor2'),
    t('shipping.factor3')
  ];

  const trackingFeatures = [
    t('shipping.trackingPoint1'),
    t('shipping.trackingPoint2')
  ];

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-black/10 dark:text-gray-100">
      {/* Hero Section */}
      <div className="relative overflow-hidden border-b dark:border-neutral-700">
        <div className="absolute inset-0"></div>
        
        <div className="relative max-w-7xl mx-auto px-6 py-20">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 dark:text-white">
              {t('shipping.title')}
            </h1>
            <p className="text-xl max-w-3xl mx-auto leading-relaxed dark:text-gray-300">
              {t('shipping.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Shipping Coverage */}
        <Card className="mb-12 border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-500/30">
          <CardContent className="p-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                <Package className="w-7 h-7 text-amber-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-1 text-black dark:text-white">
                  {t('shipping.coverageTitle')}
                </h2>
                <p className="text-lg text-amber-600 font-semibold">
                  {t('shipping.coverageDesc')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Order Processing Time */}
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-2xl font-bold text-black dark:text-white">
                  {t('shipping.dispatchTitle')}
                </h2>
              </div>
              <ul className="space-y-3">
                {processingSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                      <span className="text-amber-600 text-xs font-bold">✓</span>
                    </div>
                    <span className="text-neutral-700 dark:text-gray-300">{step}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Shipping Charges */}
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                  <IndianRupee className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-2xl font-bold text-black dark:text-white">
                  {t('shipping.chargesTitle')}
                </h2>
              </div>
              <h3 className="font-semibold text-lg mb-4 text-black dark:text-white">
                {t('shipping.feeStructure')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-neutral-300 dark:border-neutral-600">
                      <th className="text-left py-3 px-2 text-sm font-semibold text-black dark:text-white">{t('shipping.thPaymentType')}</th>
                      <th className="text-left py-3 px-2 text-sm font-semibold text-black dark:text-white">{t('shipping.thOrderValue')}</th>
                      <th className="text-left py-3 px-2 text-sm font-semibold text-black dark:text-white">{t('shipping.thShippingFee')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <td className="py-3 px-2 text-sm text-neutral-700 dark:text-gray-300">{t('shipping.prepaid')}</td>
                      <td className="py-3 px-2 text-sm text-neutral-700 dark:text-gray-300">{t('shipping.above500')}</td>
                      <td className="py-3 px-2 text-sm font-semibold text-green-600">{t('shipping.free')}</td>
                    </tr>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <td className="py-3 px-2 text-sm text-neutral-700 dark:text-gray-300">{t('shipping.prepaid')}</td>
                      <td className="py-3 px-2 text-sm text-neutral-700 dark:text-gray-300">{t('shipping.below500')}</td>
                      <td className="py-3 px-2 text-sm font-semibold text-amber-600">₹50</td>
                    </tr>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <td className="py-3 px-2 text-sm text-neutral-700 dark:text-gray-300">{t('shipping.cod')}</td>
                      <td className="py-3 px-2 text-sm text-neutral-700 dark:text-gray-300">{t('shipping.above500')}</td>
                      <td className="py-3 px-2 text-sm font-semibold text-amber-600">₹30</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-2 text-sm text-neutral-700 dark:text-gray-300">{t('shipping.cod')}</td>
                      <td className="py-3 px-2 text-sm text-neutral-700 dark:text-gray-300">{t('shipping.below500')}</td>
                      <td className="py-3 px-2 text-sm font-semibold text-amber-600">₹80</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-neutral-600 dark:text-gray-400 mt-4">
                {t('shipping.delayNotice')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Estimated Delivery Time */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
              <Truck className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="text-3xl font-bold text-black dark:text-white">
              {t('shipping.estimatedTitle')}
            </h2>
          </div>
          
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="font-bold text-2xl mb-2 text-black dark:text-white">
                  {t('shipping.standardDelivery')}
                </h3>
                <p className="text-3xl text-amber-600 font-bold mb-4">
                  {t('shipping.deliveryDays')}
                </p>
                <p className="text-neutral-600 dark:text-gray-400">
                  {t('shipping.deliveryLocations')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-4 text-black dark:text-white">
                {t('shipping.factorsTitle')}
              </h3>
              <ul className="space-y-3">
                {deliveryFactors.map((factor, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                      <span className="text-amber-600 text-xs font-bold">✓</span>
                    </div>
                    <span className="text-neutral-700 dark:text-gray-300">{factor}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-neutral-300 dark:border-neutral-600">
            <CardContent className="p-4">
              <p className="text-sm text-neutral-600 dark:text-gray-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  {t('shipping.delayNotice')}
                </span>
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Address & Delivery Responsibility */}
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                  <MapPin className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-2xl font-bold text-black dark:text-white">
                  {t('shipping.addressRespTitle')}
                </h2>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                    <span className="text-amber-600 text-xs font-bold">✓</span>
                  </div>
                  <span className="text-neutral-700 dark:text-gray-300">
                    {t('shipping.addressPoint1')}
                  </span>
                </li>
              </ul>
              <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg dark:bg-orange-900/10 dark:border-orange-500/30">
                <p className="text-sm font-semibold text-neutral-800 dark:text-gray-200 mb-2">
                  {t('shipping.notRespTitle')}
                </p>
                <ul className="space-y-2 text-sm text-neutral-700 dark:text-gray-300">
                  <li className="flex items-center gap-2">
                    <span className="text-orange-600">•</span>
                    {t('shipping.notResp1')}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-orange-600">•</span>
                    {t('shipping.notResp2')}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-orange-600">•</span>
                    {t('shipping.notResp3')}
                  </li>
                </ul>
                <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 mt-3">
                  {t('shipping.reshippingFee')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Partial / Split Shipments */}
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                  <Package className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-2xl font-bold text-black dark:text-white">
                  {t('shipping.splitShipTitle')}
                </h2>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                    <span className="text-amber-600 text-xs font-bold">✓</span>
                  </div>
                  <span className="text-neutral-700 dark:text-gray-300">
                    {t('shipping.splitPoint1')}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                    <span className="text-amber-600 text-xs font-bold">✓</span>
                  </div>
                  <span className="text-neutral-700 dark:text-gray-300">
                    {t('shipping.splitPoint2')}
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Order Tracking */}
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                  <Search className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-2xl font-bold text-black dark:text-white">
                  {t('shipping.trackingTitle')}
                </h2>
              </div>
              <p className="text-neutral-700 dark:text-gray-300 mb-4">
                {t('shipping.trackingDesc')}
              </p>
              <ul className="space-y-3">
                {trackingFeatures.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5 dark:bg-amber-900/30">
                      <span className="text-amber-600 text-xs font-bold">✓</span>
                    </div>
                    <span className="text-neutral-700 dark:text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-neutral-600 dark:text-gray-400 mt-4">
                {t('shipping.trackingAdvice')}
              </p>
            </CardContent>
          </Card>

          {/* Packaging & Safety */}
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-lg dark:bg-amber-900/30">
                  <Shield className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-2xl font-bold text-black dark:text-white">
                  {t('shipping.safetyTitle')}
                </h2>
              </div>
              <p className="text-neutral-700 dark:text-gray-300">
                {t('shipping.safetyDesc')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Undelivered / RTO Shipments */}
        <Card className="mb-12 border-orange-200 bg-orange-50 dark:bg-orange-900/10 dark:border-orange-500/30">
          <CardContent className="p-8">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-bold mb-3 text-black dark:text-white">
                  {t('shipping.rtoTitle')}
                </h3>
                <p className="text-neutral-700 dark:text-gray-300 mb-3">
                  {t('shipping.rtoDesc')}
                </p>
                <ul className="space-y-2 mb-4 text-neutral-700 dark:text-gray-300">
                  <li className="flex items-center gap-2">
                    <span className="text-orange-600">•</span>
                    {t('shipping.notResp2')}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-orange-600">•</span>
                    {t('shipping.notResp1')}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-orange-600">•</span>
                    COD refusal
                  </li>
                </ul>
                <div className="bg-white dark:bg-black/20 p-4 rounded-lg border border-orange-300 dark:border-orange-600">
                  <p className="font-semibold text-neutral-800 dark:text-gray-200 mb-2">Then:</p>
                  <ul className="space-y-2 text-neutral-700 dark:text-gray-300">
                    <li className="flex items-start gap-2">
                      <span className="text-orange-600 font-bold">→</span>
                      {t('shipping.rtoThen1')}
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-600 font-bold">→</span>
                      {t('shipping.rtoThen2')}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Questions Section */}
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-500/30">
          <CardContent className="p-8 text-center">
            <h3 className="text-2xl font-bold mb-4 text-black dark:text-white">
              {t('shipping.questionsTitle')}
            </h3>
            <p className="text-neutral-700 dark:text-gray-300 mb-6">
              {t('shipping.questionsDesc')}
            </p>
            <div className="flex items-center justify-center gap-2 mb-6">
              <Mail className="w-5 h-5 text-amber-600" />
              <a href={`mailto:${store.emailSupport}`} className="text-lg font-semibold text-amber-600 hover:text-amber-700">
                {store.emailSupport}
              </a>
            </div>
            <p className="text-neutral-700 dark:text-gray-300">
              {t('shipping.happyToAssist')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}