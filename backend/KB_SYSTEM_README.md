# Knowledge Base (KB) System

## Overview

The KB system combines **static protocol documents** (company SOPs) with **dynamic KB articles** (accepted solutions) to create a comprehensive knowledge base that mimics real-world IT support operations.

## Features

### 1. **Static Protocol Documents**
- **Location**: `backend/kb_protocols/`
- **Format**: Text files with structured metadata
- **Source Type**: `protocol`
- **Purpose**: Company standard operating procedures

### 2. **Dynamic KB Articles**
- **Source**: Promoted solutions from accepted user feedback
- **Source Types**: `ai`, `human`, `mixed`
- **Purpose**: Knowledge derived from actual support cases

### 3. **AI Integration**
- **Enhanced Solution Generation**: OpenAI now references relevant KB articles
- **Semantic Search**: Uses embeddings for better article matching
- **Context-Aware**: Prioritizes protocol documents over dynamic content

### 4. **Dashboard Integration**
- **Source Filtering**: Filter by Protocol, AI, Human, Mixed
- **Load Protocols Button**: One-click protocol loading
- **Visual Indicators**: Color-coded source types

## File Structure

```
backend/
├── kb_protocols/                 # Protocol documents folder
│   ├── network_troubleshooting.txt
│   ├── password_reset.txt
│   └── email_issues.txt
├── kb_loader.py                  # KB loader service
├── test_kb_system.py            # Test script
└── KB_SYSTEM_README.md          # This file

frontend/components/
└── KBDashboard.jsx              # Enhanced dashboard with source filtering
```

## Protocol Document Format

```
TITLE: [Title of the procedure]
CATEGORY: [Category/Type]
DEPARTMENT: [Responsible department]

PROBLEM: [Description of the issue this addresses]

SOLUTION STEPS:
[Numbered steps for resolution]

ENVIRONMENT: [Target environment/systems]
ESTIMATED_TIME: [Expected resolution time]
```

## API Endpoints

### Load Protocols
```http
POST /kb/protocols/load
Authorization: Bearer [manager_token]
```
**Response:**
```json
{
  "message": "Protocol loading completed",
  "results": {
    "loaded": 3,
    "skipped": 0,
    "errors": 0
  }
}
```

### Search KB Articles
```http
POST /kb/search
Authorization: Bearer [token]
Content-Type: application/json

{
  "query": "network connectivity issue",
  "department_id": 4,
  "limit": 5
}
```

### Get KB Articles (Enhanced)
```http
GET /kb/articles?status=published&source=protocol&limit=50
Authorization: Bearer [token]
```

## Usage Examples

### 1. Loading Protocol Documents

**Dashboard Method:**
1. Open KB Dashboard
2. Go to "Articles" tab
3. Click "📄 Load Protocols" button
4. View loaded protocol articles

**API Method:**
```bash
curl -X POST https://your-api/kb/protocols/load \
  -H "Authorization: Bearer your_manager_token"
```

### 2. Testing the System

**Run Test Script:**
```bash
cd backend
python test_kb_system.py
```

### 3. AI-Enhanced Solution Generation

When users request solutions, the AI now automatically:
1. Searches relevant KB articles based on ticket content
2. Includes protocol document context in prompts
3. Generates solutions that reference company procedures
4. Prioritizes established protocols over ad-hoc solutions

## Benefits

### For Support Agents
- **Consistent Solutions**: Follow established company protocols
- **Faster Resolution**: Reference proven procedures
- **Knowledge Sharing**: Learn from previous successful solutions

### For Managers
- **Standardization**: Ensure compliance with company procedures
- **Quality Control**: Protocol documents ensure consistent quality
- **Analytics**: Track which protocols are most referenced

### For End Users
- **Better Solutions**: AI-generated responses based on proven procedures
- **Consistency**: Similar issues get similar, tested solutions
- **Faster Response**: Agents have immediate access to relevant protocols

## Database Changes

### New Source Type
```sql
-- Added to KBArticleSource enum
ALTER TYPE kbarticlesource ADD VALUE 'protocol';
```

### Enhanced KB Articles Table
- `source` column now includes `protocol` option
- Articles distinguish between protocol docs and dynamic content
- Filtering and search optimized for source types

## Security & Access Control

- **Protocol Loading**: Restricted to MANAGER role only
- **KB Search**: Available to all support roles (L1, L2, L3, MANAGER)
- **Article Management**: Existing role-based access maintained

## Monitoring & Analytics

The system tracks:
- Protocol document usage in AI solutions
- Search patterns for protocol articles
- Effectiveness of protocol-based solutions
- User acceptance rates for protocol-derived solutions

## Troubleshooting

### Common Issues

1. **Protocols Not Loading**
   - Check `backend/kb_protocols/` folder exists
   - Verify file format matches expected structure
   - Ensure manager role permissions

2. **AI Not Using Protocols**
   - Verify protocols are loaded and published
   - Check search query relevance
   - Review OpenAI integration logs

3. **Dashboard Not Showing Sources**
   - Refresh browser cache
   - Check API response includes `source` field
   - Verify frontend filtering logic

### Logs

Monitor these log entries:
```
INFO - Processing protocol file: network_troubleshooting.txt
INFO - Loaded protocol: Network Connectivity Issues
INFO - Generated embedding for: Password Reset Procedure
INFO - KB context added to OpenAI prompt
```

## Future Enhancements

1. **Version Control**: Track protocol document changes
2. **Approval Workflow**: Manager approval for protocol updates
3. **Usage Analytics**: Detailed protocol effectiveness metrics
4. **Auto-Update**: Sync with external documentation systems
5. **Multi-Language**: Support for localized protocol documents

---

**Created**: September 2024  
**Version**: 1.0  
**Maintainer**: AI Support System
