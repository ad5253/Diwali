ALTER TABLE sales ADD COLUMN kind TEXT NOT NULL DEFAULT 'sale';
ALTER TABLE sales ADD COLUMN n INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS sales_date ON sales(date);
UPDATE settings SET key='day1:2026' WHERE key='day1';
UPDATE settings SET key='target:2026' WHERE key='target';
INSERT OR REPLACE INTO settings(key,value) VALUES ('diwali:2026','2026-11-08');
INSERT OR REPLACE INTO settings(key,value) VALUES ('diwali:2025','2025-10-20');
INSERT OR REPLACE INTO settings(key,value) VALUES ('diwali:2024','2024-10-31');
INSERT OR REPLACE INTO settings(key,value) VALUES ('diwali:2023','2023-11-12');
