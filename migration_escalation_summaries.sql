-- Add escalation_summaries table to the database
-- Run this SQL command to add the new table for escalation summaries

CREATE TABLE escalation_summaries (
    id INTEGER NOT NULL PRIMARY KEY,
    ticket_id VARCHAR(45) NOT NULL,
    escalated_to_department_id INTEGER,
    escalated_to_agent_id INTEGER,
    escalated_by_agent_id INTEGER,
    reason TEXT NOT NULL,
    summary_note TEXT,
    from_level INTEGER NOT NULL,
    to_level INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_by_agent_id INTEGER,
    read_at DATETIME,
    FOREIGN KEY(ticket_id) REFERENCES tickets (id),
    FOREIGN KEY(escalated_to_department_id) REFERENCES departments (id),
    FOREIGN KEY(escalated_to_agent_id) REFERENCES agents (id),
    FOREIGN KEY(escalated_by_agent_id) REFERENCES agents (id),
    FOREIGN KEY(read_by_agent_id) REFERENCES agents (id)
);
