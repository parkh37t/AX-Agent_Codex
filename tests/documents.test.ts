import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { extractDocument } from "../server/documents.js";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_TEXT = 150_000;
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function extract(name: string, data: string | Buffer) {
  return extractDocument({
    name,
    dataBase64: (typeof data === "string"
      ? Buffer.from(data, "utf8")
      : data
    ).toString("base64"),
  });
}

function escapeXml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function relationships(items: { id: string; type: string; target: string }[]) {
  return `${XML}<Relationships xmlns="${REL_NS}">${items
    .map(
      ({ id, type, target }) =>
        `<Relationship Id="${id}" Type="${OFFICE_REL}/${type}" Target="${target}"/>`,
    )
    .join("")}</Relationships>`;
}

function types(overrides: { path: string; type: string }[]) {
  return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Default Extension="png" ContentType="image/png"/>
    ${overrides.map(({ path, type }) => `<Override PartName="/${path}" ContentType="${type}"/>`).join("")}
  </Types>`;
}

async function docx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    types([
      {
        path: "word/document.xml",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
      },
    ]),
  );
  zip.file(
    "_rels/.rels",
    relationships([
      { id: "rId1", type: "officeDocument", target: "word/document.xml" },
    ]),
  );
  zip.file(
    "word/document.xml",
    `${XML}<w:document xmlns:w="${W_NS}"><w:body>
    <w:p><w:r><w:t>첫 문단 &amp; 확인</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>고객명</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>가상 고객</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:t>마지막 문단</w:t></w:r></w:p><w:sectPr/>
  </w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function paragraph(text: string) {
  return `<a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p>`;
}

function shape(text: string, id = 2) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraph(text)}</p:txBody></p:sp>`;
}

function table() {
  const cell = (text: string) =>
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraph(text)}</a:txBody><a:tcPr/></a:tc>`;
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
    <p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm>
    <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>
      <a:tblPr/><a:tblGrid><a:gridCol w="50"/><a:gridCol w="50"/></a:tblGrid>
      <a:tr h="50">${cell("표 이름")}${cell("표 값")}</a:tr>
      <a:tr h="50">${cell("매출")}${cell("123")}</a:tr>
    </a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

type Slide = { file?: string; body: string; notes?: string };

async function pptx(slides: Slide[]) {
  const zip = new JSZip();
  const slideFiles = slides.map(
    (slide, index) => slide.file ?? `slide${index + 1}.xml`,
  );
  zip.file(
    "[Content_Types].xml",
    types([
      {
        path: "ppt/presentation.xml",
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
      },
      ...slideFiles.map((file) => ({
        path: `ppt/slides/${file}`,
        type: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
      })),
      ...slides.flatMap((slide, index) =>
        slide.notes === undefined
          ? []
          : [
              {
                path: `ppt/notesSlides/notesSlide${index + 1}.xml`,
                type: "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml",
              },
            ],
      ),
    ]),
  );
  zip.file(
    "_rels/.rels",
    relationships([
      { id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" },
    ]),
  );
  zip.file(
    "ppt/presentation.xml",
    `${XML}<p:presentation xmlns:p="${P_NS}" xmlns:r="${OFFICE_REL}"><p:sldIdLst>
    ${slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("")}
    </p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    relationships(
      slideFiles.map((file, index) => ({
        id: `rId${index + 1}`,
        type: "slide",
        target: `slides/${file}`,
      })),
    ),
  );
  slides.forEach((slide, index) => {
    const file = slideFiles[index]!;
    zip.file(
      `ppt/slides/${file}`,
      `${XML}<p:sld xmlns:p="${P_NS}" xmlns:a="${A_NS}" xmlns:r="${OFFICE_REL}">
      <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
        <p:grpSpPr/>${slide.body}</p:spTree></p:cSld></p:sld>`,
    );
    if (slide.notes !== undefined) {
      zip.file(
        `ppt/slides/_rels/${file}.rels`,
        relationships([
          {
            id: "rIdNotes",
            type: "notesSlide",
            target: `../notesSlides/notesSlide${index + 1}.xml`,
          },
        ]),
      );
      zip.file(
        `ppt/notesSlides/notesSlide${index + 1}.xml`,
        `${XML}<p:notes xmlns:p="${P_NS}" xmlns:a="${A_NS}">
        <p:cSld><p:spTree>${shape(slide.notes)}</p:spTree></p:cSld></p:notes>`,
      );
    }
  });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// A complete, tiny PDF with byte offsets and xref avoids parser-recovery fixtures.
function pdf(pages: string[], externalLink = false) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const text of pages) {
    const contentObject = objects.length + 2;
    const escaped = text
      .replaceAll("\\", "\\\\")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)");
    const stream = text ? `BT /F1 12 Tf 20 200 Td (${escaped}) Tj ET` : "";
    const annotation = externalLink
      ? "/Annots [<< /Type /Annot /Subtype /Link /Rect [10 10 100 30] /A << /S /URI /URI (https://example.invalid/private-source) >> >>]"
      : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R ${annotation} >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

function expectOrderedOnce(text: string, items: string[]) {
  let previous = -1;
  for (const item of items) {
    const index = text.indexOf(item);
    expect(index, `Missing or reordered text: ${item}`).toBeGreaterThan(
      previous,
    );
    expect(
      text.indexOf(item, index + item.length),
      `Duplicated text: ${item}`,
    ).toBe(-1);
    previous = index;
  }
}

// Change declared ZIP sizes without allocating or decompressing a large payload.
function replaceZipDeclaredSize(input: Buffer, declaredSize: number) {
  const output = Buffer.from(input);
  const target = Buffer.from("word/document.xml");
  for (let offset = 0; offset < output.length - 46; offset++) {
    if (output.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = output.readUInt16LE(offset + 28);
    if (!output.subarray(offset + 46, offset + 46 + nameLength).equals(target))
      continue;
    output.writeUInt32LE(declaredSize, offset + 24);
    const localOffset = output.readUInt32LE(offset + 42);
    output.writeUInt32LE(declaredSize, localOffset + 22);
    return output;
  }
  throw new Error("Fixture document entry was not found");
}

function encryptedZipMetadata(input: Buffer) {
  const output = Buffer.from(input);
  for (let offset = 0; offset < output.length - 46; offset++) {
    if (output.readUInt32LE(offset) !== 0x02014b50) continue;
    output.writeUInt16LE(output.readUInt16LE(offset + 8) | 1, offset + 8);
    const localOffset = output.readUInt32LE(offset + 42);
    output.writeUInt16LE(
      output.readUInt16LE(localOffset + 6) | 1,
      localOffset + 6,
    );
  }
  return output;
}

describe("extractDocument — plain text", () => {
  it.each(["txt", "md", "csv", "json"])(
    "preserves Unicode and literal markup in .%s",
    async (extension) => {
      const raw = '한글 😀 <참조> & "원문"\n두 번째 줄';
      const content =
        extension === "json" ? JSON.stringify({ 내용: raw }) : raw;
      const result = await extract(`자료.${extension}`, content);
      expect(result.name).toBe(`자료.${extension}`);
      expect(result.text).toBe(content);
      expect(result.pageCount).toBeNull();
      expect(result.warnings).toEqual([]);
    },
  );

  it.each(["utf8", "utf16le", "utf16be"] as const)(
    "recognizes a %s byte order mark",
    async (encoding) => {
      const content = "한국어 문서 😀\n다음 줄";
      let buffer: Buffer;
      if (encoding === "utf8")
        buffer = Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from(content),
        ]);
      else {
        const body = Buffer.from(content, "utf16le");
        if (encoding === "utf16be") body.swap16();
        buffer = Buffer.concat([
          Buffer.from(encoding === "utf16le" ? [0xff, 0xfe] : [0xfe, 0xff]),
          body,
        ]);
      }
      const result = await extract("인코딩.txt", buffer);
      expect(result.text).toBe(content);
      expect(result.text).not.toContain("\ufffd");
    },
  );

  it("accepts an uppercase supported extension", async () => {
    expect((await extract("BRIEF.MD", "제안 내용")).text).toBe("제안 내용");
  });

  it("allows an empty plain text file and reports that it has no content", async () => {
    const result = await extract("empty.txt", "");
    expect(result.text).toBe("");
    expect(result.pageCount).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/비어|빈|없|텍스트|본문/);
  });

  it("caps extracted text and explains the omitted tail", async () => {
    const result = await extract(
      "large.txt",
      `시작${"가".repeat(MAX_TEXT)}제외되는꼬리`,
    );
    expect(result.text.startsWith("시작")).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(result.text).not.toContain("제외되는꼬리");
    expect(result.warnings.join(" ")).toMatch(/제한|초과|일부|생략|잘|150/);
  });
});

describe("extractDocument — Office documents", () => {
  it("extracts DOCX paragraphs and table cells in document order", async () => {
    const result = await extract("문서.docx", await docx());
    expectOrderedOnce(result.text, [
      "첫 문단 & 확인",
      "고객명",
      "가상 고객",
      "마지막 문단",
    ]);
    expect(result.pageCount).toBeNull();
  });

  it("uses the PPTX presentation order rather than lexical slide filenames", async () => {
    const data = await pptx([
      { file: "slide10.xml", body: shape("발표 순서 첫째") },
      { file: "slide2.xml", body: shape("발표 순서 둘째") },
      { file: "slide1.xml", body: shape("발표 순서 셋째") },
    ]);
    const result = await extract("발표.pptx", data);
    expect(result.pageCount).toBe(3);
    expectOrderedOnce(result.text, [
      "발표 순서 첫째",
      "발표 순서 둘째",
      "발표 순서 셋째",
    ]);
  });

  it("keeps PPTX paragraphs and table cells ordered without duplicating nested text", async () => {
    const data = await pptx([
      { body: `${shape("앞 문단 & 확인")}${table()}${shape("뒤 문단", 4)}` },
    ]);
    const result = await extract("표.pptx", data);
    expect(result.pageCount).toBe(1);
    expectOrderedOnce(result.text, [
      "앞 문단 & 확인",
      "표 이름",
      "표 값",
      "매출",
      "123",
      "뒤 문단",
    ]);
  });

  it("excludes speaker notes and reports the extraction boundary", async () => {
    const data = await pptx([
      { body: shape("공개 슬라이드 본문"), notes: "발표자 전용 메모 9472" },
    ]);
    const result = await extract("발표자메모.pptx", data);
    expect(result.text).toContain("공개 슬라이드 본문");
    expect(result.text).not.toContain("발표자 전용 메모 9472");
    expect(result.warnings.join(" ")).toMatch(/메모|노트|발표자/);
  });

  it("warns when a PPTX slide contains only an image instead of inventing OCR text", async () => {
    const picture =
      '<p:pic><p:nvPicPr><p:cNvPr id="2" name="Scan"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/></p:blipFill><p:spPr/></p:pic>';
    const zip = await JSZip.loadAsync(await pptx([{ body: picture }]));
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      relationships([
        { id: "rIdImage", type: "image", target: "../media/image1.png" },
      ]),
    );
    zip.file(
      "ppt/media/image1.png",
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR9sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const result = await extract(
      "스캔.pptx",
      await zip.generateAsync({ type: "nodebuffer" }),
    );
    expect(result.pageCount).toBe(1);
    expect(result.text).not.toContain("Scan");
    expect(result.warnings.join(" ")).toMatch(/이미지|OCR|텍스트|본문/);
  });

  it("reports all PPTX slides while extracting at most 150", async () => {
    const slides = Array.from({ length: 151 }, (_, index) => ({
      body: shape(`SLIDE_${String(index + 1).padStart(3, "0")}`),
    }));
    const result = await extract("long.pptx", await pptx(slides));
    expect(result.pageCount).toBe(151);
    expect(result.text).toContain("SLIDE_001");
    expect(result.text).toContain("SLIDE_150");
    expect(result.text).not.toContain("SLIDE_151");
    expect(result.warnings.join(" ")).toMatch(/150|제한|초과|일부|생략/);
  });
});

describe("extractDocument — PDF", () => {
  it("extracts multiple PDF pages and escaped PDF string characters", async () => {
    const result = await extract(
      "example.pdf",
      pdf(["First (sample) \\ source", "Second page"]),
    );
    expect(result.pageCount).toBe(2);
    expectOrderedOnce(result.text, ["First (sample) \\ source", "Second page"]);
  });

  it("warns for PDF pages without extractable text", async () => {
    const result = await extract("scan.pdf", pdf([""]));
    expect(result.pageCount).toBe(1);
    expect(result.warnings.join(" ")).toMatch(/이미지|OCR|텍스트|본문/);
  });

  it("reports total PDF pages while limiting extraction to the first 150", async () => {
    const pages = Array.from(
      { length: 151 },
      (_, index) => `PAGE_${String(index + 1).padStart(3, "0")}`,
    );
    const result = await extract("long.pdf", pdf(pages));
    expect(result.pageCount).toBe(151);
    expect(result.text).toContain("PAGE_001");
    expect(result.text).toContain("PAGE_150");
    expect(result.text).not.toContain("PAGE_151");
    expect(result.warnings.join(" ")).toMatch(/150|제한|초과|일부|생략/);
  }, 15_000);
});

describe("extractDocument — rejected inputs", () => {
  it("rejects malformed base64 rather than silently decoding a prefix", async () => {
    await expect(
      extractDocument({ name: "bad.txt", dataBase64: "aGVsbG8=***" }),
    ).rejects.toThrow(/base64|인코딩|유효|형식|잘못/i);
  });

  it("rejects syntactically invalid JSON", async () => {
    await expect(extract("broken.json", '{"내용": "미완성",}')).rejects.toThrow(
      /JSON|형식|유효|구문|문법|잘못/i,
    );
  });

  it.each(["archive.exe", "old.doc", "no-extension"])(
    "rejects unsupported filenames: %s",
    async (name) => {
      await expect(extract(name, "내용")).rejects.toThrow(/지원|확장자|형식/);
    },
  );

  it("rejects a file larger than the decoded 15 MiB limit", async () => {
    await expect(
      extract("oversize.txt", Buffer.alloc(MAX_BYTES + 1, 0x61)),
    ).rejects.toThrow(/15|용량|크기|제한|초과/);
  });

  it.each(["docx", "pptx"])(
    "rejects a corrupt .%s ZIP container with a useful error",
    async (extension) => {
      await expect(
        extract(
          `corrupt.${extension}`,
          Buffer.from("PK\x03\x04truncated archive"),
        ),
      ).rejects.toThrow(/손상|ZIP|압축|읽|추출|형식|유효/i);
    },
  );

  it("rejects non-PDF data with a PDF extension", async () => {
    await expect(extract("fake.pdf", "This is not a PDF")).rejects.toThrow(
      /PDF|손상|형식|읽|추출|유효/i,
    );
  });

  it("rejects an OLE Office container instead of treating encrypted bytes as OOXML", async () => {
    const ole = Buffer.alloc(512);
    Buffer.from("d0cf11e0a1b11ae1", "hex").copy(ole);
    await expect(extract("encrypted.docx", ole)).rejects.toThrow(/암호/);
  });

  it("rejects an encrypted ZIP before parsing its document XML", async () => {
    const data = encryptedZipMetadata(await docx());
    await expect(extract("encrypted-zip.docx", data)).rejects.toThrow(/암호/);
  });

  it("rejects excessive ZIP expansion declared in metadata before extraction", async () => {
    const data = replaceZipDeclaredSize(await docx(), 256 * 1024 * 1024);
    expect(data.length).toBeLessThan(10_000);
    await expect(extract("expansion.docx", data)).rejects.toThrow(
      /용량|크기|제한|초과|압축|손상/,
    );
  });

  it("rejects a compressed entry that expands beyond its forged small declared size", async () => {
    const zip = await JSZip.loadAsync(await docx());
    zip.file(
      "word/document.xml",
      `${XML}<w:document xmlns:w="${W_NS}"><w:body><w:p><w:r><w:t>${"A".repeat(2 * 1024 * 1024)}</w:t></w:r></w:p></w:body></w:document>`,
    );
    const compressed = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    const data = replaceZipDeclaredSize(compressed, 128);
    expect(data.length).toBeLessThan(10_000);
    await expect(extract("forged-size.docx", data)).rejects.toThrow(
      /크기|한도|초과|압축|손상|무결성/,
    );
  });
});

describe("extractDocument — external links", () => {
  it.each(["pdf", "pptx"])(
    "does not fetch external links while reading .%s text",
    async (extension) => {
      let data: Buffer;
      if (extension === "pdf") data = pdf(["Local document text"], true);
      else {
        const zip = await JSZip.loadAsync(
          await pptx([{ body: shape("Local document text") }]),
        );
        zip.file(
          "ppt/slides/_rels/slide1.xml.rels",
          `${XML}<Relationships xmlns="${REL_NS}">
        <Relationship Id="externalLink" Type="${OFFICE_REL}/hyperlink" Target="https://example.invalid/private-source" TargetMode="External"/>
        <Relationship Id="externalImage" Type="${OFFICE_REL}/image" Target="https://example.invalid/private-image.png" TargetMode="External"/>
      </Relationships>`,
        );
        const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
        zip.file(
          "ppt/slides/slide1.xml",
          slide.replace(
            "<a:r>",
            '<a:r><a:rPr><a:hlinkClick r:id="externalLink"/></a:rPr>',
          ),
        );
        data = await zip.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE",
        });
      }
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Unexpected document network request"));
      try {
        const result = await extract(`external.${extension}`, data);
        expect(result.text).toContain("Local document text");
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );
});
