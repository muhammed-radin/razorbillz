import { useState } from "react";
import { Lock, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { commentsApi, interactionsApi } from "@/services/shop";
import { openAuthenticationModal } from "@/utils/signin-modal-required";
import { ReviewRatingStars } from "./review-rating-stars";

export function ReviewRatingReviewForm({
  storeData,
  productId,
  onSubmitted,
  canWrite = true,
  isGuest = false,
}) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!canWrite) {
      openAuthenticationModal();
      return;
    }

    if (!reviewText.trim()) {
      toast.error(
        t("product.reviewContentRequired", {
          defaultValue: "Please write your review before submitting.",
        }),
      );
      return;
    }

    if (rating < 1) {
      toast.error(
        t("product.ratingRequired", {
          defaultValue: "Please choose a rating.",
        }),
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (!productId) {
        // No product context — showcase mode
        await new Promise((resolve) => setTimeout(resolve, 800));
      } else {
        await commentsApi.create(productId, reviewText.trim(), rating);
        if (rating > 0) {
          await interactionsApi.rate(productId, rating).catch(() => {});
        }
        toast.success(
          t("product.reviewSubmitted", {
            defaultValue: "Review submitted!",
          }),
        );
        onSubmitted?.();
      }
      setRating(0);
      setReviewText("");
    } catch {
      toast.error(
        t("product.reviewSubmitFailed", {
          defaultValue: "Could not submit your review. Please sign in again.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canWrite) {
    return (
      <div className="lg:sticky lg:top-8 lg:h-fit">
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted">
              <Lock className="size-5 text-muted-foreground" />
            </div>
            <CardTitle>
              {t("product.signInToReviewTitle", {
                defaultValue: "Sign in to write a review",
              })}
            </CardTitle>
            <CardDescription>
              {isGuest
                ? t("product.guestReviewNotice", {
                    defaultValue:
                      "You're browsing as a guest. Sign in to share your experience with this product.",
                  })
                : t("product.signInToReviewDesc", {
                    defaultValue:
                      "Create an account or sign in to rate and review this product.",
                  })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              className="h-9 w-full cursor-pointer"
              onClick={() => openAuthenticationModal()}
            >
              {t("product.signIn", { defaultValue: "Sign in" })}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="lg:sticky lg:top-8 lg:h-fit">
      <Card>
        <CardHeader>
          <CardTitle id="review-form-heading">{storeData.formTitle}</CardTitle>
          <CardDescription>{storeData.formDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label>{t("product.yourRating", { defaultValue: "Your rating" })}</Label>
              <ReviewRatingStars
                value={rating}
                onChange={setRating}
                size="size-6"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="review">{storeData.reviewLabel}</Label>
              <Textarea
                id="review"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder={storeData.reviewPlaceholder}
                required
                aria-required="true"
                className="min-h-28 resize-y"
              />
            </div>

            <Button
              type="submit"
              className="h-9 w-full cursor-pointer gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? storeData.submittingButtonText
                : storeData.submitButtonText}
              {!isSubmitting && <Send className="size-4" />}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ReviewRatingReviewForm;
