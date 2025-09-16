-- =====================================================
-- MYSQL WORKBENCH SYNC COMMANDS
-- Run these commands to sync your database with updated models.py
-- =====================================================

-- 1. CREATE MISSING TABLES
-- =====================================================


-- =====================================================
-- 2. ENHANCE EXISTING TABLES
-- =====================================================

-- Add missing columns to ticket_feedback (if they don't exist)
ALTER TABLE ticket_feedback
ADD COLUMN attempt_id INT NULL,
ADD COLUMN user_email VARCHAR(255) NULL,
ADD COLUMN feedback_type VARCHAR(20) NULL,
ADD COLUMN reason VARCHAR(255) NULL,
ADD COLUMN resolved_by INT NULL,
ADD COLUMN resolved_at DATETIME NULL;

-- Add foreign key constraints for ticket_feedback (check if they exist first)
-- For attempt_id
SET @constraint_exists = (
    SELECT COUNT(*) 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'ticket_feedback' 
      AND COLUMN_NAME = 'attempt_id'
      AND REFERENCED_TABLE_NAME = 'resolution_attempts'
);

SET @sql_attempt = IF(@constraint_exists = 0, 
    'ALTER TABLE ticket_feedback ADD CONSTRAINT fk_ticket_feedback_attempt FOREIGN KEY (attempt_id) REFERENCES resolution_attempts(id) ON DELETE SET NULL',
    'SELECT "attempt_id FK already exists" as message'
);
PREPARE stmt FROM @sql_attempt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- For resolved_by
SET @constraint_exists = (
    SELECT COUNT(*) 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'ticket_feedback' 
      AND COLUMN_NAME = 'resolved_by'
      AND REFERENCED_TABLE_NAME = 'agents'
);

SET @sql_resolved = IF(@constraint_exists = 0,
    'ALTER TABLE ticket_feedback ADD CONSTRAINT fk_ticket_feedback_resolved_by FOREIGN KEY (resolved_by) REFERENCES agents(id) ON DELETE SET NULL',
    'SELECT "resolved_by FK already exists" as message'
);
PREPARE stmt FROM @sql_resolved;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- 3. ADD PERFORMANCE INDEXES
-- =====================================================

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_resolved_by ON tickets(resolved_by);
CREATE INDEX IF NOT EXISTS idx_tickets_archived ON tickets(archived);
CREATE INDEX IF NOT EXISTS idx_messages_ticket_id ON messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_escalation_summaries_ticket_id ON escalation_summaries(ticket_id);

-- =====================================================
-- 4. DATA FIXES
-- =====================================================

-- Fix existing tickets with missing resolved_by (one-time fix)
UPDATE tickets t 
JOIN ticket_events e ON t.id = e.ticket_id 
SET t.resolved_by = e.actor_agent_id 
WHERE t.status IN ('closed', 'resolved') 
  AND t.resolved_by IS NULL 
  AND e.event_type IN ('CLOSED', 'RESOLVED') 
  AND e.actor_agent_id IS NOT NULL;

-- =====================================================
-- 5. OPTIONAL: REMOVE UNUSED COLUMNS
-- =====================================================
-- UNCOMMENT THESE ONLY IF YOU WANT TO PERMANENTLY REMOVE UNUSED COLUMNS

-- Remove unused columns from solutions table
-- ALTER TABLE solutions DROP COLUMN IF EXISTS ai_contribution_pct;
-- ALTER TABLE solutions DROP COLUMN IF EXISTS ai_confidence;
-- ALTER TABLE solutions DROP COLUMN IF EXISTS normalized_text;
-- ALTER TABLE solutions DROP COLUMN IF EXISTS fingerprint_sha256;
-- ALTER TABLE solutions DROP COLUMN IF EXISTS confirmed_by_user;
-- ALTER TABLE solutions DROP COLUMN IF EXISTS confirmed_at;
-- ALTER TABLE solutions DROP COLUMN IF EXISTS confirmed_ip;
-- ALTER TABLE solutions DROP COLUMN IF EXISTS confirmed_via;
-- ALTER TABLE solutions DROP COLUMN IF EXISTS dedup_score;
-- ALTER TABLE solutions DROP COLUMN IF EXISTS published_article_id;

-- Remove unused columns from kb_articles table
-- ALTER TABLE kb_articles DROP COLUMN IF EXISTS environment_json;
-- ALTER TABLE kb_articles DROP COLUMN IF EXISTS origin_ticket_id;
-- ALTER TABLE kb_articles DROP COLUMN IF EXISTS origin_solution_id;
-- ALTER TABLE kb_articles DROP COLUMN IF EXISTS ai_contribution_pct;
-- ALTER TABLE kb_articles DROP COLUMN IF EXISTS embedding_model;
-- ALTER TABLE kb_articles DROP COLUMN IF EXISTS embedding_hash;
-- ALTER TABLE kb_articles DROP COLUMN IF EXISTS faiss_id;

-- =====================================================
-- 6. OPTIONAL: DROP UNUSED TABLES
-- =====================================================
-- UNCOMMENT THESE ONLY IF YOU'RE SURE YOU DON'T NEED THEM
-- WARNING: This will permanently delete data!

use tickets;
DROP TABLE IF EXISTS ticket_watchers;
DROP TABLE IF EXISTS ticket_assignments;
DROP TABLE IF EXISTS kb_index;
DROP TABLE IF EXISTS kb_audit;
DROP TABLE IF EXISTS kb_drafts;
DROP TABLE IF EXISTS kb_article_versions;

-- =====================================================
-- 7. VERIFICATION QUERIES
-- =====================================================

-- Check if escalation_summaries table exists and is working
SELECT 'Checking escalation_summaries table...' as status;
SELECT COUNT(*) as escalation_summaries_count FROM escalation_summaries;

-- Check resolved_by usage in tickets
SELECT 'Checking resolved_by field usage...' as status;
SELECT 
    COUNT(*) as total_closed_tickets,
    SUM(CASE WHEN resolved_by IS NOT NULL THEN 1 ELSE 0 END) as with_resolved_by,
    SUM(CASE WHEN resolved_by IS NULL THEN 1 ELSE 0 END) as missing_resolved_by
FROM tickets 
WHERE status IN ('closed', 'resolved');

-- Check ticket_feedback enhanced columns
SELECT 'Checking ticket_feedback table structure...' as status;
DESCRIBE ticket_feedback;

-- Check assignment tracking
SELECT 'Checking assignment tracking...' as status;
SELECT 
    COUNT(*) as total_tickets,
    SUM(CASE WHEN assigned_to IS NOT NULL THEN 1 ELSE 0 END) as with_assigned_to,
    SUM(CASE WHEN owner IS NOT NULL THEN 1 ELSE 0 END) as with_owner
FROM tickets;

-- Show table status for main tables
SELECT 'Final table status check...' as status;
SELECT 
    TABLE_NAME,
    TABLE_ROWS,
    CREATE_TIME,
    UPDATE_TIME
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'tickets', 'escalation_summaries', 'ticket_feedback', 
    'ticket_events', 'agents', 'departments', 'solutions'
  )
ORDER BY TABLE_ROWS DESC;

SELECT '✅ Database sync completed successfully!' as result;
