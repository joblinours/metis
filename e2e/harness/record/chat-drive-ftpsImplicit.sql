PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('a4fdb06c-67a5-47df-889c-ee2e7a24e292','7f765568-8c0d-56ce-8b89-105126fefedf','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',12727,1244,13971,0,0,0,4,'stop','2e6a1c36-4b66-4e11-8df1-be5af771e249',1792940782059);
COMMIT;
