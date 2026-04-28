# WhatsApp Integration Plan

## Overview

Two features to implement:

1. **Automatic report delivery** — when a scheduled report fires, send a WhatsApp message (with PDF) to a configured number, alongside the email
2. **Interactive bot** — users send a WhatsApp message to request reports on demand; the bot replies with the PDF

---

## Part 1 — Automatic Report Delivery via WhatsApp

### How it works

Same scheduler that already sends emails. After generating the PDF, also send it to a WhatsApp number via Twilio.

### What to add

#### Backend

**`backend-api/.env`**
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

**`backend-api/app/database/schema.py`** — add field to `ReportSchedule`:
```python
whatsapp_number = Column(String, nullable=True)   # e.g. "+212600000000"
```

**`backend-api/app/services/scheduler.py`** — after `_send_email(...)` call:
```python
if schedule.whatsapp_number:
    _send_whatsapp(
        to=schedule.whatsapp_number,
        body=f"*{variables['company_name']}* — Rapport de présence\n{variables['period_label']}\n{variables['total_employees']} employés · {variables['total_records']} enregistrements",
        pdf_bytes=pdf_bytes,
        pdf_filename=pdf_filename,
    )
```

**New file `backend-api/app/services/whatsapp.py`**:
```python
import os, requests, tempfile, base64
from twilio.rest import Client

def _twilio_client():
    return Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])

def _send_whatsapp(to: str, body: str, pdf_bytes: bytes | None = None, pdf_filename: str = "report.pdf"):
    client = _twilio_client()
    from_number = os.environ.get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
    to_number = f"whatsapp:{to}" if not to.startswith("whatsapp:") else to

    media_url = None
    if pdf_bytes:
        # Twilio requires a publicly accessible URL for media.
        # Upload to a temporary endpoint on this server (see /api/temp-media below),
        # or use a cloud bucket (S3, Cloudflare R2, etc.)
        media_url = _upload_temp_pdf(pdf_bytes, pdf_filename)

    client.messages.create(
        from_=from_number,
        to=to_number,
        body=body,
        media_url=[media_url] if media_url else None,
    )
```

**New endpoint `backend-api/app/api/temp_media.py`** (serves PDFs temporarily for Twilio to fetch):
```python
# Store generated PDFs in memory for 10 minutes so Twilio can download them.
# Use Redis or a temp file on disk for production.
import uuid, time, threading
from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter()
_store: dict[str, tuple[bytes, float]] = {}
_lock = threading.Lock()

def store_pdf(data: bytes) -> str:
    key = str(uuid.uuid4())
    with _lock:
        _store[key] = (data, time.time())
    return key

@router.get("/temp-media/{key}")
def serve_temp_media(key: str):
    with _lock:
        item = _store.get(key)
    if not item:
        return Response(status_code=404)
    data, _ = item
    return Response(content=data, media_type="application/pdf")
```

#### Frontend — ScheduleModal step 4

Add a WhatsApp number field below the recipients list:
```jsx
<div>
  <label>Numéro WhatsApp (optionnel)</label>
  <input
    type="tel"
    value={form.whatsapp_number || ''}
    onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))}
    placeholder="+212600000000"
  />
  <p className="text-xs text-gray-400">Format international — ex. +212600000000</p>
</div>
```

---

## Part 2 — Interactive WhatsApp Bot (On-Demand Reports)

### Conversation flow

```
User:  rapport
Bot:   Bonjour 👋 Choisissez un rapport :
       1️⃣ Aujourd'hui
       2️⃣ Par date
       3️⃣ Par employé

User:  2
Bot:   Quelle date ? (jj/mm/aaaa)

User:  25/04/2026
Bot:   ⏳ Génération en cours…
Bot:   [sends PDF attachment]
       ✅ Rapport du 25/04/2026 — 42 employés · 318 enregistrements
```

### Requirements

| Requirement | Details |
|------------|---------|
| WhatsApp Business API | Via Twilio (easiest) or Meta directly |
| Public HTTPS URL | Your server must be reachable from the internet |
| Dev testing | Use [ngrok](https://ngrok.com): `ngrok http 8000` |
| Production | Domain + SSL certificate (Let's Encrypt is free) |

### Backend — new file `backend-api/app/api/whatsapp_bot.py`

```python
from fastapi import APIRouter, Request, Response
from app.database.connection import get_db_session
from app.database.schema import WhatsAppSession
from app.services.whatsapp import _send_whatsapp
from app.api.reports import _attendance_pdf_bytes, _attendance_counts
from datetime import datetime, timezone, timedelta

router = APIRouter()

MENU = (
    "Bonjour 👋 Choisissez un rapport :\n"
    "1️⃣ Aujourd'hui\n"
    "2️⃣ Par date\n"
    "3️⃣ Par employé"
)

@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request):
    form = await request.form()
    from_number = form.get("From", "")    # "whatsapp:+212600000000"
    body = (form.get("Body") or "").strip().lower()

    session = _get_session(from_number)

    if body in ("rapport", "menu", "start", "1", "2", "3") or not session:
        if not session or body in ("rapport", "menu", "start"):
            _set_session(from_number, {"step": "menu"})
            _send_whatsapp(from_number, MENU)

        elif session["step"] == "menu":
            if body == "1":
                today = datetime.now(timezone.utc).date()
                pdf = _attendance_pdf_bytes(str(today), str(today))
                _, emp, rec = _attendance_counts(str(today), str(today), None, None, None)
                _send_whatsapp(from_number, f"✅ Rapport du {today.strftime('%d/%m/%Y')} — {emp} employés · {rec} enregistrements", pdf, f"rapport_{today}.pdf")
                _clear_session(from_number)

            elif body == "2":
                _set_session(from_number, {"step": "await_date"})
                _send_whatsapp(from_number, "📅 Quelle date ? (jj/mm/aaaa)")

            elif body == "3":
                _set_session(from_number, {"step": "await_employee"})
                _send_whatsapp(from_number, "👤 Quel est le nom de l'employé ?")

        elif session["step"] == "await_date":
            try:
                d = datetime.strptime(body, "%d/%m/%Y").date()
                _send_whatsapp(from_number, "⏳ Génération en cours…")
                pdf = _attendance_pdf_bytes(str(d), str(d))
                emp, rec = _attendance_counts(str(d), str(d), None, None, None)
                _send_whatsapp(from_number, f"✅ Rapport du {d.strftime('%d/%m/%Y')} — {emp} employés · {rec} enregistrements", pdf, f"rapport_{d}.pdf")
                _clear_session(from_number)
            except ValueError:
                _send_whatsapp(from_number, "❌ Format invalide. Exemple : 25/04/2026")

        elif session["step"] == "await_employee":
            today = datetime.now(timezone.utc).date()
            first = today.replace(day=1)
            pdf = _attendance_pdf_bytes(str(first), str(today), employee_name=body)
            _send_whatsapp(from_number, f"✅ Rapport pour « {body} » (mois courant)", pdf, f"rapport_{body.replace(' ','_')}.pdf")
            _clear_session(from_number)

    return Response(content="", media_type="text/plain")
```

### Database — new table `WhatsAppSession`

```python
class WhatsAppSession(Base):
    __tablename__ = "whatsapp_sessions"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    from_number = Column(String, nullable=False, unique=True, index=True)
    step        = Column(String, nullable=False, default="menu")
    data        = Column(String, nullable=True)   # JSON extra data
    updated_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

### Webhook registration (Twilio)

1. Start ngrok: `ngrok http 8000`
2. Copy the HTTPS URL, e.g. `https://abc123.ngrok.io`
3. In Twilio Console → WhatsApp Sandbox → "When a message comes in":
   ```
   https://abc123.ngrok.io/api/whatsapp/webhook
   ```
   Method: `HTTP POST`

For production, replace ngrok with your real domain.

---

## Provider Comparison

| | **Twilio** | **Meta Cloud API** | **360dialog** |
|---|---|---|---|
| Setup time | 15 min (sandbox) | 2–5 days (review) | 1–2 days |
| Cost | ~$0.005/msg outbound | Free tier available | ~€0.004/msg |
| PDF attachment | ✅ | ✅ | ✅ |
| Dev sandbox | ✅ Free | ❌ | ❌ |
| Python SDK | `pip install twilio` | `requests` only | `requests` only |
| Business verification | Not required for sandbox | Required | Required |

**Recommendation:** Start with Twilio sandbox for development and testing. Switch to Meta Cloud API direct for production to reduce cost at scale.

---

## Files to create / modify

| File | Action |
|------|--------|
| `backend-api/app/services/whatsapp.py` | Create — Twilio send helper |
| `backend-api/app/api/whatsapp_bot.py` | Create — webhook + bot logic |
| `backend-api/app/api/temp_media.py` | Create — serve PDFs to Twilio |
| `backend-api/app/database/schema.py` | Add `WhatsAppSession` table + `whatsapp_number` to `ReportSchedule` |
| `backend-api/app/services/scheduler.py` | Add WhatsApp send after email send |
| `backend-api/main.py` | Register 2 new routers |
| `frontend/src/components/ScheduleModal.jsx` | Add WhatsApp number field in step 4 |
| `frontend/src/pages/GeneralSettings.jsx` | Add WhatsApp settings tab (optional) |
| `backend-api/.env` | Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` |

---

## Install

```bash
pip install twilio
```

Add to `backend-api/requirements.txt`:
```
twilio>=8.0.0
```
