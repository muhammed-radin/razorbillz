import React from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";

import { LoaderScreen } from "@/components/LoaderScreen";
import { RouteErrorScreen } from "./ErrorBoundary";

const lazyRoute = (importer) => ({
  lazy: async () => ({ Component: (await importer()).default }),
});

const router = createHashRouter([
  {
    ...lazyRoute(() => import("./SessionLayout")),
    errorElement: <RouteErrorScreen />,
    children: [
      {
        path: "/",
        ...lazyRoute(() => import("../App")),
        errorElement: <RouteErrorScreen />,
        children: [
          { index: true, ...lazyRoute(() => import("../pages/home/page")) },
          { path: "search", ...lazyRoute(() => import("@/pages/search/page")) },
          {
            path: "product/:id",
            ...lazyRoute(() => import("@/pages/product/page")),
          },
          { path: "cart", ...lazyRoute(() => import("@/pages/cart/page")) },
          {
            path: "checkout",
            ...lazyRoute(() => import("@/pages/checkout/page")),
          },
          {
            path: "support",
            ...lazyRoute(() => import("@/pages/support/page")),
          },
          { path: "login", ...lazyRoute(() => import("@/pages/login/page")) },
          { path: "signup", ...lazyRoute(() => import("@/pages/signup/page")) },
          {
            path: "reset-password",
            ...lazyRoute(() => import("@/pages/reset-password/page")),
          },
          {
            path: "forgot-password",
            ...lazyRoute(() => import("@/pages/reset-password/page")),
          },
          {
            path: "payment-success",
            ...lazyRoute(() => import("@/pages/payment-success/page")),
          },
          {
            path: "payment/success",
            ...lazyRoute(() => import("@/pages/payment-success/page")),
          },
          {
            path: "order-status",
            ...lazyRoute(() => import("@/pages/order-status/page")),
          },
          {
            path: "order/status",
            ...lazyRoute(() => import("@/pages/order-status/page")),
          },
          {
            path: "privacy",
            ...lazyRoute(() => import("@/pages/privacy/page")),
          },
          { path: "404", ...lazyRoute(() => import("@/pages/notfound/page")) },
          {
            path: "redirect",
            ...lazyRoute(() => import("@/pages/redirect/gprovider")),
          },
          {
            path: "order",
            ...lazyRoute(() => import("@/pages/orderhistory/Orderhistory")),
          },
          {
            path: "wishlist",
            ...lazyRoute(() => import("@/pages/wishlist/Wishlist")),
          },
          {
            path: "settings",
            ...lazyRoute(() => import("@/pages/settings/page")),
          },
          {
            path: "addressbook",
            ...lazyRoute(() => import("@/pages/addressbook/page")),
          },
          { path: "about", ...lazyRoute(() => import("@/pages/aboutUs/page")) },
          {
            path: "terms",
            ...lazyRoute(
              () => import("@/pages/TermsAndConditions/TermsAndConditions"),
            ),
          },
          {
            path: "contact",
            ...lazyRoute(() => import("@/pages/contactus/page")),
          },
          {
            path: "shipping",
            ...lazyRoute(() => import("@/pages/shippingInfo/page")),
          },
          { path: "return", ...lazyRoute(() => import("@/pages/return/page")) },
          {
            path: "categories",
            ...lazyRoute(() => import("@/pages/categories/categories.page")),
          },
          { path: "*", ...lazyRoute(() => import("@/pages/notfound/page")) },
        ],
      },
      {
        path: "auth",
        ...lazyRoute(() => import("@/pages/Admin/auth/page.index")),
        errorElement: <RouteErrorScreen />,
        children: [
          {
            path: "admin",
            ...lazyRoute(() => import("@/pages/Admin/admin.app")),
            children: [
              {
                index: true,
                ...lazyRoute(() => import("@/pages/Admin/dashboard/page")),
              },
              {
                path: "dashboard",
                ...lazyRoute(() => import("@/pages/Admin/dashboard/page")),
              },
              {
                path: "products",
                ...lazyRoute(() => import("@/pages/Admin/products/page")),
              },
              {
                path: "products/new",
                ...lazyRoute(
                  () => import("@/pages/Admin/products/pages/new/page"),
                ),
              },
              {
                path: "products/:id/edit",
                ...lazyRoute(
                  () => import("@/pages/Admin/products/pages/edit/[id]"),
                ),
              },
              {
                path: "orders",
                ...lazyRoute(() => import("@/pages/Admin/orders")),
              },
              {
                path: "customers",
                ...lazyRoute(() => import("@/pages/Admin/customers")),
              },
              {
                path: "categories",
                ...lazyRoute(() => import("@/pages/Admin/categories")),
              },
              {
                path: "analytics",
                ...lazyRoute(() => import("@/pages/Admin/analytics")),
              },
              {
                path: "payments",
                ...lazyRoute(() => import("@/pages/Admin/payments")),
              },
              {
                path: "support",
                ...lazyRoute(() => import("@/pages/Admin/support")),
              },
              {
                path: "settings",
                ...lazyRoute(() => import("@/pages/Admin/settings/page")),
              },
            ],
          },
        ],
      },
    ],
  },
]);

export default function Router() {
  return <RouterProvider router={router} fallbackElement={<LoaderScreen />} />;
}
