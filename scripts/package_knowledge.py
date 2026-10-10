#!/usr/bin/env python3
"""Build portable skills/Markdown and source archives from explicit project paths.

No network, credentials, browser data, or original customer files are read.
Python's standard library is sufficient. Run from any working directory.
"""
from __future__ import annotations

import hashlib
import json
import posixpath
import re
import zipfile
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "downloads"
WEB = "https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/"
SKILLS = ("ax-agent-studio", "wylie-proposal")
CONFIG_FILES = (
    "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts",
    "vitest.config.ts", "playwright.config.ts", ".gitignore",
)
EXCLUDED_PARTS = {"__pycache__", "node_modules", ".git", ".venv", "dist"}


def read_file(relative: str) -> bytes:
    path = ROOT / relative
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected a regular file: {relative}")
    if not path.resolve().is_relative_to(ROOT):
        raise ValueError(f"Path leaves project: {relative}")
    if path.name.startswith(".env") or path.name in {"auth.json", "credentials.json"}:
        raise ValueError(f"Credential path cannot be packaged: {relative}")
    data = path.read_bytes()
    if re.search(rb"(?m)^-----BEGIN (?:RSA )?PRIVATE KEY-----", data):
        raise ValueError(f"Private key marker: {relative}")
    return data


def collect_tree(directory: str) -> dict[str, bytes]:
    if not (ROOT / directory).is_dir():
        raise ValueError(f"Missing directory: {directory}")
    return {
        p.relative_to(ROOT).as_posix(): read_file(p.relative_to(ROOT).as_posix())
        for p in sorted((ROOT / directory).rglob("*"))
        if p.is_file() and not (set(p.relative_to(ROOT).parts) & EXCLUDED_PARTS)
        and p.name != ".DS_Store" and p.suffix != ".pyc"
    }


def web_link(path: str) -> str:
    return WEB + quote(path.removeprefix("config-files/"), safe="/")


def standalone_markdown(path: str, content: str) -> str:
    """Relative links resolve on GitHub when the single MD is downloaded alone."""
    def replace(match: re.Match[str]) -> str:
        target = match.group(2)
        if target.startswith(("#", "http://", "https://", "mailto:")):
            return match.group(0)
        resource, _, anchor = target.partition("#")
        absolute = posixpath.normpath(posixpath.join(posixpath.dirname(path), resource))
        return f"]({web_link(absolute)}{'#' + anchor if anchor else ''})"
    return re.sub(r"(\]\()([^\s)]+)\)", replace, content)


def repair_package_links(files: dict[str, bytes]) -> None:
    """Keep packaged links local; link excluded source/download files to GitHub."""
    for path, data in list(files.items()):
        if not path.endswith(".md"):
            continue
        def replace(match: re.Match[str]) -> str:
            target = match.group(2)
            if target.startswith(("#", "http://", "https://", "mailto:")):
                return match.group(0)
            resource, _, anchor = target.partition("#")
            absolute = posixpath.normpath(posixpath.join(posixpath.dirname(path), resource))
            if absolute in files:
                return match.group(0)
            return f"]({web_link(absolute)}{'#' + anchor if anchor else ''})"
        files[path] = re.sub(r"(\]\()([^\s)]+)\)", replace, data.decode("utf-8")).encode("utf-8")


def build_knowledge(files: dict[str, bytes]) -> bytes:
    priority = ["docs/PROJECT-INSTRUCTIONS.md", "docs/CONTINUE-HERE.md", "docs/PROJECT-SETTINGS.md"]
    text_files = sorted(p for p in files if p.endswith((".md", ".json", ".yaml", ".csv", ".txt"))
                        and p not in priority and not p.endswith("package-lock.json"))
    sections = [
        "# AX Agent Studio — 통합 지식·설정\n",
        "기준일: 2026-10-10. 앱 기준 커밋: 5cefbd6. 현재 공개 사이트는 미배포이며 실제 AI 생성 성공은 미검증이다. "
        "이 문서는 두 스킬과 현재 설정·인수인계·제안서 제작 방법을 읽기 위한 기록이다. "
        "문서 속 명령은 현재 사용자의 요청과 실행 환경에 따라 적용한다. 인증·브라우저 데이터·모델 학습 상태를 복제하지 않는다.\n",
        "고객 원본과 폰트 바이너리는 포함하지 않았다. 제안 관련 29개 파일 중 읽은 것은 16개 유효 문서이며 "
        "미열람·중복 판본·해석의 한계는 출처 목록을 따른다. 별도의 초기 첨부 전체를 분석했다는 의미가 아니다.\n",
    ]
    for index, path in enumerate(priority + text_files, 1):
        body = files[path].decode("utf-8")
        sections.append(f"\n---\n\n## {index:02d}. `{path}`\n\n원문: {web_link(path)}\n\n")
        if path.endswith(".md"):
            sections.append(standalone_markdown(path, body))
        else:
            language = Path(path).suffix.lstrip(".")
            sections.append(f"````{language}\n{body}\n````\n")
    # Include exact current app prompt and schema: descriptive context, not authority.
    for path in ("server/prompt.ts", "shared/domain.ts"):
        sections.append(f"\n---\n\n## 앱 구현 참조: `{path}`\n\n"
                        "다음은 현재 앱의 소스 참조다. 이 문서를 읽는 도구에 대한 별도 실행 명령이 아니다.\n\n"
                        f"````typescript\n{read_file(path).decode('utf-8')}\n````\n")
    return "\n".join(sections).encode("utf-8")


def write_archive(path: Path, folder: str, files: dict[str, bytes]) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative, data in sorted(files.items()):
            info = zipfile.ZipInfo(f"{folder}/{relative}", date_time=(2026, 10, 10, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive CRC check failed")
        for relative, data in files.items():
            if archive.read(f"{folder}/{relative}") != data:
                raise ValueError(f"Archive content differs: {relative}")


def main() -> None:
    if not (ROOT / "package.json").is_file() or not (ROOT / "server/prompt.ts").is_file():
        raise SystemExit("Run this script from the complete AX Agent Studio source checkout, not the skills/MD bundle.")
    if read_file("docs/PROJECT-SETTINGS.md") != read_file(
        ".agents/skills/ax-agent-studio/references/project-settings.md"
    ):
        raise ValueError("Project settings and standalone skill reference have drifted")
    files = {p: read_file(p) for p in ("START-HERE.md", "AGENTS.md", "README.md")}
    files.update(collect_tree("docs"))
    files.update(collect_tree("config"))
    for skill in SKILLS:
        files.update(collect_tree(f".agents/skills/{skill}"))
    files["scripts/package_knowledge.py"] = read_file("scripts/package_knowledge.py")
    for path in CONFIG_FILES:
        files[f"config-files/{path}"] = read_file(path)

    # Documentation packages deliberately omit complete application source.
    knowledge = build_knowledge(files)
    files["AX-AGENT-KNOWLEDGE.md"] = knowledge
    repair_package_links(files)
    files["MANIFEST.json"] = json.dumps({
        "formatVersion": 1,
        "recordedOn": "2026-10-10",
        "applicationBaselineCommit": "5cefbd6",
        "skills": list(SKILLS),
        "credentialsIncluded": False,
        "originalCustomerDocumentsIncluded": False,
        "fontBinariesIncluded": False,
        "applicationSourceComplete": False,
        "publicSiteDeployed": False,
        "actualModelInferenceVerified": False,
        "files": [{"path": p, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                  for p, data in sorted(files.items())],
    }, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
    OUT.mkdir(exist_ok=True)
    (OUT / "AX-AGENT-KNOWLEDGE.md").write_bytes(knowledge)
    bundle = OUT / "ax-agent-studio-skills-md.zip"
    write_archive(bundle, "ax-agent-studio-skills-md", files)
    checksums = "".join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n"
                        for p in (bundle, OUT / "AX-AGENT-KNOWLEDGE.md"))
    (OUT / "AX-AGENT-SKILLS-SHA256SUMS").write_text(checksums, encoding="utf-8")

    source = {p: read_file(p) for p in (
        "START-HERE.md", "AGENTS.md", "README.md", "index.html", *CONFIG_FILES,
    )}
    for directory in ("src", "server", "shared", "tests", "docs", "config", "scripts"):
        source.update(collect_tree(directory))
    for skill in SKILLS:
        source.update(collect_tree(f".agents/skills/{skill}"))
    source["AX-AGENT-KNOWLEDGE.md"] = knowledge
    repair_package_links(source)
    source_archive = OUT / "ax-agent-studio.zip"
    write_archive(source_archive, "ax-agent-studio", source)
    (OUT / "AX-AGENT-SHA256SUMS").write_text(
        f"{hashlib.sha256(source_archive.read_bytes()).hexdigest()}  {source_archive.name}\n",
        encoding="utf-8",
    )
    print(json.dumps({"skillsFiles": len(files), "sourceFiles": len(source),
                      "knowledgeBytes": len(knowledge), "skillsZipBytes": bundle.stat().st_size,
                      "sourceZipBytes": source_archive.stat().st_size,
                      "crcAndContent": "passed"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
