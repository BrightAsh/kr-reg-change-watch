import html
import json
import os
import re
import sys
import zipfile
import zlib


def main():
    if len(sys.argv) < 3:
        emit("error", "missing arguments", "")
        return

    file_path = sys.argv[1]
    file_name = sys.argv[2]
    ext = os.path.splitext(file_name.lower())[1]

    try:
        if ext == ".hwpx":
            emit("ok", "HWPX XML text extracted", extract_hwpx(file_path))
        elif ext == ".hwp":
            emit("ok", "HWP binary text extracted", extract_hwp(file_path))
        elif ext == ".pdf":
            emit("ok", "PDF text extracted", extract_pdf(file_path))
        else:
            emit("unsupported", f"unsupported attachment type: {ext or 'unknown'}", "")
    except ImportError as exc:
        emit("unsupported", f"missing extractor dependency: {exc}", "")
    except Exception as exc:
        emit("error", str(exc), "")


def extract_hwpx(file_path):
    texts = []
    with zipfile.ZipFile(file_path) as archive:
        names = sorted(
            name
            for name in archive.namelist()
            if name.lower().endswith(".xml") and not name.lower().startswith("meta-inf/")
        )
        for name in names:
            data = archive.read(name).decode("utf-8", errors="ignore")
            texts.append(xml_to_text(data))
    return normalize_text("\n\n".join(texts))


def extract_hwp(file_path):
    import olefile

    ole = olefile.OleFileIO(file_path)
    compressed = is_hwp_compressed(ole)
    section_names = sorted(
        "/".join(entry)
        for entry in ole.listdir()
        if len(entry) == 2 and entry[0] == "BodyText" and entry[1].startswith("Section")
    )

    texts = []
    for section in section_names:
        data = ole.openstream(section).read()
        if compressed:
            data = zlib.decompress(data, -15)
        texts.append(extract_hwp_section_text(data))

    return normalize_text("\n\n".join(texts))


def extract_pdf(file_path):
    try:
        from pypdf import PdfReader
    except ImportError:
        from PyPDF2 import PdfReader

    reader = PdfReader(file_path)
    texts = []
    for page in reader.pages:
        texts.append(page.extract_text() or "")
    return normalize_text("\n\n".join(texts))


def is_hwp_compressed(ole):
    try:
        header = ole.openstream("FileHeader").read()
        if len(header) < 40:
            return False
        properties = int.from_bytes(header[36:40], "little")
        return bool(properties & 1)
    except Exception:
        return False


def extract_hwp_section_text(data):
    pos = 0
    chunks = []
    while pos + 4 <= len(data):
        header = int.from_bytes(data[pos : pos + 4], "little")
        pos += 4
        tag_id = header & 0x3FF
        size = (header >> 20) & 0xFFF
        if size == 0xFFF:
            if pos + 4 > len(data):
                break
            size = int.from_bytes(data[pos : pos + 4], "little")
            pos += 4
        body = data[pos : pos + size]
        pos += size
        if tag_id == 67:
            chunks.append(clean_hwp_text(body.decode("utf-16le", errors="ignore")))
    return "\n".join(chunks)


def clean_hwp_text(value):
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", value)
    value = re.sub(r"[ \t]+", " ", value)
    return value.strip()


def xml_to_text(value):
    value = re.sub(r"<(hp:p|p)[^>]*>", "\n", value)
    value = re.sub(r"<[^>]+>", " ", value)
    return html.unescape(value)


def normalize_text(value):
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n[ \t]+", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def emit(status, message, text):
    print(
        json.dumps(
            {
                "status": status,
                "message": message,
                "text": text,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
