#!/usr/bin/env python3
"""Check that all internal links in generated HTML files resolve with HTTP 200."""
import argparse
import contextlib
import http.server
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, List, Set, Tuple


class LinkExtractor(HTMLParser):
    """Extract anchor href attributes from an HTML document."""

    def __init__(self) -> None:
        super().__init__()
        self.links: List[str] = []

    def handle_starttag(self, tag: str, attrs: Iterable[Tuple[str, str]]) -> None:
        if tag.lower() != "a":
            return
        for key, value in attrs:
            if key.lower() == "href" and value:
                self.links.append(value)


class StaticSiteServer(contextlib.AbstractContextManager):
    """Serve the repository contents over HTTP for link validation."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.port = self._find_available_port()
        handler = self._make_handler(directory)
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", self.port), handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    @staticmethod
    def _find_available_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    @staticmethod
    def _make_handler(directory: Path):
        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(directory), **kwargs)

            def log_message(self, format: str, *args) -> None:  # noqa: A003 - same signature as parent
                # Silence default HTTP request logging to keep the report clean.
                pass

        return Handler

    def __enter__(self) -> "StaticSiteServer":
        self.thread.start()
        return self

    def __exit__(self, exc_type, exc, exc_tb) -> None:
        self.httpd.shutdown()
        self.thread.join()


def collect_html_files(root: Path) -> List[Path]:
    return sorted(path for path in root.rglob("*.html") if path.is_file())


def is_internal_link(link: str) -> bool:
    parsed = urllib.parse.urlparse(link)
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        return False
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return False
    if link.startswith("mailto:") or link.startswith("tel:"):
        return False
    return True


def normalize_link(base_url: str, link: str) -> str:
    parsed = urllib.parse.urlparse(link)
    # Drop fragments so that `/page#section` resolves to `/page`.
    parsed = parsed._replace(fragment="")
    encoded_path = urllib.parse.quote(parsed.path, safe="/%")
    encoded_params = urllib.parse.quote(parsed.params, safe="")
    encoded_query = urllib.parse.quote(parsed.query, safe="=&%")
    parsed = parsed._replace(path=encoded_path, params=encoded_params, query=encoded_query)
    normalized = urllib.parse.urljoin(base_url, urllib.parse.urlunparse(parsed))
    return normalized


def check_link(url: str, timeout: float) -> Tuple[bool, int]:
    request = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return True, response.status
    except urllib.error.HTTPError as exc:
        return False, exc.code
    except urllib.error.URLError:
        # Retry with GET for servers that do not support HEAD.
        request = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return True, response.status
        except urllib.error.HTTPError as exc:
            return False, exc.code
        except urllib.error.URLError:
            return False, 0


def analyze_page(
    base_url: str, html_path: Path, timeout: float
) -> Tuple[Set[str], List[Tuple[str, int]]]:
    page_url = normalize_link(base_url, html_path.as_posix())
    with urllib.request.urlopen(page_url, timeout=timeout) as response:
        content = response.read().decode("utf-8", errors="ignore")
    extractor = LinkExtractor()
    extractor.feed(content)

    checked: Set[str] = set()
    broken: List[Tuple[str, int]] = []

    for raw_link in extractor.links:
        if not raw_link or raw_link.startswith("#"):
            continue
        if not is_internal_link(raw_link):
            continue
        normalized = normalize_link(page_url, raw_link)
        if normalized in checked:
            continue
        checked.add(normalized)
        ok, status = check_link(normalized, timeout)
        if not ok or status != 200:
            broken.append((normalized, status))

    return checked, broken


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "root",
        nargs="?",
        default=Path.cwd(),
        type=Path,
        help="Path to the folder that contains the generated HTML files.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        metavar="SECONDS",
        help="Tiempo máximo de espera para cada petición HTTP (por defecto: 10 segundos).",
    )
    args = parser.parse_args()
    root: Path = args.root.resolve()
    timeout = max(args.timeout, 0.1)

    html_files = collect_html_files(root)
    if not html_files:
        print(f"No se encontraron archivos HTML en {root}.")
        raise SystemExit(1)

    with StaticSiteServer(root) as server:
        base_url = f"http://127.0.0.1:{server.port}/"
        print(f"Analizando enlaces internos en {len(html_files)} páginas HTML desde {base_url}\n")
        global_broken: List[Tuple[Path, str, int]] = []
        for html_file in html_files:
            checked, broken = analyze_page(base_url, html_file.relative_to(root), timeout)
            relative_path = html_file.relative_to(root)
            print(f"- {relative_path}: {len(checked)} enlaces internos verificados")
            for url, status in broken:
                global_broken.append((relative_path, url, status))
                status_msg = "sin respuesta" if status == 0 else f"HTTP {status}"
                print(f"    ❌ {url} → {status_msg}")

    if global_broken:
        print("\nSe detectaron enlaces rotos. Corrige las rutas listadas y vuelve a ejecutar la comprobación.")
        raise SystemExit(1)

    print("\nTodos los enlaces internos respondieron con HTTP 200 ✅")


if __name__ == "__main__":
    main()
