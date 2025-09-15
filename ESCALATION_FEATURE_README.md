# Ticket Escalation Feature

## Overview
The ticket escalation feature has been enhanced with a popup form that allows agents to specify escalation details including target department, specific agent assignment, and detailed reasoning. All escalations are tracked and displayed as summary notes in the relevant agent/department inboxes.

## What's New

### 1. Enhanced Escalation Popup
- **Department Selection**: Choose which department to escalate to (optional)
- **Agent Assignment**: Assign to specific agent within department (optional)  
- **Escalation Reason**: Required field to explain why escalation is needed
- **Form Validation**: Ensures escalation reason is provided

### 2. Escalation Summary Tracking
- **Database Storage**: New `escalation_summaries` table tracks all escalation details
- **Rich Metadata**: Stores escalation reason, target department/agent, escalation level changes
- **Read Status**: Tracks whether assigned agents have viewed the escalation summary

### 3. Inbox Integration
- **New Sidebar Tab**: "Escalations" tab in the sidebar shows escalation summaries
- **Unread Indicators**: Visual badges show new/unread escalations
- **Department/Agent Filtering**: Only shows escalations relevant to the current agent
- **Mark as Read**: Click escalations to mark them as read

## Technical Implementation

### Backend Changes

#### Database Schema
```sql
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
    -- Foreign keys...
);
```

#### New API Endpoints
- `GET /agents` - Fetch all agents for dropdown selection
- `GET /escalation-summaries` - Get escalation summaries for current agent/department
- `POST /escalation-summaries/{id}/mark-read` - Mark escalation as read
- `POST /threads/{id}/escalate` - Enhanced to accept department, agent, and reason

#### Enhanced Escalation Logic
- Modified `/threads/{thread_id}/escalate` endpoint to accept:
  - `reason` (required): Explanation for escalation
  - `department_id` (optional): Target department
  - `agent_id` (optional): Specific agent assignment
- Creates `EscalationSummary` record for tracking
- Updates ticket department/assignment if specified
- Enhanced system messages with escalation details

### Frontend Changes

#### New Components
- `EscalationPopup.jsx`: Modal form for escalation details
- `EscalationSummaries.jsx`: Display escalation summaries in inbox

#### Enhanced Components
- `ChatHistory.jsx`: Integrated escalation popup with existing escalate button
- `Sidebar.jsx`: Added "Escalations" tab with unread count

#### User Experience Flow
1. Agent clicks "Escalate" button → popup opens
2. Agent fills department (optional), agent (optional), and reason (required)
3. Form submits escalation with all details
4. Target department/agent sees escalation summary in their "Escalations" tab
5. Summary shows as "NEW" until clicked/read
6. Escalation details preserved for audit trail

## Database Migration

Run the following SQL to add the new table:

```bash
# Apply the migration
sqlite3 tickets.db < migration_escalation_summaries.sql
```

Or manually execute the SQL in `migration_escalation_summaries.sql`.

## Usage Instructions

### For Escalating Agent
1. Open any ticket in ChatHistory
2. Click the "🛠 Escalate" button  
3. Fill out the escalation popup:
   - **Target Department**: Optional - select which department should handle this
   - **Assign to Agent**: Optional - choose specific agent (filtered by department)
   - **Reason for Escalation**: Required - explain why escalation is needed
4. Click "Escalate" to submit

### For Receiving Agent/Department
1. Go to sidebar and click "📋 Escalations" tab
2. View list of escalations assigned to you or your department
3. "NEW" badge indicates unread escalations
4. Click escalation to mark as read and view full details
5. See escalation reason, original agent, ticket details, etc.

## Features Implemented

✅ Escalation popup with department/agent/reason fields  
✅ Backend API endpoints for agents and escalation summaries  
✅ Enhanced escalation endpoint with new parameters  
✅ Database table for escalation tracking  
✅ Escalation summaries display in sidebar  
✅ Read/unread status tracking  
✅ Integration with existing escalation button  
✅ Department and agent filtering  
✅ Rich escalation metadata and audit trail  

## Future Enhancements

Potential improvements for future versions:
- Email notifications for escalations
- Escalation analytics and reporting  
- Bulk escalation operations
- Escalation comments/follow-ups
- Escalation priority levels
- Auto-assignment rules based on workload
