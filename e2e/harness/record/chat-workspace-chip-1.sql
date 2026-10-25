PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('f499e3ac-75f4-4120-9494-b46b996243a2','7f765568-8c0d-56ce-8b89-105126fefedf','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',7349,817,8166,0,0,0,2,'stop','571a8df5-9e50-4166-8754-151c51a8c33e',1792940852105);
COMMIT;
