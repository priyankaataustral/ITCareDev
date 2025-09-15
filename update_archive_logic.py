#!/usr/bin/env python3
"""
Script to update the archive button logic in ChatHistory.jsx
"""

# Read the file
with open('frontend/components/ChatHistory.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the comment
old_comment = "          {/* Archive/Unarchive: L2, L3, MANAGER only for closed tickets */}"
new_comment = "          {/* Archive/Unarchive: L2, L3, MANAGER only for closed/resolved tickets */}"
content = content.replace(old_comment, new_comment)

# Replace the condition  
old_condition = "            {ticket?.status === 'closed' && !ticket?.archived && ("
new_condition = "            {(ticket?.status === 'closed' || ticket?.status === 'resolved') && !ticket?.archived && ("
content = content.replace(old_condition, new_condition)

# Write the file back
with open('frontend/components/ChatHistory.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Updated ChatHistory.jsx archive button logic")
print("📦 Archive buttons now show for both 'closed' and 'resolved' tickets")
