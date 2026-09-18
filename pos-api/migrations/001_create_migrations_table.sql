-- Baseline: create the migrations tracking table.
-- All future schema changes go in new numbered files.
CREATE TABLE IF NOT EXISTS migrations (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
