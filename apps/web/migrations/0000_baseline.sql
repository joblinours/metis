CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`workspace_id` text,
	`feature` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`steps` integer DEFAULT 1 NOT NULL,
	`finish_reason` text,
	`run_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_usage_user_created_idx` ON `ai_usage` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_workspace_created_idx` ON `ai_usage` (`workspace_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_feature_created_idx` ON `ai_usage` (`feature`,`created_at`);
--> statement-breakpoint
CREATE TABLE `audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`action` text NOT NULL,
	`via` text NOT NULL,
	`mcp_client_id` text,
	`actor_user_id` text,
	`actor_email` text NOT NULL,
	`workspace_id` text,
	`workspace_name` text,
	`target_user_id` text,
	`target_label` text,
	`resource_kind` text,
	`detail` text NOT NULL,
	`ip` text,
	`user_agent` text,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_event_created_idx` ON `audit_event` (`created_at`);
--> statement-breakpoint
CREATE INDEX `audit_event_actor_created_idx` ON `audit_event` (`actor_user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `audit_event_target_created_idx` ON `audit_event` (`target_user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `audit_event_workspace_created_idx` ON `audit_event` (`workspace_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `calendar` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_sync_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_connection_idx` ON `calendar` (`connection_id`);
--> statement-breakpoint
CREATE TABLE `calendar_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`visible_calendar_ids` text DEFAULT '[]' NOT NULL,
	`ai_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendar`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calendar_workspace_calendar_idx` ON `calendar_workspace` (`calendar_id`);
--> statement-breakpoint
CREATE INDEX `calendar_workspace_workspace_idx` ON `calendar_workspace` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_workspace_calendar_workspace_idx` ON `calendar_workspace` (`calendar_id`,`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_workspace_workspace_slug_idx` ON `calendar_workspace` (`workspace_id`,`slug`);
--> statement-breakpoint
CREATE TABLE `connection` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`image` text,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`credentials` text,
	`server` text,
	`server_name` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`quarantined_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `connection_user_idx` ON `connection` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `connection_user_provider_account_idx` ON `connection` (`user_id`,`provider`,`provider_account_id`);
--> statement-breakpoint
CREATE TABLE `drive` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_sync_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_connection_idx` ON `drive` (`connection_id`);
--> statement-breakpoint
CREATE TABLE `drive_pin` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`drive_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`drive_id`) REFERENCES `drive`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drive_pin_user_idx` ON `drive_pin` (`user_id`);
--> statement-breakpoint
CREATE INDEX `drive_pin_drive_idx` ON `drive_pin` (`drive_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_pin_user_drive_folder_idx` ON `drive_pin` (`user_id`,`drive_id`,`folder_id`);
--> statement-breakpoint
CREATE TABLE `drive_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`drive_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`visible_root_ids` text DEFAULT '[]' NOT NULL,
	`ai_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`drive_id`) REFERENCES `drive`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drive_workspace_drive_idx` ON `drive_workspace` (`drive_id`);
--> statement-breakpoint
CREATE INDEX `drive_workspace_workspace_idx` ON `drive_workspace` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_workspace_drive_workspace_idx` ON `drive_workspace` (`drive_id`,`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_workspace_workspace_slug_idx` ON `drive_workspace` (`workspace_id`,`slug`);
--> statement-breakpoint
CREATE TABLE `instance_config` (
	`version` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_current` integer NOT NULL,
	`changed_keys` text NOT NULL,
	`kind` text NOT NULL,
	`reverted_from_version` integer,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`llm_driver` text NOT NULL,
	`llm_api_key` text,
	`llm_base_url` text,
	`llm_name` text,
	`llm_structured_outputs` integer,
	`llm_chat_model` text,
	`llm_smart_reply_model` text,
	`llm_classifier_model` text,
	`llm_summary_model` text,
	`llm_summary_vision` integer,
	`decision_driver` text,
	`decision_model` text,
	`decision_base_url` text,
	`decision_api_key` text,
	`decision_classifier` integer,
	`decision_summary_gate` integer,
	`decision_workflow_node` integer,
	`decision_classifier_batch` integer,
	`phishing_driver` text NOT NULL,
	`phishing_backend_url` text,
	`mail_driver` text NOT NULL,
	`mail_from` text,
	`mail_from_auth` text,
	`mail_from_invite` text,
	`mail_resend_api_key` text,
	`mail_smtp_url` text,
	`mail_smtp_host` text,
	`mail_smtp_port` integer,
	`mail_smtp_user` text,
	`mail_smtp_pass` text,
	`mail_smtp_secure` integer,
	`mail_console_url` text,
	`mail_console_token` text,
	`signup_disabled` integer NOT NULL,
	`legal_terms_url` text,
	`legal_privacy_url` text,
	`legal_version` text NOT NULL,
	`relay_max_mb` integer NOT NULL,
	`relay_concurrency` integer NOT NULL,
	`image_proxy_enabled` integer,
	`image_proxy_max_mb` real,
	`cache_driver` text NOT NULL,
	`cache_url` text,
	`cache_token` text,
	`runner_driver` text NOT NULL,
	`runner_cadence_sec` integer NOT NULL,
	`runner_tick_budget_ms` integer NOT NULL,
	`runner_batch_size` integer NOT NULL,
	`runner_concurrency` integer NOT NULL,
	`runner_redis_url` text,
	`runner_queue_prefix` text,
	`runner_cron_secret` text,
	`google_client_id` text,
	`google_client_secret` text,
	`microsoft_client_id` text,
	`microsoft_client_secret` text,
	`zoho_client_id` text,
	`zoho_client_secret` text,
	`zoho_region` text NOT NULL,
	`servers` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instance_config_current_idx` ON `instance_config` (`is_current`) WHERE "instance_config"."is_current" = 1;
--> statement-breakpoint
CREATE TABLE `legal_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`terms_url` text,
	`privacy_url` text,
	`version` text NOT NULL,
	`consented_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `legal_consent_user_idx` ON `legal_consent` (`user_id`);
--> statement-breakpoint
CREATE INDEX `legal_consent_email_idx` ON `legal_consent` (`email`);
--> statement-breakpoint
CREATE TABLE `mail_label` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`message_id` text NOT NULL,
	`label` text NOT NULL,
	`confidence` integer DEFAULT 50 NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`set_by_user_id` text,
	`classified_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mail_label_mailbox_idx` ON `mail_label` (`mailbox_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_label_mailbox_message_idx` ON `mail_label` (`mailbox_id`,`message_id`);
--> statement-breakpoint
CREATE TABLE `mail_message` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`thread_id` text,
	`sender` text NOT NULL,
	`sender_email` text,
	`subject` text NOT NULL,
	`snippet` text,
	`body_text` text,
	`body_html` text,
	`analysis_result` text,
	`is_read` integer DEFAULT false NOT NULL,
	`received_at` integer NOT NULL,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_message_mailbox_idx` ON `mail_message` (`mailbox_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_message_mailbox_msg_idx` ON `mail_message` (`mailbox_id`,`provider_message_id`);
--> statement-breakpoint
CREATE TABLE `mail_mute` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_mute_user_idx` ON `mail_mute` (`user_id`);
--> statement-breakpoint
CREATE INDEX `mail_mute_mailbox_idx` ON `mail_mute` (`mailbox_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_mute_user_mailbox_thread_idx` ON `mail_mute` (`user_id`,`mailbox_id`,`thread_id`);
--> statement-breakpoint
CREATE TABLE `mail_read_later` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`message_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_read_later_user_idx` ON `mail_read_later` (`user_id`);
--> statement-breakpoint
CREATE INDEX `mail_read_later_mailbox_idx` ON `mail_read_later` (`mailbox_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_read_later_user_mailbox_msg_idx` ON `mail_read_later` (`user_id`,`mailbox_id`,`message_id`);
--> statement-breakpoint
CREATE TABLE `mail_remote_allow` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_remote_allow_user_kind_value_idx` ON `mail_remote_allow` (`user_id`,`kind`,`value`);
--> statement-breakpoint
CREATE TABLE `mail_thread_summary` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`thread_key` text NOT NULL,
	`summary` text NOT NULL,
	`message_count` integer NOT NULL,
	`last_message_id` text NOT NULL,
	`increment_count` integer DEFAULT 0 NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_thread_summary_mailbox_idx` ON `mail_thread_summary` (`mailbox_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_thread_summary_mailbox_thread_idx` ON `mail_thread_summary` (`mailbox_id`,`thread_key`);
--> statement-breakpoint
CREATE TABLE `mail_unsubscribe` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`unsubscribed_by_user_id` text,
	`sender_email` text NOT NULL,
	`sender_name` text,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unsubscribed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mail_unsubscribe_mailbox_idx` ON `mail_unsubscribe` (`mailbox_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_unsubscribe_mailbox_sender_idx` ON `mail_unsubscribe` (`mailbox_id`,`sender_email`);
--> statement-breakpoint
CREATE TABLE `mailbox` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_sync_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_connection_idx` ON `mailbox` (`connection_id`);
--> statement-breakpoint
CREATE TABLE `mailbox_label` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`created_by_user_id` text,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mailbox_label_mailbox_idx` ON `mailbox_label` (`mailbox_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_label_mailbox_key_idx` ON `mailbox_label` (`mailbox_id`,`key`);
--> statement-breakpoint
CREATE TABLE `mailbox_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`ai_enabled` integer DEFAULT false NOT NULL,
	`phishing_detection_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mailbox_workspace_mailbox_idx` ON `mailbox_workspace` (`mailbox_id`);
--> statement-breakpoint
CREATE INDEX `mailbox_workspace_workspace_idx` ON `mailbox_workspace` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_workspace_mailbox_workspace_idx` ON `mailbox_workspace` (`mailbox_id`,`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_workspace_workspace_slug_idx` ON `mailbox_workspace` (`workspace_id`,`slug`);
--> statement-breakpoint
CREATE TABLE `mcp_client` (
	`client_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`slug` text NOT NULL,
	`preset` text,
	`enabled` integer DEFAULT true NOT NULL,
	`capabilities` text DEFAULT '{}' NOT NULL,
	`hidden_workspace_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mcp_client_user_idx` ON `mcp_client` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_client_user_slug_idx` ON `mcp_client` (`user_id`,`slug`);
--> statement-breakpoint
CREATE TABLE `preflight_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ran_at` integer NOT NULL,
	`config_version` integer NOT NULL,
	`warnings` text NOT NULL,
	`acknowledged_at` integer,
	`acknowledged_by_user_id` text,
	FOREIGN KEY (`acknowledged_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `saved_search` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_search_user_workspace_idx` ON `saved_search` (`user_id`,`workspace_id`);
--> statement-breakpoint
CREATE TABLE `schema_migration` (
	`id` text PRIMARY KEY NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signup_invite` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`accepted_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signup_invite_token_hash_idx` ON `signup_invite` (`token_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `signup_invite_pending_email_idx` ON `signup_invite` (`email`) WHERE "signup_invite"."accepted_at" is null;
--> statement-breakpoint
CREATE INDEX `signup_invite_email_idx` ON `signup_invite` (`email`);
--> statement-breakpoint
CREATE INDEX `signup_invite_invited_by_idx` ON `signup_invite` (`invited_by`);
--> statement-breakpoint
CREATE TABLE `user_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`workspace_order` text DEFAULT '[]' NOT NULL,
	`mail_remote_content` text DEFAULT 'block' NOT NULL,
	`mail_clean_links` integer DEFAULT true NOT NULL,
	`sign_in_alerts` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workflow` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`workspace_id` text,
	`principal_user_id` text,
	`mailbox_id` text,
	`origin_link_id` text,
	`name` text NOT NULL,
	`target_key` text,
	`enabled` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`principal_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`origin_link_id`) REFERENCES `mailbox_workspace`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workflow_user_scope_ck" CHECK("workflow"."kind" <> 'user' OR ("workflow"."workspace_id" IS NOT NULL AND "workflow"."principal_user_id" IS NOT NULL)),
	CONSTRAINT "workflow_mail_builtin_scope_ck" CHECK("workflow"."kind" NOT IN ('scheduled-send', 'snooze') OR ("workflow"."mailbox_id" IS NOT NULL AND "workflow"."principal_user_id" IS NOT NULL)),
	CONSTRAINT "workflow_system_scope_ck" CHECK("workflow"."kind" <> 'system' OR ("workflow"."workspace_id" IS NULL AND "workflow"."principal_user_id" IS NULL AND "workflow"."mailbox_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `workflow_workspace_idx` ON `workflow` (`workspace_id`,`kind`);
--> statement-breakpoint
CREATE INDEX `workflow_mailbox_idx` ON `workflow` (`mailbox_id`,`kind`);
--> statement-breakpoint
CREATE INDEX `workflow_principal_idx` ON `workflow` (`principal_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_live_target_idx` ON `workflow` (`mailbox_id`,`kind`,`target_key`) WHERE "workflow"."target_key" IS NOT NULL AND "workflow"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE `workflow_node_run` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`input_key` text NOT NULL,
	`branch` text,
	`status` text NOT NULL,
	`output` text,
	`output_handles` text,
	`receipt` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`resolution` text,
	`resolved_by_user_id` text,
	`resolved_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `workflow_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_node_run_identity_idx` ON `workflow_node_run` (`run_id`,`node_id`,`input_key`);
--> statement-breakpoint
CREATE INDEX `workflow_node_run_run_idx` ON `workflow_node_run` (`run_id`);
--> statement-breakpoint
CREATE TABLE `workflow_occurrence` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`trigger_id` text NOT NULL,
	`key` text NOT NULL,
	`scheduled_for` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trigger_id`) REFERENCES `workflow_trigger`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_occurrence_key_idx` ON `workflow_occurrence` (`trigger_id`,`key`);
--> statement-breakpoint
CREATE INDEX `workflow_occurrence_workflow_idx` ON `workflow_occurrence` (`workflow_id`);
--> statement-breakpoint
CREATE TABLE `workflow_payload` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_payload_workflow_idx` ON `workflow_payload` (`workflow_id`);
--> statement-breakpoint
CREATE TABLE `workflow_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`node_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`mailbox_workspace_id` text,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `workflow_revision`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_workspace_id`) REFERENCES `mailbox_workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_resource_node_idx` ON `workflow_resource` (`revision_id`,`node_id`);
--> statement-breakpoint
CREATE INDEX `workflow_resource_mailbox_idx` ON `workflow_resource` (`mailbox_id`);
--> statement-breakpoint
CREATE TABLE `workflow_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`revision` integer NOT NULL,
	`graph` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_revision_number_idx` ON `workflow_revision` (`workflow_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `workflow_run` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`occurrence_id` text NOT NULL,
	`kind` text NOT NULL,
	`workspace_id` text,
	`principal_user_id` text,
	`input` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`due_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_owner` text,
	`lease_token` text,
	`lease_expires_at` integer,
	`started_at` integer,
	`finished_at` integer,
	`blocked_at` integer,
	`error` text,
	`summary` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `workflow_revision`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`occurrence_id`) REFERENCES `workflow_occurrence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`principal_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_run_occurrence_idx` ON `workflow_run` (`occurrence_id`);
--> statement-breakpoint
CREATE INDEX `workflow_run_due_idx` ON `workflow_run` (`status`,`due_at`);
--> statement-breakpoint
CREATE INDEX `workflow_run_workflow_idx` ON `workflow_run` (`workflow_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `workflow_run_workspace_idx` ON `workflow_run` (`workspace_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `workflow_tick` (
	`id` text PRIMARY KEY NOT NULL,
	`last_discovery_at` integer,
	`next_check_at` integer,
	`lease_owner` text,
	`lease_token` text,
	`lease_expires_at` integer,
	`last_error` text,
	`last_tick_at` integer,
	`last_success_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_trigger` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`node_id` text NOT NULL,
	`kind` text NOT NULL,
	`cron` text,
	`timezone` text DEFAULT 'Etc/UTC' NOT NULL,
	`armed` integer DEFAULT true NOT NULL,
	`next_due_at` integer,
	`baseline_at` integer,
	`cursor` text,
	`claimed_at` integer,
	`claim_token` text,
	`last_run_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `workflow_revision`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_trigger_node_idx` ON `workflow_trigger` (`workflow_id`,`node_id`);
--> statement-breakpoint
CREATE INDEX `workflow_trigger_due_idx` ON `workflow_trigger` (`armed`,`next_due_at`);
--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`ai_policy` text DEFAULT 'optional' NOT NULL,
	`phishing_detection_policy` text DEFAULT 'optional' NOT NULL,
	`branding` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_slug_idx` ON `workspace` (`slug`);
--> statement-breakpoint
CREATE TABLE `workspace_invite` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invite_token_hash_idx` ON `workspace_invite` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `workspace_invite_workspace_idx` ON `workspace_invite` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `workspace_invite_email_idx` ON `workspace_invite` (`email`);
--> statement-breakpoint
CREATE TABLE `workspace_member` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`invited_by` text,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_member_workspace_user_idx` ON `workspace_member` (`workspace_id`,`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_member_one_owner_idx` ON `workspace_member` (`workspace_id`) WHERE "workspace_member"."role" = 'owner';
--> statement-breakpoint
CREATE INDEX `workspace_member_user_idx` ON `workspace_member` (`user_id`);
--> statement-breakpoint
CREATE INDEX `workspace_member_workspace_idx` ON `workspace_member` (`workspace_id`);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);
--> statement-breakpoint
CREATE TABLE `jwks` (
	`id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`alg` text,
	`crv` text
);
--> statement-breakpoint
CREATE TABLE `oauth_access_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`refresh_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refresh_id`) REFERENCES `oauth_refresh_token`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_access_token_token_unique` ON `oauth_access_token` (`token`);
--> statement-breakpoint
CREATE INDEX `oauthAccessToken_clientId_idx` ON `oauth_access_token` (`client_id`);
--> statement-breakpoint
CREATE INDEX `oauthAccessToken_sessionId_idx` ON `oauth_access_token` (`session_id`);
--> statement-breakpoint
CREATE INDEX `oauthAccessToken_userId_idx` ON `oauth_access_token` (`user_id`);
--> statement-breakpoint
CREATE INDEX `oauthAccessToken_authorizationCodeId_idx` ON `oauth_access_token` (`authorization_code_id`);
--> statement-breakpoint
CREATE INDEX `oauthAccessToken_refreshId_idx` ON `oauth_access_token` (`refresh_id`);
--> statement-breakpoint
CREATE TABLE `oauth_client` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text,
	`client_discovery_id` text,
	`disabled` integer DEFAULT false,
	`skip_consent` integer,
	`enable_end_session` integer,
	`subject_type` text,
	`scopes` text,
	`client_credentials_scopes` text DEFAULT '[]',
	`user_id` text,
	`created_at` integer,
	`updated_at` integer,
	`name` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`software_id` text,
	`software_version` text,
	`software_statement` text,
	`redirect_uris` text NOT NULL,
	`post_logout_redirect_uris` text,
	`backchannel_logout_uri` text,
	`backchannel_logout_session_required` integer,
	`token_endpoint_auth_method` text,
	`application_type` text,
	`jwks` text,
	`jwks_uri` text,
	`grant_types` text,
	`response_types` text,
	`require_pkce` integer,
	`dpop_bound_access_tokens` integer DEFAULT false,
	`reference_id` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_client_client_id_unique` ON `oauth_client` (`client_id`);
--> statement-breakpoint
CREATE INDEX `oauthClient_userId_idx` ON `oauth_client` (`user_id`);
--> statement-breakpoint
CREATE TABLE `oauth_client_assertion` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_client_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `oauth_resource`(`identifier`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClientResource_clientId_resourceId_uidx` ON `oauth_client_resource` (`client_id`,`resource_id`);
--> statement-breakpoint
CREATE INDEX `oauthClientResource_clientId_idx` ON `oauth_client_resource` (`client_id`);
--> statement-breakpoint
CREATE INDEX `oauthClientResource_resourceId_idx` ON `oauth_client_resource` (`resource_id`);
--> statement-breakpoint
CREATE TABLE `oauth_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauthConsent_clientId_idx` ON `oauth_consent` (`client_id`);
--> statement-breakpoint
CREATE INDEX `oauthConsent_userId_idx` ON `oauth_consent` (`user_id`);
--> statement-breakpoint
CREATE TABLE `oauth_refresh_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`rotated_at` integer,
	`rotation_replay_response` text,
	`rotation_replay_expires_at` integer,
	`auth_time` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_refresh_token_token_unique` ON `oauth_refresh_token` (`token`);
--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_clientId_idx` ON `oauth_refresh_token` (`client_id`);
--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_sessionId_idx` ON `oauth_refresh_token` (`session_id`);
--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_userId_idx` ON `oauth_refresh_token` (`user_id`);
--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_authorizationCodeId_idx` ON `oauth_refresh_token` (`authorization_code_id`);
--> statement-breakpoint
CREATE TABLE `oauth_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`access_token_ttl` integer,
	`refresh_token_ttl` integer,
	`signing_algorithm` text,
	`signing_key_id` text,
	`allowed_scopes` text,
	`custom_claims` text,
	`dpop_bound_access_tokens_required` integer DEFAULT false,
	`disabled` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	`policy_version` integer DEFAULT 1,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_resource_identifier_unique` ON `oauth_resource` (`identifier`);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);
--> statement-breakpoint
CREATE TABLE `two_factor` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`user_id` text NOT NULL,
	`verified` integer DEFAULT true,
	`failed_verification_count` integer DEFAULT 0,
	`locked_until` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `twoFactor_secret_idx` ON `two_factor` (`secret`);
--> statement-breakpoint
CREATE INDEX `twoFactor_userId_idx` ON `two_factor` (`user_id`);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`two_factor_enabled` integer DEFAULT false,
	`subscription_status` text DEFAULT 'not-created',
	`dodo_customer_id` text,
	`dodo_subscription_id` text,
	`subscription_product_id` text,
	`subscription_updated_at` integer,
	`default_workspace_slug` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
