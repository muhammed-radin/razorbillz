import { useRef, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

/**
 * Generic "Import" control for the Specifications / Features cards.
 *
 * Accepts a markdown table / CSV / bullets file (.md, .csv, .txt, .json for
 * plain string arrays) or pasted text, parses it and hands the parsed rows
 * to `onImport(items, mode)` where mode is "replace" | "append".
 */
export default function ArrayImportDialog({ kind = "specifications", onImport }) {
  const isSpecs = kind === "specifications";
  const fileRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState("replace");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  const hint = isSpecs
    ? "Markdown table (| Label | Value |), CSV (Label,Value) or 'Label: Value' lines."
    : "Markdown bullets (- item), CSV (one per line) or plain lines.";

  const readAndOpen = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setOpen(true);
    };
    reader.onerror = () => toast.error("Could not read the file");
    reader.readAsText(file);
  };

  const parse = () => {
    setBusy(true);
    try {
      let content = text.trim();
      if (!content) throw new Error("Nothing to import");
      // A JSON file may hold a raw string[] (features) or [{label,value}[]]
      if (
        (fileName.endsWith(".json") || content.startsWith("[") || content.startsWith("{")) &&
        (content.startsWith("[") || content.startsWith("{"))
      ) {
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error("Invalid JSON");
        }
        const items = isSpecs
          ? (Array.isArray(parsed) ? parsed : parsed?.specifications ?? [])
              .map((s) =>
                typeof s === "string"
                  ? { label: s, value: "" }
                  : { label: String(s?.label ?? ""), value: String(s?.value ?? "") },
              )
              .filter((s) => s.label)
          : (Array.isArray(parsed) ? parsed : parsed?.features ?? []).map((f) => String(f));
        if (!items.length) throw new Error("No entries found in the JSON");
        onImport(items, mode);
        toast.success(`Imported ${items.length} ${isSpecs ? "specification(s)" : "feature(s)"}`);
        setOpen(false);
        setText("");
        return;
      }
      // Dynamically import to keep this component light — both parsers live
      // in the same util module as the full-document importer.
      import("@/utils/product-import").then(({ parseSpecifications, parseFeatures }) => {
        const items = isSpecs ? parseSpecifications(content) : parseFeatures(content);
        if (!items.length) throw new Error("Could not parse any entries — check the format hint");
        onImport(items, mode);
        toast.success(`Imported ${items.length} ${isSpecs ? "specification(s)" : "feature(s)"}`);
        setOpen(false);
        setText("");
        setFileName("");
      });
    } catch (e) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
            <FileText className="mr-2 h-4 w-4" />
            From .md / .csv / .json file…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setFileName("");
              setText("");
              setOpen(true);
            }}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Paste text…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileRef}
        type="file"
        accept=".md,.csv,.txt,.json,text/markdown,text/csv,text/plain,application/json"
        className="hidden"
        onChange={(e) => {
          readAndOpen(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Import {isSpecs ? "Specifications" : "Features"}
            </DialogTitle>
            <DialogDescription>{hint}</DialogDescription>
          </DialogHeader>
          {fileName && (
            <p className="text-xs text-muted-foreground">File: {fileName}</p>
          )}
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={9}
                className="font-mono text-xs"
                placeholder={
                  isSpecs
                    ? "| Label | Value |\n| --- | --- |\n| Battery | 2000 mAh |"
                    : "- 20 hours of playback\n- IPX5 water resistance"
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>When importing</Label>
              <div className="flex gap-2">
                {[
                  { v: "replace", l: "Replace existing" },
                  { v: "append", l: "Append" },
                ].map((o) => (
                  <Button
                    key={o.v}
                    type="button"
                    size="sm"
                    variant={mode === o.v ? "default" : "outline"}
                    onClick={() => setMode(o.v)}
                  >
                    {o.l}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="button" onClick={parse} disabled={busy} className="w-full sm:w-auto">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
