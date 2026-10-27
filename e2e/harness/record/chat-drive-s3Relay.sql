PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('db2c5b77-2d8e-4814-89bb-e51e9ebdcb74','7f765568-8c0d-56ce-8b89-105126fefedf','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',13633,2488,16121,0,0,0,4,'stop','6f955b0a-4e8c-43c6-b20e-8809d5bbe962',1793063914884);
COMMIT;
