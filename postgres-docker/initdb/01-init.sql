-- The official entrypoint creates POSTGRES_USER and POSTGRES_DB.
-- Add project-specific initial SQL here if needed.
-- Existing Floor Shift Manager tables are created by: python -m app.manage migrate
SELECT 'PostgreSQL initialization completed' AS message;
