import EventEmitter, { ClassicEvent } from "../shared/models/event.js";

const globalEvents = new EventEmitter();
const dbEvents = new EventEmitter();

class DatabaseDocumentEvent {
  constructor(type, collection, document, eventData = null) {
    this.type = type;
    this.collection = collection;
    this.document = document;
    this.data = eventData;
    this.timestamp = new Date();
  }
}

// Major Events

class ProductEvent extends ClassicEvent {
  constructor({
    type,
    product,
    response = null,
    isReq = false,
    reqPath = null,
    userId = null,
    actorId = null,
    productId = null,
    isGuest = false,
  }) {
    super({
      type,
      isMajor: true,
      sector: "product",
      content: { product, response },
      isReq,
      reqPath,

      userId,
      actorId,
      isGuest,
      productId: productId || product?.id || response?.productId || null,
    });
    this.global = true;
    this.product = product;
    this.response = response;
    this.isReq = isReq;
    this.reqPath = reqPath;
  }
}

class UserEvent extends ClassicEvent {
  constructor({ type, user, isGuest = false, userId = null }) {
    super({
      type,
      isMajor: true,
      sector: "user",
      content: { ...user },
      isGuest,
      userId: user.id || userId,
      userName: user.name,
      userEmail: user.email,
      userAvatar: user.image,
      actorId: user.id || userId,
    });
    this.global = true;
    this.user = user; // short for user object
    this.isGuest = user.isGuest || isGuest;
  }
}

class OrderEvent extends ClassicEvent {
  constructor({ type, order }) {
    super({
      type,
      isMajor: true,
      sector: "order",
      content: { ...order },
      orderId: order.id,
      userId: order.userId,
      actorId: order.userId,
    });
    this.global = true;
    this.order = order;
    this.isGuest = false; // Guest users cannot place orders, so this is always false for order events
  }
}

class RecordEvent extends ClassicEvent {
  constructor({
    type,
    title,
    message,
    data,
    isError = false,
    sector = null,
    id = null,
  }) {
    super({
      type,
      isMajor: true,
      sector: sector || "record",
      title,
      message,
      isError,
      content: data,
    });
    this.global = true;
    this.title = title;
    this.message = message;
    this.data = data;
    this.isError = isError;
    this.happenedAt = new Date();
    if (id) {
      this.id = id;
    }
  }
}

class SessionEvent extends ClassicEvent {
  constructor({ type, session, isGuest = false }) {
    super({
      type,
      isMajor: true,
      sector: "session",
      content: { ...session },
      userId: session.userId || session.user?.id || null,
      actorId: session.userId || session.user?.id || null,
      isError: false,
      userAgent: session.userAgent,
      isGuest: isGuest || session.isAnonymous || session.user?.isAnonymous || false,
    });
    this.global = true;
    this.session = session;
    this.happenedAt = new Date();
  }
}

// Non Major Event
class CommentEvent extends ClassicEvent {
  constructor({ type, comment }) {
    super({
      type,
      isMajor: false,
      sector: "comment",
      content: { ...comment },
      commentId: comment.id,
      productId: comment.productId,
      userId: comment.userId,
      actorId: comment.userId,
      userName: comment.userName,
      userEmail: comment.userEmail,
      userAvatar: comment.userAvatar,
      isError: false,
    });
    this.global = true;
    this.comment = comment;
  }
}

class ErrorEvent extends ClassicEvent {
  constructor({ type, error, errorCode = null, data = null }) {
    super({
      type,
      isMajor: true,
      sector: "error",
      content: { error, errorCode, ...data },
      isError: true,

      error,
      errorCode,
    });
    this.global = true;
    this.error = error;
    this.errorCode = errorCode;
    this.data = data;
  }
}

const dbEventNames = {
  // Database connection events
  CONNECTED: "db_connected",
  DISCONNECTED: "db_disconnected",
  ERROR: "db_error",
  CONNECTING: "db_connecting",

  // Database actions events
  DOCUMENT_CREATED: "document_created",
  DOCUMENT_READ: "document_read",
  DOCUMENT_UPDATED: "document_updated",
  DOCUMENT_DELETED: "document_deleted",

  COLLECTION_DROPPED: "collection_dropped",
  DATABASE_DROPPED: "database_dropped",
};

const GlobalEventNames = {
  ///////////////////// MAIN EVENTS //////////////////////////////
  // Site Events
  SITE_VIEWED: "site_viewed",

  // Error events
  ERROR: "error",

  // Product events
  PRODUCT_CREATED: "product_created",
  PRODUCT_UPDATED: "product_updated",
  PRODUCT_DELETED: "product_deleted",

  // Product interaction events
  PRODUCT_SEARCHED: "site_searched",
  PRODUCT_VIEWED: "product_viewed",
  PRODUCT_RATED: "product_rated",
  PRODUCT_SHARED: "product_shared",
  PRODUCT_WISHLISTED: "product_wishlisted",
  PRODUCT_CARTED: "product_carted",
  PRODUCT_COMMENTED: "product_commented",
  PRODUCT_LOW_STOCK: "product_low_stock",
  PRODUCT_OUT_OF_STOCK: "product_out_of_stock",
  PRODUCT_COMMENT_UPDATED: "product_comment_updated",
  PRODUCT_COMMENT_DELETED: "product_comment_deleted",
  PRODUCT_COMMENT_ERROR: "product_comment_error",

  // User events
  USER_REGISTERED: "user_registered",
  USER_LOGGED_IN: "user_logged_in",
  USER_LOGGED_OUT: "user_logged_out",
  USER_PROFILE_UPDATED: "user_profile_updated",
  USER_PASSWORD_CHANGED: "user_password_changed",
  USER_DELETED: "user_deleted",

  // Order events
  ORDER_PLACED: "order_placed",
  ORDER_PAID: "order_paid",
  ORDER_REFUNDED: "order_refunded",
  ORDER_UPDATED: "order_updated",
  ORDER_CANCELLED: "order_cancelled",
  ORDER_COMPLETED: "order_completed",
  ORDER_RETURN_REQUESTED: "order_return_requested",
  ORDER_CREATE_ATTEMPT: "order_create_attempt",
  ORDER_CREATE_FAILED: "order_create_failed",
  ORDER_STATUS_CHANGED: "order_status_changed",

  // Payment events (server-authoritative only)
  CHECKOUT_STARTED: "checkout_started",
  PAYMENT_INITIATED: "payment_initiated",
  PAYMENT_CHECKOUT_OPENED: "payment_checkout_opened",
  PAYMENT_SUCCEEDED: "payment_succeeded",
  PAYMENT_FAILED: "payment_failed",
  PAYMENT_CANCELLED: "payment_cancelled",
  PAYMENT_VERIFICATION_FAILED: "payment_verification_failed",
  PAYMENT_WEBHOOK_RECEIVED: "payment_webhook_received",
  PAYMENT_WEBHOOK_VERIFIED: "payment_webhook_verified",
  PAYMENT_DUPLICATE_IGNORED: "payment_duplicate_ignored",
  COD_CREATED: "cod_created",
  COD_COLLECTION_PENDING: "cod_collection_pending",
  COD_COLLECTED: "cod_collected",
  COD_COLLECTION_FAILED: "cod_collection_failed",

  // Shipment events
  SHIPMENT_SERVICEABILITY_CHECK: "shipment_serviceability_check",
  SHIPMENT_CREATE_ATTEMPT: "shipment_create_attempt",
  SHIPMENT_CREATED: "shipment_created",
  SHIPMENT_CREATE_FAILED: "shipment_create_failed",
  SHIPMENT_PICKUP: "shipment_pickup",
  SHIPMENT_IN_TRANSIT: "shipment_in_transit",
  SHIPMENT_OUT_FOR_DELIVERY: "shipment_out_for_delivery",
  SHIPMENT_DELIVERED: "shipment_delivered",
  SHIPMENT_CANCELLED: "shipment_cancelled",
  SHIPMENT_RTO: "shipment_rto",
  SHIPMENT_TRACK_SYNCED: "shipment_track_synced",

  // Customer care events (never log message bodies)
  TICKET_CREATED: "ticket_created",
  TICKET_REPLIED: "ticket_replied",
  TICKET_RESOLVED: "ticket_resolved",
  TICKET_REOPENED: "ticket_reopened",
  TICKET_CLOSED: "ticket_closed",

  // Search events
  SEARCH_SUBMITTED: "search_submitted",
  SEARCH_RATE_LIMITED: "search_rate_limited",

  // Analytics events
  ANALYTICS_UPDATED: "analytics_updated",
  ANALYTICS_FLUSHED: "analytics_flushed",

  // Log events
  EVENT_RECORDED: "event_recorded",

  ////////////////////// INDIVIDUAL EVENTS //////////////////////////////
  // Wihlist events
  WISHLIST_REMOVED: "wishlist_removed",
  WISHLIST_ADDED: "wishlist_added",
  WISHLIST_UPDATED: "wishlist_updated",
  WISHLIST_ERROR: "wishlist_error",

  // Cart events
  CART_UPDATED: "cart_updated",
  CART_CLEARED: "cart_cleared",
  CART_ERROR: "cart_error",
  CART_ITEM_ADDED: "cart_item_added",
  CART_ITEM_REMOVED: "cart_item_removed",
  CART_ITEM_UPDATED: "cart_item_updated",

  // Non Major: User events
  USER_LOGGED_OUT_REQUEST: "user_logged_out_request",
  USER_LOGIN_FAILED: "user_login_failed",

  // Non Major: Product events
  PRODUCT_SEARCHED_FROM_CACHE: "site_searched_from_cache",
  PRODUCT_STOCK_UPDATED: "product_stock_updated",
  PRODUCT_PRICE_UPDATED: "product_price_updated",
  PRODUCT_IMAGE_UPDATED: "product_image_updated",
  PRODUCT_DESCRIPTION_UPDATED: "product_description_updated",
  PRODUCT_CATEGORY_UPDATED: "product_category_updated",
  PRODUCT_TAGS_UPDATED: "product_tags_updated",
  PRODUCT_DISCOUNT_UPDATED: "product_discount_updated",
  PRODUCT_RATING_UPDATED: "product_rating_updated",
  PRODUCT_UNRATED: "product_unrated",

  // Flush events
  FLUSH_REQUESTED: "flush_requested",

  INTERACTION_RECORDED: "interaction_recorded",
  ANALYTICS_RECONCILED: "analytics_reconciled",
};

/* Events that are important enough to be stored in the activity log
 * (`activities`) even when a caller fires them as a plain payload instead
 * of a ClassicEvent subclass. This keeps the global manager authoritative:
 * no feature has to remember to construct a special class. */
const MAJOR_EVENT_TYPES = new Set([
  GlobalEventNames.SITE_VIEWED,
  GlobalEventNames.ERROR,
  GlobalEventNames.PRODUCT_CREATED,
  GlobalEventNames.PRODUCT_UPDATED,
  GlobalEventNames.PRODUCT_DELETED,
  GlobalEventNames.PRODUCT_SEARCHED,
  GlobalEventNames.PRODUCT_VIEWED,
  GlobalEventNames.PRODUCT_RATED,
  GlobalEventNames.PRODUCT_RATING_UPDATED,
  GlobalEventNames.PRODUCT_SHARED,
  GlobalEventNames.PRODUCT_WISHLISTED,
  GlobalEventNames.PRODUCT_CARTED,
  GlobalEventNames.PRODUCT_COMMENTED,
  GlobalEventNames.PRODUCT_COMMENT_UPDATED,
  GlobalEventNames.PRODUCT_COMMENT_DELETED,
  GlobalEventNames.PRODUCT_COMMENT_ERROR,
  GlobalEventNames.PRODUCT_LOW_STOCK,
  GlobalEventNames.PRODUCT_OUT_OF_STOCK,
  GlobalEventNames.USER_REGISTERED,
  GlobalEventNames.USER_LOGGED_IN,
  GlobalEventNames.USER_LOGGED_OUT,
  GlobalEventNames.USER_PROFILE_UPDATED,
  GlobalEventNames.USER_PASSWORD_CHANGED,
  GlobalEventNames.USER_DELETED,
  GlobalEventNames.USER_LOGIN_FAILED,
  GlobalEventNames.ORDER_PLACED,
  GlobalEventNames.ORDER_PAID,
  GlobalEventNames.ORDER_REFUNDED,
  GlobalEventNames.ORDER_UPDATED,
  GlobalEventNames.ORDER_CANCELLED,
  GlobalEventNames.ORDER_COMPLETED,
  GlobalEventNames.ORDER_RETURN_REQUESTED,
  GlobalEventNames.ORDER_CREATE_ATTEMPT,
  GlobalEventNames.ORDER_CREATE_FAILED,
  GlobalEventNames.ORDER_STATUS_CHANGED,
  GlobalEventNames.CHECKOUT_STARTED,
  GlobalEventNames.PAYMENT_INITIATED,
  GlobalEventNames.PAYMENT_CHECKOUT_OPENED,
  GlobalEventNames.PAYMENT_SUCCEEDED,
  GlobalEventNames.PAYMENT_FAILED,
  GlobalEventNames.PAYMENT_CANCELLED,
  GlobalEventNames.PAYMENT_VERIFICATION_FAILED,
  GlobalEventNames.PAYMENT_WEBHOOK_VERIFIED,
  GlobalEventNames.PAYMENT_DUPLICATE_IGNORED,
  GlobalEventNames.COD_CREATED,
  GlobalEventNames.COD_COLLECTION_PENDING,
  GlobalEventNames.COD_COLLECTED,
  GlobalEventNames.COD_COLLECTION_FAILED,
  GlobalEventNames.SHIPMENT_CREATED,
  GlobalEventNames.SHIPMENT_CREATE_FAILED,
  GlobalEventNames.SHIPMENT_DELIVERED,
  GlobalEventNames.SHIPMENT_CANCELLED,
  GlobalEventNames.SHIPMENT_RTO,
  GlobalEventNames.SHIPMENT_PICKUP,
  GlobalEventNames.SHIPMENT_TRACK_SYNCED,
  GlobalEventNames.TICKET_CREATED,
  GlobalEventNames.TICKET_REPLIED,
  GlobalEventNames.TICKET_RESOLVED,
  GlobalEventNames.TICKET_REOPENED,
  GlobalEventNames.TICKET_CLOSED,
  GlobalEventNames.CART_ITEM_ADDED,
  GlobalEventNames.CART_ITEM_REMOVED,
  GlobalEventNames.CART_CLEARED,
  GlobalEventNames.CART_ERROR,
  GlobalEventNames.SEARCH_SUBMITTED,
  GlobalEventNames.SEARCH_RATE_LIMITED,
]);

const PRODUCT_EVENT_TYPES = new Set([
  GlobalEventNames.PRODUCT_CREATED,
  GlobalEventNames.PRODUCT_UPDATED,
  GlobalEventNames.PRODUCT_DELETED,
  GlobalEventNames.PRODUCT_SEARCHED,
  GlobalEventNames.PRODUCT_SEARCHED_FROM_CACHE,
  GlobalEventNames.PRODUCT_VIEWED,
  GlobalEventNames.PRODUCT_RATED,
  GlobalEventNames.PRODUCT_RATING_UPDATED,
  GlobalEventNames.PRODUCT_UNRATED,
  GlobalEventNames.PRODUCT_SHARED,
  GlobalEventNames.PRODUCT_WISHLISTED,
  GlobalEventNames.PRODUCT_CARTED,
  GlobalEventNames.PRODUCT_COMMENTED,
  GlobalEventNames.PRODUCT_COMMENT_UPDATED,
  GlobalEventNames.PRODUCT_COMMENT_DELETED,
  GlobalEventNames.PRODUCT_STOCK_UPDATED,
  GlobalEventNames.PRODUCT_PRICE_UPDATED,
  GlobalEventNames.PRODUCT_IMAGE_UPDATED,
  GlobalEventNames.PRODUCT_DESCRIPTION_UPDATED,
  GlobalEventNames.PRODUCT_CATEGORY_UPDATED,
  GlobalEventNames.PRODUCT_TAGS_UPDATED,
  GlobalEventNames.PRODUCT_DISCOUNT_UPDATED,
]);

export function isMajorEvent(type) {
  return MAJOR_EVENT_TYPES.has(type);
}

export function isProductEvent(type) {
  return PRODUCT_EVENT_TYPES.has(type);
}

export function eventSector(type) {
  const value = String(type || "");
  if (value.startsWith("product_") || value === GlobalEventNames.PRODUCT_SEARCHED)
    return "product";
  if (value.startsWith("user_")) return "user";
  if (value.startsWith("session") || value.includes("logged_in"))
    return "session";
  if (value.startsWith("order_")) return "order";
  if (
    value.startsWith("payment_") ||
    value.startsWith("checkout_") ||
    value.startsWith("cod_")
  )
    return "payment";
  if (value.startsWith("shipment_")) return "shipment";
  if (value.startsWith("ticket_")) return "support";
  if (value.startsWith("wishlist_")) return "wishlist";
  if (value.startsWith("cart_")) return "cart";
  if (value.startsWith("search_")) return "search";
  if (value.startsWith("analytics_")) return "analytics";
  if (value === GlobalEventNames.ERROR || value.endsWith("_error"))
    return "error";
  if (value === GlobalEventNames.SITE_VIEWED) return "site";
  return "global";
}

export {
  dbEventNames,
  globalEvents as evt,
  dbEvents,
  DatabaseDocumentEvent,
  GlobalEventNames as Evts,

  // Event classes
  ProductEvent,
  ErrorEvent,
  CommentEvent,
  UserEvent,
  OrderEvent,
  RecordEvent,
  SessionEvent,
};
