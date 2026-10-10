const MAX_TEXT = 150000;
export async function extractBrowserDocument(file: File) {
  if (file.size > 15 * 1024 * 1024) throw new Error("파일당 15MB 이하로 나눠 주세요.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  let text = "";
  let pageCount: number | null = null;
  const warnings = ["이 브라우저에서만 처리했습니다. 서버 업로드·OCR·시각 판독은 하지 않았습니다."];
  if (["txt", "md", "csv", "json"].includes(extension ?? "")) {
    text = await file.text();
  } else if (extension === "pdf") {
    const pdf = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdf.GlobalWorkerOptions.workerSrc = worker.default;
    const job = pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const document = await job.promise;
      const pageLimit = Math.min(document.numPages, 150);
      pageCount = 0;
      if (document.numPages > 150) warnings.push("처음 150쪽만 읽었습니다.");
      for (let i = 1; i <= pageLimit && text.length < MAX_TEXT; i++) {
        const page = await document.getPage(i);
        const content = await page.getTextContent();
        text += `\n[페이지 ${i}]\n` + content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
        pageCount = i;
        page.cleanup();
      }
      if (pageCount < pageLimit) warnings.push(`텍스트 한도로 ${pageCount}쪽까지만 읽었습니다.`);
    } finally { await job.destroy(); }
  } else {
    throw new Error("공개 웹에서는 PDF·TXT·MD·CSV·JSON을 읽습니다. DOCX·PPTX는 텍스트를 붙여 넣거나 로컬 앱에서 여세요.");
  }
  if (text.length > MAX_TEXT) warnings.push("추출 한도로 처음 150,000자만 보관합니다.");
  text = text.slice(0, MAX_TEXT);
  if (!text.replace(/\[페이지 \d+\]/g, "").trim()) throw new Error("읽을 수 있는 텍스트가 없습니다. 이미지 PDF는 OCR 후 텍스트로 등록하세요.");
  return { name: file.name, text, pageCount, warnings };
}
