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
          { ttl: 2 * 60 * 1000, forceRefresh: force },
        )
        .then((payload) => {
          if (requestIdRef.current !== requestId) return payload?.reviews;
          setRemoteReviews(payload?.reviews ?? []);
          setRemoteMeta({
            totalPages: Number(payload?.totalPages) || 0,
            count: Number(payload?.count) || 0,
          });
          return payload?.reviews;
        })
        .catch(() => {
          // 404 / no session / offline -> show the empty state
          if (requestIdRef.current === requestId) {
            setRemoteReviews([]);
            setRemoteMeta({ totalPages: 0, count: 0 });
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
    if (currentPage !== 1) {
      setCurrentPage(1);
      return;
    }
    loadComments(true);
  };

  const totalPages = remoteMeta.totalPages;
  const currentReviews = reviews;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold">{storeData.pageTitle}</h1>
        <p className="text-muted-foreground mx-auto mt-2 max-w-2xl">
          {storeData.pageDescription}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                {t("product.customerReviews")}
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
              <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="text-muted-foreground mb-3 size-10" />
              <p className="text-muted-foreground text-sm font-medium">
                {t("product.noCommentsTitle")}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t("product.noCommentsDesc")}
              </p>
            </div>
          ) : (
            currentReviews.map((review) => {
              const userName = review.userName;
              const owner = isOwnReview(review);
              const isEditing = editingId === review.id;
              const isDeleting = deletingId === review.id;

              return (
                <Card
                  key={review.id}
                  className={cn(
                    "transition-all hover:shadow-md",
                    owner && "border-primary/40 ring-primary/10 ring-1",
                  )}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-4">
                        <Avatar className="bg-muted size-12 shrink-0">
                          <AvatarImage
                            src={review.userAvatar}
                            alt={`${userName}'s avatar`}
                          />
                          <AvatarFallback>
                            {userName.substring(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-medium">{userName}</h3>
                            {owner ? (
                              <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
                                {t("product.yourReview", {
                                  defaultValue: "Your review",
                                })}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
                            <ReviewRatingStars
                              value={review.rating}
                              readOnly
                            />
                            <span>•</span>
                            <time
                              dateTime={review.date}
                              className="flex items-center"
                            >
                              <Calendar className="me-1 size-3" />
                              {review.date}
                            </time>
                            {review.edited ? (
                              <>
                                <span>•</span>
                                <span className="text-xs">
                                  {t("product.edited", {
                                    defaultValue: "Edited",
                                  })}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {owner && !isEditing ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 cursor-pointer text-muted-foreground hover:text-primary"
                            onClick={() => startEdit(review)}
                            aria-label={t("product.editReview", {
                              defaultValue: "Edit review",
                            })}
                            title={t("product.editReview", {
                              defaultValue: "Edit review",
                            })}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 cursor-pointer text-muted-foreground hover:text-destructive"
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
                                "size-4",
                                isDeleting && "animate-pulse",
                              )}
                            />
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <div className="mt-4 flex flex-col gap-3">
                        <ReviewRatingStars
                          value={editRating}
                          onChange={setEditRating}
                          size="size-5"
                        />
                        <Textarea
                          value={editContent}
                          onChange={(event) =>
                            setEditContent(event.target.value)
                          }
                          className="min-h-24 resize-y"
                          aria-label={t("product.editReview", {
                            defaultValue: "Edit review",
                          })}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="cursor-pointer"
                            onClick={cancelEdit}
                            disabled={savingId === review.id}
                          >
                            {t("product.cancel", { defaultValue: "Cancel" })}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="cursor-pointer"
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
                      <p className="text-muted-foreground mt-4 whitespace-pre-wrap break-words pt-[5px]">
                        {review.content}
                      </p>
                    )}

                    {!isEditing ? (
                      <div className="mt-4 flex items-center gap-4">
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
                          className="text-muted-foreground hover:bg-primary/10 hover:text-primary h-8 cursor-pointer px-3 text-xs"
                          aria-label={`${reviewLiked(review) ? "Unlike" : "Like"} this review`}
                          aria-pressed={reviewLiked(review)}
                        >
                          <ReviewRatingReactionToggle
                            active={reviewLiked(review)}
                            icon={ThumbsUp}
                            iconClassName="size-4"
                            activeColorClassName="text-primary"
                          />
                          <span>{reviewLikes(review)}</span>
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          )}

          {totalPages > 1 ? (
            <Pagination className="mt-6">
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

        <ReviewRatingReviewForm
          storeData={storeData}
          productId={productId}
          onSubmitted={handleReviewSubmitted}
          canWrite={canWrite}
          isGuest={Boolean(viewer?.isAnonymous)}
        />
      </div>
    </div>
  );
}

export default ReviewRatingSection;
