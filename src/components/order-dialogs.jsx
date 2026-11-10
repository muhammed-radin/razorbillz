import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, TriangleAlert, PackageX, Undo2 } from "lucide-react";

import { CANCEL_REASONS, RETURN_REASONS } from "@/utils/orderReasons";

function useReasonForm(open) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setDetail("");
      setError(null);
    }
  }, [open ]);
  const valid = useMemo(() => {
    if (!reason) return "Select a reason to continue.";
    if (reason === "Other" && detail.trim().length < 10) {
      return "Please explain in at least 10 characters.";
    }
    return null;
  }, [reason, detail]);
  return { reason, setReason, detail, setDetail, error, setError, valid };
}

function OrderLine({ order }) {
  if (!order) return null;
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold">{order.id}</span>
        <Badge variant="outline">{order.status ?? "pending"}</Badge>
      </div>
      <p className="mt-1 text-muted-foreground">
        {(order.products ?? []).length} item(s) · ₹
        {Number(order.totalAmount ?? 0).toFixed(2)}
        {order.products?.[0]?.title ? ` · ${order.products[0].title}` : ""}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Applies to the entire order — partial cancellation is not supported.
      </p>
    </div>
  );
}

function ReasonOptions({ reasons, reason, setReason, prefix }) {
  return (
    <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
      {reasons.map((r) => (
        <div
          key={r}
          className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition hover:border-primary/40"
          onClick={() => setReason(r)}
        >
          <RadioGroupItem value={r} id={`${prefix}-${r}`} />
          <Label htmlFor={`${prefix}-${r}`} className="flex-1 cursor-pointer">
            {r}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

export function CancelOrderDialog({ order, open, onClose, onConfirm, busy }) {
  const { reason, setReason, detail, setDetail, error, setError, valid } =
    useReasonForm(open);

  const submit = async () => {
    if (valid) {
      setError(valid);
      return;
    }
    setError(null);
    await onConfirm({ reason, detail: detail.trim() || null });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="h-5 w-5 text-destructive" />
            Cancel order?
          </DialogTitle>
          <DialogDescription>
            Cancellation applies to the whole order and requests admin review.
            Prepaid amounts are refunded only through the verified refund flow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <OrderLine order={order} />
          <div>
            <p className="mb-2 text-sm font-medium">Why are you cancelling?</p>
            <ReasonOptions
              reasons={CANCEL_REASONS}
              reason={reason}
              setReason={setReason}
              prefix="cancel"
            />
          </div>
          {reason === "Other" && (
            <div className="space-y-2">
              <Label htmlFor="cancel-detail">Explain briefly</Label>
              <Textarea
                id="cancel-detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Tell us what went wrong…"
                rows={3}
                maxLength={1000}
              />
            </div>
          )}
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <TriangleAlert className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
        </div>
        <Separator />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep order
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={busy || Boolean(valid)}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReturnRequestDialog({ order, open, onClose, onConfirm, busy }) {
  const { reason, setReason, detail, setDetail, error, setError, valid } =
    useReasonForm(open);

  const submit = async () => {
    if (valid) {
      setError(valid);
      return;
    }
    setError(null);
    await onConfirm({ reason, detail: detail.trim() || null });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-primary" />
            Request a return
          </DialogTitle>
          <DialogDescription>
            Returns are accepted within 7 days of delivery and need
            admin approval. Approval does not auto-refund — refunds follow the
            verified refund flow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <OrderLine order={order} />
          <div>
            <p className="mb-2 text-sm font-medium">
              What&apos;s wrong with the order?
            </p>
            <ReasonOptions
              reasons={RETURN_REASONS}
              reason={reason}
              setReason={setReason}
              prefix="return"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="return-detail">
              Additional details {reason === "Other" ? "(required)" : "(optional)"}
            </Label>
            <Textarea
              id="return-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Describe the issue, quantity affected…"
              rows={3}
              maxLength={1000}
            />
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <TriangleAlert className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
        </div>
        <Separator />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button onClick={submit} disabled={busy || Boolean(valid)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit return request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default { CancelOrderDialog, ReturnRequestDialog };
