-- Backward-compatibility for older deployments that still reference `point_award_jobs`.
-- We renamed the table to `sweet_coin_award_jobs` in 20250113000000_rename_points_to_sweet_coins.
-- Creating an updatable view keeps old workers running while new code uses the new table name.

DO $$
BEGIN
  IF to_regclass('public.sweet_coin_award_jobs') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW "point_award_jobs" AS SELECT * FROM "sweet_coin_award_jobs"';
  END IF;
END $$;
