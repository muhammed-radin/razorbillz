/**
 * Product document import/parsing utilities.
 *
 * - Full-product import: markdown (YAML frontmatter + `##` sections) or JSON.
 * - Partial import: Specifications (markdown table / CSV) and Features
 *   (bullet list / CSV).
 * - The format itself is documented in docs/PRODUCT_MD_FORMAT.md; that file
 *   is imported raw so the UI dialog and the docs stay in sync.
 */
import { productSchema } from "@shared/utils/product_zod";
import formatDoc from "../../docs/PRODUCT_MD_FORMAT.md?raw";

export { formatDoc as PRODUCT_MD_FORMAT_DOC };

/* ------------------------------------------------------------------ */
/* Specs / Features snippets                                           */
/* ------------------------------------------------------------------ */

/** Split a CSV line honouring double quotes. */
function splitCsvLine(line) {  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const HEADER_RE = /^(label|name|spec|feature|key|item|title|value)$/i;

/** Parse a markdown 2-column pipe table into [{label,value}]. */
function parseMdTable(text) {
  const rows = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) return null; // not a table
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    // separator row like --- | ---
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) continue;
    if (cells.length >= 2) rows.push(cells);
  }
  if (!rows.length) return null;
  // drop header row if it looks like one
  if (HEADER_RE.test(rows[0][0])) rows.shift();
  return rows
    .map(([label, ...rest]) => ({ label, value: rest.join(" — ") }))
    .filter((r) => r.label);
}

/**
 * Parse Specifications from markdown / CSV / "Label: Value" lines.
 * Auto-detects format. Returns [{label, value}].
 */
export function parseSpecifications(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];
  // markdown table?
  if (trimmed.startsWith("|")) {
    return parseMdTable(trimmed) ?? [];
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-*+]\s+/, ""))
    .filter((l) => l && !l.startsWith("#"));
  // "Label: Value" lines (bullet stripped) — the most common AI markdown form.
  const kvRows = lines
    .map((l) => l.match(/^([^:,]{1,60}):\s+(.+)$/))
    .filter(Boolean)
    .map((m) => ({ label: m[1].trim(), value: m[2].trim() }));
  if (kvRows.length === lines.length && kvRows.length > 0) {
    return kvRows;
  }
  if (lines.length) {
    const rows = lines.map(splitCsvLine);
    let cells = rows;
    // header?
    if (HEADER_RE.test(cells[0][0]) && cells[0].length >= 2) cells = cells.slice(1);
    return cells
      .filter((c) => c[0] || c[1])
      .map((row) => ({
        label: row[0] ?? "",
        value: row.slice(1).join(" — "),
      }))
      .filter((r) => r.label && r.value);
  }
  return [];
}

/**
 * Parse Features from markdown bullets / CSV / plain lines.
 * Returns string[].
 */
export function parseFeatures(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];
  const items = [];
  for (const raw of trimmed.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    // bullets & numbered lists
    line = line.replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "");
    if (line.startsWith("#")) continue; // heading
    if (line.includes(",")) {
      // CSV-ish single column? A feature rarely contains commas — but a
      // comma-line like "a, b, c" splits naturally.
      if (line.startsWith('"') || !line.includes(":")) {
        items.push(...splitCsvLine(line).filter(Boolean));
        continue;
      }
    }
    items.push(line);
  }
  return items.filter((f) => f.trim());
}

/* ------------------------------------------------------------------ */
/* Videos                                                              */
/* ------------------------------------------------------------------ */

/** Coerce a string or partial object into the product video shape. */
function normalizeVideo(value) {
  if (typeof value === "string") {
    const url = value.trim();
    return url ? { url } : null;
  }
  if (!value || typeof value !== "object") return null;

  const url = String(value.url ?? value.src ?? "").trim();
  if (!url) return null;

  return {
    url,
    poster: String(value.poster ?? value.thumbnail ?? "").trim(),
    duration: Number(value.duration) || 0,
    width: Number(value.width) || 0,
    height: Number(value.height) || 0,
    size: Number(value.size) || 0,
  };
}

/**
 * Parse `## Videos` bullets. Each bullet is either a plain URL or
 * `URL | poster-url`; a JSON object on its own line is accepted too.
 */
function parseVideosSection(content) {
  if (Array.isArray(content)) {
    return content.map(normalizeVideo).filter(Boolean);
  }
  if (!content) return [];

  return content
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const value = line
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .trim();

      if (!value) return null;

      if (value.startsWith("{")) {
        try {
          return normalizeVideo(JSON.parse(value));
        } catch {
          return null;
        }
      }

      const [url, poster = ""] = value.split("|").map((part) => part.trim());
      return normalizeVideo({ url, poster });
    })
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Full product document                                               */
/* ------------------------------------------------------------------ */

/** Minimal flat YAML subset: `key: value` lines. */
function parseFrontmatter(block) {
  const data = {};
  for (const raw of block.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const m = raw.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (m) data[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return data;
}

function coerceScalar(v) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return "";
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return v;
}

function splitFrontmatter(text) {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---");
  if (end === -1) return {};
  return {
    fm: parseFrontmatter(text.slice(3, end)),
    body: text.slice(end + 4),
  };
}

/** Split the body into `## Section` → content blocks. */
function splitSections(body) {
  const sections = {};
  let current = null;
  for (const raw of body.split("\n")) {
    const m = raw.match(/^##\s+(.*)$/);
    if (m) {
      current = m[1].trim().toLowerCase();
      sections[current] = [];
    } else if (current) {
      sections[current].push(raw);
    }
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].join("\n").trim();
  return sections;
}

/**
 * Parse a full product document (markdown or JSON).
 * Returns { source: "md"|"json", raw } or throws with a readable message.
 */
export function parseProductDocument(text) {
  const content = String(text ?? "").trim();
  if (!content) throw new Error("The document is empty");
  if (content.startsWith("{")) {
    // JSON payload
    try {
      return { source: "json", raw: JSON.parse(content) };
    } catch (e) {
      throw new Error("Invalid JSON: " + e.message);
    }
  }
  const { fm, body } = splitFrontmatter(content);
  if (!fm || !Object.keys(fm).length) {
    throw new Error(
      "Missing YAML frontmatter. The document must start with '---' and contain key: value lines. See the format documentation.",
    );
  }
  const sections = splitSections(body ?? "");

  const scalars = {};
  for (const [k, v] of Object.entries(fm)) scalars[k] = coerceScalar(v);

  const data = {
    ...scalars,
    description: sections["description"] ?? scalars.description ?? "",
    detailedDescription:
      sections["detailed description"] ?? scalars.detailedDescription ?? "",
    specifications: sections["specifications"]
      ? parseSpecifications(sections["specifications"])
      : Array.isArray(scalars.specifications)
        ? scalars.specifications
        : [],
    features: sections["features"]
      ? parseFeatures(sections["features"])
      : Array.isArray(scalars.features)
        ? scalars.features
        : [],
    tags: parseListSection(sections["tags"] ?? scalars.tags),
    keywords: parseListSection(sections["keywords"] ?? scalars.keywords, ","),
    images: parseListSection(sections["images"] ?? scalars.images, "\nurl"),
    videos: parseVideosSection(sections["videos"] ?? scalars.videos),
  };
  return { source: "md", raw: data };
}

/** Bullets or comma separated list(s) → string[]. */
function parseListSection(content, fallbackJoin) {
  if (Array.isArray(content)) return content.map((c) => String(c));
  if (!content) return [];
  const lines = content
    .split("\n")
    .map((l) => l.trim().replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, ""))
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length === 1 && /,/.test(lines[0])) {
    return lines[0].split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (lines.length === 1 && /\shttps?:\/\//.test(lines[0])) {
    // multiple URLs on one line?
    return lines[0].split(/\s+/).filter(Boolean);
  }
  if (fallbackJoin === "," && lines.length === 1 && /\s{2,}/.test(lines[0])) {
    return lines[0].split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Normalization + validation                                          */
/* ------------------------------------------------------------------ */

/** Shape of the values submitted by the create/edit pages (pre-parse). */
export function normalizeProductForValidation(p) {
  return {
    id: String(p.id ?? "").trim(),
    title: String(p.title ?? "").trim(),
    price: Number(p.price) || 0,
    originalPrice: Number(p.originalPrice) || 0,
    thumbnail: String(p.thumbnail ?? ""),
    description: String(p.description ?? ""),
    detailedDescription: String(p.detailedDescription ?? ""),
    category: String(p.category ?? "").trim(),
    stock: Math.round(Number(p.stock) || 0),
    brand: String(p.brand ?? "").trim(),
    tax: Number(p.tax) || 0,
    weight: Number(p.weight) || 0,
    rating: Number(p.rating) || 0,
    reviewCount: Math.round(Number(p.reviewCount) || 0),
    isActive: p.isActive !== false,
    currency: String(p.currency || "INR"),
    warranty: p.warranty ?? "",
    returnPolicy: p.returnPolicy ?? "",
    shippingDetails: p.shippingDetails ?? "",
    sku: String(p.sku ?? "").trim(),
    specifications: (p.specifications ?? []).filter((s) => s.label && s.value),
    features: (p.features ?? []).filter((f) => String(f).trim() !== ""),
    tags: p.tags ?? [],
    keywords: p.keywords ?? [],
    images: (p.images ?? []).filter((i) => String(i ?? "").trim() !== ""),
    videos: (p.videos ?? []).map(normalizeVideo).filter(Boolean),
    dimensions: {
      width: Number(p.width) || 0,
      height: Number(p.height) || 0,
      depth: Number(p.depth) || 0,
    },
  };
}

/**
 * Validate a normalized product payload with the shared zod schema.
 * Returns { ok, data?, error? } where error is a single readable string.
 */
export function validateProduct(normalized) {
  const result = productSchema.safeParse(normalized);
  if (result.success) return { ok: true, data: result.data };
  const issues = JSON.parse(result.error.message);
  const summary = issues
    .slice(0, 6)
    .map((i) => `${i.path?.length ? i.path.join(".") : "value"}: ${i.message}`)
    .join("; ");
  return {
    ok: false,
    error: `${summary}${issues.length > 6 ? ` (+${issues.length - 6} more)` : ""}`,
  };
}

/** A complete, valid starting template for the format. */
export const PRODUCT_MD_TEMPLATE = `---
id: my-new-product
title: My New Product Title
category: your-category-id
brand: Acme
sku: ACME-001
price: 999
originalPrice: 1299
stock: 10
tax: 18
currency: INR
isActive: true
rating: 4.5
reviewCount: 10
warranty: 1 year warranty
returnPolicy: 7 day return
shippingDetails: Ships in 2-3 business days
width: 10
height: 5
depth: 5
weight: 500
thumbnail: https://example.com/product.jpg
---

## Description

A short, punchy description shown on product cards.

## Detailed Description

The long-form marketing copy. Markdown is supported: **bold**, lists and
tables render on the product page.

## Specifications

| Label | Value |
| --- | --- |
| Material | Aluminium |
| Length | 25 cm |

## Features

- First feature highlight
- Second feature highlight

## Tags

tag-one, tag-two, tag-three

## Keywords

search keyword one, search keyword two

## Images

- https://example.com/product-1.jpg
- https://example.com/product-2.jpg

## Videos

- https://example.com/product-demo.webm
`;
