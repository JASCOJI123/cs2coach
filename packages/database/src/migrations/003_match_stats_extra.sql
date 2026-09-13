ALTER TABLE player_statistics ADD COLUMN IF NOT EXISTS headshots int NOT NULL DEFAULT 0;
ALTER TABLE player_statistics ADD COLUMN IF NOT EXISTS headshots_percent double precision;
ALTER TABLE player_statistics ADD COLUMN IF NOT EXISTS total_damage int NOT NULL DEFAULT 0;
ALTER TABLE player_statistics ADD COLUMN IF NOT EXISTS mvps int NOT NULL DEFAULT 0;
ALTER TABLE player_statistics ADD COLUMN IF NOT EXISTS triple_kills int NOT NULL DEFAULT 0;
ALTER TABLE player_statistics ADD COLUMN IF NOT EXISTS quadro_kills int NOT NULL DEFAULT 0;
ALTER TABLE player_statistics ADD COLUMN IF NOT EXISTS ace_kills int NOT NULL DEFAULT 0;
