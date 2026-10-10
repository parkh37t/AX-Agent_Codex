import { inflateRawSync } from "node:zlib";
import { posix } from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import mammoth from "mammoth";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 150_000;
const MAX_PAGES = 150;
const MAX_ZIP_ENTRIES = 2_000;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;
const supported = new Set(["txt", "md", "csv", "json", "docx", "pdf", "pptx"]);

export type ExtractedDocument = {
  name: string;
  text: string;
  pageCount: number | null;
  warnings: string[];
};

class TextCollector {
  private chunks: string[] = [];
  private length = 0;
  truncated = false;

  append(value: string): void {
    const remaining = MAX_TEXT_CHARS - this.length;
    if (value.length > remaining) this.truncated = true;
    let part = value.slice(0, remaining);
    // Avoid splitting a UTF-16 surrogate pair at the output boundary.
    if (part.length < value.length && /[\uD800-\uDBFF]$/.test(part))
      part = part.slice(0, -1);
    if (part) {
      this.chunks.push(part);
      this.length += part.length;
    }
  }

  get text(): string {
    return this.chunks.join("");
  }
}

function decodeBase64(value: string): Buffer {
  if (typeof value !== "string")
    throw new Error("파일 데이터는 Base64 문자열이어야 합니다.");
  if (value.length > Math.ceil(MAX_FILE_BYTES / 3) * 4)
    throw new Error("파일 크기는 15 MiB를 초과할 수 없습니다.");
  if (
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value) ||
    value.length % 4 === 1 ||
    (value.includes("=") && value.length % 4 !== 0)
  ) {
    throw new Error("올바르지 않은 Base64 파일 데이터입니다.");
  }
  const data = Buffer.from(value, "base64");
  if (data.length > MAX_FILE_BYTES)
    throw new Error("파일 크기는 15 MiB를 초과할 수 없습니다.");
  if (data.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, ""))
    throw new Error("올바르지 않은 Base64 파일 데이터입니다.");
  return data;
}

function decodeText(data: Buffer): string {
  let encoding = "utf-8";
  let bytes: Uint8Array = data;
  if (data[0] === 0xff && data[1] === 0xfe) {
    encoding = "utf-16le";
    bytes = data.subarray(2);
  }
  if (data[0] === 0xfe && data[1] === 0xff) {
    encoding = "utf-16be";
    bytes = data.subarray(2);
  }
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw new Error("binary");
    return text;
  } catch {
    throw new Error(
      "텍스트 파일을 읽을 수 없습니다. UTF-8 또는 BOM이 있는 UTF-16 파일을 사용하세요.",
    );
  }
}

type ZipEntry = {
  name: string;
  method: number;
  compressed: number;
  size: number;
  crc: number;
  start: number;
};

// Inspect central/local directory metadata BEFORE inflation. No ZIP filenames
// become filesystem paths, and no relationship target is fetched or opened.
function inspectZip(data: Buffer): Map<string, ZipEntry> {
  if (data.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"))) {
    throw new Error(
      "암호화된 Office 파일 또는 이전 바이너리 형식은 지원하지 않습니다. 암호를 제거한 DOCX/PPTX 파일을 사용하세요.",
    );
  }
  let end = -1;
  for (
    let i = data.length - 22, min = Math.max(0, data.length - 65_557);
    i >= min;
    i--
  ) {
    if (
      data.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + data.readUInt16LE(i + 20) === data.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0)
    throw new Error("손상되었거나 올바르지 않은 Office ZIP 파일입니다.");
  const count = data.readUInt16LE(end + 10);
  const directorySize = data.readUInt32LE(end + 12);
  const directoryStart = data.readUInt32LE(end + 16);
  if (
    count === 0xffff ||
    directorySize === 0xffffffff ||
    directoryStart === 0xffffffff
  )
    throw new Error("ZIP64 Office 파일은 지원하지 않습니다.");
  if (
    data.readUInt16LE(end + 4) !== 0 ||
    data.readUInt16LE(end + 6) !== 0 ||
    data.readUInt16LE(end + 8) !== count
  )
    throw new Error("분할 ZIP 파일은 지원하지 않습니다.");
  if (count > MAX_ZIP_ENTRIES)
    throw new Error("압축 파일의 항목 수가 안전 한도 2,000개를 초과합니다.");
  if (directoryStart + directorySize !== end)
    throw new Error("ZIP 중앙 디렉터리가 손상되었습니다.");
  const entries = new Map<string, ZipEntry>();
  let pos = directoryStart;
  let total = 0;
  const regions: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || data.readUInt32LE(pos) !== 0x02014b50)
      throw new Error("ZIP 항목 정보가 손상되었습니다.");
    const flags = data.readUInt16LE(pos + 8);
    const method = data.readUInt16LE(pos + 10);
    const crc = data.readUInt32LE(pos + 16);
    const compressed = data.readUInt32LE(pos + 20);
    const size = data.readUInt32LE(pos + 24);
    const nameLength = data.readUInt16LE(pos + 28);
    const extraLength = data.readUInt16LE(pos + 30);
    const commentLength = data.readUInt16LE(pos + 32);
    const local = data.readUInt32LE(pos + 42);
    const next = pos + 46 + nameLength + extraLength + commentLength;
    if (next > end || !nameLength)
      throw new Error("ZIP 파일 이름 정보가 손상되었습니다.");
    if (flags & 1 || flags & 64 || method === 99)
      throw new Error(
        "암호화된 ZIP/Office 파일은 지원하지 않습니다. 암호를 제거하세요.",
      );
    if (method !== 0 && method !== 8)
      throw new Error("지원하지 않는 ZIP 압축 방식입니다.");
    if (
      data.readUInt16LE(pos + 34) !== 0 ||
      [compressed, size, local].includes(0xffffffff)
    )
      throw new Error("분할 또는 ZIP64 파일은 지원하지 않습니다.");
    total += size;
    if (
      size > MAX_ENTRY_BYTES ||
      total > MAX_UNZIPPED_BYTES ||
      (size > 1024 * 1024 && size / Math.max(1, compressed) > 200)
    ) {
      throw new Error(
        "압축 해제 크기 또는 압축 비율이 안전 한도를 초과합니다.",
      );
    }
    const rawName = data.subarray(pos + 46, pos + 46 + nameLength);
    const name = rawName.toString("utf8");
    if (
      name.includes("\0") ||
      name.includes("\\") ||
      name.startsWith("/") ||
      /^[A-Za-z]:/.test(name) ||
      name.split("/").includes("..") ||
      entries.has(name)
    ) {
      throw new Error("안전하지 않거나 중복된 ZIP 항목 이름입니다.");
    }
    if (local + 30 > directoryStart || data.readUInt32LE(local) !== 0x04034b50)
      throw new Error("ZIP 로컬 헤더가 손상되었습니다.");
    const localFlags = data.readUInt16LE(local + 6);
    const localNameLength = data.readUInt16LE(local + 26);
    const start = local + 30 + localNameLength + data.readUInt16LE(local + 28);
    if (
      localFlags !== flags ||
      data.readUInt16LE(local + 8) !== method ||
      start + compressed > directoryStart ||
      !data.subarray(local + 30, local + 30 + localNameLength).equals(rawName)
    ) {
      throw new Error("ZIP 중앙 정보와 로컬 정보가 일치하지 않습니다.");
    }
    if (
      !(flags & 8) &&
      (data.readUInt32LE(local + 14) !== crc ||
        data.readUInt32LE(local + 18) !== compressed ||
        data.readUInt32LE(local + 22) !== size)
    ) {
      throw new Error("ZIP 파일 크기 또는 무결성 정보가 일치하지 않습니다.");
    }
    entries.set(name, { name, method, compressed, size, crc, start });
    regions.push([local, start + compressed]);
    pos = next;
  }
  if (pos !== end) throw new Error("ZIP 디렉터리 항목 수가 일치하지 않습니다.");
  regions.sort((a, b) => a[0] - b[0]);
  if (regions.some((region, i) => i > 0 && region[0] < regions[i - 1][1]))
    throw new Error("겹치는 ZIP 항목은 허용하지 않습니다.");
  return entries;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const value of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function unzipEntry(data: Buffer, entry: ZipEntry): Buffer {
  const compressed = data.subarray(entry.start, entry.start + entry.compressed);
  let result: Buffer;
  try {
    result =
      entry.method === 0
        ? compressed
        : inflateRawSync(compressed, {
            maxOutputLength: Math.max(1, entry.size),
          });
  } catch {
    throw new Error(
      "손상된 압축 데이터이거나 실제 압축 해제 크기가 한도를 초과합니다.",
    );
  }
  if (result.length !== entry.size || crc32(result) !== entry.crc)
    throw new Error("ZIP 파일의 실제 크기 또는 무결성 검사가 실패했습니다.");
  return result;
}

function readXml(bytes: Buffer): string {
  const xml = decodeText(bytes);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))
    throw new Error(
      "DTD 또는 외부 엔터티가 포함된 XML 문서는 지원하지 않습니다.",
    );
  if (XMLValidator.validate(xml) !== true)
    throw new Error("Office 문서의 XML 형식이 손상되었습니다.");
  return xml;
}

function validateArchive(data: Buffer, entries: Map<string, ZipEntry>): void {
  // Bound actual inflation as well: a forged uncompressed-size header alone
  // must not make a later DOCX library allocate an unbounded buffer.
  for (const entry of entries.values()) {
    const bytes = unzipEntry(data, entry);
    if (/\.(?:xml|rels)$/i.test(entry.name)) readXml(bytes);
  }
}

type XmlNode = Record<string, unknown>;
const xmlParser = new XMLParser({
  preserveOrder: true,
  removeNSPrefix: true,
  ignoreAttributes: true,
  trimValues: false,
  parseTagValue: false,
  processEntities: true,
});

function paragraphText(nodes: XmlNode[]): string {
  let text = "";
  for (const node of nodes) {
    for (const [tag, children] of Object.entries(node)) {
      if (tag === "t" && Array.isArray(children)) {
        text += children
          .map((child: XmlNode) =>
            typeof child["#text"] === "string" ? child["#text"] : "",
          )
          .join("");
      } else if (tag === "br") text += "\n";
      else if (tag === "tab") text += "\t";
      else if (Array.isArray(children))
        text += paragraphText(children as XmlNode[]);
    }
  }
  return text;
}

function* paragraphs(nodes: XmlNode[]): Generator<string> {
  for (const node of nodes) {
    for (const [tag, children] of Object.entries(node)) {
      if (!Array.isArray(children)) continue;
      // Collect at paragraph boundaries once; table-cell paragraphs follow
      // the same traversal and are not extracted again as separate tables.
      if (tag === "p") yield paragraphText(children as XmlNode[]);
      else yield* paragraphs(children as XmlNode[]);
    }
  }
}

const relationshipParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  trimValues: false,
  parseTagValue: false,
  processEntities: true,
});

function* elements(nodes: XmlNode[], localName: string): Generator<XmlNode> {
  for (const node of nodes) {
    for (const [tag, children] of Object.entries(node)) {
      if (tag.split(":").at(-1) === localName) yield node;
      if (Array.isArray(children))
        yield* elements(children as XmlNode[], localName);
    }
  }
}

function orderedSlides(
  data: Buffer,
  entries: Map<string, ZipEntry>,
  warnings: string[],
): ZipEntry[] {
  const allSlides = [...entries.values()]
    .filter((entry) => /^ppt\/slides\/slide[1-9]\d*\.xml$/.test(entry.name))
    .sort(
      (a, b) =>
        Number(a.name.match(/slide(\d+)\.xml$/)![1]) -
        Number(b.name.match(/slide(\d+)\.xml$/)![1]),
    );
  const presentation = relationshipParser.parse(
    readXml(unzipEntry(data, entries.get("ppt/presentation.xml")!)),
  ) as XmlNode[];
  const ids = [...elements(presentation, "sldId")].map((node) => {
    const attrs = node[":@"] as Record<string, string> | undefined;
    return (
      attrs &&
      Object.entries(attrs).find(
        ([key]) => key.startsWith("@_") && key.endsWith(":id"),
      )?.[1]
    );
  });
  if (!ids.length) {
    warnings.push(
      "발표 순서 정보가 없어 슬라이드 파일 번호 순서로 추출했습니다.",
    );
    return allSlides;
  }
  const relationships = entries.get("ppt/_rels/presentation.xml.rels");
  if (!relationships)
    throw new Error("PPTX 슬라이드 순서의 관계 정보가 없습니다.");
  const relations = relationshipParser.parse(
    readXml(unzipEntry(data, relationships)),
  ) as XmlNode[];
  const targets = new Map<string, string>();
  for (const node of elements(relations, "Relationship")) {
    const attrs = node[":@"] as Record<string, string>;
    if (!attrs?.["@_Type"]?.endsWith("/slide")) continue;
    const target = attrs["@_Target"];
    if (
      attrs["@_TargetMode"] === "External" ||
      !target ||
      /^[a-z][a-z0-9+.-]*:/i.test(target) ||
      target.includes("\\")
    )
      throw new Error(
        "외부 슬라이드 관계는 지원하지 않습니다. 외부 파일을 가져오지 않았습니다.",
      );
    const path = posix.normalize(
      target.startsWith("/") ? target.slice(1) : `ppt/${target}`,
    );
    if (
      !/^ppt\/slides\/slide[1-9]\d*\.xml$/.test(path) ||
      targets.has(attrs["@_Id"])
    )
      throw new Error("PPTX 슬라이드 관계 경로가 올바르지 않습니다.");
    targets.set(attrs["@_Id"], path);
  }
  const used = new Set<string>();
  return ids.map((id) => {
    const target = id && targets.get(id);
    const entry = target && entries.get(target);
    if (!entry || used.has(entry.name))
      throw new Error(
        "PPTX 발표 순서의 슬라이드가 누락되었거나 중복되었습니다.",
      );
    used.add(entry.name);
    return entry;
  });
}

async function extractPptx(
  data: Buffer,
  output: TextCollector,
  warnings: string[],
): Promise<number> {
  const entries = inspectZip(data);
  if (
    !entries.has("[Content_Types].xml") ||
    !entries.has("ppt/presentation.xml")
  )
    throw new Error("올바른 PPTX 프레젠테이션 파일이 아닙니다.");
  validateArchive(data, entries);
  const slides = orderedSlides(data, entries, warnings);
  if (!slides.length)
    throw new Error("PPTX 파일에 읽을 수 있는 슬라이드가 없습니다.");
  if (slides.length > MAX_PAGES)
    warnings.push(
      `전체 ${slides.length}장 중 처음 ${MAX_PAGES}장까지만 추출했습니다.`,
    );
  if (
    [...entries.keys()].some((name) =>
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name),
    )
  )
    warnings.push("발표자 노트는 추출 범위에 포함하지 않았습니다.");
  warnings.push(
    "PPTX의 이미지·차트·SmartArt 내부 글자는 OCR하지 않았습니다. 슬라이드 XML의 편집 가능한 텍스트만 추출합니다.",
  );
  const empty: number[] = [];
  for (const [index, slide] of slides.slice(0, MAX_PAGES).entries()) {
    const nodes = xmlParser.parse(
      readXml(unzipEntry(data, slide)),
    ) as XmlNode[];
    output.append(`${index ? "\n\n" : ""}[슬라이드 ${index + 1}]\n`);
    let hasText = false;
    for (const paragraph of paragraphs(nodes)) {
      if (paragraph.trim()) hasText = true;
      output.append(`${paragraph}\n`);
    }
    if (!hasText) empty.push(index + 1);
    if (output.truncated) break;
  }
  if (empty.length)
    warnings.push(
      `텍스트가 없는 슬라이드: ${empty.slice(0, 20).join(", ")}${empty.length > 20 ? ` 외 ${empty.length - 20}장` : ""}. 이미지 문서는 OCR이 필요하며 내용을 추정하지 않았습니다.`,
    );
  return slides.length;
}

async function extractDocx(
  data: Buffer,
  output: TextCollector,
  warnings: string[],
): Promise<void> {
  const entries = inspectZip(data);
  if (!entries.has("[Content_Types].xml") || !entries.has("word/document.xml"))
    throw new Error("올바른 DOCX 문서 파일이 아닙니다.");
  validateArchive(data, entries);
  try {
    const result = await mammoth.extractRawText({ buffer: data });
    output.append(result.value);
    for (const message of result.messages.slice(0, 10))
      warnings.push(`DOCX 변환: ${message.message.slice(0, 500)}`);
    warnings.push(
      "DOCX의 페이지 수와 시각적 배치는 계산하지 않았으며 이미지 내 글자는 OCR하지 않았습니다.",
    );
  } catch {
    throw new Error(
      "DOCX 본문을 읽을 수 없습니다. 문서가 손상되었거나 지원하지 않는 형식입니다.",
    );
  }
}

async function extractPdf(
  data: Buffer,
  output: TextCollector,
  warnings: string[],
): Promise<number> {
  if (!data.subarray(0, 1024).includes(Buffer.from("%PDF-")))
    throw new Error("올바른 PDF 파일이 아닙니다.");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    disableAutoFetch: true,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PAGES)
      warnings.push(
        `전체 ${pdf.numPages}쪽 중 처음 ${MAX_PAGES}쪽까지만 추출했습니다.`,
      );
    const empty: number[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
      const page = await pdf.getPage(n);
      try {
        const content = await page.getTextContent();
        let hasText = false;
        output.append(`${n > 1 ? "\n\n" : ""}[페이지 ${n}]\n`);
        for (const item of content.items) {
          if (!("str" in item)) continue;
          if (item.str.trim()) hasText = true;
          output.append(item.str + (item.hasEOL ? "\n" : " "));
          if (output.truncated) break;
        }
        if (!hasText) empty.push(n);
      } finally {
        page.cleanup();
      }
      if (output.truncated) break;
    }
    warnings.push(
      "PDF 텍스트 레이어만 추출했습니다. 표·다단의 읽기 순서는 원본과 다를 수 있으며 이미지 글자는 OCR하지 않았습니다.",
    );
    if (empty.length)
      warnings.push(
        `텍스트가 없는 페이지: ${empty.slice(0, 20).join(", ")}${empty.length > 20 ? ` 외 ${empty.length - 20}쪽` : ""}. 스캔·이미지 페이지는 OCR이 필요하며 내용을 추정하지 않았습니다.`,
      );
    return pdf.numPages;
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException")
      throw new Error(
        "암호화된 PDF는 지원하지 않습니다. 암호를 제거한 파일을 사용하세요.",
      );
    throw new Error(
      "PDF를 읽을 수 없습니다. 손상되었거나 지원하지 않는 PDF 형식입니다.",
    );
  } finally {
    await task.destroy();
  }
}

export async function extractDocument(input: {
  name: string;
  dataBase64: string;
}): Promise<ExtractedDocument> {
  if (
    !input ||
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 250 ||
    /[\x00-\x1f]/.test(input.name)
  )
    throw new Error("올바른 파일 이름을 지정하세요.");
  // Name is display metadata only; it is never used to create or open a path.
  const extension = input.name.match(/\.([^.\/\\]+)$/)?.[1].toLowerCase();
  if (!extension || !supported.has(extension))
    throw new Error(
      "지원하는 파일 형식은 TXT, MD, CSV, JSON, DOCX, PDF, PPTX입니다.",
    );
  const data = decodeBase64(input.dataBase64);
  const output = new TextCollector();
  const warnings: string[] = [];
  let pageCount: number | null = null;
  if (extension === "pptx")
    pageCount = await extractPptx(data, output, warnings);
  else if (extension === "docx") await extractDocx(data, output, warnings);
  else if (extension === "pdf")
    pageCount = await extractPdf(data, output, warnings);
  else {
    const text = decodeText(data);
    if (extension === "json") {
      try {
        JSON.parse(text);
      } catch {
        throw new Error("올바른 JSON 문서가 아닙니다. JSON 구문을 확인하세요.");
      }
    }
    output.append(text);
  }
  if (output.truncated)
    warnings.push(
      "추출 텍스트가 150,000자 한도를 초과하여 뒷부분을 생략했습니다.",
    );
  if (!output.text.trim())
    warnings.push("문서에서 추출할 텍스트를 찾지 못했습니다.");
  return { name: input.name, text: output.text, pageCount, warnings };
}
