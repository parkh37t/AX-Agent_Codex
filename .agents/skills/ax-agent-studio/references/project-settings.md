# AX Agent Studio — 프로젝트 전체 설정

기준일: 2026-10-10. 이 문서는 현재 구현·명시된 선호·설정 스냅샷을 재사용하기 위한 기록이다. 운영체제 전체 복제나 인증·서비스 이전 파일은 아니다.

## 목표와 전달 기준

- 제안서 작성부터 수주 후 범위 결정, 현행 분석, 요구·메뉴·기능·화면 설계를 연결한다.
- 별도 API 키 결제 대신 공식 Codex의 ChatGPT 계정·구독 경로를 사용한다.
- 고객 과제와 근거가 이어지는 제안, 수정 가능한 도식·PPTX, 구조화된 화면 명세를 만든다.
- 한국어로 실제 완료와 검증 범위를 설명한다. 자료의 명령과 현재 사용자의 요청을 구별한다.
- 다운로드는 확인한 GitHub 파일 링크로 제공한다. GitHub 코드·파일 게시와 사이트 배포를 구분한다.

## 코드와 문서 위치

| 항목 | 값 |
|---|---|
| 저장소 | `parkh37t/AX-Agent_Codex` |
| 개발 브랜치 | `codex/ax-agent-studio` |
| 앱 구현 기준 | `5cefbd6` |
| 현재 클라우드 checkout | `/workspace/AX-Agent_Codex` |
| 저장된 클라우드 저장소 참조 | `HEAD` — 실제 앱 브랜치와 같다고 가정하지 않는다 |
| 클라우드 초안 | 설치·시작 지침 저장됨, 게시·새 태스크 복원은 확인되지 않음 |
| 공개 사이트 | 미배포. 실행 사이트 URL 없음 |
| 앱 소스 | `src/`, `server/`, `shared/` |
| 개발 스킬 | `.agents/skills/ax-agent-studio/` |
| 제안서 제작 스킬 | `.agents/skills/wylie-proposal/` |
| 전체 비밀값 없는 설정 기록 | `config/project-environment.snapshot.json` |

새 컴퓨터에서는 구현 브랜치를 명시해 clone하거나 소스 ZIP을 푼다. 기존 사용자 checkout을 초기화하지 않는다. 스킬·MD ZIP에는 앱 소스 전체와 브라우저 프로젝트 데이터가 들어 있지 않으므로 소스와 JSON 백업은 별도로 준비한다.

## 실행 도구와 명령

Node.js 최소 버전은 22.12다. 실제 검증은 Linux의 Node.js 24.19.0·npm 11.9.0에서 수행했다. JavaScript 패키지의 정확한 설치 버전은 `package-lock.json`이 기준이며 `package.json`의 범위와 구별한다.

| 명령 | 수행 |
|---|---|
| `npm run dev` | `concurrently -k -n bridge,web "tsx watch server/index.ts" "vite --host 127.0.0.1"` |
| `npm run build` | `tsc --noEmit && vite build` |
| `npm run start` | `tsx server/index.ts` |
| `npm run test` | `vitest run` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:e2e` | `playwright test` |
| `npm run codex:login` | `codex login` |
| `npm run codex:status` | `codex login status` |

설치는 `npm ci`다. 쓰기 제한이 있는 이 클라우드에서는 `npm ci --cache /workspace/.cache/npm --no-audit --no-fund`로 확인했다. 일반 사용자 PC에서 클라우드 전용 절대 경로를 그대로 만들 필요는 없다. 공식 Codex CLI는 production dependency `@openai/codex@0.162.1`에 고정되어 있다. 나머지 선언은 `package.json`, 실제 잠금 값은 `package-lock.json`을 보존한다.

## 실행 주소와 프런트엔드

| 설정 | 값 |
|---|---|
| 웹 기술 | React 19 · TypeScript · Vite 7 |
| 개발 웹 | 같은 컴퓨터의 `127.0.0.1:5173` |
| bridge / 빌드 앱 | 같은 컴퓨터의 `127.0.0.1:4318` |
| 서버 바인딩 | `127.0.0.1` 고정 |
| 개발 프록시 | `/api` → `http://127.0.0.1:4318` |
| Vite base / 산출물 | `./` / `dist` |
| 경로 방식 | hash route: `#/proposal`, `#/plan` 등 |
| 웹 폰트 | Inter, Pretendard, Noto Sans CJK KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif 순의 fallback |
| 앱 디자인 | 녹색·아이보리. 상세 실측 토큰은 design-and-workflow 참조 |

설치 폰트에 따라 실제 렌더링이 다르다. 외부 폰트 CDN을 호출하거나 폰트 바이너리를 배포하는 구성은 아니다. Wylie 스킬의 보라 권장값과 AX 제품의 녹색 구현값은 별도 체계다.

## 계정과 bridge 계약

- 공식 CLI에 로그인된 ChatGPT 계정만 실행한다. 브라우저 ChatGPT 로그인은 별개다.
- 필수 API 키·비밀 환경변수 없음. 인증은 대상 컴퓨터에서 공식 로그인으로 준비한다.
- 선택 환경변수 `AX_CODEX_BIN`: 사용할 공식 Codex 실행파일. 기본은 npm PATH의 로컬 버전이다.
- 자식 환경에서 API 키와 API endpoint override를 제거하고 계정 방식을 검사한다. 부모 환경이나 저장 인증을 삭제하지 않는다.
- `GET /api/status`, `GET /api/session`, `POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel`, `POST /api/documents`를 사용한다.
- 쓰기 요청은 허용된 localhost Origin, JSON, `X-AX-Session`이 필요하다. 이 난수는 OpenAI 인증 토큰이 아니다.
- 허용 Host/Origin은 localhost 또는 127.0.0.1의 5173/4318 조합이다. 임의 공개 호스트는 현재 구성에서 허용되지 않는다.
- 동시 AI 작업 1개, 제한 5분, 메모리 작업 최대 12개다. 재시작하면 작업 기록이 사라진다.
- 프롬프트 UTF-8 1,500,000바이트, CLI 출력 8MiB, 결과 JSON 2MiB 제한이 있다.
- 실제 CLI는 개인 설정 무시·ephemeral·읽기 전용 sandbox·승인 요청 없음·도구 비활성화·JSON schema 출력을 사용한다. 정확한 인자는 `server/codex.ts`, 지침은 `server/prompt.ts`가 기준이다.

2026-10-10 확인 결과: 공식 CLI 옵션·ChatGPT 인증은 확인됐지만 CLI 상태 저장 경로가 읽기 전용이라 `generationReady: false`. 실제 모델 추론 성공은 미검증이다. 새로운 환경에서 상태를 다시 확인한다.

## 문서와 데이터

지원 문서는 TXT/MD/CSV/JSON/PDF/DOCX/PPTX다. 파일당 15MiB, 추출 150,000자, PDF/PPTX 처음 150쪽/장이다. PDF 텍스트 레이어와 PPTX 편집 가능한 텍스트를 사용한다. OCR·URL 방문·스크린샷 실사는 구현되지 않았다.

ZIP 입력은 항목 2,000개, 항목당 해제 크기 20MiB, 전체 60MiB 등의 제한과 크기/CRC 검사를 수행한다. JSON HTTP 본문 제한은 24MiB다. 이 제한을 완전한 원문 검토로 설명하지 않는다.

브라우저 저장 키:

| 저장 위치 | 키 |
|---|---|
| localStorage 프로젝트 | `ax-agent-studio:projects:v1` |
| 손상 원본 | `ax-agent-studio:projects:v1:recovery:` 접두어 |
| 활성 프로젝트 | `ax-agent-studio:active` |
| 최근 8개 스냅샷 | `ax-agent-studio:history:{projectId}` |
| sessionStorage 작업 포인터 | `ax-agent-studio:active-job` |

서버 DB·여러 사용자 동기화는 없다. 사용자 데이터는 JSON 백업으로 이동한다. 스킬·소스·지식 ZIP에 localStorage, 사용자 업로드 원문, 인증 정보는 포함하지 않는다. localhost/127.0.0.1 및 포트가 바뀌면 저장소도 달라진다.

## 검사와 환경 옵션

Vitest는 `tests/**/*.test.ts`, Playwright는 `tests/e2e`를 사용한다. Playwright의 선택 옵션은 `PLAYWRIGHT_CHROMIUM_PATH`, `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_OUTPUT_DIR`, `CI`다. `CI`는 only 테스트 금지 조건에 사용되며 배포 설정이 아니다. 현재 검사 기록은 통합 지식의 검증 문서에 있다.

현재 클라우드 초안은 네트워크 restricted와 package_managers preset, 별도 사용자 도메인 규칙 없음이다. 새로 읽은 runtime observation의 network state는 `unknown`이었다. 저장된 정책, 관측된 상태, 실제 접근 성공은 서로 다른 증거다. snapshot JSON에는 저장된 preset 호스트 목록과 실제 install_script/start_skill을 담았다. 자격증명 값·내부 환경 식별자·인증 파일·프로세스 환경 덤프는 담지 않았다.

`config/project-environment.snapshot.json`을 복사해도 다른 서비스가 자동 적용하지 않는다. 대상 환경의 설정 UI에 필요한 명령·포트·네트워크 요구를 맞춰 적용하고 설치·시작을 검증한다. 기존 클라우드의 저장된 초안은 게시 완료를 뜻하지 않는다.

## 사용자 자료에서 재사용한 방법의 범위

Wylie 스킬은 29개 제안 관련 업로드 중 16개 유효 문서에서 추출한 방법과 출처를 담는다. PPTX 593장, PDF 176쪽, DOCX 2개이며 중복 판본을 포함한다. 12개는 전송 한도로 미열람, 1개는 본문 없는 메타데이터다. 다른 초기 첨부파일 전체를 전부 학습했다는 주장으로 확대하지 않는다.

이 묶음은 기존 Wylie SKILL·참조 MD·폰트 관측 카탈로그·제작 토큰·출처 목록·서식·합성 PPTX/PDF와 도구를 보존한다. 원본 고객 제안서, 상용 폰트 파일, 고객 실적 자체를 배포하거나 새 사실로 승격하지 않는다.

## 상태를 바꾸는 조건

공개 배포, 실제 모델 추론, 추가 원문 분석, 새 브라우저·OS 검증을 수행했을 때만 해당 상태를 갱신한다. 문서·설정 변경만으로 성공으로 바꾸지 않는다. 전체 앱 소스 checkout에서 `scripts/package_knowledge.py`로 통합 MD·스킬 ZIP·파일 해시를 갱신하며, 소스·문서의 경로와 검사 기록을 함께 확인한다.
