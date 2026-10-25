PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('6e825d4b-ca4c-4fb6-89c7-8157f19373de','7f765568-8c0d-56ce-8b89-105126fefedf','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',12791,1365,14156,0,0,0,4,'stop','bf70bafb-6144-4066-9881-15f3421f0db7',1792940779117);
COMMIT;
