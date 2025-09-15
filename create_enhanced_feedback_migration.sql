-- Enhanced TicketFeedback and EscalationSummary Migration for MySQL
-- Run this after backing up your database

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

-- 2. Enhance ticket_feedback table with new columns
-- Check if columns exist before adding them

-- Add attempt_id column if it doesn't exist
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'ticket_feedback' 
     AND COLUMN_NAME = 'attempt_id') = 0,
    'ALTER TABLE ticket_feedback ADD COLUMN attempt_id INT NULL',
    'SELECT "attempt_id column already exists" as message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add user_email column if it doesn't exist
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'ticket_feedback' 
     AND COLUMN_NAME = 'user_email') = 0,
    'ALTER TABLE ticket_feedback ADD COLUMN user_email VARCHAR(255) NULL',
    'SELECT "user_email column already exists" as message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add feedback_type column if it doesn't exist
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'ticket_feedback' 
     AND COLUMN_NAME = 'feedback_type') = 0,
    'ALTER TABLE ticket_feedback ADD COLUMN feedback_type VARCHAR(20) NULL',
    'SELECT "feedback_type column already exists" as message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add reason column if it doesn't exist
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'ticket_feedback' 
     AND COLUMN_NAME = 'reason') = 0,
    'ALTER TABLE ticket_feedback ADD COLUMN reason VARCHAR(255) NULL',
    'SELECT "reason column already exists" as message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add resolved_by column if it doesn't exist
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'ticket_feedback' 
     AND COLUMN_NAME = 'resolved_by') = 0,
    'ALTER TABLE ticket_feedback ADD COLUMN resolved_by INT NULL',
    'SELECT "resolved_by column already exists" as message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add resolved_at column if it doesn't exist
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'ticket_feedback' 
     AND COLUMN_NAME = 'resolved_at') = 0,
    'ALTER TABLE ticket_feedback ADD COLUMN resolved_at DATETIME NULL',
    'SELECT "resolved_at column already exists" as message'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Update submitted_at column to be DATETIME instead of STRING if needed
-- (This is more complex and should be done carefully with data migration)

-- 4. Add foreign key constraints for new columns if they don't exist
-- Add FK for attempt_id
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
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

-- Add FK for resolved_by
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
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

-- 5. Show final table structures
SELECT 'escalation_summaries table structure:' as info;
DESCRIBE escalation_summaries;

SELECT 'ticket_feedback table structure:' as info;
DESCRIBE ticket_feedback;

SELECT 'Migration completed successfully!' as result;
