PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('b9c9d9d6-62ae-4d0f-83a2-992abe941f1d','7f765568-8c0d-56ce-8b89-105126fefedf','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',11917,1294,13211,0,0,0,4,'stop','fc92c602-c1c1-4c1d-a8d0-10b7842c73a9',1792374068865);
COMMIT;
