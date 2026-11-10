import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { useNavigate, Link } from "react-router-dom";
import { StoreMeta } from "@/components/store-meta";
import { useStoreInfo } from "@/utils/store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ShoppingCart,
  MapPin,
  CreditCard,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Home,
  Briefcase,
  Building2,
  Phone,
  BadgeCheck,
  AlertTriangle,
  Smartphone,
  Banknote,
  ShieldCheck,
  Truck,
  RotateCcw,
  Lock,
  Receipt,
  Percent,
  Package,
  Loader2,
  CircleAlert,
  MapPinned,
  Plus,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import {
  useCartStore,
  useAddressStore,
  useOrderStore,
} from "@/stores/shop";
import { paymentsApi, shipmentsApi } from "@/services/shop";
import { loadRazorpayCheckout, openRazorpayCheckout } from "@/utils/razorpay";
import {
  validateAddressFields,
  lookupPincode,
} from "@/utils/addressValidation";

const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const STEPS = [
  { id: "cart", label: "Cart", icon: ShoppingCart, href: "/cart" },
  { id: "address", label: "Address", icon: MapPin },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "done", label: "Done", icon: CheckCircle2 },
];

function addressTypeIcon(type) {
  if (type === "home") return Home;
  if (type === "work") return Briefcase;
  return Building2;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const store = useStoreInfo();
  const items = useCartStore((s) => s.items);
  const cartLoading = useCartStore((s) => s.loading);
  const fetchCart = useCartStore((s) => s.fetch);
  const clearCart = useCartStore((s) => s.clear);
  const addresses = useAddressStore((s) => s.addresses);
  const addressesLoading = useAddressStore((s) => s.loading);
  const fetchAddresses = useAddressStore((s) => s.fetch);
  const createOrder = useOrderStore((s) => s.create);

  const [selectedAddress, setSelectedAddress] = useState(null);
  const [method, setMethod] = useState("razorpay");
  const [payConfig, setPayConfig] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [placedOrder, setPlacedOrder] = useState(null);
  const [serviceability, setServiceability] = useState(null);
  const [checkingService, setCheckingService] = useState(false);
  const [pinVerified, setPinVerified] = useState(null);
  const [recheckingConfig, setRecheckingConfig] = useState(false);

  const refreshConfig = useCallback(async () => {
    setRecheckingConfig(true);
    try {
      const cfg = await paymentsApi.config();
      setPayConfig(cfg);
      if (cfg?.razorpayConfigured) {
        toast.success("Online payments are now available.");
      } else {
        toast.info("Server still reports online payments as unavailable.");
      }
    } catch {
      toast.error("Could not reach the server. Is the backend running?");
    } finally {
      setRecheckingConfig(false);
    }
  }, []);

  useStrictEffect(() => {
    fetchCart().catch(() => {});
    fetchAddresses().catch(() => {});
    refreshConfig().catch(() => setPayConfig(null));
  }, [fetchCart, fetchAddresses, refreshConfig]);

  useEffect(() => {
    if (addresses?.length && !selectedAddress) {
      setSelectedAddress(
        addresses.find((a) => a.isDefault) ?? addresses[0],
      );
    }
  }, [addresses, selectedAddress]);

  const estimate = useMemo(() => {
    const subtotal = (items ?? []).reduce(
      (t, p) => t + Number(p.price ?? 0) * Number(p.quantity ?? 1),
      0,
    );
    const shipping = subtotal >= 500 || subtotal === 0 ? 0 : 50;
    const tax = Number(((subtotal * 18) / 100).toFixed(2));
    const codFee = method === "cod" ? Number(payConfig?.codFee ?? 30) : 0;
    return {
      subtotal: Number(subtotal.toFixed(2)),
      shipping,
      tax,
      codFee,
      total: Number((subtotal + tax + shipping + codFee).toFixed(2)),
    };
  }, [items, method, payConfig]);

  const codLimits = useMemo(
    () => ({
      min: Number(payConfig?.codMinOrderValue ?? 450),
      max: Number(payConfig?.codMaxOrderValue ?? 3000),
    }),
    [payConfig],
  );

  const razorpayAvailable = payConfig?.razorpayConfigured !== false;

  /* COD eligibility is method-INDEPENDENT: always evaluated on the
   * fee-inclusive total, exactly like the server rule. (Evaluating it
   * on the selected-method total would make the option flicker and
   * could strand the user on a disabled method.) */
  const codEligible = useMemo(() => {
    if (payConfig && payConfig.codEnabled === false) {
      return { eligible: false, reason: "Cash on Delivery is disabled." };
    }
    const fee = Number(payConfig?.codFee ?? 30);
    const withFee = Number(
      (estimate.subtotal + estimate.tax + estimate.shipping + fee).toFixed(2),
    );
    if (withFee < codLimits.min) {
      return {
        eligible: false,
        reason: `COD needs a minimum order of ₹${codLimits.min} — add more items or pay online.`,
      };
    }
    if (withFee > codLimits.max) {
      return {
        eligible: false,
        reason: `COD is available up to ₹${codLimits.max} — please pay online for this order.`,
      };
    }
    return { eligible: true, reason: null };
  }, [estimate.subtotal, estimate.tax, estimate.shipping, codLimits, payConfig]);

  /* Keep the selection always on an AVAILABLE option. */
  useEffect(() => {
    if (!payConfig) return;
    if (method === "razorpay" && !razorpayAvailable && codEligible.eligible) {
      setMethod("cod");
    } else if (method === "cod" && !codEligible.eligible && razorpayAvailable) {
      setMethod("razorpay");
    }
  }, [payConfig, method, razorpayAvailable, codEligible.eligible]);

  const noMethodAvailable = !razorpayAvailable && !codEligible.eligible;

  /* Validate the selected address (format) + verify its pincode. */
  const addressIssues = useMemo(() => {
    if (!selectedAddress) return null;
    return validateAddressFields(selectedAddress);
  }, [selectedAddress]);

  useStrictEffect(() => {
    const pin = String(selectedAddress?.postalCode ?? "").trim();
    if (!pin || pin.length !== 6) {
      setPinVerified(null);
      return;
    }
    let cancelled = false;
    setPinVerified(null);
    lookupPincode(pin).then((r) => {
      if (!cancelled) setPinVerified(r.exists && !r.unverified);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedAddress?.postalCode]);

  const checkServiceability = async () => {
    if (!selectedAddress?.postalCode) {
      toast.error("Select a delivery address first");
      return;
    }
    setCheckingService(true);
    setServiceability(null);
    try {
      const resp = await shipmentsApi.serviceability({
        deliveryPincode: selectedAddress.postalCode,
      });
      setServiceability(resp);
      if (resp?.stub) {
        toast.info("Courier check unavailable in test setup (stub).");
      } else if (String(resp?.result) === "1") {
        const ok = resp?.data?.serviceable !== false;
        if (ok) toast.success("Delivery available to this pincode.");
        else toast.error("Delivery unavailable to this pincode.");
      } else {
        toast.error(resp?.message ?? "Delivery unavailable to this pincode.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error ?? "Serviceability check failed");
    } finally {
      setCheckingService(false);
    }
  };

  /* Attempt-first prepaid flow: no order exists until the backend
   * verifies payment. The cart stays intact on any failure. */
  const startRazorpayAttempt = async (address) => {
    setPaying(true);
    const idempotencyKey = newIdempotencyKey();
    let attempt;
    try {
      attempt = await paymentsApi.createRazorpay({
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        shippingAddress: address,
        billingAddress: address,
        idempotencyKey,
      });
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      if (code === "CART_MISMATCH" || err?.response?.status === 409) {
        toast.error(
          "Your cart changed. We refreshed it — please review the quantities and try again.",
        );
        fetchCart().catch(() => {});
      }
      setError(
        err?.response?.data?.error?.message ??
          err?.response?.data?.error ??
          err?.message ??
          "Payment initiation failed",
      );
      setPaying(false);
      return;
    }
    try {
      await loadRazorpayCheckout();
      openRazorpayCheckout({
        keyId: attempt.keyId ?? import.meta.env.VITE_RAZORPAY_KEY_ID,
        razorpayOrderId: attempt.razorpayOrderId,
        amountInr: attempt.amount,
        orderId: attempt.attemptId,
        prefill: {
          name: selectedAddress.name,
          contact: selectedAddress.phoneNumber,
          email: selectedAddress.email,
        },
        onSuccess: async (resp) => {
          try {
            const verified = await paymentsApi.verifyRazorpay({
              attemptId: attempt.attemptId,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            // Cart clears ONLY after the backend confirms order creation.
            // Never swallow a clear failure: retry once, then tell the user
            // the order is safe but the cart needs manual cleanup.
            try {
              await clearCart();
            } catch {
              try {
                await clearCart();
              } catch {
                setError(
                  "Payment verified and order placed, but clearing the cart failed. Please remove the items manually.",
                );
              }
            }
            toast.success("Payment verified — order placed.");
            navigate(`/payment-success?type=prepaid&id=${verified.order.id}`);
          } catch (err) {
            setError(
              err?.response?.data?.error?.message ??
                err?.response?.data?.error ??
                err?.message ??
                "Payment verification failed. No order was created; your cart is intact.",
            );
          } finally {
            setPaying(false);
          }
        },
        onDismiss: async (gatewayError) => {
          // Report only; no order exists and the cart is untouched.
          try {
            await paymentsApi.reportAttemptFailed(attempt.attemptId, {
              cancelled: !gatewayError,
              reason: gatewayError?.description ?? gatewayError?.reason,
            });
          } catch { /* intentional no-op */ }
          setError(
            gatewayError?.description ??
              "Payment window closed before completion. No order was created and your cart is unchanged.",
          );
          setPaying(false);
        },
      });
    } catch (err) {
      setError(
        err?.response?.data?.error?.message ??
          err?.response?.data?.error ??
          err?.message ??
          "Payment initiation failed",
      );
      setPaying(false);
    }
  };

  const placeOrderAndPay = async () => {
    setError(null);
    if (!items?.length) {
      setError("Your cart is empty.");
      return;
    }
    if (!selectedAddress) {
      setError("Please select a delivery address.");
      return;
    }
    if (addressIssues && !addressIssues.valid) {
      setError(
        `Delivery address needs attention: ${Object.values(addressIssues.errors)[0]} Update it in the address book.`,
      );
      return;
    }
    const address = {
      name: selectedAddress.name,
      street: selectedAddress.street,
      city: selectedAddress.city,
      state: selectedAddress.state,
      postalCode: selectedAddress.postalCode,
      country: selectedAddress.country ?? "India",
      phoneNumber: selectedAddress.phoneNumber,
      email: selectedAddress.email,
    };

    if (method === "cod") {
      if (!codEligible.eligible) {
        setError(codEligible.reason);
        return;
      }
      setPlacing(true);
      try {
        const order = await createOrder({
          products: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          shippingAddress: address,
          billingAddress: address,
          payment: { method: "cod" },
          idempotencyKey: newIdempotencyKey(),
        });
        setPlacedOrder(order);
        // Cart clears ONLY after the backend confirms the COD order.
        // Never swallow a clear failure: retry once, then tell the user
        // the order is safe but the cart needs manual cleanup.
        try {
          await clearCart();
        } catch {
          try {
            await clearCart();
          } catch {
            setError(
              "COD order placed, but clearing the cart failed. Please remove the items manually.",
            );
          }
        }
        toast.success("COD order placed.");
        navigate(`/payment-success?type=cod&id=${order.id}`);
      } catch (err) {
        const code = err?.response?.data?.code;
        if (code === "CART_MISMATCH" || err?.response?.status === 409) {
          toast.error(
            "Your cart changed. We refreshed it — please review the quantities and try again.",
          );
          fetchCart().catch(() => {});
        }
        setError(
          err?.response?.data?.error ??
            err?.message ??
            "Failed to place order",
        );
      } finally {
        setPlacing(false);
      }
      return;
    }

    // Razorpay prepaid: attempt first, order only after verification.
    if (!razorpayAvailable) {
      setError(
        "Online payment is temporarily unavailable (server not configured). Choose Cash on Delivery or try again later.",
      );
      return;
    }
    await startRazorpayAttempt(address);
  };

  const bootstrapping = cartLoading || addressesLoading;

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 to-background">
      <StoreMeta
        title="Secure Checkout — Address & Payment"
        description={`Complete your ${store.name} order securely. Choose a verified delivery address and pay via Razorpay (UPI, cards) or Cash on Delivery across Kerala, India.`}
        noIndex
      />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        {/* Brand + secure header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Logo className="h-10 w-10" />
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Lock className="h-3.5 w-3.5 text-green-600" />
            256-bit SSL secured checkout
          </Badge>
        </div>

        {/* Stepper */}
        <nav aria-label="Checkout steps" className="mb-8">
          <ol className="flex items-center gap-1 sm:gap-2">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const active = step.id === "payment";
              const done = step.id === "cart" || step.id === "address";
              const inner = (
                <span
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium sm:text-sm",
                    active && "bg-primary text-primary-foreground shadow",
                    done && "bg-green-500/10 text-green-700 dark:text-green-400",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{step.label}</span>
                </span>
              );
              return (
                <li key={step.id} className="flex items-center gap-1 sm:gap-2">
                  {step.href ? (
                    <Link to={step.href} className="transition hover:opacity-80">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                  {i < STEPS.length - 1 && (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Checkout
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Verified address, transparent pricing, secure payment.
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link to="/cart">
              <ChevronLeft className="h-4 w-4" />
              Cart
            </Link>
          </Button>
        </div>

        {bootstrapping ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              {[0, 1].map((k) => (
                <Card key={k}>
                  <CardHeader>
                    <Skeleton className="h-6 w-40" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="h-fit">
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : !items?.length ? (
          <Card className="mx-auto max-w-lg text-center">
            <CardContent className="space-y-4 py-14">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <ShoppingCart className="h-8 w-8 text-muted-foreground" />
              </span>
              <div>
                <p className="text-lg font-semibold">Your cart is empty</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add some products first — checkout unlocks with items.
                </p>
              </div>
              <Button asChild>
                <Link to="/">
                  Continue shopping
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              {/* Address step */}
              <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b bg-muted/40 pb-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <CardTitle className="text-base sm:text-lg">
                      1 · Delivery address
                    </CardTitle>
                    <CardDescription>
                      Shipmozo-verified pincodes deliver across Kerala & India
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/addressbook">
                      <Plus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">New address</span>
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3 pt-5">
                  {!addresses?.length ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-8 text-center">
                      <MapPinned className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        No saved addresses yet.
                      </p>
                      <Button size="sm" asChild>
                        <Link to="/addressbook">Add delivery address</Link>
                      </Button>
                    </div>
                  ) : (
                    <RadioGroup
                      value={selectedAddress?.id ?? ""}
                      onValueChange={(id) =>
                        setSelectedAddress(addresses.find((a) => a.id === id))
                      }
                      className="space-y-3"
                    >
                      {addresses.map((a) => {
                        const TypeIcon = addressTypeIcon(a.type);
                        const active = selectedAddress?.id === a.id;
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition sm:p-4",
                              active
                                ? "border-primary bg-primary/[0.04] shadow-sm"
                                : "hover:border-primary/40",
                            )}
                            onClick={() => setSelectedAddress(a)}
                          >
                            <RadioGroupItem
                              value={a.id}
                              id={`addr-${a.id}`}
                              className="mt-1"
                            />
                            <span
                              className={cn(
                                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                                active
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              <TypeIcon className="h-4 w-4" />
                            </span>
                            <Label
                              htmlFor={`addr-${a.id}`}
                              className="flex-1 cursor-pointer text-sm leading-relaxed"
                            >
                              <span className="flex flex-wrap items-center gap-2 font-semibold">
                                {a.name}
                                <Badge variant="secondary" className="text-[10px]">
                                  {a.type ?? "other"}
                                </Badge>
                                {a.isDefault && (
                                  <Badge className="text-[10px]">Default</Badge>
                                )}
                              </span>
                              <span className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                {a.street}, {a.city}, {a.state} — {a.postalCode}
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                                <Phone className="h-3.5 w-3.5 shrink-0" />
                                {a.phoneNumber}
                              </span>
                            </Label>
                            {active &&
                              (pinVerified ? (
                                <BadgeCheck
                                  className="h-5 w-5 shrink-0 text-green-600"
                                  aria-label="Pincode verified"
                                />
                                                          ) : (
                                <AlertTriangle
                                  className="h-5 w-5 shrink-0 text-amber-500"
                                  aria-label="Pincode unverified"
                                />
                              ))}
                          </div>
                        );
                      })}
                    </RadioGroup>
                  )}

                  {addressIssues && !addressIssues.valid && selectedAddress && (
                    <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      {Object.values(addressIssues.errors)[0]} Update it in the
                      address book before placing the order.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={checkingService || !selectedAddress}
                      onClick={checkServiceability}
                    >
                      {checkingService ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Truck className="h-3.5 w-3.5" />
                      )}
                      {checkingService
                        ? "Checking…"
                        : "Check courier availability"}
                    </Button>
                    {serviceability && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1",
                          !serviceability.stub &&
                            String(serviceability.result) === "1" &&
                            serviceability.data?.serviceable !== false &&
                            "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
                        )}
                      >
                        <Truck className="h-3 w-3" />
                        {serviceability.stub
                          ? "Courier check stubbed"
                          : serviceability.data?.serviceable === false
                            ? "Not serviceable"
                            : String(serviceability.result) === "1"
                              ? "Serviceable"
                              : (serviceability.message ?? "Not serviceable")}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Payment step */}
              <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b bg-muted/40 pb-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <div>
                    <CardTitle className="text-base sm:text-lg">
                      2 · Payment method
                    </CardTitle>
                    <CardDescription>
                      Only verified payments confirm an order
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pt-5">
                  {noMethodAvailable && (
                    <div
                      role="alert"
                      className="mb-4 flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
                    >
                      <span className="flex items-start gap-2">
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          No payment method is available right now:
                          online payment is unconfigured on the server
                          (restart the backend with RAZORPAY_KEY_ID/SECRET)
                          and this cart&apos;s total (₹{estimate.total.toFixed(2)}{" "}
                          incl. fees) is outside the COD range ₹{codLimits.min}–
                          ₹{codLimits.max}. Adjust the cart or fix the server
                          config to continue.
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-fit gap-1.5"
                        disabled={recheckingConfig}
                        onClick={refreshConfig}
                      >
                        {recheckingConfig ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        {recheckingConfig ? "Rechecking…" : "Recheck server config"}
                      </Button>
                    </div>
                  )}
                  <RadioGroup
                    value={method}
                    onValueChange={(v) => {
                      // Guard: labels/keys must never select a disabled method.
                      if (v === "razorpay" && !razorpayAvailable) return;
                      if (v === "cod" && !codEligible.eligible) return;
                      setMethod(v);
                    }}
                    className="space-y-3"
                  >
                    <div
                      role="radio"
                      aria-checked={method === "razorpay"}
                      aria-disabled={!razorpayAvailable}
                      tabIndex={razorpayAvailable ? 0 : -1}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && razorpayAvailable) {
                          e.preventDefault();
                          setMethod("razorpay");
                        }
                      }}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition sm:p-4",
                        method === "razorpay"
                          ? "border-primary bg-primary/[0.04] shadow-sm"
                          : "hover:border-primary/40",
                        !razorpayAvailable && "cursor-not-allowed opacity-60",
                      )}
                      onClick={() => razorpayAvailable && setMethod("razorpay")}
                    >
                      <RadioGroupItem
                        value="razorpay"
                        id="pay-razorpay"
                        className="mt-1"
                        disabled={!razorpayAvailable}
                      />
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Smartphone className="h-4 w-4" />
                      </span>
                      <Label
                        htmlFor="pay-razorpay"
                        className="flex-1 cursor-pointer"
                      >
                        <span className="flex flex-wrap items-center gap-2 font-semibold">
                          Razorpay — UPI / Cards / Netbanking
                          <Badge className="gap-1 bg-green-500/10 text-[10px] text-green-700 hover:bg-green-500/10 dark:text-green-400">
                            <ShieldCheck className="h-3 w-3" />
                            Secure
                          </Badge>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {razorpayAvailable ? (
                            <>
                              Pay now via Checkout.js. Test mode — no real money
                              moves. The order is created only after backend
                              signature verification.
                            </>
                          ) : (
                            <>
                              Online payment is temporarily unavailable — the
                              server is not configured. Restart the backend
                              with RAZORPAY_KEY_ID/SECRET, or choose COD.
                            </>
                          )}
                        </span>
                      </Label>
                    </div>
                    <div
                      role="radio"
                      aria-checked={method === "cod"}
                      aria-disabled={!codEligible.eligible}
                      tabIndex={codEligible.eligible ? 0 : -1}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && codEligible.eligible) {
                          e.preventDefault();
                          setMethod("cod");
                        }
                      }}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition sm:p-4",
                        method === "cod"
                          ? "border-primary bg-primary/[0.04] shadow-sm"
                          : "hover:border-primary/40",
                        !codEligible.eligible && "cursor-not-allowed opacity-60",
                      )}
                      onClick={() => codEligible.eligible && setMethod("cod")}
                    >
                      <RadioGroupItem
                        value="cod"
                        id="pay-cod"
                        className="mt-1"
                        disabled={!codEligible.eligible}
                      />
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Banknote className="h-4 w-4" />
                      </span>
                      <Label htmlFor="pay-cod" className="flex-1 cursor-pointer">
                        <span className="flex flex-wrap items-center gap-2 font-semibold">
                          Cash on Delivery
                          <Badge variant="secondary" className="text-[10px]">
                            +₹{payConfig?.codFee ?? 30} fee
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            ₹{codLimits.min}–₹{codLimits.max}
                          </Badge>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {codEligible.eligible ? (
                            <>
                              Pay in cash when the courier arrives. Marked
                              collected only after delivery — never prepaid.
                            </>
                          ) : (
                            <>{codEligible.reason}</>
                          )}
                        </span>
                      </Label>
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>
            </div>

            {/* Summary */}
            <Card className="overflow-hidden lg:sticky lg:top-4">
              <CardHeader className="border-b bg-muted/40 pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4" />
                  Order summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-5 text-sm">
                <ul className="max-h-64 space-y-3 overflow-auto pr-1">
                  {(items ?? []).map((i) => (
                    <li key={i.productId} className="flex items-center gap-3">
                      {i.thumbnail ? (
                        <img
                          src={i.thumbnail}
                          alt={i.title ?? "Product"}
                          className="h-11 w-11 shrink-0 rounded-lg border object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-muted">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {i.title ?? i.productId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Qty {i.quantity}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">
                        ₹
                        {(Number(i.price ?? 0) * Number(i.quantity ?? 1)).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Separator />
                <dl className="space-y-1.5">
                  <div className="flex justify-between">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <Receipt className="h-3.5 w-3.5" /> Subtotal
                    </dt>
                    <dd>₹{estimate.subtotal.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <Percent className="h-3.5 w-3.5" /> Tax (18% GST)
                    </dt>
                    <dd>₹{estimate.tax.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <Truck className="h-3.5 w-3.5" /> Shipping
                    </dt>
                    <dd>
                      {estimate.shipping === 0 ? (
                        <Badge
                          variant="outline"
                          className="border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
                        >
                          FREE
                        </Badge>
                      ) : (
                        `₹${estimate.shipping.toFixed(2)}`
                      )}
                    </dd>
                  </div>
                  {method === "cod" && (
                    <div className="flex justify-between">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <Banknote className="h-3.5 w-3.5" /> COD fee
                      </dt>
                      <dd>₹{estimate.codFee.toFixed(2)}</dd>
                    </div>
                  )}
                </dl>
                <Separator />
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-2xl font-bold text-primary">
                    ₹{estimate.total.toFixed(2)}
                  </span>
                </div>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Final totals are computed by the server — client prices are
                  never trusted.
                </p>
                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
                  >
                    <span className="flex items-start gap-1.5">
                      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{error}</span>
                    </span>
                    {placedOrder?.id && (
                      <div className="mt-2">
                        <Link
                          to={`/order-status?id=${placedOrder.id}`}
                          className="font-medium underline"
                        >
                          View saved order {placedOrder.id} / retry payment
                        </Link>
                      </div>
                    )}
                  </div>
                )}
                <Button
                  size="lg"
                  className="mt-2 w-full gap-2"
                  disabled={
                    placing ||
                    paying ||
                    (method === "cod" && !codEligible.eligible) ||
                    (method === "razorpay" && !razorpayAvailable)
                  }
                  onClick={placeOrderAndPay}
                  title={
                    method === "cod" && !codEligible.eligible
                      ? codEligible.reason
                      : method === "razorpay" && !razorpayAvailable
                        ? "Online payment is temporarily unavailable."
                        : undefined
                  }
                >
                  {placing || paying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : method === "cod" ? (
                    <Banknote className="h-4 w-4" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {placing
                    ? "Placing order…"
                    : paying
                      ? "Waiting for payment…"
                      : method === "cod"
                        ? `Place COD order · ₹${estimate.total.toFixed(2)}`
                        : `Pay ₹${estimate.total.toFixed(2)} securely`}
                </Button>
                <div className="grid grid-cols-3 gap-2 pt-2 text-center text-[11px] text-muted-foreground">
                  <span className="flex flex-col items-center gap-1 rounded-lg bg-muted/60 p-2">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    Verified payments
                  </span>
                  <span className="flex flex-col items-center gap-1 rounded-lg bg-muted/60 p-2">
                    <Truck className="h-4 w-4 text-blue-600" />
                    Shipmozo shipping
                  </span>
                  <span className="flex flex-col items-center gap-1 rounded-lg bg-muted/60 p-2">
                    <RotateCcw className="h-4 w-4 text-amber-600" />
                    Easy returns
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
