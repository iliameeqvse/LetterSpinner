import os
from datetime import timedelta

import regex
from django.core.files.base import File
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from pypdf import PdfReader

from .models import Document

MAX_BYTES = 25 * 1024 * 1024
MAX_PAGES = 1000
MAX_GRAPHEMES = 20000
LIFETIME = timedelta(hours=24)


def error(message, status=400):
    return JsonResponse({"error": message}, status=status)


def get_document(document_id):
    document = Document.objects.filter(id=document_id).first()
    if document and document.created_at < timezone.now() - LIFETIME:
        document.pdf.delete(save=False)
        document.delete()
        return None
    return document


def health(request):
    if request.method != "GET":
        return error("Method not allowed.", 405)
    return JsonResponse({"status": "ok"})


@csrf_exempt
def documents(request):
    if request.method != "POST":
        return error("Method not allowed.", 405)
    uploaded = request.FILES.get("file")
    if uploaded is None:
        return error("Choose one PDF file.")
    if not 0 < uploaded.size <= MAX_BYTES:
        return error("PDFs must be between 1 byte and 25 MiB.", 413)
    if uploaded.read(5) != b"%PDF-":
        return error("This file is not a PDF.")
    uploaded.seek(0)
    try:
        reader = PdfReader(uploaded, strict=False)
        if reader.is_encrypted:
            return error("Password-protected PDFs are not supported.")
        count = len(reader.pages)
        if not 0 < count <= MAX_PAGES:
            return error("The PDF must contain 1 to 1,000 pages.")
    except Exception:
        return error("Could not read this PDF.")
    uploaded.seek(0)
    document = Document(display_name=os.path.basename(uploaded.name)[:255], page_count=count)
    try:
        document.pdf.save("document.pdf", File(uploaded), save=False)
        document.save()
    except Exception:
        if document.pdf.name:
            document.pdf.delete(save=False)
        return error("Could not store this PDF.", 500)
    return JsonResponse({"id": str(document.id), "name": document.display_name, "page_count": count}, status=201)


@csrf_exempt
def document_detail(request, document_id):
    if request.method != "DELETE":
        return error("Method not allowed.", 405)
    document = get_document(document_id)
    if document is None:
        return error("Document not found.", 404)
    document.pdf.delete(save=False)
    document.delete()
    return JsonResponse({"deleted": True})


def page_text(request, document_id, page_number):
    if request.method != "GET":
        return error("Method not allowed.", 405)
    document = get_document(document_id)
    if document is None:
        return error("Document not found.", 404)
    if not 1 <= page_number <= document.page_count:
        return error("Page number is out of range.", 404)
    try:
        with document.pdf.open("rb") as source:
            page = PdfReader(source, strict=False).pages[page_number - 1]
            text = page.extract_text(0) or ""
    except Exception:
        return error("Could not extract this page.", 422)
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if len(regex.findall(r"\X", text)) > MAX_GRAPHEMES:
        return error("This page exceeds the 20,000-character reading limit.", 413)
    return JsonResponse({"page": page_number, "page_count": document.page_count, "text": text})
