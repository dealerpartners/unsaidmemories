-- Removes the hold_reason column added by
-- 20261104100000_fulfillment_order_hold_reason.sql; the offer-routing
-- change it served was reverted — a published product fulfills
-- through the supplier it was published with.
alter table fulfillment_orders
  drop column if exists hold_reason;
