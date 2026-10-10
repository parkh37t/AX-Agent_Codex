# con-ai 소스 벤치마크와 AX Agent Studio의 적용 범위

기준일: **2026-10-10, Asia/Seoul**.

조사 대상은 공개 저장소 [parkh37t/con-ai](https://github.com/parkh37t/con-ai)의 커밋 [`042d6356891f02d64f2bc184b00fbce189b5b9fb`](https://github.com/parkh37t/con-ai/tree/042d6356891f02d64f2bc184b00fbce189b5b9fb)입니다. 조사에 사용한 읽기 전용 checkout 경로는 `/workspace/scratch/con-ai-benchmark`입니다. 아래 GitHub 링크는 모두 이 커밋에 고정했습니다.

**8개 경로의 코드를 조사했습니다.** 배포된 GitHub Pages를 실행하거나 실제 모델을 호출하지 않았고, 화면의 시각 품질·접근성·브라우저 동작을 실측하지 않았습니다. 코드상 기능, 코드에서 추론한 위험, AX에 제안한 개선을 구분합니다. AX 제품 UI를 만들 때 con-ai의 소스 코드를 복사하지 않았습니다.

## 조사한 8개 경로

| 경로 | 코드에서 확인한 역할 | 소스 근거 | AX에 참고한 원칙 |
|---|---|---|---|
| `#/` | 히어로, 간편 생성, 결과 예시, 4단계 안내, 프로젝트 건수·최근 결과. 없는 예시는 비활성 표시 | [MainPage.tsx](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/MainPage.tsx#L21) | 다음 행동을 먼저 보여 주고, 실제로 없는 산출물을 성공 사례처럼 표시하지 않기 |
| `#/new` | 짧은 입력과 기기 선택으로 Screen을 만든 뒤 생성 job 시작. 작업 ID를 URL에 보관 | [SimpleHomePage.tsx](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/SimpleHomePage.tsx#L48), [simple-flow.ts](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/simple-flow.ts#L108) | 시작은 간단하게 하되 실제로 선택·전송한 근거를 명확히 드러내기 |
| `#/asis` | URL/메모 분석 목록, 상세의 구조 요약·페인포인트·이미지·채택 상태. 정적 배포에서는 저장된 샘플 사용 | [AsisListPage.tsx](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/AsisListPage.tsx#L20), [AsisDetailPage.tsx](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/AsisDetailPage.tsx#L134) | 관찰, 영향, 개선 제안을 나누고 수집 범위와 사람의 판단을 분리하기 |
| `#/references` | 화면 종류별 합성 예시와 영역·요소·CASE·동작 등 구조 명세를 보여 줌 | [ReferencesPage.tsx](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/ReferencesPage.tsx#L10) | 참고 자료를 이미지뿐 아니라 재사용할 구조로 설명하고 합성임을 표시하기 |
| `#/trace` | REQ→IA→FN→SCR 연결표, coverage와 공백, 이유·이름을 입력하는 ID 발번·연결 제안 | [TraceMatrixPage.tsx](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/TraceMatrixPage.tsx#L20), [rtm-view.ts](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/rtm-view.ts#L9) | 연결률과 전체 품질·승인을 구분하고 미연결 항목을 직접 고치게 하기 |
| `#/advanced` | 프로젝트 전환, 단계 KPI, 요구사항·수용 조건, IA, 화면 상태·버전·코멘트 링크 | [HomePage.tsx](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/HomePage.tsx#L12) | 간단한 시작 화면과 상세 편집 작업대를 나누고 프로젝트 문맥 유지하기 |
| `#/prototype` | 기존 API로 분석→생성→수정→승인을 순서대로 실행하는 체험 흐름, 로컬 진행 상태 | [PrototypePage.tsx](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/PrototypePage.tsx#L41) | 체험에서도 실제 상태를 표시하고 단계 완료와 업무 근거 연결을 구분하기 |
| `#/plan` | IA 트리, 연결 화면, 선택 근거, 실제 요청 기반 프롬프트 미리보기, 단일·순차 일괄 생성 | [PlanPage.tsx](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/PlanPage.tsx#L49) | 메뉴·기능·화면 연결을 먼저 드러내고 생성 대상과 현재 상태를 함께 보여 주기 |

## 기능 해석에서 확인한 경계

### 간편 생성과 체험은 완성된 추적 관계가 아니다

간편 생성 요청은 `requirement_ids`, `criterion_ids`, `roles`, `keep_conditions`를 빈 배열로 구성합니다([simple-flow.ts:108](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/simple-flow.ts#L108)). IA 문맥을 사용하는 것과 요구사항을 명시적으로 연결하는 것은 다릅니다. 체험 분석의 ID·페인포인트도 다음 생성 요청에 자동으로 전달되지 않습니다([PrototypePage.tsx:82](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/PrototypePage.tsx#L82)).

따라서 “4단계를 실행했다”를 “AS-IS→REQ→화면 추적을 완성했다”로 해석하지 않았습니다. AX에서는 실제 참조로 연결 공백을 계산합니다. 메뉴 초안에 출처가 없으면 가설 상태와 공백을 유지합니다.

### AS-IS 수집 범위와 요구사항 채택은 별개다

서버 AS-IS 분석은 단일 URL의 PC·모바일 캡처와 headings/nav/forms/buttons 구조를 수집합니다. 구조 목록은 각각 최대 30개이며 모델 입력에는 URL·메모·구조가 사용됩니다. 캡처를 모델에 직접 전달한 시각 분석이라고 볼 근거는 없습니다([asis-runner.ts:257](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/api/src/asis-runner.ts#L257), [구조 수집](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/api/src/asis-runner.ts#L304)). 페인포인트 채택 API는 상태를 바꾸며 자동 REQ 변환은 하지 않습니다([app.ts:751](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/api/src/app.ts#L751)).

AX의 현재 AS-IS는 **등록한 자료의 텍스트 기반 분석**입니다. URL 방문, 스크린샷 수집, OCR을 구현했다고 설명하지 않습니다.

### 합성 어댑터, 모델 실행, 검사 실행을 구분해야 한다

브라우저 파이프라인에는 자격증명이 없으면 FixtureAdapter를, 있으면 Anthropic 호출을 선택하는 분기가 있습니다([pipeline.ts:5](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/browser-run/pipeline.ts#L5)). 합성 어댑터도 명세·렌더·검사를 실행할 수 있지만 결과가 실제 모델 추론이라는 뜻은 아닙니다.

일부 주석과 달리 브라우저 V3 검사 함수가 runtime에서 주입되고 실행 경로로 이어지는 것을 확인했습니다([runtime.ts:32](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/browser-run/runtime.ts#L32), [pipeline.ts:440](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/browser-run/pipeline.ts#L440)). 이 관찰은 **코드상 실행 경로 확인**이며 이번 조사에서 V3를 직접 실행했다는 의미는 아닙니다. AX도 합성 예시·규칙 기반 초안·Codex 생성 경로를 구분합니다.

### 연결률, 작업 성공, 최종 승인은 서로 다르다

con-ai 연결표는 분모 0을 100%로 만들지 않으며, 100% 연결과 검증·보류·사인오프는 별개라고 표시합니다([rtm-view.ts:9](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/rtm-view.ts#L9), [TraceMatrixPage.tsx:322](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/TraceMatrixPage.tsx#L322)). 생성 작업이 성공해도 필수검사를 통과하지 못한 산출물은 `validation_pending`일 수 있습니다([generation/pipeline.ts:183](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/workers/generation/src/pipeline.ts#L183)).

승인 게이트는 대상 baseline, hash, 필수검사, 열린 blocker를 확인합니다. 승인자 이름은 입력 문자열이므로 조직 계정에 의한 본인 확인과 동일하지 않습니다([approval-gate.ts:47](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/packages/domain/src/approval-gate.ts#L47), [승인 API](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/api/src/app.ts#L600)). AX는 구조 검수와 사용자 반영을 구현했으며, 이 정식 승인 모델 전체를 구현하지는 않았습니다.

### 코드에서 도출한 개선 후보는 재현 결과와 구분한다

- **프로젝트 문맥:** project query가 없으면 첫 프로젝트를 고르는 [App.tsx](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/App.tsx#L38)와 일부 query 없는 이동 링크 사이에 프로젝트 선택이 바뀔 가능성이 있습니다. 브라우저에서 재현한 버그로 단정하지 않았습니다.
- **수정의 완료 판정:** fixture가 지원하지 않는 수정 요청을 unresolved로 남기는 경로와, 수정 job 성공 시 요청 코멘트를 resolved 처리하는 경로가 있습니다([fixture-adapter.ts:408](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/packages/model-adapter/src/fixture-adapter.ts#L408), [pipeline.ts:219](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/workers/generation/src/pipeline.ts#L219)). 작업 성공만으로 사람의 검토 항목을 자동 해결하지 않는 원칙을 도출했습니다.
- **일괄 생성:** 첫 실패에 중단하는 순차 처리와 폴링 대기 종료가 있습니다. 클라이언트 대기 종료는 서버 작업 취소와 다릅니다([PlanPage.tsx:68](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/web/src/pages/PlanPage.tsx#L68)). AX의 취소 버튼은 로컬 작업 취소 API를 호출합니다. 같은 탭 새로고침 후에는 보관한 작업 ID로 상태를 다시 조회하지만 서버 재시작 후 재개 기능은 없습니다.

## AX에서 채택한 것과 새로 만든 것

| 구분 | AX Agent Studio의 현재 처리 |
|---|---|
| 업무 흐름 | 제안→수주·범위 전환→자료 기반 AS-IS→화면 설계로 독립 구성 |
| UI | 현재 프로젝트와 다음 행동을 중심으로 자체 탐색 구조·색상·카드·편집 화면 구성 |
| 근거·추적 | 출처 ID와 주장 상태, REQ·IA·FN·SCR 연결, 구조 공백 표시 |
| 생성 유형 | 가상 고객 체험, 메뉴 규칙 기반 초안, ChatGPT 인증 Codex 호출 구분 |
| 결과 반영 | 사용자 검토와 현재 참조 재검사 후 적용, 스냅샷 실패 시 중단, 생성 중 편집 경고, AI로 변경된 요구사항의 범위 결정 재확인 |
| 저장·이관 | localStorage, 손상 원본 별도 복구 백업, 최근 8개 스냅샷, JSON 백업/새 프로젝트 복원, PPTX·Markdown·CSV·HTML 내보내기 |
| 아직 미구현 | 서버 DB·협업, 원본 해시·조항 locator, CASE별 검증 기록, 정식 baseline·승인자·sign-off, URL 실사·OCR |

제안서 작성과 수주 범위 전환은 이번 조사에서 확인한 con-ai의 핵심 API 기능이 아니며 AX에서 별도로 구성한 영역입니다. 해당 커밋의 [API 라우트](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/apps/api/src/app.ts)와 [importer 진입점](https://github.com/parkh37t/con-ai/blob/042d6356891f02d64f2bc184b00fbce189b5b9fb/packages/importers/src/index.ts)을 조사한 범위에서, RFP 파일 업로드·제안서 관리·수주 인계 API는 확인하지 못했습니다. 저장소 전체의 모든 가능성을 부정하는 주장으로 확대하지 않습니다.

AX의 정확한 구현 계약과 한계는 [제품 명세](product-spec.md), 계정 연결은 [인증 안내](authentication.md)를 따릅니다. 벤치마크 제품의 기능이나 초기 설계 제안을 AX의 완료 기능으로 간주하지 않습니다.
