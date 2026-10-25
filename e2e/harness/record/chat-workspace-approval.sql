PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('a7335669-79d4-462b-b240-4ac5d613f33d','7f765568-8c0d-56ce-8b89-105126fefedf','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',19693,1120,20813,0,0,0,4,'stop','3eb251ea-10db-4c54-875a-90775dafac16',1792940886178);
COMMIT;
