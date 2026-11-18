-- Lead-capture fields collected at signup (name/phone/company/referral
-- source) so sales can follow up and so the signup-notification email has
-- something worth reading. Nullable at the DB level because the 9 existing
-- rows predate this -- "required" is enforced in the registration form for
-- new signups only, same pattern as every other required-but-nullable field
-- in this schema. phone and company_name are plain text (no format
-- validation at the DB layer, same as email elsewhere in this table).
alter table profiles add column phone text;
alter table profiles add column company_name text;
alter table profiles add column referral_source text;
