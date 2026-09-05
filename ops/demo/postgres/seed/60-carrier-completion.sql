-- The generators use 10 to distinguish delivered-but-unpaid cohorts while
-- constructing settlement evidence. The canonical order status is COMPLETED
-- for both paid and unpaid deliveries; MANUAL_COMPLETED is a human override.
UPDATE order_status_history history SET status = 4
FROM orders
WHERE history.order_id = orders.id AND history.status = 10
  AND orders.confirmed = 10 AND orders.ecotrack_status = 'livre_non_encaisse';

UPDATE orders SET confirmed = 4
WHERE confirmed = 10 AND ecotrack_status = 'livre_non_encaisse';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM orders
    WHERE ecotrack_status IN ('livre_non_encaisse', 'payed') AND confirmed <> 4
  ) THEN
    RAISE EXCEPTION 'Carrier completion must agree with canonical order status';
  END IF;
END $$;
