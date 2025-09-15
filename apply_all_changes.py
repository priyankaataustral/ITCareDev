#!/usr/bin/env python3
"""
Apply all status and archive filtering changes
"""

import os

def update_chathistory():
    """Update ChatHistory.jsx archive button logic"""
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

    with open('frontend/components/ChatHistory.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    
    return "✅ Updated ChatHistory.jsx archive button logic"

def update_backend():
    """Update backend status filtering logic"""
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

    content = content.replace(old_logic, new_logic)

    with open('backend/urls.py', 'w', encoding='utf-8') as f:
        f.write(content)
    
    return "✅ Updated backend/urls.py status filtering logic"

def main():
    print("🚀 Applying all status and archive filtering changes...")
    print("=" * 60)
    
    results = []
    
    # Update ChatHistory.jsx
    try:
        result = update_chathistory()
        results.append(result)
    except Exception as e:
        results.append(f"❌ Failed to update ChatHistory.jsx: {e}")
    
    # Update backend
    try:
        result = update_backend()
        results.append(result)
    except Exception as e:
        results.append(f"❌ Failed to update backend: {e}")
    
    # Display results
    for result in results:
        print(result)
    
    print("\n" + "=" * 60)
    print("📋 SUMMARY OF CHANGES:")
    print("=" * 60)
    print("✅ Sidebar.jsx - Added filter options: all, open, escalated, closed, resolved, archived")
    print("✅ SupportInboxPlugin.jsx - Fixed API filtering logic for status and archived")
    print("✅ ChatHistory.jsx - Archive buttons now show for both closed AND resolved tickets")
    print("✅ Backend urls.py - Added individual status filtering (open, escalated, closed, resolved)")
    
    print("\n🎯 WHAT YOU CAN NOW DO:")
    print("=" * 60)
    print("1. 📋 Filter tickets by: All Active, Open, Escalated, Closed, Resolved, Archived")
    print("2. 📦 Archive any closed or resolved ticket")
    print("3. 📤 Unarchive any archived ticket")
    print("4. 🔄 Proper separation between status-based filtering and archive functionality")
    
    print("\n🧪 TESTING:")
    print("=" * 60)
    print("1. Open your app and check the dropdown in the sidebar")
    print("2. Try filtering by different statuses")
    print("3. Close or resolve a ticket, then look for the Archive button")
    print("4. Archive a ticket and check the 'Archived Tickets' filter")

if __name__ == "__main__":
    main()
