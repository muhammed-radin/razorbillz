import { useCallback, useMemo, useRef, useState } from "react";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";
import { useApiCacheStore } from "@/stores/apiCacheStore";
import { useUserSession } from "@/contexts/user-session-context";
import { openAuthenticationModal } from "@/utils/signin-modal-required";
import { alert } from "@/components/dialog-alert-provider";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  Lock,
  CheckCircle2,
  MessageCircle,
  MessageSquare,
  Calendar,
  ThumbsUp,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ReviewRatingReactionToggle } from "./review-rating-reaction-toggle";
import { ReviewRatingStars } from "./review-rating-stars";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Preloader } from "@/components/LoaderScreen";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { storeData } from "@/pages/product/review-store-data";
import { ReviewRatingReviewForm } from "./review-rating-review-form";
import { commentsApi } from "@/services/shop";
import { decrypt } from "@/utils/crypt";

const REVIEWS_PER_PAGE = 20;

const wasEdited = (comment) => {
  if (!comment.createdAt || !comment.updatedAt) return false;
  const created = new Date(comment.createdAt).getTime();
  const updated = new Date(comment.updatedAt).getTime();
  return Number.isFinite(created) && Number.isFinite(updated)
    ? updated - created > 1000
    : false;
};

const toReview = (comment, index) => ({
  id: comment._id ?? comment.id ?? `comment-${index}`,
  userId: comment.userId ?? "",
  /* Server decrypts reviewer PII on read (Tier A); decrypt() here is a
   * defensive passthrough that also opens legacy-sealed values from
   * stale caches. Avatar must be decrypted too — sealed URLs break
   * <img src> and fall back to initials. */
  userName: decrypt(comment.userName) ?? "Anonymous",
  userAvatar: decrypt(comment.userAvatar) ?? "",
  rating: comment.rating ?? 5,
  date: comment.createdAt
    ? new Date(comment.createdAt).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0],
  content: comment.content ?? "",
  likes: Number(comment.likes) || 0,
  liked: Boolean(comment.liked),
  edited: wasEdited(comment),
  comments: 0,
});

export function ReviewRatingSection({ productId }) {
  const { t } = useTranslation();
  const { data: session, isPending: sessionPending } = useUserSession();
  const viewer = session?.user ?? null;
  const viewerId = viewer?.id ?? null;
  /* Guest sessions (Better Auth anonymous users) may READ reviews.
   * Only real accounts may write/like. No session at all is denied by
   * the server and shows the sign-in state here. */
  const canRead = Boolean(viewer);
  const canWrite = Boolean(viewer && !viewer.isAnonymous);

  const [currentPage, setCurrentPage] = useState(1);
  // null = loading, [] = no comments (or 404 / error), otherwise server comments
  const [remoteReviews, setRemoteReviews] = useState(null);
  const [remoteMeta, setRemoteMeta] = useState({ totalPages: 0, count: 0 });
  const requestIdRef = useRef(0);

  const loadComments = useCallback(
    (force = false) => {
      if (!productId) {
        setRemoteReviews([]);
        setRemoteMeta({ totalPages: 0, count: 0 });
        return Promise.resolve([]);
      }
      if (sessionPending) return Promise.resolve([]);
      if (!canRead) {
        setRemoteReviews([]);
        setRemoteMeta({ totalPages: 0, count: 0 });
        return Promise.resolve([]);
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setRemoteReviews(null);

      const cacheKey = `comments:${productId}:${currentPage}:${viewerId ?? "guest"}`;
      return useApiCacheStore
        .getState()
        .fetchWithCache(
          cacheKey,
          async () => {
            const data = await commentsApi.list(productId, {
              limit: REVIEWS_PER_PAGE,
              page: currentPage,
            });
            const list = Array.isArray(data) ? data : (data.comments ?? []);
            const totalPages = Array.isArray(data)
              ? Math.max(1, Math.ceil(list.length / REVIEWS_PER_PAGE))
              : Number(data.totalPages) || 0;
            const count = Array.isArray(data)
              ? list.length
              : Number(data.count) || list.length;

            return {
              reviews: list.map(toReview),
              totalPages,
              count,
            };
          },
          { ttl: 60 * 60 * 1000, forceRefresh: force },
        )
        .then((payload) => {
          if (requestIdRef.current !== requestId) return payload?.reviews;
          const loaded = payload?.reviews ?? [];
          setRemoteReviews(loaded);
          setRemoteMeta({
            totalPages: Number(payload?.totalPages) || 0,
            count: Number(payload?.count) || 0,
          });
          /* Own reviews are sorted first by the server, so page 1 is
           * authoritative. On later pages we only ever upgrade to true. */
          if (currentPage === 1) {
            setHasOwnReview(
              Boolean(
                viewerId && loaded.some((review) => review.userId === viewerId),
              ),
            );
            setOwnReviewResolved(true);
          } else if (
            viewerId &&
            loaded.some((review) => review.userId === viewerId)
          ) {
            setHasOwnReview(true);
          }
          return loaded;
        })
        .catch(() => {
          // 404 / no session / offline -> show the empty state
          if (requestIdRef.current === requestId) {
            setRemoteReviews([]);
            setRemoteMeta({ totalPages: 0, count: 0 });
            if (currentPage === 1) {
              setHasOwnReview(false);
              setOwnReviewResolved(true);
            }
          }
          return [];
        });
    },
    [productId, currentPage, sessionPending, canRead, viewerId],
  );

  useStrictEffect(() => {
    loadComments(false);
  }, [loadComments]);

  const reviews = useMemo(() => remoteReviews ?? [], [remoteReviews]);
  const isLoading = remoteReviews === null;
  const [isLiked, setIsLiked] = useState({});
  const [likeCounts, setLikeCounts] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editRating, setEditRating] = useState(0);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [hasOwnReview, setHasOwnReview] = useState(false);
  const [ownReviewResolved, setOwnReviewResolved] = useState(false);

  const reviewLiked = (review) =>
    isLiked[review.id] ?? Boolean(review.liked);
  const reviewLikes = (review) =>
    likeCounts[review.id] ?? (Number(review.likes) || 0);
  const isOwnReview = (review) =>
    Boolean(viewerId && review.userId && review.userId === viewerId);

  const updateCachedReview = (reviewId, patch) => {
    const cacheKey = `comments:${productId}:${currentPage}:${viewerId ?? "guest"}`;
    const cached = useApiCacheStore.getState().getCache(cacheKey);
    const cachedReviews = cached?.data?.reviews;
    if (!Array.isArray(cachedReviews)) return;
    useApiCacheStore.getState().setCache(
      cacheKey,
      {
        ...cached.data,
        reviews: cachedReviews.map((item) =>
          item.id === reviewId ? { ...item, ...patch } : item,
        ),
      },
      cached.ttl,
    );
  };

  const toggleLike = async (review) => {
    if (!canWrite) {
      openAuthenticationModal();
      return;
    }

    const wasLiked = reviewLiked(review);
    const previousLikes = reviewLikes(review);
    const next = !wasLiked;

    setIsLiked((prev) => ({ ...prev, [review.id]: next }));
    setLikeCounts((prev) => ({
      ...prev,
      [review.id]: Math.max(0, previousLikes + (next ? 1 : -1)),
    }));

    try {
      const result = await commentsApi.toggleLike(review.id);
      const likes = Number(result?.likes) || 0;
      const liked = Boolean(result?.liked);
      setIsLiked((prev) => ({ ...prev, [review.id]: liked }));
      setLikeCounts((prev) => ({ ...prev, [review.id]: likes }));

      updateCachedReview(review.id, { likes, liked });
    } catch {
      /* Roll back the optimistic toggle. */
      setIsLiked((prev) => ({ ...prev, [review.id]: wasLiked }));
      setLikeCounts((prev) => ({ ...prev, [review.id]: previousLikes }));
      toast.error(
        t("product.likeFailed", {
          defaultValue: "Could not update this like. Please try again.",
        }),
      );
    }
  };

  const startEdit = (review) => {
    setEditingId(review.id);
    setEditContent(review.content ?? "");
    setEditRating(Number(review.rating) || 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
    setEditRating(0);
  };

  const saveEdit = async (review) => {
    const content = editContent.trim();
    if (!content) {
      toast.error(
        t("product.reviewContentRequired", {
          defaultValue: "Please write your review before submitting.",
        }),
      );
      return;
    }
    if (editRating < 1) {
      toast.error(
        t("product.ratingRequired", {
          defaultValue: "Please choose a rating.",
        }),
      );
      return;
    }

    setSavingId(review.id);
    try {
      await commentsApi.update(productId, content, editRating);
      updateCachedReview(review.id, {
        content,
        rating: editRating,
        edited: true,
      });
      toast.success(
        t("product.reviewUpdated", { defaultValue: "Review updated." }),
      );
      cancelEdit();
      loadComments(true);
    } catch {
      toast.error(
        t("product.reviewUpdateFailed", {
          defaultValue: "Could not update your review. Please try again.",
        }),
      );
    } finally {
      setSavingId(null);
    }
  };

  const deleteReview = async (review) => {
    const confirmed = await alert.confirm({
      title: t("product.deleteReviewTitle", {
        defaultValue: "Delete this review?",
      }),
      description: t("product.deleteReviewDescription", {
        defaultValue: "This action cannot be undone.",
      }),
      buttonText: t("product.delete", { defaultValue: "Delete" }),
      secondaryButtonText: t("product.cancel", { defaultValue: "Cancel" }),
    });
    if (!confirmed) return;

    setDeletingId(review.id);
    try {
      await commentsApi.remove(productId);
      toast.success(
        t("product.reviewDeleted", { defaultValue: "Review deleted." }),
      );
      setHasOwnReview(false);
      setOwnReviewResolved(true);
      if (reviews.length === 1 && currentPage > 1) {
        setCurrentPage((page) => Math.max(1, page - 1));
      } else {
        loadComments(true);
      }
    } catch {
      toast.error(
        t("product.reviewDeleteFailed", {
          defaultValue: "Could not delete your review. Please try again.",
        }),
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleReviewSubmitted = () => {
    setHasOwnReview(true);
    setOwnReviewResolved(true);
    if (currentPage !== 1) {
      setCurrentPage(1);
      return;
    }
    loadComments(true);
  };

  const totalPages = remoteMeta.totalPages;
  const currentReviews = reviews;

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b pb-2.5">
            <div className="flex items-center gap-1.5">
              <MessageCircle className="text-muted-foreground size-4" />
              <h2 className="text-sm font-medium">
                {t("product.reviewsTab")}
              </h2>
            </div>
            {remoteMeta.count > 0 ? (
              <span className="text-muted-foreground rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {t("product.reviewCount", {
                  count: remoteMeta.count,
                  defaultValue: "{{count}} reviews",
                })}
              </span>
            ) : null}
          </div>

          {isLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Preloader />
            </div>
          ) : !canRead ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <Lock className="size-10 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {t("product.signInToSeeReviews", {
                    defaultValue: "Sign in to see customer reviews",
                  })}
                </p>
                <p className="text-muted-foreground max-w-sm text-xs">
                  {t("product.signInToSeeReviewsDesc", {
                    defaultValue:
                      "Reviews are available to signed-in customers and guests.",
                  })}
                </p>
                <Button
                  size="sm"
                  className="mt-1 cursor-pointer"
                  onClick={() => openAuthenticationModal()}
                >
                  {t("product.signIn", { defaultValue: "Sign in" })}
                </Button>
              </CardContent>
            </Card>
          ) : currentReviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="text-muted-foreground mb-2 size-8" />
              <p className="text-muted-foreground text-sm font-medium">
                {t("product.noCommentsTitle")}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {t("product.noCommentsDesc")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentReviews.map((review) => {
                const userName = review.userName;
                const owner = isOwnReview(review);
                const isEditing = editingId === review.id;
                const isDeleting = deletingId === review.id;

                return (
                  <Card
                    key={review.id}
                    className={cn(
                      "shadow-none transition-shadow hover:shadow-sm",
                      owner && "border-primary/30 bg-primary/[0.02]",
                      isEditing && "md:col-span-2",
                    )}
                  >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <Avatar className="bg-muted size-10 shrink-0">
                        <AvatarImage
                          src={review.userAvatar}
                          alt={`${userName}'s avatar`}
                        />
                        <AvatarFallback className="text-xs">
                          {userName.substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3 className="truncate text-sm font-medium">
                                {userName}
                              </h3>
                              {owner ? (
                                <span className="bg-primary/10 text-primary rounded-full px-1.5 py-px text-[10px] font-semibold">
                                  {t("product.yourReview", {
                                    defaultValue: "Your review",
                                  })}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                              <ReviewRatingStars
                                value={review.rating}
                                readOnly
                                size="size-3.5"
                              />
                              <span aria-hidden="true">·</span>
                              <time
                                dateTime={review.date}
                                className="flex items-center"
                              >
                                <Calendar className="me-0.5 size-3" />
                                {review.date}
                              </time>
                              {review.edited ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {t("product.edited", {
                                      defaultValue: "Edited",
                                    })}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          {owner && !isEditing ? (
                            <div className="flex shrink-0 items-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-primary size-7 cursor-pointer"
                                onClick={() => startEdit(review)}
                                aria-label={t("product.editReview", {
                                  defaultValue: "Edit review",
                                })}
                                title={t("product.editReview", {
                                  defaultValue: "Edit review",
                                })}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive size-7 cursor-pointer"
                                onClick={() => deleteReview(review)}
                                disabled={isDeleting}
                                aria-label={t("product.deleteReview", {
                                  defaultValue: "Delete review",
                                })}
                                title={t("product.deleteReview", {
                                  defaultValue: "Delete review",
                                })}
                              >
                                <Trash2
                                  className={cn(
                                    "size-3.5",
                                    isDeleting && "animate-pulse",
                                  )}
                                />
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        {isEditing ? (
                          <div className="mt-2 flex flex-col gap-2">
                            <ReviewRatingStars
                              value={editRating}
                              onChange={setEditRating}
                              size="size-4"
                            />
                            <Textarea
                              value={editContent}
                              onChange={(event) =>
                                setEditContent(event.target.value)
                              }
                              className="min-h-20 resize-y text-sm"
                              aria-label={t("product.editReview", {
                                defaultValue: "Edit review",
                              })}
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 cursor-pointer px-3 text-xs"
                                onClick={cancelEdit}
                                disabled={savingId === review.id}
                              >
                                {t("product.cancel", {
                                  defaultValue: "Cancel",
                                })}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 cursor-pointer px-3 text-xs"
                                onClick={() => saveEdit(review)}
                                disabled={
                                  savingId === review.id || isDeleting
                                }
                              >
                                {savingId === review.id
                                  ? t("common.saving", {
                                      defaultValue: "Saving…",
                                    })
                                  : t("product.saveChanges", {
                                      defaultValue: "Save changes",
                                    })}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {review.content}
                          </p>
                        )}

                        {!isEditing ? (
                          <div className="mt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleLike(review)}
                              title={
                                canWrite
                                  ? undefined
                                  : t("product.signInToLike", {
                                      defaultValue: "Sign in to like reviews",
                                    })
                              }
                              className="text-muted-foreground hover:bg-primary/10 hover:text-primary -ml-2 h-7 cursor-pointer px-2 text-xs"
                              aria-label={`${reviewLiked(review) ? "Unlike" : "Like"} this review`}
                              aria-pressed={reviewLiked(review)}
                            >
                              <ReviewRatingReactionToggle
                                active={reviewLiked(review)}
                                icon={ThumbsUp}
                                iconClassName="size-3.5"
                                activeColorClassName="text-primary"
                              />
                              <span>{reviewLikes(review)}</span>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            </div>
          )}

          {totalPages > 1 ? (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    className={
                      currentPage === 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <PaginationItem key={i}>
                    <PaginationLink
                      onClick={() => setCurrentPage(i + 1)}
                      isActive={currentPage === i + 1}
                      className="cursor-pointer"
                    >
                      {i + 1}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      setCurrentPage((page) =>
                        Math.min(totalPages, page + 1),
                      )
                    }
                    className={
                      currentPage === totalPages
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </div>

        {hasOwnReview ? (
          <div className="lg:sticky lg:top-8 lg:h-fit">
            <Card className="shadow-none">
              <CardContent className="flex items-start gap-3 p-4">
                <CheckCircle2 className="text-primary mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {t("product.alreadyReviewedTitle", {
                      defaultValue: "You've already reviewed this product",
                    })}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {t("product.alreadyReviewedDesc", {
                      defaultValue:
                        "Use the edit button on your review above to make changes.",
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : ownReviewResolved ? (
          <ReviewRatingReviewForm
            storeData={storeData}
            productId={productId}
            onSubmitted={handleReviewSubmitted}
            canWrite={canWrite}
            isGuest={Boolean(viewer?.isAnonymous)}
          />
        ) : null}
      </div>
    </div>
  );
}

export default ReviewRatingSection;
