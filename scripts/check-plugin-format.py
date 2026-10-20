"""Offline format checks using the pinned upstream schemas and Agent Skills rules."""
import json
import re
import sys
from pathlib import Path

import jsonschema
import yaml

REPO = Path(__file__).resolve().parent.parent
ALLOWED_SKILL_FIELDS = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}


def check(root: Path) -> None:
    for name in ("plugin", "mcp"):
        schema = json.loads((REPO / "plugins" / "schemas" / f"{name}.schema.json").read_text())
        jsonschema.Draft202012Validator(schema).validate(json.loads((root / f"{name}.json").read_text()))
    skills = sorted((root / "skills").iterdir())
    for skill in skills:
        raw = (skill / "SKILL.md").read_text()
        assert raw.startswith("---\n"), f"Missing frontmatter: {skill.name}"
        data = yaml.safe_load(raw.split("---\n", 2)[1])
        assert isinstance(data, dict) and set(data) <= ALLOWED_SKILL_FIELDS, f"Unexpected frontmatter: {skill.name}"
        name = data["name"]
        assert isinstance(name, str) and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name) and len(name) <= 64
        assert name == skill.name
        assert isinstance(data["description"], str) and 1 <= len(data["description"].strip()) <= 1024
        if "compatibility" in data:
            assert isinstance(data["compatibility"], str) and 1 <= len(data["compatibility"]) <= 500
        if "metadata" in data:
            assert isinstance(data["metadata"], dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in data["metadata"].items())
        for field in ("license", "allowed-tools"):
            if field in data:
                assert isinstance(data[field], str)
    print(f"{root}: official manifest/MCP schemas and {len(skills)} skill envelopes passed")


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        check(Path(arg))
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python3 scripts/check-plugin-format.py <candidate-package-root> [...]")
