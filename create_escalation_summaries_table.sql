-- Create escalation_summaries table for MySQL
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
    
    -- Foreign key constraints
    CONSTRAINT fk_escalation_ticket 
        FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    CONSTRAINT fk_escalation_to_dept 
        FOREIGN KEY (escalated_to_department_id) REFERENCES departments(id),
    CONSTRAINT fk_escalation_to_agent 
        FOREIGN KEY (escalated_to_agent_id) REFERENCES agents(id),
    CONSTRAINT fk_escalation_by_agent 
        FOREIGN KEY (escalated_by_agent_id) REFERENCES agents(id),
    CONSTRAINT fk_escalation_read_by 
        FOREIGN KEY (read_by_agent_id) REFERENCES agents(id)
);

-- Add indexes for better performance
CREATE INDEX idx_escalation_ticket ON escalation_summaries(ticket_id);
CREATE INDEX idx_escalation_to_dept ON escalation_summaries(escalated_to_department_id);
CREATE INDEX idx_escalation_to_agent ON escalation_summaries(escalated_to_agent_id);
CREATE INDEX idx_escalation_created ON escalation_summaries(created_at);
