/* Aggregate daily analytics documents into the shape used by
 * `site_analytics` (`global_counters`).
 *
 * Field names follow the schemas:
 *  - daily_analytics: products.views / products.searches / orders.total
 *  - site_analytics:  orders.totalOrders / users.totalUsers
 * Older documents may still use `viewed` / `total`; both are read. */
export function calculateAnalyticsFrom(daysAnalytics = []) {
  const result = {
    events: {
      total: 0,
      errors: 0,
      sessions: 0,
    },
    traffic: {
      allViews: 0,
      debouncedViews: 0,
      uniqueUsers: 0,
      uniqueGuests: 0,
      devices: {
        desktop: 0,
        mobile: 0,
        tablet: 0,
        other: 0,
      },
      sources: {
        chrome: 0,
        firefox: 0,
        safari: 0,
        edge: 0,
        other: 0,
      },
    },
    users: {
      loggedInUsers: 0,
      signedUpUsers: 0,
      deletedUsers: 0,
      passwordChanged: 0,
      totalUsers: 0, // signedUpUsers - deletedUsers
    },
    products: {
      views: 0,
      searches: 0,
      lowStock: 0,
      outOfStock: 0,
      totalProducts: 0,
    },
    engagement: {
      ratings: 0,
      shares: 0,
      wishlists: 0,
      comments: 0,
    },
    orders: {
      totalOrders: 0,
      revenue: 0,
      cancelled: 0,
      delivered: 0,
      returned: 0,
    },
    reviews: {
      total: 0,
    },
    lastUpdated: new Date(),
  };

  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  daysAnalytics.forEach((day = {}) => {
    const traffic = day.traffic ?? {};
    const devices = traffic.devices ?? {};
    const sources = traffic.sources ?? {};
    const users = day.users ?? {};
    const products = day.products ?? {};
    const engagement = day.engagement ?? {};
    const orders = day.orders ?? {};
    const reviews = day.reviews ?? {};
    const events = day.events ?? {};

    result.events.total += number(events.total);
    result.events.errors += number(events.errors);
    result.events.sessions += number(events.sessions);

    result.traffic.allViews += number(traffic.allViews);
    result.traffic.debouncedViews += number(traffic.debouncedViews);
    result.traffic.uniqueUsers += number(traffic.uniqueUsers);
    result.traffic.uniqueGuests += number(traffic.uniqueGuests);

    result.traffic.devices.desktop += number(devices.desktop);
    result.traffic.devices.mobile += number(devices.mobile);
    result.traffic.devices.tablet += number(devices.tablet);
    result.traffic.devices.other += number(devices.other);

    result.traffic.sources.chrome += number(sources.chrome);
    result.traffic.sources.firefox += number(sources.firefox);
    result.traffic.sources.safari += number(sources.safari);
    result.traffic.sources.edge += number(sources.edge);
    result.traffic.sources.other += number(sources.other);

    result.users.loggedInUsers += number(users.loggedInUsers);
    result.users.signedUpUsers += number(users.signedUpUsers);
    result.users.deletedUsers += number(users.deletedUsers);
    result.users.passwordChanged += number(users.passwordChanged);

    result.products.views += number(products.views ?? products.viewed);
    result.products.searches += number(products.searches);
    result.products.lowStock += number(products.lowStock);
    result.products.outOfStock += number(products.outOfStock);
    result.products.totalProducts += number(products.totalProducts);

    result.engagement.ratings += number(engagement.ratings);
    result.engagement.shares += number(engagement.shares);
    result.engagement.wishlists += number(engagement.wishlists);
    result.engagement.comments += number(engagement.comments);

    result.orders.totalOrders += number(orders.totalOrders ?? orders.total);
    result.orders.revenue += number(orders.revenue);
    result.orders.cancelled += number(orders.cancelled);
    result.orders.delivered += number(orders.delivered);
    result.orders.returned += number(orders.returned);

    result.reviews.total += number(reviews.total);
  });

  result.users.totalUsers = Math.max(
    0,
    result.users.signedUpUsers - result.users.deletedUsers,
  );

  return result;
}

export default calculateAnalyticsFrom;
