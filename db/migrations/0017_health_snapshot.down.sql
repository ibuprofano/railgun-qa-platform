-- Reverses 0017_health_snapshot.up.sql. Recorded history is lost; the trend falls back
-- to recomputed days.

REVOKE SELECT ON test_run FROM railgun_worker;
DROP TABLE IF EXISTS health_snapshot;
