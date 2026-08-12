export * from "./billing-schema";
export * from "./billing-types";
export * from "./billing-provider";
export * from "./plan-service";
export * from "./subscription-service";
export * from "./credit-service";
export * from "./tax-service";
export * from "./pricing-service";
export * from "./billing-service";

// Namespaced — create()/list() collide across invoice-service.ts,
// payment-service.ts, and coupon-service.ts (different signatures per
// file). Same fix shape as src/lib/saas/index.ts's audit-service/
// activity-service collision.
export * as invoiceService from "./invoice-service";
export * as paymentService from "./payment-service";
export * as couponService from "./coupon-service";

// Phase 18 Milestone 1 — the PARALLEL, per-USER platform entitlement
// system (see platform-schema.ts's own header comment for why it's
// deliberately separate from the organization-scoped exports above).
// Namespaced for the same reason as invoiceService/paymentService/
// couponService above: several names here (SubscriptionStatus's own
// re-export, "Plan"-shaped concepts) would otherwise collide with the
// organization-scoped billing-schema.ts/billing-types.ts exports.
export * as platformSchema from "./platform-schema";
export * as personaService from "./persona-service";
export * as featureRegistry from "./feature-registry";
export * as platformPlanRegistry from "./platform-plan-registry";
export * as entitlementOverridesService from "./entitlement-overrides-service";
export * as usageEventService from "./usage-event-service";
export * as entitlementService from "./entitlement-service";
