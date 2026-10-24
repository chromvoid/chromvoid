#!/usr/bin/env bash
# Every string the English resources define must exist in Russian, and no
# Russian string may be left behind after its English one is removed.
# Plural resources must also carry the quantities each language needs.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
python3 - "$AIR_ROOT" <<'PY'
import sys, pathlib, xml.etree.ElementTree as ET

root = pathlib.Path(sys.argv[1])
required = {"values": {"one", "other"}, "values-ru": {"one", "few", "many", "other"}}
failed = False
# The client's own modules, and the shared platform module it includes from beside it.
modules = sorted(root.glob("*/src/main/res/values/strings.xml"))
modules.append(root.parent / "android-platform/src/main/res/values/strings.xml")
for english in modules:
    res = english.parent.parent
    names = {}
    for folder in required:
        path = res / folder / "strings.xml"
        if not path.exists():
            print(f"{path.relative_to(root.parent)}: missing")
            failed = True
            names[folder] = {}
            continue
        entries = {}
        for node in ET.parse(path).getroot():
            if node.tag == "string" and node.get("translatable") != "false":
                entries[node.get("name")] = None
            elif node.tag == "plurals":
                quantities = {item.get("quantity") for item in node}
                entries[node.get("name")] = quantities
                missing = required[folder] - quantities
                if missing:
                    print(f"{path.relative_to(root.parent)}: {node.get('name')} lacks {sorted(missing)}")
                    failed = True
        names[folder] = entries
    en, ru = set(names["values"]), set(names["values-ru"])
    for name in sorted(en - ru):
        print(f"{res.relative_to(root.parent)}: '{name}' has no Russian text")
        failed = True
    for name in sorted(ru - en):
        print(f"{res.relative_to(root.parent)}: '{name}' is only in Russian")
        failed = True
sys.exit(1 if failed else 0)
PY
