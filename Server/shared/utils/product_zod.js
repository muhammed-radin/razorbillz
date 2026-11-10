import * as z from "zod";

const productSchema = z.object({
  id: z.string().min(8, "ID must be at least 8 characters long"),
  title: z.string().min(6, "Title must be at least 6 characters long"),
  price: z.number().min(1, "Price must be greater than 0"),
  originalPrice: z.number().min(1, "Original price must be greater than 0"),
  thumbnail: z.string().min(2, "Thumbnail must be at least 2 characters long"),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters long"),
  category: z.string().min(2, "Category must be at least 2 characters long"),
  stock: z.number().min(0, "Stock must be a non-negative number"),
  brand: z.string().min(2, "Brand must be at least 2 characters long"),
  tax: z.number().default(0),
  tags: z
    .array(z.string().min(2, "Tag must be at least 2 characters long"))
    .min(3, "At least three tag is required")
    .default([]),
  keywords: z
    .array(z.string().min(2, "Keyword must be at least 2 characters long"))
    .optional()
    .default([]),
  detailedDescription: z
    .string()
    .min(10, "Detailed description must be at least 10 characters long")
    .max(3500, "Detailed description must be at most 3500 characters long")
    .default(""),
  specifications: z
    .array(
      z.object({
        label: z.string().min(2, "Label must be at least 2 characters long"),
        value: z.string().min(2, "Value must be at least 2 characters long"),
      }),
    )
    .default([]),
  features: z
    .array(z.string().min(2, "Feature must be at least 2 characters long"))
    .min(2, "At least two feature is required")
    .default([]),
  images: z
    .array(z.string().min(8, "Image URL must be at least 8 characters long"))
    .min(1, "At least one image is required")
    .default([]),
  videos: z
    .array(
      z.object({
        url: z.string().min(8, "Video URL must be at least 8 characters long"),
        poster: z.string().optional().default(""),
        duration: z.number().optional().default(0),
        width: z.number().optional().default(0),
        height: z.number().optional().default(0),
        size: z.number().optional().default(0),
      }),
    )
    .optional()
    .default([]),
  rating: z.number().optional().default(0),
  reviewCount: z.number().optional().default(0),
  dimensions: z
    .object({
      width: z.number().optional().default(0),
      height: z.number().optional().default(0),
      depth: z.number().optional().default(0),
    })
    .optional(),
  weight: z.number().min(0, "Weight must be a non-negative number").default(0),
  createdAt: z.date().default(Date.now),
  updatedAt: z.date().default(Date.now),
  isActive: z.boolean().default(true),
  currency: z.string().optional().default("INR"),
  owner: z
    .object({
      id: z.string().default("admin"),
      name: z.string().default("Admin"),
    })
    .optional(),
  warranty: z.string().optional().default(null),
  returnPolicy: z.string().optional().default(null),
  shippingDetails: z.string().optional().default(null),
  relatedProducts: z.array(z.string()).optional().default([]),
  accessories: z.array(z.string()).optional().default([]),
  priceHistory: z.array(z.number()).optional().default([]),
  sku: z.string().min(2, "SKU must be at least 2 characters long").default(""),
  views: z.number().default(0),
  specialInfo: z.record(z.any()).optional().default({}),
});

export { productSchema };
