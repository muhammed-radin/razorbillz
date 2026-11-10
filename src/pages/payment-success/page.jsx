import React, { useState } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  CreditCard,
  ShoppingBag,
  ArrowRight,
  Mail,
  Calendar,
  PackageCheck,
  Loader2,
  Banknote,
} from "lucide-react";
import { useOrderStore } from "@/stores/shop";
import { paymentsApi } from "@/services/shop";
import { loadRazorpayCheckout, openRazorpayCheckout } from "@/utils/razorpay";
import { toast } from "sonner";

export default function PaymentSuccessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const type = params.get("type") ?? "prepaid";
  const orderId = params.get("id");

  const detail = useOrderStore((s) => s.detail);
  const fetchDetail = useOrderStore((s) => s.fetchDetail);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [fetchError, setFetchError] = useState(null);
  const [retrying, setRetrying] = useState(false);

  useStrictEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    fetchDetail(orderId)
      .catch((err) =>
        setFetchError(
          err?.response?.data?.error ?? "Could not load order details.",
        ),
      )
      .finally(() => setLoading(false));
  }, [orderId, fetchDetail]);

  const retryPayment = async () => {
    if (!orderId) return;
    setRetrying(true);
    try {
      const init = await paymentsApi.createRazorpay(orderId);
      if (init?.stub) {
        toast.error("Razorpay test keys not configured (stub).");
        setRetrying(false);
        return;
      }
      await loadRazorpayCheckout();
      openRazorpayCheckout({
        keyId: init.keyId ?? import.meta.env.VITE_RAZORPAY_KEY_ID,
        razorpayOrderId: init.razorpayOrderId,
        amountInr: init.amount ?? detail?.totalAmount,
        orderId,
        onSuccess: async (resp) => {
          try {
            await paymentsApi.verifyRazorpay({
              orderId,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            toast.success("Payment verified.");
            fetchDetail(orderId).catch(() => {});
          } catch {
            toast.error("Verification failed.");
          } finally {
            setRetrying(false);
          }
        },
        onDismiss: async (gatewayError) => {
          try {
            await paymentsApi.reportFailed(orderId, {
              cancelled: !gatewayError,
              reason: gatewayError?.description,
            });
          } catch { /* intentional no-op */ }
          toast.info("Payment window closed. Order saved — retry anytime.");
          setRetrying(false);
        },
      });
    } catch {
      toast.error("Could not start payment retry.");
      setRetrying(false);
    }
  };

  const isCod = type === "cod" || detail?.payment?.method === "cod";
  const paid = detail?.payment?.status === "paid";
  const failed = detail?.payment?.status === "failed";

  return (
    <div className="min-h-screen bg-background py-12 px-4 flex items-center justify-center">
      <Helmet>
        {/* Single expression: react-helmet-async renders nothing for a <title>
         * assembled from multiple JSX children. */}
        <title>{`${t("paymentSuccess.title")} - ${t("store.name")}`}</title>
      </Helmet>

      <div className="max-w-xl w-full">
        <Card className="border-border shadow-lg">
          <CardHeader className="text-center pb-2">
            <div
              className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                failed
                  ? "bg-red-100 dark:bg-red-900/30 text-red-600"
                  : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
              }`}
            >
              {failed ? (
                <XCircle className="w-10 h-10" />
              ) : (
                <CheckCircle2 className="w-10 h-10" />
              )}
            </div>
            <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">
              {loading
                ? "Loading order…"
                : failed
                  ? "Payment failed"
                  : isCod
                    ? "Order placed — pay on delivery"
                    : t("paymentSuccess.title")}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base mt-2 max-w-md mx-auto">
              {isCod && !failed
                ? "Your COD order is confirmed. Keep cash ready when the courier arrives."
                : t("paymentSuccess.subtitle")}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : fetchError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {fetchError}
              </div>
            ) : !orderId && !detail ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                No order reference in the URL. Place an order from{" "}
                <Link to="/checkout" className="text-primary underline">
                  checkout
                </Link>{" "}
                to see a real confirmation here.
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/40 p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("paymentSuccess.orderId")}
                  </span>
                  <span className="text-sm font-semibold font-mono">
                    {detail?.id ?? orderId}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("paymentSuccess.paymentStatus")}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      paid
                        ? "bg-green-500/10 text-green-600 border-green-500/30"
                        : isCod
                          ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                          : failed
                            ? "bg-red-500/10 text-red-600 border-red-500/30"
                            : "bg-muted text-muted-foreground"
                    }
                  >
                    {isCod
                      ? `COD · ${detail?.payment?.codStatus ?? "pending_collection"}`
                      : (detail?.payment?.status ?? "pending")}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("paymentSuccess.paymentMethod")}
                  </span>
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    {isCod ? (
                      <Banknote className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                    )}
                    {isCod
                      ? "Cash on Delivery"
                      : `Razorpay${detail?.payment?.razorpayPaymentId ? ` · ${detail.payment.razorpayPaymentId.slice(0, 14)}…` : ""}`}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("paymentSuccess.date")}
                  </span>
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    {detail?.createdAt
                      ? new Date(detail.createdAt).toLocaleDateString()
                      : new Date().toLocaleDateString()}
                  </span>
                </div>

                {detail?.payment?.razorpayPaymentId && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {t("paymentSuccess.transactionId")}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {detail.payment.razorpayPaymentId}
                    </span>
                  </div>
                )}

                <Separator className="my-2" />

                <div className="flex items-center justify-between pt-1">
                  <span className="text-base font-semibold">
                    {t("paymentSuccess.amountPaid")}
                  </span>
                  <span className="text-lg font-bold text-primary">
                    ₹{Number(detail?.totalAmount ?? 0).toFixed(2)}
                  </span>
                </div>

                {failed && orderId && (
                  <Button
                    className="w-full mt-2"
                    disabled={retrying}
                    onClick={retryPayment}
                  >
                    {retrying ? "Opening Razorpay…" : "Retry payment"}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            )}

            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-primary/5 border border-primary/10 text-xs sm:text-sm text-muted-foreground">
              <Mail className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{t("paymentSuccess.confirmationEmail")}</span>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              className="w-full sm:w-1/2 gap-2"
              onClick={() =>
                navigate(orderId ? `/order-status?id=${orderId}` : "/order")
              }
            >
              <PackageCheck className="w-4 h-4" />
              {t("paymentSuccess.viewOrder")}
            </Button>
            <Button variant="outline" className="w-full sm:w-1/2 gap-2" asChild>
              <Link to="/">
                <ShoppingBag className="w-4 h-4" />
                {t("paymentSuccess.continueShopping")}
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
