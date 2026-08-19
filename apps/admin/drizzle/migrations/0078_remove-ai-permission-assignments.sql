DELETE FROM "admin"."role_definition_permissions"
WHERE "permission"::text IN (
  'ai_use',
  'ai_catalog_propose',
  'ai_catalog_apply',
  'ai_analytics_query',
  'ai_pricing_analyze',
  'ai_pricing_apply',
  'ai_landing_publish'
);
