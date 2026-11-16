from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from reader.models import Document


class Command(BaseCommand):
    help = "Delete uploaded PDFs older than 24 hours. Run this periodically."

    def handle(self, *args, **options):
        expired = Document.objects.filter(created_at__lt=timezone.now() - timedelta(hours=24))
        count = 0
        for document in expired.iterator():
            document.pdf.delete(save=False)
            document.delete()
            count += 1
        self.stdout.write(f"Deleted {count} expired document(s).")
