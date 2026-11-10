import {
  CheckCircle,
  CreditCard,
  Download,
  MapPin,
  Package,
  Printer,
  Truck,
} from "lucide-react";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const DEFAULT_ORDER = {
  orderNumber: "ORD-2024-78432",
  orderDate: "December 14, 2024",
  status: "confirmed",
  email: "customer@example.com",
  items: [
    {
      id: "1",
      name: "Minimalist Beige Sneakers",
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/clothes/Minimalist-Beige-Sneakers-2.png",
      price: 120.0,
      quantity: 1,
      details: [
        { label: "Size", value: "42" },
        { label: "Color", value: "Beige" },
      ],
    },
    {
      id: "2",
      name: "Embroidered Blue Top",
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/clothes/Woman-in-Embroidered-Blue-Top-2.png",
      price: 140.0,
      quantity: 2,
      details: [
        { label: "Size", value: "M" },
        { label: "Color", value: "Blue" },
      ],
    },
    {
      id: "3",
      name: "Classic Fedora Hat",
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/accessories/Classic-Fedora-Hat-2.png",
      price: 84.0,
      quantity: 1,
      details: [{ label: "Size", value: "One Size" }],
    },
  ],
  subtotal: 484.0,
  shipping: 12.0,
  tax: 38.72,
  discount: 50.0,
  total: 484.72,
  shippingAddress: {
    name: "Alex Johnson",
    street: "1234 Maple Street, Apt 5B",
    city: "San Francisco",
    state: "CA",
    zipCode: "94102",
    country: "United States",
  },
  shippingMethod: "Express Shipping",
  estimatedDelivery: "December 18-20, 2024",
  paymentMethod: {
    type: "card",
    lastFour: "4242",
    cardBrand: "Visa",
  },
};

const OrderSummary1 = ({
  order = DEFAULT_ORDER,
  className
}) => {
  const formatPrice = (price) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(Number(price ?? 0));
  };

  /* Defensive normalization: missing/unknown shapes (loading states,
   * partial API responses, new statuses) must never crash the page. */
  const safe = {
    ...(order ?? {}),
    items: Array.isArray(order?.items) ? order.items : [],
    shippingAddress: order?.shippingAddress ?? {},
    paymentMethod: order?.paymentMethod ?? {},
  };

  const getStatusBadge = (status) => {
    const variants = {
      pending: {
        label: "Pending Payment",
        className: "bg-gray-500/10 text-gray-600 hover:bg-gray-500/10",
      },
      confirmed: {
        label: "Order Confirmed",
        className: "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10",
      },
      processing: {
        label: "Processing",
        className: "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10",
      },
      shipped: {
        label: "Shipped",
        className: "bg-blue-500/10 text-blue-600 hover:bg-blue-500/10",
      },
      delivered: {
        label: "Delivered",
        className: "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10",
      },
      cancelled: {
        label: "Cancelled",
        className: "bg-red-500/10 text-red-600 hover:bg-red-500/10",
      },
      return_requested: {
        label: "Return Requested",
        className: "bg-orange-500/10 text-orange-600 hover:bg-orange-500/10",
      },
      returned: {
        label: "Returned",
        className: "bg-purple-500/10 text-purple-600 hover:bg-purple-500/10",
      },
    };
    // Unknown/missing statuses must never crash the page.
    return (
      variants[status] ?? {
        label: status ? String(status).replace(/_/g, " ") : "Order Placed",
        className: "bg-muted text-muted-foreground hover:bg-muted",
      }
    );
  };

  const statusBadge = getStatusBadge(safe.status);

  return (
    <section className={cn("py-16 md:py-24", className)}>
      <div className="container max-w-4xl">
        {/* Success Header */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle className="size-8 text-emerald-600" />
          </div>
          <h1 className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">
            Thank you for your order!
          </h1>
          <p className="text-muted-foreground">
            A confirmation email has been sent to{" "}
            <span className="font-medium text-foreground">{safe.email}</span>
          </p>
        </div>

        {/* Order Info Bar */}
        <Card className="mb-6 shadow-none">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Order Number</p>
                <p className="font-semibold">{safe.orderNumber}</p>
              </div>
              <Separator
                orientation="vertical"
                className="hidden h-10 md:block"
              />
              <div>
                <p className="text-sm text-muted-foreground">Order Date</p>
                <p className="font-medium">{safe.orderDate}</p>
              </div>
            </div>
            <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Items & Totals */}
          <div className="space-y-6 lg:col-span-2">
            {/* Order Items */}
            <Card className="shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="size-5" />
                  Items Ordered
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {safe.items.map((item, index) => (
                  <div key={item.id}>
                    <div className="flex gap-4">
                      <div className="w-20 shrink-0">
                        <AspectRatio
                          ratio={1}
                          className="overflow-hidden rounded-lg bg-muted"
                        >
                          <img
                            src={item.image}
                            alt={item.name}
                            className="size-full object-cover"
                          />
                        </AspectRatio>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium">{item.name}</h3>
                        {item.details && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {item.details.map((d, i) => (
                              <span key={d.label}>
                                {d.value}
                                {i < item.details.length - 1 && " · "}
                              </span>
                            ))}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-muted-foreground">
                          Qty: {item.quantity}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {formatPrice(item.price * item.quantity)}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-sm text-muted-foreground">
                            {formatPrice(item.price)} each
                          </p>
                        )}
                      </div>
                    </div>
                    {index < safe.items.length - 1 && (
                      <Separator className="mt-4" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Order Totals */}
            <Card className="shadow-none">
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatPrice(safe.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>
                      {safe.shipping === 0
                        ? "Free"
                        : formatPrice(safe.shipping)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{formatPrice(safe.tax)}</span>
                  </div>
                  {safe.discount && safe.discount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Discount</span>
                      <span>-{formatPrice(safe.discount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total Paid</span>
                    <span>{formatPrice(safe.total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Shipping & Payment */}
          <div className="space-y-6">
            {/* Shipping Information */}
            <Card className="shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="size-5" />
                  Shipping Address
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-medium">{safe.shippingAddress.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {safe.shippingAddress.street}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {safe.shippingAddress.city}, {safe.shippingAddress.state}{" "}
                    {safe.shippingAddress.zipCode}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {safe.shippingAddress.country}
                  </p>
                </div>
                <Separator />
                <div className="flex items-start gap-3">
                  <Truck className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {safe.shippingMethod}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Estimated delivery: {safe.estimatedDelivery}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Information */}
            <Card className="shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="size-5" />
                  Payment Method
                </CardTitle>
              </CardHeader>
              <CardContent>
                {safe.paymentMethod.type === "card" && (
                  <div className="flex items-center gap-3">
                    <img
                      src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/visa-icon.svg"
                      alt="Visa"
                      className="size-8"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {safe.paymentMethod.cardBrand} ending in{" "}
                        {safe.paymentMethod.lastFour}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Payment completed
                      </p>
                    </div>
                  </div>
                )}
                {safe.paymentMethod.type === "paypal" && (
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-md bg-muted">
                      <img
                        src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/paypal-icon.svg"
                        alt="PayPal"
                        className="size-5"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">PayPal</p>
                      <p className="text-sm text-muted-foreground">
                        {safe.paymentMethod.email}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card className="shadow-none">
              <CardContent className="space-y-3 p-4">
                <Button className="w-full" variant="default">
                  <Package className="mr-2 size-4" />
                  Track Order
                </Button>
                <Button className="w-full" variant="outline">
                  <Download className="mr-2 size-4" />
                  Download Receipt
                </Button>
                <Button className="w-full" variant="ghost">
                  <Printer className="mr-2 size-4" />
                  Print Order
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Continue Shopping */}
        <div className="mt-10 text-center">
          <p className="mb-4 text-muted-foreground">
            Have a question about your order?
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" asChild>
              <a href="#">Contact Support</a>
            </Button>
            <Button asChild>
              <a href="#">Continue Shopping</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export { OrderSummary1 };
