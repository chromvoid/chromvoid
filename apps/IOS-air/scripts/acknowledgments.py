"""Build the native, offline presentation of collected license evidence."""

from html.parser import HTMLParser


class NoticeText(HTMLParser):
    """Keep body text, including collapsed details/pre notices, without executing HTML."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.body = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "body":
            self.body = True
        if self.body and tag in {"p", "div", "h1", "h2", "h3", "li", "pre", "br", "summary"}:
            self.parts.append("\n")
        if self.body and tag in {"script", "style", "iframe", "object"}:
            raise ValueError(f"Unexpected executable/style element in license report: {tag}")
        if self.body and tag == "a":
            href = dict(attrs).get("href", "")
            if href and not href.startswith("#"):
                self.parts.append(href + " — ")

    def handle_endtag(self, tag):
        if tag == "body":
            self.body = False
        if self.body and tag in {"p", "div", "h1", "h2", "h3", "li", "pre", "summary"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if self.body:
            self.parts.append(data)


def presentation_catalog(coverage, corpus):
    texts = dict(corpus["texts_by_sha256"])
    library = coverage["rust_standard_library"]
    for document in library["documents"]:
        if document["format"] == "text/html":
            parser = NoticeText()
            parser.feed(texts[document["sha256"]])
            parser.close()
            display = "".join(parser.parts).strip()
            if not display:
                raise ValueError("Rust library report has no body text")
            texts[document["sha256"]] = display

    def documents(sources):
        result = []
        for source in sources:
            checksum = source["sha256"]
            if checksum not in texts:
                raise ValueError(f"Missing acknowledgment text: {checksum}")
            result.append({"source": source["source"], "textID": checksum})
            if "displayName" in source:
                result[-1]["displayName"] = source["displayName"]
        return result

    entries = [{"id": f"{p['name']}@{p['version']}", "name": p["name"],
                "version": p["version"], "license": p["declared_license"],
                "documents": documents(p["sources"])} for p in coverage["packages"]]
    entries.append({"id": "rust-standard-library", "name": "Rust Standard Library",
                    "version": library["release"], "license": None,
                    "documents": documents(library["documents"])})
    for runtime in coverage["rust_runtime"]:
        entries.append({"id": f"rust-runtime:{runtime['name']}@{runtime['version']}",
                        "name": runtime["name"], "version": runtime["version"],
                        "license": runtime["declared_license"], "documents": documents(runtime["documents"])})
    return {"entries": sorted(entries, key=lambda p: (p["name"].casefold(), p["version"])),
            "texts": texts}
