import { useRef, useState } from "react";
import {
  BookOpen,
  Copy,
  Download,
  FileUp,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  PRODUCT_MD_FORMAT_DOC,
  PRODUCT_MD_TEMPLATE,
  normalizeProductForValidation,
  parseProductDocument,
  validateProduct,
} from "@/utils/product-import";

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Full-product import dialog for the Create/Edit product pages.
 *
 * Accepts a documented product markdown document (docs/PRODUCT_MD_FORMAT.md,
 * designed to be AI-generatable) or a JSON payload, validates it against the
 * shared product Zod schema, previews the result, then applies it to the
 * form via onApply({formValues, specifications, features, tags, keywords,
 * images, videos, thumbnail}).
 */
export default function ProductImportDialog({ onApply, trigger }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null); // {normalized, error, source}
  const [parsing, setParsing] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const fileRef = useRef(null);

  const readAndLoad = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setPreview(null);
    };
    reader.onerror = () => toast.error("Could not read the file");
    reader.readAsText(file);
  };

  const runValidation = (raw) => {
    const doc = parseProductDocument(raw); // throws with readable message
    const normalized = normalizeProductForValidation({
      id: doc.raw.id,
      title: doc.raw.title,
      price: doc.raw.price,
      originalPrice: doc.raw.originalPrice ?? doc.raw.price,
      thumbnail: doc.raw.thumbnail ?? doc.raw.thumbnailUrl ?? "",
      description: (doc.raw.description ?? "").trim(),
      detailedDescription: doc.raw.detailedDescription ?? "",
      category: doc.raw.category,
      stock: doc.raw.stock,
      brand: doc.raw.brand,
      tax: doc.raw.tax,
      weight: doc.raw.weight,
      rating: doc.raw.rating,
      reviewCount: doc.raw.reviewCount,
      isActive: doc.raw.isActive !== false,
      currency: doc.raw.currency,
      warranty: doc.raw.warranty ?? "",
      returnPolicy: doc.raw.returnPolicy ?? "",
      shippingDetails: doc.raw.shippingDetails ?? "",
      sku: doc.raw.sku,
      width: doc.raw.width ?? doc.raw.dimensions?.width,
      height: doc.raw.height ?? doc.raw.dimensions?.height,
      depth: doc.raw.depth ?? doc.raw.dimensions?.depth,
      specifications: doc.raw.specifications ?? [],
      features: doc.raw.features ?? [],
      tags: doc.raw.tags ?? [],
      keywords: doc.raw.keywords ?? [],
      images: doc.raw.images ?? [],
      videos: doc.raw.videos ?? [],
    });
    const verdict = validateProduct(normalized);
    return { ...verdict, normalized, source: doc.source };
  };

  const validateNow = () => {
    setParsing(true);
    try {
      const result = runValidation(text);
      setPreview(result);
    } catch (e) {
      setPreview({ error: e.message ?? "Could not parse the document" });
    } finally {
      setParsing(false);
    }
  };

  const apply = () => {
    if (!preview?.ok || !preview.normalized) return;
    const { normalized } = preview;
    try {
      onApply({
        formValues: {
          id: normalized.id,
          title: normalized.title,
          price: normalized.price,
          originalPrice: normalized.originalPrice,
          description: normalized.description,
          category: normalized.category,
          stock: normalized.stock,
          brand: normalized.brand,
          tax: normalized.tax,
          detailedDescription: normalized.detailedDescription ?? "",
          rating: normalized.rating,
          reviewCount: normalized.reviewCount,
          width: normalized.dimensions?.width ?? 0,
          height: normalized.dimensions?.height ?? 0,
          depth: normalized.dimensions?.depth ?? 0,
          weight: normalized.weight,
          isActive: normalized.isActive,
          currency: normalized.currency,
          warranty: normalized.warranty ?? "",
          returnPolicy: normalized.returnPolicy ?? "",
          shippingDetails: normalized.shippingDetails ?? "",
          sku: normalized.sku,
        },
        specifications: normalized.specifications,
        features: normalized.features,
        tags: normalized.tags,
        keywords: normalized.keywords,
        images: normalized.images,
        videos: normalized.videos,
        thumbnail: normalized.thumbnail,
      });
      toast.success("Product document applied — review and save");
      setOpen(false);
      setText("");
      setPreview(null);
      setFileName("");
    } catch (e) {
      toast.error(e.message ?? "Apply failed");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDocsOpen(false); }}>
        <DialogTrigger asChild>
          {trigger ?? (
            <Button type="button" variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import product
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[92dvh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Import full product document</DialogTitle>
            <DialogDescription>
              Paste or upload a product in the documented .md format (built for
              AI generation) or as JSON. Nothing is written until validation
              passes and you apply it.
            </DialogDescription>
          </DialogHeader>

          {/* Docs dialog nested here so the format is available in-product */}
          <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[88dvh] flex flex-col">
              <DialogHeader className="shrink-0">
                <DialogTitle>Product document format</DialogTitle>
                <DialogDescription>
                  Give this document to your AI generator, or follow it by
                  hand. (docs/PRODUCT_MD_FORMAT.md)
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-1 min-h-0 max-w-full rounded-md border">
                <pre className="text-xs leading-relaxed p-4 whitespace-pre-wrap break-words font-mono">
                  {PRODUCT_MD_FORMAT_DOC}
                </pre>
              </ScrollArea>
              <DialogFooter className="shrink-0 flex-col-reverse sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => download("PRODUCT_MD_FORMAT.md", PRODUCT_MD_FORMAT_DOC, "text/markdown")}
                  className="w-full sm:w-auto"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Save doc
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(PRODUCT_MD_FORMAT_DOC).then(
                      () => toast.success("Format documentation copied"),
                      () => toast.error("Copy failed"),
                    );
                  }}
                  className="w-full sm:w-auto"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy doc
                </Button>
                <Button type="button" onClick={() => setDocsOpen(false)} className="w-full sm:w-auto">
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex flex-wrap items-center gap-2 py-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setDocsOpen(true)}>
              <BookOpen className="mr-2 h-3.5 w-3.5" />
              Format documentation
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => download("product-template.md", PRODUCT_MD_TEMPLATE, "text/markdown")}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Template .md
            </Button>
          </div>

          <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                readAndLoad(e.dataTransfer.files?.[0]);
              }}
              className="rounded-xl border-2 border-dashed p-3 text-center text-xs text-muted-foreground"
            >
              Drop a .md / .json file here, or{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => fileRef.current?.click()}
              >
                browse…
              </button>
              {fileName && <span className="ml-1 text-foreground">({fileName})</span>}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.json,.txt,text/markdown,text/plain,application/json"
              className="hidden"
              onChange={(e) => {
                readAndLoad(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="space-y-1.5">
              <Label>Document</Label>
              <Textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPreview(null);
                }}
                rows={10}
                className="font-mono text-xs"
                placeholder={"---\nid: …\ntitle: …\n---\n\n## Description\n…"}
              />
            </div>

            {preview && (
              <div
                className={`rounded-lg border p-3 text-sm space-y-2 ${
                  preview.ok
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-destructive/40 bg-destructive/5"
                }`}
                aria-live="polite"
              >
                {preview.ok ? (
                  <>
                    <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="h-4 w-4" />
                      Valid {preview.source.toUpperCase()} document — ready to apply
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{preview.normalized.title}</Badge>
                      <Badge variant="outline">{preview.normalized.category}</Badge>
                      <Badge variant="outline">₹{preview.normalized.price}</Badge>
                      <Badge variant="outline">{preview.normalized.specifications.length} specs</Badge>
                      <Badge variant="outline">{preview.normalized.features.length} features</Badge>
                      <Badge variant="outline">{preview.normalized.tags.length} tags</Badge>
                      <Badge variant="outline">
                        {preview.normalized.images.length + (preview.normalized.thumbnail ? 1 : 0)} images
                      </Badge>
                      <Badge variant="outline">
                        {preview.normalized.videos.length} videos
                      </Badge>
                    </div>
                  </>
                ) : (
                  <p className="flex items-start gap-2 text-destructive">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="font-medium">Validation failed.</span>{" "}
                      {preview.error}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={parsing || !text.trim()}
              onClick={validateNow}
              className="w-full sm:w-auto"
            >
              {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Validate
            </Button>
            <Button
              type="button"
              disabled={!preview?.ok}
              onClick={apply}
              className="w-full sm:w-auto"
            >
              <FileUp className="mr-2 h-4 w-4" />
              Apply to form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
