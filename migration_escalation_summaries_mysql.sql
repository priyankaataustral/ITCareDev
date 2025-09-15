-- MySQL Migration for escalation_summaries table
-- Run this SQL against your MySQL database

CREATE TABLE escalation_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(45) NOT NULL,
    escalated_to_department_id INT DEFAULT NULL,
    escalated_to_agent_id INT DEFAULT NULL,
    escalated_by_agent_id INT DEFAULT NULL,
    reason TEXT NOT NULL,
    summary_note TEXT DEFAULT NULL,
    from_level INT NOT NULL,
    to_level INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_by_agent_id INT DEFAULT NULL,
    read_at TIMESTAMP NULL DEFAULT NULL,
    
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_escalated_to_dept (escalated_to_department_id),
    INDEX idx_escalated_to_agent (escalated_to_agent_id),
    INDEX idx_escalated_by_agent (escalated_by_agent_id),
    INDEX idx_created_at (created_at),
    
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (escalated_to_department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (escalated_to_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (escalated_by_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (read_by_agent_id) REFERENCES agents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
