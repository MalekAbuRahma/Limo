-- Run in pgAdmin / psql on database: vip_limousine_cars
-- Creates or updates admin user:  username admin  |  password 1234

INSERT INTO users (id, username, password_hash, display_name, role, active, created_at, updated_at)
VALUES (
  'a0000001-0001-4001-8001-000000000001',
  'admin',
  'd6ddd53d0a214496adf2a4216b4bc195:c3e8ae1169e83a74319bcaafa84f8a1d21e8c5c0ad0993dc229c5bdce4798c82a0e0d2807a19f48559bea15c0d9f384b03620933feef701befbece0bf796d4a2',
  'مدير النظام',
  'admin',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = 'admin',
  active = TRUE,
  display_name = EXCLUDED.display_name,
  updated_at = NOW();
