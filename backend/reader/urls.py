from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("documents/", views.documents, name="documents"),
    path("documents/<uuid:document_id>/", views.document_detail, name="document_detail"),
    path("documents/<uuid:document_id>/pages/<int:page_number>/", views.page_text, name="page_text"),
]
