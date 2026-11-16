from django.urls import include, path, re_path

from . import web

urlpatterns = [
    path("api/", include("reader.urls")),
    path("", web.index, name="web_index"),
    re_path(r"^(?P<path>(?:_expo|assets)/.+|favicon\.ico)$", web.asset, name="web_asset"),
]
