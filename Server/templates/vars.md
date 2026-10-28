# Email Template Variables

All email templates are rendered through `sendEmail`:

```js
import sendEmail from "../utils/mailer.js";

await sendEmail({
  email: "customer@example.com",
  subject: "Your email subject",
  templateName: "template-name.ejs",
  variables: {
    // Template variables go here.
  },
});
```

Values are passed to EJS as `locals`. Optional variables can be omitted unless
otherwise stated.

## Shared variables

These variables are supported by the commerce and authentication templates:

| Variable | Type | Description |
| --- | --- | --- |
| `appName` | `string` | Product or store name. Defaults to `RazorBills` for commerce templates and `Razorbillz` for auth templates. |
| `logoUrl` | `string` | Public URL of the logo displayed before the product name. |
| `logo` | `string` | Alias for `logoUrl`. |
| `logoAlt` | `string` | Accessible image alt text. Defaults to `appName`. |
| `name` | `string` | Recipient's display name. |
| `email` | `string` | Recipient email address shown in the email footer. |
| `locale` | `string` | Locale used for currency and date formatting. Defaults to `en-IN`. |
| `actionUrl` | `string` | Primary button destination. |
| `actionLabel` | `string` | Primary button text. |
| `expiryMinutes` | `number` | Expiration duration displayed in the email. |

## Verification email

Template: `verification.ejs`

```js
{
  appName: "Razorbillz",
  logoUrl: "https://razorbills.vercel.app/logo-1.png",
  name: "John",
  verificationType: "both", // "link", "otp", or "both"
  verificationUrl: "https://razorbills.vercel.app/verify?token=abc123",
  code: "482913",
  expiryMinutes: 15
}
```

### Verification-specific variables

| Variable | Type | Description |
| --- | --- | --- |
| `verificationType` | `"link" \| "otp" \| "both"` | Controls which verification method is displayed. Defaults to `both`. |
| `verificationUrl` | `string` | Verification button and fallback URL. |
| `verifyUrl` | `string` | Alias for `verificationUrl`. |
| `code` | `string` | OTP code. |
| `verificationCode` | `string` | Alias for `code`. |

### Verification modes

```js
// Button and OTP code.
{
  verificationType: "both",
  verificationUrl: "https://example.com/verify",
  code: "482913"
}
```

```js
// Button and fallback URL only.
{
  verificationType: "link",
  verificationUrl: "https://example.com/verify"
}
```

```js
// OTP code only.
{
  verificationType: "otp",
  code: "482913"
}
```

## Authentication emails

### Reset password

Template: `reset-password.ejs`

```js
{
  appName: "Razorbillz",
  logoUrl: "https://razorbills.vercel.app/logo-1.png",
  name: "John",
  email: "john@example.com",
  actionUrl: "https://razorbills.vercel.app/reset-password?token=abc123",
  actionLabel: "Reset password",
  expiryMinutes: 15
}
```

### Sign-up attempt

Template: `signup-attempt.ejs`

```js
{
  appName: "Razorbillz",
  logoUrl: "https://razorbills.vercel.app/logo-1.png",
  name: "John",
  email: "john@example.com",
  actionUrl: "https://razorbills.vercel.app/sign-in",
  actionLabel: "Sign in"
}
```

### Authentication-specific variables

The shared authentication layout also supports these optional overrides:

| Variable | Type | Description |
| --- | --- | --- |
| `eyebrow` | `string` | Small label above the heading. |
| `title` | `string` | Main email heading. |
| `message` | `string` | Main explanatory message. |
| `detail` | `string` | Highlighted detail panel content. |
| `url` | `string` | Alias for `actionUrl`. |

## Commerce emails

The following templates use the shared `_commerce.ejs` layout:

| Template | Event |
| --- | --- |
| `order-placed.ejs` | Product ordered / order received |
| `order-confirmed.ejs` | Order confirmed |
| `order-shipped.ejs` | Order shipped |
| `order-returned.ejs` | Order returned |
| `order-completed.ejs` | Order completed |
| `order-refunded.ejs` | Order refunded |
| `cart-reminder.ejs` | Cart waiting for checkout |
| `product-suggestions.ejs` | Suggested products |
| `payment-success.ejs` | Successful payment |
| `payment-failed.ejs` | Failed payment |

### Commerce variables

| Variable | Type | Description |
| --- | --- | --- |
| `orderNumber` | `string` | Order number displayed in the order summary. |
| `orderId` | `string` | Alias for `orderNumber`. |
| `orderDate` | `Date \| string` | Order date displayed in the order summary. |
| `date` | `Date \| string` | Alias for `orderDate`. |
| `items` | `Array` | Items shown in an order or cart. |
| `currency` | `string` | ISO currency code, such as `INR` or `USD`. Defaults to `INR`. |
| `total` | `number` | Order or payment total. |
| `totalAmount` | `number` | Alias for `total`. |
| `amount` | `number` | Alias for `total`. |
| `trackingUrl` | `string` | Shipment tracking URL. |
| `products` | `Array` | Recommended products shown by `product-suggestions.ejs`. |
| `checkoutUrl` | `string` | Fallback checkout URL. |
| `orderUrl` | `string` | Fallback order details URL. |
| `shopUrl` | `string` | Fallback store URL. |

### Order item variables

Each object in `items` may contain:

| Variable | Type | Description |
| --- | --- | --- |
| `name` | `string` | Product name. |
| `title` | `string` | Alias for `name`. |
| `image` | `string` | Product image URL. |
| `imageUrl` | `string` | Alias for `image`. |
| `quantity` | `number` | Quantity purchased. Defaults to `1`. |
| `price` | `number` | Unit price, used when `total` is absent. |
| `total` | `number` | Total price for this item. |

### Suggested product variables

Each object in `products` may contain:

| Variable | Type | Description |
| --- | --- | --- |
| `name` | `string` | Product name. |
| `title` | `string` | Alias for `name`. |
| `image` | `string` | Product image URL. |
| `imageUrl` | `string` | Alias for `image`. |
| `price` | `number` | Product price. |
| `url` | `string` | Product page URL. |
| `link` | `string` | Alias for `url`. |

## Full order example

```js
await sendEmail({
  email: "john@example.com",
  subject: "Your order has shipped",
  templateName: "order-shipped.ejs",
  variables: {
    appName: "Razorbillz",
    logoUrl: "https://razorbills.vercel.app/logo-1.png",
    name: "John",
    email: "john@example.com",
    orderNumber: "RB-1001",
    orderDate: new Date(),
    items: [
      {
        name: "Classic Black T-Shirt",
        image: "https://example.com/images/t-shirt.png",
        quantity: 2,
        price: 499,
        total: 998,
      },
      {
        name: "Everyday Cap",
        imageUrl: "https://example.com/images/cap.png",
        quantity: 1,
        price: 299,
      },
    ],
    total: 1297,
    currency: "INR",
    actionUrl: "https://razorbills.vercel.app/orders/RB-1001",
    actionLabel: "View order",
    trackingUrl: "https://razorbills.vercel.app/track/RB-1001",
  },
});
```

## Cart reminder example

```js
await sendEmail({
  email: "john@example.com",
  subject: "Your cart is waiting for you",
  templateName: "cart-reminder.ejs",
  variables: {
    appName: "Razorbillz",
    logoUrl: "https://razorbills.vercel.app/logo-1.png",
    name: "John",
    items: [
      {
        name: "Wireless Headphones",
        image: "https://example.com/images/headphones.png",
        quantity: 1,
        price: 2499,
      },
    ],
    total: 2499,
    currency: "INR",
    checkoutUrl: "https://razorbills.vercel.app/checkout",
    actionLabel: "Complete checkout",
  },
});
```

## Suggested products example

```js
await sendEmail({
  email: "john@example.com",
  subject: "Products picked for you",
  templateName: "product-suggestions.ejs",
  variables: {
    appName: "Razorbillz",
    logoUrl: "https://razorbills.vercel.app/logo-1.png",
    name: "John",
    products: [
      {
        name: "Minimal Backpack",
        image: "https://example.com/images/backpack.png",
        price: 1899,
        url: "https://razorbills.vercel.app/products/minimal-backpack",
      },
      {
        title: "Daily Sneakers",
        imageUrl: "https://example.com/images/sneakers.png",
        price: 2999,
        link: "https://razorbills.vercel.app/products/daily-sneakers",
      },
    ],
    shopUrl: "https://razorbills.vercel.app/shop",
    actionLabel: "Shop now",
  },
});
```

## Payment examples

### Payment successful

```js
await sendEmail({
  email: "john@example.com",
  subject: "Payment successful for order RB-1001",
  templateName: "payment-success.ejs",
  variables: {
    appName: "Razorbillz",
    logoUrl: "https://razorbills.vercel.app/logo-1.png",
    name: "John",
    email: "john@example.com",
    orderNumber: "RB-1001",
    amount: 1297,
    currency: "INR",
    actionUrl: "https://razorbills.vercel.app/orders/RB-1001",
    actionLabel: "View order",
  },
});
```

### Payment failed

```js
await sendEmail({
  email: "john@example.com",
  subject: "Payment failed for order RB-1001",
  templateName: "payment-failed.ejs",
  variables: {
    appName: "Razorbillz",
    logoUrl: "https://razorbills.vercel.app/logo-1.png",
    name: "John",
    email: "john@example.com",
    orderNumber: "RB-1001",
    amount: 1297,
    currency: "INR",
    actionUrl: "https://razorbills.vercel.app/checkout?retry=RB-1001",
    actionLabel: "Try payment again",
  },
});
```
