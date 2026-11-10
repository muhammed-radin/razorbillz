/**
 * Upload trace dialog — shown while a product is being saved.
 *
 * Every image and video that still needs to leave the browser gets one Trace
 * line. Lines update live (pending → running → done/error) and expand to show
 * the current stage, progress and any error, so the admin can see exactly
 * which resource is uploading and why a save failed.
 */
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Film,
  Image as ImageIcon,
  Loader2,
  Save,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { UPLOAD_STAGE_LABEL } from "@/utils/product-upload";

function statusIcon(step) {
  if (step.status === "running") {
    return <Loader2 className="animate-spin" />;
  }
  if (step.status === "done") {
    return <CheckCircle2 className="text-emerald-600" />;
  }
  if (step.status === "error") {
    return <AlertCircle />;
  }
  return <Circle />;
}

function lineStatus(step) {
  if (step.status === "running") return "running";
  if (step.status === "error") return "error";
  if (step.status === "pending") return "pending";
  return undefined;
}

function stepTitle(step) {
  if (step.kind === "save") {
    if (step.status === "running") return "Saving product details";
    if (step.status === "done") return "Product saved";
    if (step.status === "error") return "Failed to save product";
    return "Waiting to save product";
  }

  const noun = step.kind === "video" ? "video" : "image";

  if (step.status === "running") {
    const stage = UPLOAD_STAGE_LABEL[step.stage] || "Working…";
    if (step.kind === "video") {
      return `${stage.replace(/…$/, "")} ${step.label}`;
    }
    return `Uploading ${noun} ${step.label}`;
  }
  if (step.status === "done") {
    return step.kind === "video"
      ? `Compressed and uploaded video ${step.label}`
      : `Uploaded ${noun} ${step.label}`;
  }
  if (step.status === "error") {
    return `Failed to upload ${noun} ${step.label}`;
  }
  return `Waiting to upload ${noun} ${step.label}`;
}

function stepDetail(step) {
  if (step.kind === "save") {
    if (step.status === "error") {
      return "Uploaded media is safe. Fix the error above, then save again.";
    }
    return "Stores the product together with the uploaded media.";
  }
  if (step.kind === "video" && step.status === "done") {
    return "Converted to WebM (VP8) in the browser, then uploaded.";
  }
  if (step.kind === "image" && step.status === "done") {
    return "Image uploaded to Cloudinary.";
  }
  if (step.kind === "video") {
    return "The file is compressed and converted to WebM before it leaves the browser.";
  }
  return "The image is uploaded as-is.";
}

function TraceStep({ step }) {
  const percent = Math.round(
    Math.min(1, Math.max(0, step.progress || 0)) * 100,
  );
  // Failures start expanded so the reason is visible without a click.
  const [open, setOpen] = useState(step.status === "error");

  useEffect(() => {
    if (step.status === "error") setOpen(true);
  }, [step.status]);

  return (
    <TraceCollapsible open={open} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine status={lineStatus(step)}>
          <TraceIcon>
            {step.kind === "video" ? (
              <Film />
            ) : step.kind === "save" ? (
              <Save />
            ) : (
              <ImageIcon />
            )}
          </TraceIcon>
          <TraceTitle>{stepTitle(step)}</TraceTitle>
          <TraceDescription>
            {step.status === "running" && step.kind !== "save" && percent > 0
              ? `${percent}%`
              : step.status === "done"
                ? "Done"
                : step.status === "error"
                  ? "Error"
                  : ""}
          </TraceDescription>
          <TraceIcon>{statusIcon(step)}</TraceIcon>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="space-y-2">
        <p className="text-xs">{stepDetail(step)}</p>

        {step.status === "running" && (
          <div className="space-y-1">
            <Progress value={percent} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">
              {UPLOAD_STAGE_LABEL[step.stage] || "Working…"}{" "}
              {percent > 0 ? `${percent}%` : ""}
            </p>
          </div>
        )}

        {step.size > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Original size: {(step.size / 1024 / 1024).toFixed(1)} MB
          </p>
        )}

        {step.error && (
          <p className="text-xs text-destructive">{step.error}</p>
        )}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

export default function UploadTraceDialog({
  open,
  steps = [],
  running = false,
  onClose,
  title = "Saving product resources",
  description = "Images and videos upload one at a time, then the product is saved. Keep this tab open until every step finishes.",
}) {
  const total = steps.length;
  const done = steps.filter((step) => step.status === "done").length;
  const failed = steps.filter((step) => step.status === "error").length;
  const savingNow = steps.some(
    (step) => step.kind === "save" && step.status === "running",
  );

  const aggregate = total
    ? Math.round(
        (steps.reduce((sum, step) => {
          if (step.status === "done") return sum + 1;
          if (step.status === "running")
            return sum + Math.min(1, Math.max(0, step.progress || 0));
          return sum;
        }, 0) /
          total) *
          100,
      )
    : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !running) onClose?.();
      }}
    >
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-xl"
        onEscapeKeyDown={(event) => {
          if (running) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (running) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : failed ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {done} of {total} steps completed
          </Badge>
          {failed > 0 && <Badge variant="destructive">{failed} failed</Badge>}
        </div>

        <div
          className="max-h-[45dvh] overflow-y-auto rounded-xl border p-4"
          aria-live="polite"
        >
          <Trace>
            {steps.map((step) => (
              <TraceStep key={step.id} step={step} />
            ))}
          </Trace>
        </div>

        <div className="space-y-1.5">
          <Progress value={aggregate} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {running
              ? `${savingNow ? "Saving product" : "Uploading"}… ${aggregate}%`
              : failed
                ? "Fix the failed resource, then save again."
                : "All uploads finished."}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant={failed ? "destructive" : "default"}
            disabled={running}
            onClick={() => onClose?.()}
          >
            {running ? "Uploading…" : failed ? "Close" : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
