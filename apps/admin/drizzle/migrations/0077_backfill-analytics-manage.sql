INSERT INTO "admin"."role_definition_permissions" ("role_id", "permission")
SELECT "role_id", 'analytics_manage'::"admin"."admin_role_permission"
FROM "admin"."role_definition_permissions"
WHERE "permission" = 'ops_view'::"admin"."admin_role_permission"
ON CONFLICT ("role_id", "permission") DO NOTHING;
