-- Run in pgAdmin on database vip_limousine_cars
-- User: Saleh (regular user, not admin) — login: saleh / 1234

INSERT INTO users (id, username, password_hash, display_name, role, active, created_at, updated_at)
VALUES (
  'a0000002-0002-4002-8002-000000000002',
  'saleh',
  '38ef7d01839e7aef1b70bfa6e42c0182:da9f6649ef7cb905309f068de1b5321a7508ab05ccf6d7ee1935090214ed132c603526f799b8f81e908ff80f645cbfe09d0ec417eb37f271270a842048ffe742',
  'Saleh',
  'user',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  display_name = EXCLUDED.display_name,
  role = 'user',
  active = TRUE,
  updated_at = NOW();
