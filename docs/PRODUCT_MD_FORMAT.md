# Razorbillz Product Document Format (for AI generators)

This is the canonical format for importing a full product into Razorbillz from a
single text document. Feed it to the **Import product** dialog on the Create New
Product / Edit Product admin pages. Supported files: `.md` / `.txt` (this
format) and `.json` (same shape, raw JSON object).

Rules an AI generator MUST follow:

1. The document starts with a **YAML frontmatter block** (`---` fenced) with one
   `key: value` line per scalar field. Flat scalars only — no nesting.
2. Every field below the frontmatter lives under a `## <Section>` heading.
   Unknown headings are ignored; missing sections are treated as empty.
3. Lists use markdown bullets (`- item`). Tables use the markdown pipe table
   with exactly two columns: `| Label | Value |`.
4. Numbers are plain digits (no currency symbols). Booleans are `true`/`false`.
   `category` must match an existing category **id**.
5. URLs must be absolute (`https://...`). The product is not published from the
   import alone — an admin reviews and presses Create/Save.
6. Media is referenced by URL only. Never inline base64/binary data. Images and
   videos are **not** transcoded during import; link to files that are already
   hosted (Cloudinary, your CDN, …).

--- START OF EXAMPLE PRODUCT DOCUMENT ---

---

id: seed-uno-board title: Seed Uno R3 Board category: microcontrollers brand:
Seed Studio sku: UNO-R3-001 price: 1499 originalPrice: 1799 stock: 25 tax: 18
currency: INR isActive: true rating: 4.5 reviewCount: 128 warranty: 1 year
manufacturer warranty returnPolicy: 7 day hassle-free return shippingDetails:
Dispatched in 2-3 business days via tracked courier width: 10 height: 2 depth: 6
weight: 250 thumbnail:
https://res.cloudinary.com/drv6qpv56/image/upload/samples/seed-uno.jpg

---

## Description

Compact ATmega328P development board for makers, classrooms and rapid
prototyping.

## Detailed Description

The Seed Uno R3 is a microcontroller board based on the ATmega328P. It has 14
digital input/output pins, 6 analog inputs, a 16 MHz ceramic resonator, USB
connection, power jack and a reset button. Plug it in over USB, flash a sketch
from the Arduino IDE and your project is live in minutes.

## Specifications

| Label             | Value      |
| ----------------- | ---------- |
| Microcontroller   | ATmega328P |
| Operating Voltage | 5V         |
| Clock Speed       | 16 MHz     |
| Digital I/O Pins  | 14         |
| Analog Input Pins | 6          |

## Features

- Genuine ATmega328P with pre-flashed bootloader
- 14 digital I/O pins and 6 analog inputs
- USB Type-B programming port
- Works with the Arduino IDE out of the box
- Shield-compatible R3 footprint

## Tags

arduino, uno, microcontroller, development board, robotics

## Keywords

uno r3 board, atmega328p board, arduino compatible, starter electronics

## Images

- https://res.cloudinary.com/drv6qpv56/image/upload/samples/seed-uno-1.jpg
- https://res.cloudinary.com/drv6qpv56/image/upload/samples/seed-uno-2.jpg

## Videos

- https://res.cloudinary.com/drv6qpv56/video/upload/samples/seed-uno-demo.webm
- https://res.cloudinary.com/drv6qpv56/video/upload/samples/seed-uno-blink.webm
  |
  https://res.cloudinary.com/drv6qpv56/video/upload/so_0/samples/seed-uno-blink.jpg

--- END OF EXAMPLE PRODUCT DOCUMENT ---

## Field reference (frontmatter)

| Key                                       | Type    | Required | Notes                                                            |
| ----------------------------------------- | ------- | -------- | ---------------------------------------------------------------- |
| id                                        | string  | yes      | ≥8 chars, unique, kebab-case (`mega-screwdriver-kit`)            |
| title                                     | string  | yes      | ≥6 chars                                                         |
| category                                  | string  | yes      | existing category id                                             |
| brand                                     | string  | yes      |                                                                  |
| sku                                       | string  | yes      | ≥2 chars, unique                                                 |
| price                                     | number  | yes      | > 0, in INR (no symbols)                                         |
| originalPrice                             | number  | yes      | > 0 (use price if unaffected)                                    |
| stock                                     | number  | yes      | ≥ 0                                                              |
| tax                                       | number  | no       | default 0                                                        |
| currency                                  | string  | no       | default `INR`                                                    |
| isActive                                  | boolean | no       | default `true`                                                   |
| rating                                    | number  | no       | 0–5                                                              |
| reviewCount                               | number  | no       |                                                                  |
| thumbnail                                 | string  | yes      | absolute image URL                                               |
| description                               | string  | —        | from `## Description` (≥10 chars)                                |
| detailedDescription                       | string  | —        | from `## Detailed Description` (10–3500 chars, markdown allowed) |
| width/height/depth                        | number  | no       | centimetres                                                      |
| weight                                    | number  | no       | grams                                                            |
| warranty / returnPolicy / shippingDetails | string  | no       |                                                                  |

## Sections under `##` headings

| Heading                   | Contents                                            | Rules                     |
| ------------------------- | --------------------------------------------------- | ------------------------- |
| `## Description`          | short paragraph                                     | ≥10 chars                 |
| `## Detailed Description` | long markdown text                                  | 10–3500 chars             |
| `## Specifications`       | 2-column pipe table                                 | label+value each ≥2 chars |
| `## Features`             | bullet list                                         | ≥2 bullets, each ≥2 chars |
| `## Tags`                 | bullets or one comma line                           | ≥3 tags                   |
| `## Keywords`             | bullets or one comma line                           | optional                  |
| `## Images`               | bullets, one URL each                               | ≥1 image                  |
| `## Videos`               | bullets, one URL each; optional `URL \| poster-URL` | optional, any number      |

## Validation summary

`id`, `title`, `category`, `brand`, `sku`, `price`, `originalPrice`, `stock`,
`thumbnail`, `description`, plus **3+ tags**, **2+ features** and **1+ image**
are validated (same Zod schema as manual creation). Videos are validated per
item when present (non-empty URL and optional numeric metadata) and are
otherwise optional. The import preview shows every failing field before anything
is written — a document only applies when validation passes.

## Videos (for AI generators)

Videos are optional and are always **referenced by URL**:

- In Markdown, put one absolute URL per bullet under `## Videos`. Add an
  optional poster image after a pipe: `- <video-url> | <poster-url>`.
- In JSON, `videos` is an array. Each entry may be a plain URL string or an
  object with the keys below. Only `url` is required; omitted metadata does not
  invalidate the document. When no poster is given, the admin UI derives one for
  Cloudinary URLs (`/video/upload/so_0/…jpg`).

| Key            | Type   | Required | Notes                                   |
| -------------- | ------ | -------- | --------------------------------------- |
| url            | string | yes      | absolute video URL (`.webm`, `.mp4`, …) |
| poster         | string | no       | absolute image URL for the thumbnail    |
| duration       | number | no       | seconds                                 |
| width / height | number | no       | pixels                                  |
| size           | number | no       | bytes of the hosted file                |

Do **not** invent upload URLs or link to files that do not exist. If you cannot
produce a real hosted video URL, omit `## Videos` / `videos` entirely.

## JSON alternative

The same payload as raw JSON (frontmatter keys + section names as arrays of
strings / `{label, value}` objects) is accepted in a `.json` file. JSON also
accepts `videos` as strings or objects (see above), and `specifications` as
`{label, value}` objects.

```json
{
  "id": "seed-uno-board",
  "title": "Seed Uno R3 Board",
  "category": "microcontrollers",
  "brand": "Seed Studio",
  "sku": "UNO-R3-001",
  "price": 1499,
  "originalPrice": 1799,
  "stock": 25,
  "tax": 18,
  "currency": "INR",
  "isActive": true,
  "rating": 4.5,
  "reviewCount": 128,
  "warranty": "1 year manufacturer warranty",
  "returnPolicy": "7 day hassle-free return",
  "shippingDetails": "Dispatched in 2-3 business days via tracked courier",
  "width": 10,
  "height": 2,
  "depth": 6,
  "weight": 250,
  "thumbnail": "https://res.cloudinary.com/drv6qpv56/image/upload/samples/seed-uno.jpg",
  "description": "Compact ATmega328P development board for makers, classrooms and rapid prototyping.",
  "detailedDescription": "The Seed Uno R3 is a microcontroller board based on the ATmega328P.",
  "specifications": [{ "label": "Microcontroller", "value": "ATmega328P" }],
  "features": [
    "Genuine ATmega328P with pre-flashed bootloader",
    "14 digital I/O pins"
  ],
  "tags": [
    "arduino",
    "uno",
    "microcontroller",
    "development board",
    "robotics"
  ],
  "keywords": ["uno r3 board", "atmega328p board"],
  "images": [
    "https://res.cloudinary.com/drv6qpv56/image/upload/samples/seed-uno-1.jpg"
  ],
  "videos": [
    {
      "url": "https://res.cloudinary.com/drv6qpv56/video/upload/samples/seed-uno-demo.webm",
      "poster": "https://res.cloudinary.com/drv6qpv56/video/upload/so_0/samples/seed-uno-demo.jpg",
      "duration": 12,
      "width": 1280,
      "height": 720,
      "size": 1048576
    }
  ]
}
```

## Specifications / Features only (partial import)

The Specifications and Features cards accept standalone snippets:

Markdown table (Specifications):

```
| Label | Value |
| --- | --- |
| Battery Life | 20 hours |
```

CSV (Specifications — first row may be a header):

```
Label,Value
Battery Life,20 hours
Capacity,2000 mAh
```

Markdown bullet list (Features):

```
- 20 hours of playback
- IPX5 water resistance
```

CSV (Features — one item per line):

```
20 hours of playback
IPX5 water resistance
```
