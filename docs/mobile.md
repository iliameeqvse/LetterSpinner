# Mobile and website development

This is a local development setup for one Expo React Native frontend across Android, iOS, and web, backed by Django. The frontend uploads a selected PDF to Django, then requests one page of extracted text at a time. Android and iOS bundles compile, but a physical-device run has not yet been verified.

## 1. Start Django

Install Python 3.12–3.14 and Node.js 24. On Windows PowerShell, from the repository root:

```powershell
python -m venv backend/.venv
& '.\backend\.venv\Scripts\python.exe' -m pip install -r backend/requirements.txt
& '.\backend\.venv\Scripts\python.exe' backend/manage.py migrate
$env:DJANGO_ALLOWED_HOSTS = '127.0.0.1,localhost,YOUR_COMPUTER_LAN_IP'
& '.\backend\.venv\Scripts\python.exe' backend/manage.py runserver 0.0.0.0:8000
```

Some Python installations create `backend/.venv/bin/python.exe` instead of `Scripts/python.exe`; use whichever exists. Replace `YOUR_COMPUTER_LAN_IP` with your computer's Wi-Fi address, for example `192.168.1.7`. Find it with `ipconfig`. The phone and computer must share a network, and Windows Firewall must allow the Django process on that private network. Check `http://YOUR_COMPUTER_LAN_IP:8000/api/health/` in the phone browser; it should return `{"status":"ok"}`.

On macOS or Linux, activate `backend/.venv/bin/activate` and use `python backend/manage.py ...` for the same commands. Keep the Django terminal open.

## 2. Start Expo

In a second terminal:

```sh
cd mobile
npm ci
npx expo start --lan
```

Open the project in a compatible Expo Go app on your phone and enter `http://YOUR_COMPUTER_LAN_IP:8000` in **Django server address**. You can also set `EXPO_PUBLIC_API_URL` before starting Expo to prefill it. For Android Emulator, `http://10.0.2.2:8000` is the default; for iOS Simulator, the default is `http://127.0.0.1:8000`. A physical phone must use the LAN IP, not localhost.

The project uses Expo SDK 54 to support Expo Go on a physical iPhone. Expo Go must match the app's SDK version. If it does not, install a compatible Expo Go build or use a development build.

## Open the website on a PC

The same React Native frontend builds for web. From the repository root:

```sh
cd mobile
npm ci
npx expo export --platform web
cd ../backend
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Open <http://127.0.0.1:8000/> on your computer, or `http://YOUR_COMPUTER_LAN_IP:8000/` on another device. Django serves the exported web files and API from the same origin, so the browser can upload and read PDFs without a separate frontend server. Rerun `npx expo export --platform web` after frontend changes and refresh the page.

For live web development, use `npx expo start --web` in `mobile/` and set `DJANGO_CORS_ORIGINS` to that development origin (for example `http://localhost:8081`). The deployed development website at port 8000 uses the same-origin route and does not need this setting.

## Use the app

Choose a selectable PDF. The app uploads it, then shows the first page. Use **Previous/Next**, **Pause/Resume**, **Normal text**, overall speed controls, and the slowest/fastest turn controls. Adjacent eligible letters use different speeds and alternate between bundled Noto Sans Georgian and Noto Serif Georgian fonts. Pages over 600 animated letters remain readable in normal text on mobile. The system reduced-motion preference also forces normal text.

Closing or replacing a document requests its deletion from Django. Uploaded files remain on the development server if the app disconnects before deletion. Django rejects access to documents older than 24 hours; run `python backend/manage.py prune_documents` periodically to remove expired files from storage.

## API and checks

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health/` | Health check. |
| POST | `/api/documents/` | Multipart form upload with a `file` field; returns an opaque document ID and page count. |
| GET | `/api/documents/{id}/pages/{page}/` | Extracted text for one page. Page numbers start at 1. |
| DELETE | `/api/documents/{id}/` | Delete the PDF and its record. |

```sh
cd backend
python manage.py check
python manage.py test reader
cd ../mobile
npm test
npx expo install --check
npx expo export --platform all
```

With Django running, `npm run smoke:web` from the repository root opens the website in Playwright, uploads a small PDF, reads its page, and checks a narrow screen. Install Playwright's browser with `npx playwright install chromium` if needed.

The server stores PDFs in `backend/media/` and document metadata in `backend/db.sqlite3`; both are ignored by Git. It uses random document IDs but has no user accounts, per-user authorization, rate limits, or TLS in this local setup. Keep it on a trusted local network. Before a public deployment, add authentication, upload quotas, background extraction, HTTPS, and scheduled cleanup. Scanned PDFs still need OCR, and complex PDF layouts may extract in the wrong order.
