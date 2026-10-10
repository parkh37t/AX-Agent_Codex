# 기술 검수와 재현

## 실행 환경

Python3.10+와 `python-pptx`, `PyMuPDF`, `python-docx`가 필요하다. 실행 시 설치 여부를 먼저 확인한다. PDF 변환·썸네일은 LibreOffice 또는 PowerPoint 및 PyMuPDF로 수행할 수 있다. 고객 폰트는 사용 권한과 설치 상태를 별도로 확인한다. 이 묶음에는 폰트 파일이나 고객 원본이 없다.

아래 명령은 **스킬 폴더에서**, 읽기/쓰기 경로를 실제 작업에 맞춰 실행한다. 스크립트는 원본을 덮어쓰지 않으며 결과 경로가 이미 있으면 중단한다.

```bash
python scripts/inspect_deck.py /path/to/source.pptx --out /path/to/fresh-analysis
python scripts/build_template.py --out /path/to/new-layout-gallery.pptx --font "Noto Sans CJK KR"
python scripts/audit_proposal.py /path/to/proposal.pptx --mode draft --profile report --json-out /path/to/new-audit.json
```

## 추출의 의미

- PPTX: 슬라이드 텍스트/표/노트, 그룹 하위 도형, 위치·크기, 명시 폰트·크기·색, 테마 선언, 다이어그램 XML의 텍스트를 보존한다. 연결된 외부 이미지는 가져오지 않고 미포함 상태로 기록한다.
- 폰트 계수는 글자 수를 가중치로 삼은 **선언 빈도**다. 한 run의 서로 다른 script face가 같은 글자 범위를 가질 수 있으므로 독립 문자 수로 합산하지 않는다. 테마의 전 세계 언어용 폰트 목록은 실제 사용 폰트 목록이 아니다.
- 상속 글꼴·실제 렌더·이미지 속 서체를 자동 확정하지 않는다. PDF는 원본 텍스트 span의 폰트 정보를 읽지만 그림 안의 글씨는 별도 시각 판독이 필요하다.
- DOCX는 문단·표를 읽지만 페이지 배치를 계산하지 않는다. 내부 body 단위를 물리 페이지 수로 보고하지 않는다. 표·문단의 정확한 교차 순서가 중요하면 원본과 대조한다.
- AppleDouble 파일은 실제 발표자료로 취급하지 않는다.

## 정적 감사의 범위

`audit_proposal.py`는 빈 덱, 슬라이드 밖 최상위 도형, 명시된 작은 글씨, 본문/노트의 일부 placeholder, 선택 입력한 슬라이드계획/근거표의 ID·상태·메시지·행 수를 검사한다. `footer:`·`label:`·`eyebrow:` 도형명은 템플릿의 역할 표기다. 일반 본문에 이름만 붙여 작은 글씨를 숨기는 용도로 쓰지 않는다.

```bash
python scripts/audit_proposal.py /path/to/proposal.pptx \
  --mode final --profile presentation \
  --slide-plan /path/to/slide-plan.csv \
  --evidence /path/to/evidence-register.csv \
  --json-out /path/to/final-static-audit.json
```

결과 `pass`는 **정적 검사만**의 통과다. 겹침·텍스트 넘침·한글 줄바꿈·도식 의미·색 대비·합계·RFP 충족·주장 사실성은 별도 검수한다. 글씨 크기 경고가 남아도 종료코드는0일 수 있으므로 warnings를 읽는다. 최상위 도형의 화면 밖 배치는 의도적 재단일 수 있어 원본을 확인하고 처리 결과를 기록한다. 화면 밖 참조 이미지도 제출본에서 그대로 둘지 결정한다.

종료코드: 0 정적검사pass, 2 검사fail, 3 실행error. 출력을 파일로 저장하거나 파이프할 때 종료코드를 보존한다. 도구 오류를 `pass`로 바꾸지 않는다.

## 시각 검수

1. 원본을 보존하고 별도 경로에 PDF를 생성한다. 페이지 수와 비율을 먼저 대조한다.
2. 전 페이지 컨택트시트로 흐름·밀도·빈 페이지·마스터 불일치를 본다.
3. 제목/표/도식/UI/이미지 등 유형별로 원본 크기를 확대해 잘림·겹침·기호·라인·읽기 순서를 확인한다.
4. 글꼴 대체가 있으면 대표 페이지 비교만으로 끝내지 않고 영향을 받는 페이지를 다시 본다. 제공된 원본PDF가 있으면 우선 비교 기준으로 삼는다.
5. 작은 표는 제출 크기100%, 발표본은 상영 크기에서 읽는다. 핵심 조건을 각주로 숨기지 않는다.
6. 시각 검토 범위를 ‘전수’, ‘대표 표본’, ‘미실행’으로 기록한다. 렌더 파일의 존재는 전수 육안 검사 증거가 아니다.

## 이번 묶음의 검증 기록

실제 실행 결과는 `validation-report.md`에 남긴다. 추가 원본·새 템플릿·스크립트 변경 시 해당 부분을 다시 검사한다. 표본 PPTX의 실패 fixture로 bounds와 최종 placeholder 차단을 확인하며, 의도적 오류를 고치지 않고 정적 감사가 실패를 보고하는지를 검증한다.
