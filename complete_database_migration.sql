-- Enhanced Database Migration
-- Adds escalation_summaries table and improves existing tables

-- 1. Create escalation_summaries table if it doesn't exist
CREATE TABLE IF NOT EXISTS escalation_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(45) NOT NULL,
    escalated_to_department_id INT NULL,
    escalated_to_agent_id INT NULL,
    escalated_by_agent_id INT NULL,
    reason TEXT NOT NULL,
    summary_note TEXT NULL,
    from_level INT NOT NULL,
    to_level INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_by_agent_id INT NULL,
    read_at DATETIME NULL,
    CONSTRAINT fk_escalation_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_escalation_to_dept FOREIGN KEY (escalated_to_department_id) REFERENCES departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_escalation_to_agent FOREIGN KEY (escalated_to_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    CONSTRAINT fk_escalation_by_agent FOREIGN KEY (escalated_by_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    CONSTRAINT fk_escalation_read_by FOREIGN KEY (read_by_agent_id) REFERENCES agents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- 2. Ensure ticket_feedback has all enhanced columns
ALTER TABLE ticket_feedback 
ADD COLUMN IF NOT EXISTS attempt_id INT NULL,
ADD COLUMN IF NOT EXISTS user_email VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(20) NULL,
ADD COLUMN IF NOT EXISTS reason VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS resolved_by INT NULL,
ADD COLUMN IF NOT EXISTS resolved_at DATETIME NULL;

-- Add foreign key constraints if they don't exist
-- Note: Use individual statements for better error handling
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'ticket_feedback' 
     AND COLUMN_NAME = 'attempt_id'
     AND REFERENCED_TABLE_NAME = 'resolution_attempts') = 0,
    'ALTER TABLE ticket_feedback ADD CONSTRAINT fk_ticket_feedback_attempt FOREIGN KEY (attempt_id) REFERENCES resolution_attempts(id) ON DELETE SET NULL',
    'SELECT "attempt_id FK already exists" as message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'ticket_feedback' 
     AND COLUMN_NAME = 'resolved_by'
     AND REFERENCED_TABLE_NAME = 'agents') = 0,
    'ALTER TABLE ticket_feedback ADD CONSTRAINT fk_ticket_feedback_resolved_by FOREIGN KEY (resolved_by) REFERENCES agents(id) ON DELETE SET NULL',
    'SELECT "resolved_by FK already exists" as message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_resolved_by ON tickets(resolved_by);
CREATE INDEX IF NOT EXISTS idx_tickets_archived ON tickets(archived);
CREATE INDEX IF NOT EXISTS idx_messages_ticket_id ON messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_escalation_summaries_ticket_id ON escalation_summaries(ticket_id);

-- 4. Fix any existing closed tickets with missing resolved_by
-- (Run this as a one-time data fix)
UPDATE tickets t 
JOIN ticket_events e ON t.id = e.ticket_id 
SET t.resolved_by = e.actor_agent_id 
WHERE t.status IN ('closed', 'resolved') 
AND t.resolved_by IS NULL 
AND e.event_type IN ('CLOSED', 'RESOLVED') 
AND e.actor_agent_id IS NOT NULL;

-- 5. Clean up unused tables (OPTIONAL - uncomment if you want to remove them)
-- DROP TABLE IF EXISTS ticket_watchers;
-- DROP TABLE IF EXISTS kb_feedback;
-- DROP TABLE IF EXISTS kb_audit; 
-- DROP TABLE IF EXISTS kb_index;
-- DROP TABLE IF EXISTS kb_drafts;
-- DROP TABLE IF EXISTS kb_article_versions;

-- 6. Show final table status
SELECT 
    TABLE_NAME,
    TABLE_ROWS,
    CREATE_TIME,
    UPDATE_TIME
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'tickets', 'escalation_summaries', 'ticket_feedback', 
    'ticket_events', 'agents', 'departments'
  )
ORDER BY TABLE_ROWS DESC;

SELECT 'Database migration completed successfully!' as result;
