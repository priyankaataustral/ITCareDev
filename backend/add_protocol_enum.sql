-- Quick SQL script to add 'protocol' to kb_articles source enum
-- Run this in MySQL Workbench for full demo experience
-- Takes 30 seconds to execute

USE tickets;

-- Add 'protocol' to the source enum
ALTER TABLE kb_articles 
MODIFY COLUMN source ENUM('ai','human','mixed','protocol') DEFAULT 'ai';

-- Verify the change
DESCRIBE kb_articles;

-- Optional: Update any test articles to use protocol source
-- UPDATE kb_articles SET source = 'protocol' WHERE approved_by = 'system';

-- Show current articles by source
SELECT source, COUNT(*) as count 
FROM kb_articles 
GROUP BY source;
