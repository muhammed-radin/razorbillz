import mongoose from "mongoose";

// total analytics for the entire site
const siteAnalyticsSchema = mongoose.Schema(
  {
    _id: { type: String, required: true, default: "global_counters" },
    traffic: {
      allViews: { type: Number, default: 0 },
      debouncedViews: { type: Number, default: 0 }, // unique guests + unique users
      uniqueGuests: { type: Number, default: 0 },
      uniqueUsers: { type: Number, default: 0 },
      devices: {
        desktop: { type: Number, default: 0 },
        mobile: { type: Number, default: 0 },
        tablet: { type: Number, default: 0 },
      },
      sources: {
        chrome: { type: Number, default: 0 },
        firefox: { type: Number, default: 0 },
        safari: { type: Number, default: 0 },
        edge: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
      },
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },

    users: {
      loggedInUsers: { type: Number, default: 0 },
      signedUpUsers: { type: Number, default: 0 },
      totalUsers: { type: Number, default: 0 },
      deletedUsers: { type: Number, default: 0 },
      passwordChanged: { type: Number, default: 0 },
    },

    products: {
      views: { type: Number, default: 0 },
      searches: { type: Number, default: 0 },
      lowStock: { type: Number, default: 0 },
      outOfStock: { type: Number, default: 0 },
      totalProducts: { type: Number, default: 0 },
    },

    orders: {
      totalOrders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      returned: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
    },

    reviews: {
      total: {
        type: Number,
        default: 0,
      },
    },

    engagement: {
      shares: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      ratings: { type: Number, default: 0 },
      wishlists: { type: Number, default: 0 },
    },

    events: {
      total: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
      sessions: { type: Number, default: 0 },
    },

    activeUsers: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

// daily analytics for the entire site
const dailyAnalyticsSchema = mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      default: () => new Date().toISOString().split("T")[0],
    }, // YYYY-MM-DD
    date: { type: Date, required: true, unique: true },

    traffic: {
      allViews: { type: Number, default: 0 },
      debouncedViews: { type: Number, default: 0 }, // unique guests + unique users
      uniqueGuests: { type: Number, default: 0 },
      uniqueUsers: { type: Number, default: 0 },
      devices: {
        desktop: { type: Number, default: 0 },
        mobile: { type: Number, default: 0 },
        tablet: { type: Number, default: 0 },
      },
      sources: {
        chrome: { type: Number, default: 0 },
        firefox: { type: Number, default: 0 },
        safari: { type: Number, default: 0 },
        edge: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
      },
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },

    users: {
      loggedInUsers: { type: Number, default: 0 },
      signedUpUsers: { type: Number, default: 0 },
      deletedUsers: { type: Number, default: 0 },
      passwordChanged: { type: Number, default: 0 },
    },

    products: {
      views: { type: Number, default: 0 },
      searches: { type: Number, default: 0 },
      lowStock: { type: Number, default: 0 },
      outOfStock: { type: Number, default: 0 },
      totalProducts: { type: Number, default: 0 },
    },

    orders: {
      total: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      returned: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
    },

    reviews: {
      total: {
        type: Number,
        default: 0,
      },
    },

    engagement: {
      shares: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      ratings: { type: Number, default: 0 },
      wishlists: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  },
);

const analyticEventSchema = new mongoose.Schema(
  {
    // What happened?
    type: {
      type: String,
      required: true,
      index: true,
    },

    // When did it happen?
    timestamp: { type: Date, required: true, default: Date.now, index: true },

    // User who performed the event
    userId: {
      type: String,
      ref: "User",
      default: null,
      index: true,
    },

    eventId: {
      type: String,
      required: true,
      index: true,
    },

    // Useful for traffic/session calculations
    sessionId: { type: String, default: null, index: true },

    // Page/product/etc.
    path: { type: String, default: null },

    sector: {
      type: String,
      default: null,
    },

    productId: {
      type: String,
      ref: "Product",
      default: null,
    },

    orderId: {
      type: String,
      ref: "Order",
      default: null,
    },

    // Search
    search: { query: String },

    // Order information
    order: {
      actor: { type: String, default: null },
      actorId: { type: String, default: null },
      revenue: {
        type: Number,
        default: 0,
      },
    },

    // Traffic information
    device: {
      type: String,
      enum: ["desktop", "mobile", "tablet", "other"],
      default: "other",
    },

    browser: {
      type: String,
      enum: ["chrome", "firefox", "safari", "edge", "other"],
      default: "other",
    },

    os: { type: String, default: null },

    userAgent: { type: String, default: null },

    // Additional information when needed
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  {
    timestamps: true,
  },
);

// Record of major events and activities (login, signup, order, ...etc)
const eventsRecordSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      index: true,
    },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    userId: {
      type: String,
      ref: "User",
      default: null,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    sessionId: { type: String, default: null, index: true }, // Useful for traffic/session calculations
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
    sector: {
      type: String,
      default: null,
    }, // its defines where sector the event happened, for example: product, order, user, cart
    productId: {
      type: String,
      ref: "Product",
      default: null,
    },
    fromAdmin: { type: Boolean, default: false }, // if the event is triggered from admin panel or not
    isMajor: { type: Boolean, default: false }, // if the event is major or not, major events are important events that need to be recorded for analytics and reporting purposes
    path: { type: String, default: null }, // the path of the page where the event happened, for example: /product/123
    isGuest: { type: Boolean, default: false }, // if the event is triggered by a guest user or not
    isError: { type: Boolean, default: false }, // if the event is triggered by an error or not
    error: { type: String, default: null }, // the error message
    errorCode: { type: Number, default: null }, // the error code

    refId: {
      type: String,
      default: null,
    },

    title: { type: String, default: null }, // the title of the event, for example: "User signed up", "Product added to cart", "Order placed", "Error occurred", etc.
    message: { type: String, default: null }, // the message of the event, for example: "User signed up with email:
  },
  {
    timestamps: true,
  },
);

// SiteAnalyticsCache schema for caching analytics data for quick server response
const siteAnalyticsCacheSchema = mongoose.Schema(
  {
    _id: { type: String, required: true, default: "global_counters" },
    year: { type: Number, required: true },
    months: {
      type: Map,
      of: {
        month: { type: Number, required: true },
        monthName: { type: String, required: true },
        analytics: [mongoose.Schema.Types.Mixed], // Store monthly analytics data
      },
    },
    weeks: {
      type: Map,
      of: {
        week: { type: Number, required: true },
        weekName: { type: String, required: true },
        weekId: { type: String, required: true }, // Format: YYYY-WW
        analytics: [mongoose.Schema.Types.Mixed], // Store weekly analytics data
      },
    },
    analytics: [mongoose.Schema.Types.Mixed], // Store yearly analytics data
    lastUpdated: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

export const SiteAnalyticsModel = mongoose.model(
  "SiteAnalytics",
  siteAnalyticsSchema,
  "site_analytics",
);

export const DailyAnalyticsModel = mongoose.model(
  "DailyAnalytics",
  dailyAnalyticsSchema,
  "daily_analytics",
);

export const EventsRecordModel = mongoose.model(
  "EventsRecord",
  eventsRecordSchema,
  "activities",
);

export const AnalyticEventModel = mongoose.model(
  "AnalyticEvent",
  analyticEventSchema,
  "analytic_events",
);

// currently not used, but can be used in the future for caching analytics data for quick server response
export const SiteAnalyticsCacheModel = mongoose.model(
  "SiteAnalyticsCache",
  siteAnalyticsCacheSchema,
  "site_analytics_cache",
);

// schema
export default {
  siteAnalyticsSchema,
  dailyAnalyticsSchema,
  eventsRecordSchema,
  analyticEventSchema,
  siteAnalyticsCacheSchema,
};

/* 

okay, My Final Conclusion:

### Schema and Collections For:

- AnalyticEvent - contains analytic information with "what happened". collection: "analytic_events"
- DailySatitcs - contains statics from calculated with AnalyticEvents. collection "daily_analytics"
- EventsRecord - contains every type of major events and activities. such as login, signup, ...etc. collection: "activites"

- SiteAnalyticsCache - contains cached statics for quick server responds. collection: "site_analytics_cache"

### One document for Entire site analytics:

- schema SiteAnalytics: contains overall statics. store at collection "site_analytics" with id "global_encounters"

### Strategy of saving:

event triggers ( sign-up, sign-In, Visit, Liked ..all events ) -> event listens
                        | -> AnalyticEvent: this filter events as need ( visits, logins, ...etc ) -> create new document in collection "analytic_events" with all details of the event -> also update the SiteAnalytics document with new statics ( stores in buffer, interval flushes buffer ) -> also update the DailyAnalytics document with new statics
                        | -> EventsRecord: this filter events as need. Major Activites ( oreder, sign up, share, ...etc ) -> Passes diffrent sector

weekly, monthly, yearly reports can be generated from the DailyAnalytics collection.
weekly, monthly, yearly calculated caches for quick server responds, only re-calucalate and cache data at specific time, specific intervals and specific event trigegers. 
after weekend, after month-end, after year-end, recalculate and cache data and store in db (collection: "site_analytics_cache") for quick server responds. this collection help reduce the load of heavy calucations. in this collection never contains current data, only past data. 
daily also caches for quick server responds.

### Document of Collection "SiteAnalyticsCache": ( optional )
- _id: string, default: "year" (YYYY)
- months: [{ _id: string, default: "month" (YYYY-MM), month: 6, monthName: "June", ...analytics }, other months],
- weeks: [{ _id: string, default: "week" (YYYY-WW), week: 23, weekName: "Week 23", ...analytics }, other weeks],
- year: 2024, 
- yearName: "2024", 
...yearly analytics,
- lastUpdated: Date,
- createdAt: Date

> Used for quick server responds, this collection contains only past data, never current data. reduce the load of heavy calucations. restore the analytics if server is down or crashed or break or suspends ( cache in the memory loses when server fall here is permanent solution ). 
*/
