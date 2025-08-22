# backend/services/notification_service.py

import requests
import os
from dotenv import load_dotenv

load_dotenv()

# Replace with your actual Power Automate webhook URL
POWER_AUTOMATE_WEBHOOK = os.getenv('POWER_AUTOMATE_WEBHOOK_URL')

def send_notification(payload: dict) -> bool:
    """
    Send a JSON payload to the Power Automate webhook.

    Args:
      payload: dict containing event data, e.g.
        {
          "event": "ticket_updated",
          "ticketId": 123,
          "status": "pending approval",
          "agent": "alice@example.com"
        }

    Returns:
      True if the webhook accepted the payload (HTTP 202), False otherwise.
    """
    try:
        res = requests.post(POWER_AUTOMATE_WEBHOOK, json=payload)
        return res.status_code == 202
    except Exception:
        return False
