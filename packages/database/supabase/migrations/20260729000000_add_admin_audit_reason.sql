-- Plan doc section 6 (schema) omitted "reason" from admin_audit_logs, but
-- section 12 (audit trail requirements) explicitly requires it on every
-- sensitive admin action. Adding it here rather than leaving the two
-- sections of the doc inconsistent.
alter table public.admin_audit_logs add column reason text;
