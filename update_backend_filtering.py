#!/usr/bin/env python3
"""
Script to update the backend status filtering logic in urls.py
"""

# Read the file
with open('backend/urls.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Old filtering logic
old_logic = '''        if status_filter != "all":
            if status_filter == "open":
                threads_filtered = [t for t in threads_filtered if t.get("status") in ["open", "in_progress", "escalated"]]
            elif status_filter == "closed":
                threads_filtered = [t for t in threads_filtered if t.get("status") in ["closed", "resolved"]]'''

# New filtering logic
new_logic = '''        if status_filter != "all":
            if status_filter == "open":
                threads_filtered = [t for t in threads_filtered if t.get("status") == "open"]
            elif status_filter == "escalated":
                threads_filtered = [t for t in threads_filtered if t.get("status") == "escalated"]
            elif status_filter == "closed":
                threads_filtered = [t for t in threads_filtered if t.get("status") == "closed"]
            elif status_filter == "resolved":
                threads_filtered = [t for t in threads_filtered if t.get("status") == "resolved"]'''

# Replace the logic
content = content.replace(old_logic, new_logic)

# Write the file back
with open('backend/urls.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Updated backend/urls.py status filtering logic")
print("📊 Backend now supports individual status filters: open, escalated, closed, resolved")
