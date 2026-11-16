from datetime import timedelta
from io import BytesIO
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import Document


def make_pdf(text="Hello spinner"):
    stream = f"BT /F1 18 Tf 40 750 Td ({text}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
        f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream",
    ]
    result = b"%PDF-1.4\n"
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    start = len(result)
    result += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    for offset in offsets[1:]:
        result += f"{offset:010d} 00000 n \n".encode()
    result += f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    return result


class DocumentApiTests(TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.settings_context = override_settings(MEDIA_ROOT=self.temporary.name)
        self.settings_context.enable()

    def tearDown(self):
        self.settings_context.disable()
        self.temporary.cleanup()

    def test_upload_page_and_delete(self):
        upload = SimpleUploadedFile("sample.pdf", make_pdf(), content_type="application/pdf")
        created = self.client.post("/api/documents/", {"file": upload})
        self.assertEqual(created.status_code, 201)
        data = created.json()
        self.assertEqual(data["page_count"], 1)
        page = self.client.get(f"/api/documents/{data['id']}/pages/1/")
        self.assertEqual(page.status_code, 200)
        self.assertIn("Hello spinner", page.json()["text"])
        self.assertEqual(self.client.get(f"/api/documents/{data['id']}/pages/2/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/documents/{data['id']}/").status_code, 200)
        self.assertFalse(Document.objects.filter(id=data["id"]).exists())
        self.assertEqual(self.client.get(f"/api/documents/{data['id']}/pages/1/").status_code, 404)

    def test_invalid_upload_does_not_create_document(self):
        upload = SimpleUploadedFile("wrong.pdf", b"not a pdf", content_type="application/pdf")
        response = self.client.post("/api/documents/", {"file": upload})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Document.objects.count(), 0)

    def test_expired_document_is_deleted_on_access(self):
        upload = SimpleUploadedFile("sample.pdf", make_pdf(), content_type="application/pdf")
        created = self.client.post("/api/documents/", {"file": upload}).json()
        Document.objects.filter(id=created["id"]).update(created_at=timezone.now() - timedelta(days=2))
        response = self.client.get(f"/api/documents/{created['id']}/pages/1/")
        self.assertEqual(response.status_code, 404)
        self.assertFalse(Document.objects.filter(id=created["id"]).exists())
