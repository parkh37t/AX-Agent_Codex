# AX Agent Studio 이어서 작업하기

기준일: 2026-10-10. 이 문서는 다른 개발 세션에서 현재 구현을 확인하고 이어서 작업하기 위한 인수인계입니다. 특정 외부 서비스로 이전하거나 그 서비스의 계정을 연결한 상태는 아닙니다.

## 어디에서 시작하나요?

- 저장소: <https://github.com/parkh37t/AX-Agent_Codex>
- 작업 브랜치: `codex/ax-agent-studio`
- 앱 구현 기준 커밋: `5cefbd6` — `Build AX Agent Studio for proposals and delivery design`
- [브랜치의 소스](https://github.com/parkh37t/AX-Agent_Codex/tree/codex/ax-agent-studio)
- [앱 소스 ZIP](https://github.com/parkh37t/AX-Agent_Codex/raw/refs/heads/codex/ax-agent-studio/downloads/ax-agent-studio.zip)
- [설정·스킬·Markdown 묶음](https://github.com/parkh37t/AX-Agent_Codex/raw/refs/heads/codex/ax-agent-studio/downloads/ax-agent-studio-skills-md.zip)
- 설정 명세: [PROJECT-SETTINGS.md](PROJECT-SETTINGS.md)

`main`에는 이전에 만든 ChatGPT용 와일리 제안서 지식 묶음이 있습니다. 앱을 수정할 때는 위 작업 브랜치와 현재 `git status`를 먼저 확인하세요. 이 인수인계 추가 이후의 커밋도 있을 수 있으므로 기준 커밋으로 되돌리지 않습니다.

**GitHub 소스 페이지와 ZIP은 실행 중인 웹사이트가 아닙니다. 현재 앱을 사용자가 방문할 공개 사이트로 배포한 상태는 아닙니다.** `127.0.0.1`은 브라우저를 연 컴퓨터 자신을 가리킵니다. 클라우드 작업 공간에서 실행한 localhost 주소를 사용자 PC에서 클릭한다고 해당 클라우드 앱에 연결되지는 않습니다. 앱 실행은 아래의 로컬 환경에서 확인해야 합니다.

## 로컬 실행

Node.js **22.12 이상**, npm, Codex 사용 권한이 있는 ChatGPT 계정이 필요합니다. Node·앱·Codex를 같은 운영체제와 사용자 계정으로 실행합니다. Windows에서는 WSL2를 권장합니다.

```sh
git clone --branch codex/ax-agent-studio --single-branch https://github.com/parkh37t/AX-Agent_Codex.git
cd AX-Agent_Codex
npm ci
npm run codex:login
npm run codex:status
npm run dev
```

이미 저장소나 소스 ZIP이 있다면 그 폴더에서 `npm ci`부터 진행합니다. 원하는 계정으로 Codex 로그인이 되어 있다면 로그인 명령은 생략합니다. 개발 화면은 실행한 PC의 <http://127.0.0.1:5173>에서 열립니다.

빌드한 앱은 다음 명령으로 실행합니다.

```sh
npm run build
npm start
```

이때 주소는 <http://127.0.0.1:4318>입니다. 서버를 종료하면 사이트도 종료됩니다. 이 실행 방법 자체가 공개 배포를 수행하지는 않습니다.

## 구조와 수정 위치

| 위치 | 역할 |
|---|---|
| `src/App.tsx`, `src/styles.css` | 12개 업무 화면, 편집·결과 검토·연결 상태·복구 UI |
| `src/lib/planning.ts` | 들여쓴 메뉴에서 REQ·IA·FN·SCR 초안을 만드는 규칙 |
| `src/lib/demo.ts` | 가상 고객과 합성 자료로 만든 체험 데이터 |
| `src/lib/storage.ts` | 브라우저 저장, 원본 손상 복구, 최근 8개 스냅샷 |
| `src/lib/exports.ts` | PPTX·Markdown·CSV·HTML·JSON 내보내기 |
| `src/lib/api.ts` | 같은 앱 서버의 로컬 연결 API 호출 |
| `shared/domain.ts` | Zod 스키마, ID·출처 연결 검수, 수행 범위 결정 유지·무효화 |
| `server/index.ts` | Express 로컬 서버, 세션 확인, 작업 생성·조회·취소 |
| `server/codex.ts` | 공식 CLI 상태·권한 검사, 제한된 자식 프로세스 실행, 오류 분류 |
| `server/prompt.ts` | 작업별 입력, 구조화된 AI 결과 요구, 결과 검증 |
| `server/documents.ts` | 자료 텍스트 추출과 파일·압축·내용 한도 검사 |
| `tests/`, `tests/e2e/` | 단위 검사와 Chromium 브라우저 검사 |
| `package.json`, `package-lock.json` | 설치 버전·실행 명령. 공식 Codex CLI는 `0.162.1`로 고정 |
| `vite.config.ts`, `playwright.config.ts`, `vitest.config.ts` | 개발 서버·빌드·브라우저 및 단위 검사 설정 |

React 19·TypeScript·Vite로 화면을 만들고, Node.js·Express 5 서버가 공식 Codex CLI를 실행합니다. Vite 개발 서버는 `127.0.0.1:5173`에서 `/api`를 `127.0.0.1:4318`로 전달합니다. 빌드 후에는 Express가 `dist`와 API를 같은 4318 포트에서 제공합니다.

로컬 서버는 개인 사용을 전제로 loopback에 바인딩됩니다. 허용 Host·Origin과 세션 토큰을 검사합니다. 이 서버를 그대로 공용 주소로 노출하거나 계정 여러 개가 공유하는 서버로 바꾸는 작업은 현재 구현 범위에 포함되지 않습니다. 정적 웹 호스팅만으로 로컬 Node 서버와 Codex 로그인이 실행되는 것은 아닙니다.

## 구현된 업무와 판정 원칙

자료 등록 → 제안서 → 수주 후 범위 결정 → AS-IS 분석 → 요구사항·메뉴·기능·화면 설계 → 연결 검수 흐름이 구현되어 있습니다. TXT·MD·CSV·JSON·DOCX·PDF·PPTX 텍스트 추출, 편집 가능한 제안 장표, 화면 명세, HTML 프로토타입, 산출물 다운로드를 지원합니다. 세부 범위와 상한은 [제품 명세](product-spec.md) 및 실제 Zod 스키마를 함께 확인합니다.

- 모아금융 프로젝트는 가상 예시입니다. 체험 데이터나 메뉴 기반 규칙 초안을 실제 AI 생성 결과로 설명하지 않습니다.
- 문서 주장, 가설, 검증된 사실을 구분합니다. AI가 새로 만든 주장이나 추정치를 자동으로 검증된 사실로 승격하지 않습니다.
- AI 결과는 검토 후 반영하며, 반영 시 현재 프로젝트의 참조와 스키마를 다시 검사합니다.
- 수행 단계로 전환하려면 요구사항마다 채택·변경·보류·제외와 이유가 필요합니다. 기존 요구사항 내용이 바뀌면 해당 범위 결정을 재확인합니다.
- 스키마·ID 연결 검수 통과는 고객 승인이나 사실 검증의 완료를 뜻하지 않습니다.

벤치마크는 [con-ai 분석 기록](benchmark.md), 제안서 방법은 별도의 [ChatGPT용 와일리 지식 묶음](https://github.com/parkh37t/AX-Agent_Codex/raw/refs/heads/main/downloads/wylie-proposal-chatgpt.zip)을 참고합니다. 원본 고객 문서 전체와 폰트 바이너리는 저장소에 포함되어 있지 않습니다. 지식 묶음을 사용한다는 것은 모델 자체를 재훈련하거나 계정 사이에 자동 학습 동기화를 한다는 뜻이 아닙니다.

## ChatGPT 구독 연결: 확인된 것과 남은 것

이 앱은 별도 과금되는 OpenAI API 키를 받지 않습니다. 공식 Codex CLI의 **ChatGPT 로그인과 해당 플랜의 Codex 사용량**을 이용하도록 구성했습니다. 브라우저의 ChatGPT 로그인과 CLI 로그인은 별개입니다. 자료가 모델에 전달되는 경우 Codex를 통해 OpenAI로 전송됩니다.

현재 클라우드에서는 `authenticated: true`, `authMode: chatgpt`, `generationReady: false`까지 확인했습니다. CLI 상태 저장 위치가 읽기 전용이라 `installation_id`를 준비하지 못했고 실제 모델 생성 시작 전에 실패했습니다. 공식 안정판 `0.162.1`의 옵션·기능·상태 검사 호환성은 확인했지만, **사용자 계정으로 모델 생성이 완료되는 경로는 미검증**입니다.

인증 파일을 복사하거나 토큰을 지식 파일에 넣어 해결하지 않습니다. 기존 `CODEX_HOME`이나 보호 설정을 우회 변경하지 않습니다. 정상적으로 쓰기 가능한 사용자 로컬 Codex 환경에서 작은 합성 자료로 실제 생성·검토·반영을 확인하는 일이 남아 있습니다. 절차와 진단 기준은 [인증 안내](authentication.md)에 있습니다.

## 프로젝트 데이터 옮기기

코드와 사용자가 만든 프로젝트 데이터는 별개입니다. 프로젝트는 현재 브라우저의 `localStorage`에 있고, 서버 DB나 GitHub에 자동 저장되지 않습니다.

**도메인·프로토콜·포트가 다르면 다른 저장소입니다.** 예를 들어 `127.0.0.1:5173`, `127.0.0.1:4318`, `localhost:5173`, 이후의 공개 도메인은 각각 별도 데이터로 보입니다. 새 주소에서 빈 프로젝트가 보인다고 기존 데이터가 삭제된 것은 아닙니다.

1. 기존 주소·브라우저에서 프로젝트별 JSON 백업을 다운로드합니다.
2. 다른 환경에서 앱을 실행하고 JSON을 가져옵니다.
3. 가져온 프로젝트의 자료·요구사항·장표·화면을 확인한 뒤 이어서 작업합니다.

JSON 가져오기는 기존 프로젝트를 덮어쓰지 않고 새 ID의 프로젝트를 만듭니다. 브라우저의 전체 스냅샷 이력과 실행 중인 작업, Codex 로그인은 프로젝트 JSON으로 이전되지 않습니다. 작업 ID의 `sessionStorage` 복구는 같은 탭과 살아 있는 같은 서버 작업을 전제로 하며 서버 재시작 후에는 이어지지 않습니다. JSON에 프로젝트 자료가 포함될 수 있으므로 공개 저장소에 자동으로 추가하지 않습니다.

## 검증과 다음 작업

기존 검증 기록은 [validation.md](validation.md)에 있습니다. 단위 검사 120개, 브라우저 검사 10개 항목, 타입 검사·빌드, 실제 다운로드 및 합성 데모 PPTX 렌더링을 확인했습니다. 브라우저 자동 검사의 AI 응답은 테스트 대역입니다. 이 기록을 실제 모델 호출 성공의 근거로 사용하지 않습니다.

```sh
npm test
npm run build
npm run test:e2e
```

브라우저 검사에는 Chromium이 필요합니다. 설치된 브라우저를 자동 탐색하거나 `PLAYWRIGHT_CHROMIUM_PATH`로 실행 파일을 지정합니다. 일반 로컬 PC에 브라우저가 없다면 `npm exec -- playwright install chromium`으로 준비할 수 있습니다. 관리형 클라우드에서는 해당 환경의 설치·권한 정책을 따르며, 실행 중인 앱과 테스트 서버의 포트 충돌을 확인합니다.

현재 남은 일은 다음과 같습니다. 별도의 작업 지시 없이 모든 항목을 구현하라는 뜻은 아닙니다.

1. 사용자 로컬 환경에서 실제 ChatGPT 로그인으로 소규모 생성이 완료되는지 검증하고, 실제 생성 결과의 품질을 평가합니다.
2. 공개 미리보기 또는 배포가 요청되면 정적 미리보기와 사용자 로컬 Codex 실행 기능을 구분한 배포 방식을 설계합니다. 현재 사이트 배포는 완료되지 않았습니다.
3. Microsoft PowerPoint 데스크톱과 다른 폰트 환경에서 PPTX 렌더링을 확인합니다. 기존 시각 검토는 LibreOffice 기준입니다.
4. 추가 요청이 있으면 OCR, URL 실사, 다중 사용자 협업, 서버 DB, 정식 계약 승인 등을 별도 범위로 설계합니다. 현재는 제공하지 않습니다.

## 다음 개발 에이전트에게 붙여 넣을 프롬프트

```text
AX Agent Studio 작업을 이어서 해 주세요.

저장소: https://github.com/parkh37t/AX-Agent_Codex
브랜치: codex/ax-agent-studio

먼저 현재 git status와 브랜치를 확인하고 기존 변경을 보존하세요.
README.md, docs/CONTINUE-HERE.md, docs/PROJECT-SETTINGS.md,
docs/product-spec.md, docs/authentication.md, docs/validation.md를 읽으세요.
사용 가능한 AX Agent Studio 스킬의 SKILL.md도 확인하세요.

목표는 자료에서 제안서를 만들고 수주 범위·AS-IS 분석·REQ→IA→FN→SCR
연결을 유지하며 화면 설계와 편집 가능한 산출물까지 만드는 개인용 AX 에이전트입니다.
별도 OpenAI API 키가 아니라 공식 Codex CLI의 ChatGPT 로그인 경로를 유지하세요.
인증·토큰·원본 고객 자료를 소스, Markdown, 스킬, ZIP에 넣지 마세요.

GitHub 소스 ZIP은 실행 중인 사이트가 아닙니다. 현재 공개 사이트는 미배포입니다.
React/Vite + Node/Express 로컬 앱이며 Node 22.12 이상, npm ci로 준비합니다.
실제 AI 생성은 클라우드의 읽기 전용 Codex 상태 저장 위치 때문에 미검증입니다.
로그인 확인, 테스트 대역, 규칙 기반 초안을 실제 AI 생성 성공으로 설명하지 마세요.
보호 경로나 인증 저장소를 우회하지 말고 확인된 실행 조건과 한계를 기록하세요.

프로젝트 데이터는 브라우저 origin별 localStorage에 있습니다.
환경이나 주소 변경 전 JSON 백업·가져오기 흐름을 보존하세요.
요구사항 출처, 주장/가설/사실 구분, 범위 변경 재확인, 검토 후 AI 결과 반영,
스냅샷 실패 시 변경 중단을 유지하세요. 변경에 맞는 검사와 npm run build를 실행하세요.

이번에 요청하는 작업: [여기에 다음 목표를 적으세요]
```
