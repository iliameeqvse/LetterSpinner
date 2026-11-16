import mimetypes
from pathlib import Path

from django.http import FileResponse, HttpResponse

DIST = Path(__file__).resolve().parents[2] / "mobile" / "dist"


def index(request):
    page = DIST / "index.html"
    if not page.is_file():
        return HttpResponse("Build the website with: cd mobile && npx expo export --platform web", status=503)
    return FileResponse(page.open("rb"), content_type="text/html; charset=utf-8")


def asset(request, path):
    root = DIST.resolve()
    candidate = (root / path).resolve()
    if not candidate.is_relative_to(root) or not candidate.is_file():
        return HttpResponse(status=404)
    content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
    return FileResponse(candidate.open("rb"), content_type=content_type)
