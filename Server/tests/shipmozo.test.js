import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

/* =========================================================
 * Shipmozo contract guards.
 *
 * Live provider calls cannot run without real API keys, so this
 * suite covers everything that is deterministic offline:
 *   - the typed "configuration missing" error (the ONLY failure a
 *     caller may skip when keys are placeholders),
 *   - courier status classification (out-for-delivery must never be
 *     treated as delivered),
 *   - tracking-history de-duplication.
 * ========================================================= */

const ENV_KEYS = [
  "SHIPMOZO_PUBLIC_KEY",
  "SHIPMOZO_PRIVATE_KEY",
  "SHIPMOZO_ALLOW_LIVE",
  "SHIPMOZO_WAREHOUSE_ID",
];
let saved = {};
let shipmozo;

before(async () => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  shipmozo = await import("../utils/shipmozo.js");
});

after(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("shipmozo configuration", () => {
  it("reports unconfigured when keys or the live flag are missing", () => {
    process.env.SHIPMOZO_PUBLIC_KEY = "pub";
    process.env.SHIPMOZO_PRIVATE_KEY = "priv";
    // allow-live flag deliberately absent
    assert.equal(shipmozo.shipmozoConfig().configured, false);
    assert.equal(shipmozo.isShipmozoConfigured(), false);
  });

  it("asserts with a typed configuration error, not a generic one", () => {
    assert.throws(
      () => shipmozo.assertShipmozoConfigured(),
      (err) => {
        assert.equal(err.code, shipmozo.SHIPMENT_CONFIGURATION_MISSING);
        assert.equal(err.status, 503);
        return true;
      },
    );
  });

  it("resolveWarehouseId fails closed with the typed error", async () => {
    await assert.rejects(
      () => shipmozo.resolveWarehouseId(),
      (err) => err.code === shipmozo.SHIPMENT_CONFIGURATION_MISSING,
    );
  });

  it("is configured only when both keys and allow-live are present", () => {
    process.env.SHIPMOZO_ALLOW_LIVE = "true";
    assert.equal(shipmozo.shipmozoConfig().configured, true);
    assert.doesNotThrow(() => shipmozo.assertShipmozoConfigured());
  });

  it("shipmentConfigError carries the stable code and status", () => {
    const err = shipmozo.shipmentConfigError("custom message");
    assert.equal(err.message, "custom message");
    assert.equal(err.code, shipmozo.SHIPMENT_CONFIGURATION_MISSING);
    assert.equal(err.status, 503);
  });

  it("recognises provider success only when result is '1'", () => {
    assert.equal(shipmozo.isShipmozoSuccess({ result: "1" }), true);
    assert.equal(shipmozo.isShipmozoSuccess({ result: 1 }), true);
    assert.equal(shipmozo.isShipmozoSuccess({ result: "0" }), false);
    assert.ok(!shipmozo.isShipmozoSuccess(null));
  });
});

describe("classifyTrackingStatus", () => {
  const cases = [
    ["Delivered", "delivered"],
    ["DELIVERY_SUCCESSFUL", "delivered"],
    ["Out for Delivery", "out_for_delivery"],
    ["Out For Dispatch", "out_for_delivery"],
    ["Delivery Attempted", "delivery_exception"],
    ["Undelivered - Customer Unavailable", "delivery_exception"],
    ["NDR Raised", "delivery_exception"],
    ["RTO Initiated", "rto"],
    ["Returned to Origin", "rto"],
    ["Shipment Cancelled", "cancelled"],
    ["In Transit", "in_transit"],
    ["Picked Up", "in_transit"],
    ["", "unknown"],
  ];

  for (const [input, expected] of cases) {
    it(`classifies ${JSON.stringify(input)} as ${expected}`, () => {
      assert.equal(shipmozo.classifyTrackingStatus(input), expected);
    });
  }

  it("never classifies out-for-delivery as delivered", () => {
    assert.notEqual(
      shipmozo.classifyTrackingStatus("Out for delivery"),
      "delivered",
    );
  });
});

describe("appendUniqueHistory", () => {
  it("merges unseen scans and ignores repeats", () => {
    const order = {
      fulfillment: {
        history: [
          {
            status: "In Transit",
            message: "Left hub",
            location: "Mumbai",
          },
        ],
      },
    };
    shipmozo.appendUniqueHistory(order, [
      { status: "In Transit", message: "Left hub", location: "Mumbai" },
      { status: "Out for Delivery", message: "With courier", location: "Pune" },
    ]);
    assert.equal(order.fulfillment.history.length, 2);
    assert.equal(order.fulfillment.history[1].status, "Out for Delivery");

    shipmozo.appendUniqueHistory(order, [
      { status: "Out for Delivery", message: "With courier", location: "Pune" },
    ]);
    assert.equal(order.fulfillment.history.length, 2);
  });

  it("is a no-op for orders without a fulfillment snapshot", () => {
    const order = {};
    assert.doesNotThrow(() =>
      shipmozo.appendUniqueHistory(order, [{ status: "x" }]),
    );
    assert.equal(order.fulfillment, undefined);
  });
});
