CREATE TABLE IF NOT EXISTS permission_grants (
  capability TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL CHECK(decision IN ('ALLOWED_ALWAYS')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (capability, target)
);
