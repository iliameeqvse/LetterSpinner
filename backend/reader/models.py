import uuid

from django.db import models


def pdf_path(instance, filename):
    return f"documents/{instance.id}.pdf"


class Document(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    display_name = models.CharField(max_length=255)
    pdf = models.FileField(upload_to=pdf_path)
    page_count = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
