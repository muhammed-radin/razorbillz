// Razorpay Checkout.js loader + helpers (frontend only).
// Never expose secrets here — only the public Key ID (VITE_RAZORPAY_KEY_ID).
import { storeConfig } from "@shared/store.config";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loadPromise = null;

export function loadRazorpayCheckout() {
  if (typeof window !== "undefined" && window.Razorpay) {
    return Promise.resolve(true);
  }
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () =>
        reject(new Error("Failed to load Razorpay Checkout.js"));
      document.body.appendChild(script);
    });
  }
  return loadPromise;
}

export function openRazorpayCheckout({
  keyId,
  razorpayOrderId,
  amountInr,
  orderId,
  prefill = {},
  onSuccess,
  onDismiss,
}) {
  if (!window.Razorpay) {
    throw new Error("Razorpay Checkout.js not loaded");
  }
  const rzp = new window.Razorpay({
    key: keyId,
    order_id: razorpayOrderId,
    amount: Math.round(Number(amountInr) * 100),
    currency: storeConfig.site.currency,
    name: storeConfig.brand.shortName,
    description: `Order ${orderId}`,
    image: storeConfig.assets.ogImage,
    prefill,
    theme: { color: storeConfig.assets.themeColor },
    handler: (resp) => onSuccess?.(resp),
    modal: {
      ondismiss: () => onDismiss?.(),
    },
  });
  rzp.on("payment.failed", (resp) => onDismiss?.(resp?.error));
  rzp.open();
  return rzp;
}
