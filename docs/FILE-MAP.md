# 환경 설정·MD·스킬·GitHub 파일 안내

기준일: **2026-10-10, Asia/Seoul**. 이 파일을 전체 위치 안내의 시작점으로 사용한다. 소스·설정·스킬·다운로드와 별도로 보관되는 사용자 데이터를 구분한다.

## 1. GitHub와 실제 작업 위치

| 항목 | 위치·의미 |
|---|---|
| GitHub 소유자 | `parkh37t` |
| 저장소 | [parkh37t/AX-Agent_Codex](https://github.com/parkh37t/AX-Agent_Codex) |
| **현재 개발 브랜치** | **[codex/ax-agent-studio](https://github.com/parkh37t/AX-Agent_Codex/tree/codex/ax-agent-studio)** |
| Git clone 주소 | `https://github.com/parkh37t/AX-Agent_Codex.git` |
| 최신 변경 기록 | [개발 브랜치 커밋 목록](https://github.com/parkh37t/AX-Agent_Codex/commits/codex/ax-agent-studio) |
| 초기 앱 구현 | [5cefbd6](https://github.com/parkh37t/AX-Agent_Codex/commit/5cefbd6) |
| 최초 통합 스킬·MD 패키지 | [2e220a8](https://github.com/parkh37t/AX-Agent_Codex/commit/2e220a8) |
| 기존 `main` 브랜치 | 이전 ChatGPT용 Wylie 묶음이 게시된 브랜치. AX 앱 작업은 위 개발 브랜치를 사용한다. |
| 현재 작업 폴더 | `/workspace/AX-Agent_Codex` |
| 이 안내서의 실제 경로 | `/workspace/AX-Agent_Codex/docs/FILE-MAP.md` |
| 공개 웹사이트 | **미배포**. GitHub 코드·다운로드 주소는 실행 사이트 주소가 아니다. |

아래 표의 파일 경로는 모두 `/workspace/AX-Agent_Codex/`를 기준으로 한다. 표의 링크는 GitHub에서 파일을 열며, 사용자의 PC에 존재하는 경로라는 뜻이 아니다. 새 컴퓨터에서는 소스 ZIP을 풀거나 다음 명령으로 해당 브랜치를 받는다.

```sh
git clone --branch codex/ax-agent-studio https://github.com/parkh37t/AX-Agent_Codex.git
cd AX-Agent_Codex
```

기존 checkout이 있으면 변경 상태부터 확인하며 재복제·reset으로 덮어쓰지 않는다.

## 2. 다운로드 파일

| 파일 | 용도 | GitHub 다운로드 |
|---|---|---|
| `downloads/ax-agent-studio-skills-md.zip` | 환경 설정·MD·두 스킬·제안서 템플릿 전체 묶음 | [받기](https://github.com/parkh37t/AX-Agent_Codex/raw/refs/heads/codex/ax-agent-studio/downloads/ax-agent-studio-skills-md.zip) |
| `downloads/AX-AGENT-KNOWLEDGE.md` | ChatGPT나 다음 대화에 올릴 단일 통합 지식 | [받기](https://github.com/parkh37t/AX-Agent_Codex/raw/refs/heads/codex/ax-agent-studio/downloads/AX-AGENT-KNOWLEDGE.md) |
| `downloads/ax-agent-studio.zip` | 앱 소스 전체와 스킬·문서. 설치·개발할 때 사용 | [받기](https://github.com/parkh37t/AX-Agent_Codex/raw/refs/heads/codex/ax-agent-studio/downloads/ax-agent-studio.zip) |
| `downloads/wylie-proposal-chatgpt.zip` | 기존 ChatGPT용 Wylie 제안서 묶음 | [받기](https://github.com/parkh37t/AX-Agent_Codex/raw/refs/heads/main/downloads/wylie-proposal-chatgpt.zip) |

현재 ZIP의 파일별 목록은 스킬·MD ZIP 안의 `MANIFEST.json`에서 확인한다. ZIP 파일 자체의 무결성 확인 파일은 아래와 같다.

| 저장소 기준 파일 경로 | 내용 |
|---|---|
| [downloads/AX-AGENT-SKILLS-SHA256SUMS](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/downloads/AX-AGENT-SKILLS-SHA256SUMS) | 스킬·MD ZIP과 통합 MD의 SHA-256 |
| [downloads/AX-AGENT-SHA256SUMS](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/downloads/AX-AGENT-SHA256SUMS) | 앱 소스 ZIP의 SHA-256 |
| [downloads/SHA256SUMS](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/downloads/SHA256SUMS) | 기존 Wylie ChatGPT ZIP의 SHA-256 |

## 3. 먼저 읽을 MD와 제품 문서

| 저장소 기준 파일 경로 | 내용 |
|---|---|
| [README.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/README.md) | 제품 개요, 다운로드, 설치·실행 방법 |
| [START-HERE.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/START-HERE.md) | 다른 대화·코딩 도구에서 재사용하는 방법 |
| [AGENTS.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/AGENTS.md) | 저장소에서 작업하는 코딩 에이전트의 프로젝트 안내 |
| [docs/PROJECT-INSTRUCTIONS.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/PROJECT-INSTRUCTIONS.md) | ChatGPT 프로젝트 지침 등에 복사할 내용 |
| [docs/CONTINUE-HERE.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/CONTINUE-HERE.md) | 작업 현황, 코드 구조, 남은 작업과 재개 프롬프트 |
| [docs/PROJECT-SETTINGS.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/PROJECT-SETTINGS.md) | 실행 도구·명령·포트·인증·저장·네트워크 설정 설명 |
| [docs/authentication.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/authentication.md) | 공식 Codex의 ChatGPT 계정 연결과 오류 진단 |
| [docs/product-spec.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/product-spec.md) | 현재 제품 범위·데이터 모델·내보내기 동작 |
| [docs/benchmark.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/benchmark.md) | con-ai 8개 경로의 소스 벤치마크 근거와 적용 범위 |
| [docs/validation.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/validation.md) | 실제 수행한 테스트·브라우저·PPTX 검증과 미검증 범위 |

이 안내서 자체는 `docs/FILE-MAP.md`이며 통합 지식 MD에도 함께 들어 있다.

## 4. 환경 설정 원본

| 저장소 기준 파일 경로 | 내용 |
|---|---|
| [config/project-environment.snapshot.json](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/config/project-environment.snapshot.json) | 실제 클라우드 초안의 비밀값 없는 설정 스냅샷 |
| [package.json](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/package.json) | Node 최소 버전, npm 실행 명령, 패키지 선언, 고정 Codex 버전 |
| [package-lock.json](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/package-lock.json) | 실제 재현 설치에 사용할 패키지 버전·무결성 잠금 파일 |
| [vite.config.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/vite.config.ts) | 개발 웹 5173, /api→4318 프록시, base와 빌드 경로 |
| [tsconfig.json](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/tsconfig.json) | TypeScript 컴파일·검사 설정 |
| [vitest.config.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/vitest.config.ts) | 단위 테스트 대상 설정 |
| [playwright.config.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/playwright.config.ts) | 브라우저·E2E 서버·테스트 출력 설정 |
| [.gitignore](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.gitignore) | 의존성·빌드·인증·로컬 산출물 등 Git 제외 규칙 |
| [scripts/package_knowledge.py](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/scripts/package_knowledge.py) | 스킬 ZIP·통합 MD·소스 ZIP·해시를 재생성하는 도구 |

설정 JSON에서 찾아볼 위치:

| JSON 필드 | 저장한 내용 |
|---|---|
| `repository` | 저장소, 개발 브랜치, 앱 기준 커밋, 현재 경로와 클라우드의 저장소 참조 |
| `draft.install_script` | 의존성 설치·빌드·테스트 명령 |
| `draft.start_skill` | 다음 클라우드 작업에서 서버를 시작하고 확인할 지침 |
| `draft.network_policy` | restricted / package_managers preset 및 저장된 호스트 목록 |
| `draft.secretRequirementNames` | 등록된 비밀값 요구 이름. 현재 비어 있음 |
| `draft.environmentVariableRequirements` | 등록된 환경변수 요구. 현재 비어 있음 |
| `draft.publicationConfirmed` | 게시 확인 여부. `false`는 게시 완료가 확인되지 않았다는 뜻 |
| `runtimeObservation` | 기록 당시 연결·네트워크 정책 관측 상태 |
| `authentication` | 공식 CLI 버전·로그인 방식·실제 추론 미검증 기록 |

이번 위치 확인에서도 클라우드 초안 revision 2의 설치·시작 지침이 저장된 것을 확인했다. 플랫폼 환경 설정 화면의 초안과 이 JSON 사본은 구분한다. 복사한 JSON을 읽는 것만으로 다른 환경에 설정이 적용되지 않는다. 저장된 저장소 참조 `HEAD`를 개발 브랜치명으로 오해하지 않는다.

네트워크 관측 상태는 `unknown`이며, 저장된 정책만으로 접근 성공을 보장하지 않는다. 문서의 읽기 전용 Codex 경로 오류는 이전 검증 기록이다. 현재 세션 권한과 과거 검증 시점이 다를 수 있으므로 실행 준비와 실제 모델 생성은 해당 환경에서 다시 확인한다. 이번 작업은 파일 위치 정리이며 모델 추론을 재실행하지 않았다.

환경 요약: Node.js **22.12 이상**, 공식 Codex CLI **0.162.1**, 개발 웹 **5173**, 개인용 로컬 bridge/빌드 앱 **4318**. 인증은 공식 Codex의 ChatGPT 로그인 방식이며 API 키를 입력하는 앱이 아니다.

## 5. AX 개발·실행 스킬

폴더: `.agents/skills/ax-agent-studio/`. 사용할 때 폴더 전체를 옮긴다.

| 저장소 기준 파일 경로 | 내용 |
|---|---|
| [.agents/skills/ax-agent-studio/SKILL.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/ax-agent-studio/SKILL.md) | 스킬의 진입점·적용 요청·재개 절차·제품 규칙 |
| [.agents/skills/ax-agent-studio/references/execution.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/ax-agent-studio/references/execution.md) | 설치·실행·사이트가 보이지 않을 때의 구분 |
| [.agents/skills/ax-agent-studio/references/design-and-workflow.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/ax-agent-studio/references/design-and-workflow.md) | 12개 화면, 데이터 연결, 녹색 UI, 폰트·색·6종 PPTX 도식 |
| [.agents/skills/ax-agent-studio/references/continuity.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/ax-agent-studio/references/continuity.md) | 검증 결과, 남은 작업과 다음 대화 프롬프트 |
| [.agents/skills/ax-agent-studio/references/project-settings.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/ax-agent-studio/references/project-settings.md) | 폴더만 옮겨도 읽을 수 있는 전체 설정 참조. docs의 설정 문서와 동일 |

## 6. Wylie 제안서 제작 스킬

폴더: `.agents/skills/wylie-proposal/`. 제안 논리·콘텐츠·서체·도식·레이아웃과 실제 학습 범위를 함께 보관한다.

| 저장소 기준 파일 경로 | 내용 |
|---|---|
| [.agents/skills/wylie-proposal/SKILL.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/SKILL.md) | 제안서 제작 스킬의 진입점 |
| [.agents/skills/wylie-proposal/README.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/README.md) | 설치·사용법과 전체 구성 |
| [.agents/skills/wylie-proposal/references/proposal-story-and-process.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/references/proposal-story-and-process.md) | RFP→전략→목차→장표→발표의 제작 절차 |
| [.agents/skills/wylie-proposal/references/content-and-evidence.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/references/content-and-evidence.md) | 콘텐츠·회사소개·회의록·실적과 근거 처리 |
| [.agents/skills/wylie-proposal/references/visual-system.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/references/visual-system.md) | 폰트·크기·색·그리드·마스터·레이아웃 규칙 |
| [.agents/skills/wylie-proposal/references/diagram-recipes.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/references/diagram-recipes.md) | 논리와 관계에 맞는 도식 레시피 |
| [.agents/skills/wylie-proposal/references/industry-patterns.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/references/industry-patterns.md) | 금융·AX·커머스·B2B 적용 패턴 |
| [.agents/skills/wylie-proposal/references/source-catalog.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/references/source-catalog.md) | 읽은 원본·미열람 자료·판본 관계와 분석 범위 |
| [.agents/skills/wylie-proposal/references/technical-validation.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/references/technical-validation.md) | 추출·정적 검사·렌더링 검수 방법 |
| [.agents/skills/wylie-proposal/references/validation-report.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/references/validation-report.md) | 이 스킬 제작 당시 수행한 검증 기록 |
| [.agents/skills/wylie-proposal/assets/design-tokens.json](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/assets/design-tokens.json) | 신규 제안서 제작용 글자·색상·간격 권장값 |
| [.agents/skills/wylie-proposal/assets/font-catalog.json](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/assets/font-catalog.json) | 원본에서 관측한 폰트·크기·색·테마 메타데이터 |
| [.agents/skills/wylie-proposal/assets/source-manifest.json](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/assets/source-manifest.json) | 원본별 파일명·해시·형식·판독 범위 |
| [.agents/skills/wylie-proposal/assets/layout-gallery.pptx](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/assets/layout-gallery.pptx) | 편집 가능한 12종 합성 장표 템플릿 |
| [.agents/skills/wylie-proposal/assets/layout-gallery.pdf](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/assets/layout-gallery.pdf) | 템플릿 PDF 미리보기 |
| [.agents/skills/wylie-proposal/assets/layout-preview-1.png](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/assets/layout-preview-1.png) | 템플릿 미리보기 1 |
| [.agents/skills/wylie-proposal/assets/layout-preview-2.png](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/assets/layout-preview-2.png) | 템플릿 미리보기 2 |
| [.agents/skills/wylie-proposal/templates/brief.yaml](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/templates/brief.yaml) | 제안 브리프 서식 |
| [.agents/skills/wylie-proposal/templates/rfp-matrix.csv](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/templates/rfp-matrix.csv) | 요구·평가 대응표 서식 |
| [.agents/skills/wylie-proposal/templates/slide-plan.csv](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/templates/slide-plan.csv) | 장표별 메시지·근거·도식 계획 |
| [.agents/skills/wylie-proposal/templates/evidence-register.csv](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/templates/evidence-register.csv) | 근거 목록 서식 |
| [.agents/skills/wylie-proposal/templates/review-rubric.md](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/templates/review-rubric.md) | 내용·시각·파일 검수표 |
| [.agents/skills/wylie-proposal/scripts/inspect_deck.py](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/scripts/inspect_deck.py) | 입력 문서 구조·텍스트 추출 도구 |
| [.agents/skills/wylie-proposal/scripts/build_template.py](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/scripts/build_template.py) | 합성 장표 템플릿 생성 도구 |
| [.agents/skills/wylie-proposal/scripts/audit_proposal.py](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/scripts/audit_proposal.py) | 제안서 정적 검사 도구 |
| [.agents/skills/wylie-proposal/requirements.txt](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/.agents/skills/wylie-proposal/requirements.txt) | 위 Python 도구의 검증된 의존성 버전 |

제안 관련 업로드 29개 중 16개 유효 문서의 분석 결과다. 미열람 자료와 중복 판본을 포함한 범위는 source-catalog를 따른다. 원본 고객 문서나 상용 폰트 파일이 포함된 묶음은 아니다.

## 7. 앱 구현과 화면 자료

| 저장소 기준 파일 경로 | 내용 |
|---|---|
| [src/App.tsx](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/src/App.tsx) | 12개 작업 화면과 프로젝트 상태·편집 흐름 |
| [src/main.tsx](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/src/main.tsx) | 브라우저 앱 시작점 |
| [src/styles.css](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/src/styles.css) | 실제 앱 폰트·색·간격·반응형 스타일 |
| [src/lib/api.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/src/lib/api.ts) | 브라우저와 로컬 bridge의 요청 연결 |
| [src/lib/storage.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/src/lib/storage.ts) | 브라우저 저장·복구·스냅샷 |
| [src/lib/planning.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/src/lib/planning.ts) | 메뉴 기반 초안과 수주 범위 전환 |
| [src/lib/exports.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/src/lib/exports.ts) | PPTX·HTML·JSON·Markdown·CSV 내보내기 |
| [src/lib/demo.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/src/lib/demo.ts) | 가상 고객의 합성 체험 데이터 |
| [shared/domain.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/shared/domain.ts) | 프로젝트 스키마·근거 상태·참조 검수 |
| [server/index.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/server/index.ts) | 로컬 서버·작업·문서 추출 endpoint |
| [server/codex.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/server/codex.ts) | 공식 Codex 실행·인증 판별·결과 검증 |
| [server/prompt.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/server/prompt.ts) | 앱이 Codex에 전달하는 생성 지침 |
| [server/documents.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/server/documents.ts) | PDF·PPTX·DOCX·텍스트 추출 |
| [index.html](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/index.html) | 프런트엔드 HTML 진입점 |

테스트와 화면 이미지는 다음 파일에 있다.

| 저장소 기준 파일 경로 | 내용 |
|---|---|
| [tests/documents.test.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/tests/documents.test.ts) | 단위 테스트 |
| [tests/domain.test.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/tests/domain.test.ts) | 단위 테스트 |
| [tests/e2e/studio.spec.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/tests/e2e/studio.spec.ts) | 브라우저 자동 검사 |
| [tests/exports.test.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/tests/exports.test.ts) | 단위 테스트 |
| [tests/lifecycle.test.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/tests/lifecycle.test.ts) | 단위 테스트 |
| [tests/server.test.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/tests/server.test.ts) | 단위 테스트 |
| [tests/storage.test.ts](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/tests/storage.test.ts) | 단위 테스트 |

| 저장소 기준 파일 경로 | 내용 |
|---|---|
| [docs/images/dashboard.png](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/images/dashboard.png) | 실제 앱 화면 또는 합성 PPTX 도식 미리보기 |
| [docs/images/pptx-layouts.png](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/images/pptx-layouts.png) | 실제 앱 화면 또는 합성 PPTX 도식 미리보기 |
| [docs/images/proposal.png](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/images/proposal.png) | 실제 앱 화면 또는 합성 PPTX 도식 미리보기 |
| [docs/images/screen-design.png](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/images/screen-design.png) | 실제 앱 화면 또는 합성 PPTX 도식 미리보기 |

## 8. 저장소와 ZIP 안의 경로 차이

압축 해제 루트는 스킬·MD ZIP의 경우 `ax-agent-studio-skills-md/`, 소스 ZIP의 경우 `ax-agent-studio/`다. 아래 경로는 각 루트를 기준으로 한다.

| 항목 | GitHub/현재 저장소 | 스킬·MD ZIP | 소스 ZIP |
|---|---|---|---|
| 통합 지식 MD | `downloads/AX-AGENT-KNOWLEDGE.md` | `AX-AGENT-KNOWLEDGE.md` | `AX-AGENT-KNOWLEDGE.md` |
| 이 안내서 | `docs/FILE-MAP.md` | 동일 | 동일 |
| 두 스킬 | `.agents/skills/` | 동일 | 동일 |
| 환경 스냅샷 | `config/project-environment.snapshot.json` | 동일 | 동일 |
| package/빌드/테스트 설정 | 저장소 최상위 | `config-files/` 안의 사본 | 압축 해제 최상위 |
| 파일별 해시 manifest | 없음 | 최상위 `MANIFEST.json` | 없음 |
| 앱 소스 전체 | `src/`, `server/`, `shared/`, `tests/` | 미포함 | 포함 |
| 다운로드 결과 폴더 | `downloads/` | 미포함 | 미포함 |

스킬·MD ZIP은 지식 이전용이다. 패키지 재생성 명령 `python scripts/package_knowledge.py`는 전체 소스 checkout 또는 소스 ZIP을 푼 폴더에서 실행한다. 생성한 ZIP·MD·해시는 그 폴더의 `downloads/`에 저장된다. 재생성은 GitHub push나 클라우드 게시를 자동 실행하지 않는다.

## 9. 이 저장소 밖에 있는 설정·데이터

| 항목 | 실제 위치와 이동 방법 |
|---|---|
| 사용자 프로젝트·스냅샷 | 사용한 브라우저 origin의 localStorage. 앱의 JSON 백업으로 이동 |
| 실행 중 AI 작업 포인터 | 같은 탭의 sessionStorage. 작업 자체는 서버 메모리이며 서버 재시작 후 재개되지 않음 |
| Codex 계정 인증 | 해당 컴퓨터의 공식 Codex가 관리. 묶음에 인증정보가 들어 있지 않으며 대상 환경에서 공식 로그인 |
| 클라우드 환경 초안 | 이 작업에 연결된 플랫폼 환경 설정. 비밀값 없는 사본이 config의 JSON |
| 클라우드 runtime 스킬 | 플랫폼 제공 `cloud-environment:cloud-environment-runtime`. 프로젝트의 두 스킬과 별도 |
| 클라우드 setup 스킬 | 플랫폼 제공 `cloud-environment-onboarding:setup`. 해당 환경에서 제공되는 설치·시작 설정 도구를 사용 |
| 의존성·빌드 산출물 | `node_modules/`, `dist/`. ZIP에는 없으며 npm ci / npm run build로 재생성 |

플랫폼 제공 스킬·로그인·세션 권한은 프로젝트 스킬 폴더를 복사해도 다른 서비스에 설치되지 않는다. 브라우저 저장소는 `localhost`/`127.0.0.1` 및 포트가 달라져도 나뉜다. 원본 고객 업로드·인증 파일·브라우저 데이터·임시 검증 로그는 이 파일 안내서의 다운로드 패키지에 포함하지 않았다.

## 10. 가장 빠른 재개 방법

- 문서·제안 작업: 통합 MD 업로드 → `docs/PROJECT-INSTRUCTIONS.md`를 프로젝트 지침에 복사 → 이번 요청 전달.
- 코드 개발: 개발 브랜치 clone 또는 소스 ZIP → `AGENTS.md`와 `docs/CONTINUE-HERE.md` 읽기 → 필요한 스킬의 SKILL.md 적용.
- 환경 복원: `docs/PROJECT-SETTINGS.md`와 config 스냅샷 확인 → 대상 환경에서 설치·시작 → 실제 응답과 기능 확인.

파일이 게시되어 있다는 사실만으로 공개 사이트, 실제 모델 생성, 새로운 클라우드 작업의 복원이 완료된 것은 아니다. 각각의 검증 상태는 `docs/validation.md`와 이후 Git 기록에서 확인한다.
