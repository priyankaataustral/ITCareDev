# MySQL Migration Guide for Escalation Feature

## Overview
Since you're using MySQL server, here are the specific steps to run the migration for the escalation summaries table.

## Option 1: Using the Python Migration Script (Recommended)

### Prerequisites
```bash
pip install mysql-connector-python
```

### Run the Migration
```bash
python run_mysql_migration.py
```

The script will:
- Prompt for your MySQL password if not set in environment variables
- Check if the table already exists
- Create the `escalation_summaries` table with proper MySQL syntax
- Verify the migration was successful

### Environment Variables (Optional)
You can set these to avoid prompts:
```bash
export DB_HOST=localhost
export DB_PORT=3306
export DB_NAME=your_database_name
export DB_USER=your_username
export DB_PASSWORD=your_password
```

## Option 2: Manual MySQL Command

### Connect to MySQL
```bash
mysql -u your_username -p your_database_name
```

### Run the Migration SQL
```sql
-- Copy and paste the contents of migration_escalation_summaries_mysql.sql
-- Or source the file directly:
SOURCE migration_escalation_summaries_mysql.sql;
```

## Option 3: Using MySQL Workbench or phpMyAdmin

1. Open your MySQL administration tool
2. Connect to your database
3. Open/paste the contents of `migration_escalation_summaries_mysql.sql`
4. Execute the SQL

## Verification

After running the migration, verify the table was created:

```sql
DESCRIBE escalation_summaries;
SHOW CREATE TABLE escalation_summaries;
```

Expected structure:
```
+----------------------------+--------------+------+-----+-------------------+----------------+
| Field                      | Type         | Null | Key | Default           | Extra          |
+----------------------------+--------------+------+-----+-------------------+----------------+
| id                         | int          | NO   | PRI | NULL              | auto_increment |
| ticket_id                  | varchar(45)  | NO   | MUL | NULL              |                |
| escalated_to_department_id | int          | YES  | MUL | NULL              |                |
| escalated_to_agent_id      | int          | YES  | MUL | NULL              |                |
| escalated_by_agent_id      | int          | YES  | MUL | NULL              |                |
| reason                     | text         | NO   |     | NULL              |                |
| summary_note               | text         | YES  |     | NULL              |                |
| from_level                 | int          | NO   |     | NULL              |                |
| to_level                   | int          | NO   |     | NULL              |                |
| created_at                 | timestamp    | NO   | MUL | CURRENT_TIMESTAMP |                |
| read_by_agent_id           | int          | YES  |     | NULL              |                |
| read_at                    | timestamp    | YES  |     | NULL              |                |
+----------------------------+--------------+------+-----+-------------------+----------------+
```

## Database Configuration in Your App

Make sure your Flask/Python application is configured to use MySQL. You may need to update your database connection string in your application configuration.

Example connection string:
```python
# In your config file
SQLALCHEMY_DATABASE_URI = 'mysql+pymysql://username:password@localhost/database_name'
```

If you're using a different MySQL driver, adjust accordingly:
- `mysql+mysqlconnector://` for mysql-connector-python
- `mysql+pymysql://` for PyMySQL
- `mysql://` for MySQL-python (deprecated)

## Troubleshooting

### Common Issues:

1. **Foreign Key Constraints Fail**
   - Ensure your `tickets`, `departments`, and `agents` tables exist
   - Check that the referenced columns have the correct data types

2. **Permission Denied**
   - Make sure your MySQL user has CREATE TABLE privileges
   - You may need REFERENCES privilege for foreign keys

3. **Character Set Issues**
   - The migration uses `utf8mb4` which supports full Unicode including emojis
   - If you have encoding issues, you may need to adjust your MySQL configuration

4. **Connection Issues**
   - Verify MySQL server is running
   - Check host, port, username, and password
   - Ensure the database exists

### Testing the Migration
After migration, you can test by:
1. Starting your application
2. Escalating a ticket with the new popup form
3. Checking the "Escalations" tab in the sidebar
4. Verifying data appears in the `escalation_summaries` table

## Next Steps

Once the migration is complete:
1. Restart your application server
2. Test the escalation feature
3. Verify escalation summaries appear in the sidebar
4. Check that the database is properly storing escalation data

The escalation feature should now be fully functional with your MySQL database!
