import uuid

import django.db.models.deletion
from django.db import migrations, models

import reader.models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="Document",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("display_name", models.CharField(max_length=255)),
                ("pdf", models.FileField(upload_to=reader.models.pdf_path)),
                ("page_count", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
        ),
    ]
