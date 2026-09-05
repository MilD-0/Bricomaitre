UPDATE "admin"."accounts"
SET "issuer" = 'https://accounts.google.com',
    "updated_at" = now()
WHERE "provider" = 'google'
  AND "issuer" = 'local:oauth:google';
