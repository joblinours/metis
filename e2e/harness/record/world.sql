PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "mail_mute" ("id","user_id","mailbox_id","thread_id","created_at") VALUES ('a0d90b6f-d8d8-4870-a74e-64efb5a75d3a','7f765568-8c0d-56ce-8b89-105126fefedf','4c045289-9c42-53f9-a3d7-2dfac727d3d0','<e2e-otp-0001@harness.test>',1793063871600);
INSERT INTO "mail_read_later" ("id","user_id","mailbox_id","message_id","created_at") VALUES ('805464e1-2487-40f2-8a44-f97bb755b3bc','7f765568-8c0d-56ce-8b89-105126fefedf','4c045289-9c42-53f9-a3d7-2dfac727d3d0','WyJJTkJPWCIsIjEwMDAiLDI4MV0',1793063871600);
COMMIT;
