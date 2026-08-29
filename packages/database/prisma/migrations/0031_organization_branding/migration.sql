-- Per-college branding: name, logo and one accent colour.
--
-- A college opening the LMS should recognise it as theirs. Deliberately three
-- columns and not a stylesheet: colleges get their identity, the product stays
-- readable, and nothing a customer types can break a page.
--
-- All nullable and additive. Existing organisations keep the product's own
-- look, which is what the internal academy should keep anyway.
ALTER TABLE "organizations" ADD COLUMN "displayName" TEXT;
ALTER TABLE "organizations" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "organizations" ADD COLUMN "primaryColor" TEXT;
