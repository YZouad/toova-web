-- DEPRECATED: do not re-run.
-- This historically opened model-files SELECT to every authenticated user.
-- Replaced by security_hardening_public_catalog_and_shares.sql which allows:
--   owner folder + public catalog assets + public room assets only.
-- Share access is token-bound via the sign-share-assets edge function.

-- Intentionally empty (kept so old docs/links do not 404).
SELECT 1;
