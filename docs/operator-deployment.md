> **교체 실패 수정 검수본:** 현재 교체 전략은 [operator-handoff.md](operator-handoff.md)를 우선합니다. 이전의 기존 인스턴스 수동 종료 안내를 bounded standby 방식으로 대체합니다. 실제 서비스 변경은 이번 작업에서 수행하지 않았습니다.

> **최초 등록 흐름:** 최초 subject 확인을 위한 [Google 등록 대기](google-registration.md)를 추가했습니다. 기본 폐쇄이며 명시적 등록 모드에서는 앱/API 권한을 부여하지 않습니다.

# 운영자 웹 v10 — 실행·인증·브라우저 연결 완료 범위

이 문서는 `codex/ax-operator-api` 소스 브랜치의 최신 기준이다. 최종 사용자는 배포 후 HTTPS 주소만 열면 되며 서버 설치는 운영자가 담당한다. v8 `operator-api.md`의 로그인/pg driver/화면 연결 미구현 항목은 아래 구현으로 대체한다. 이전 개인 ChatGPT 구독 경로와 공개 Pages는 이번 운영자 서비스의 인증·과금 경로가 아니다.

## 완료한 연결

- 공식 `pg@8.23.1`과 `openid-client@6.8.8`을 고정하고 lockfile 갱신. 원본 저장소의 node_modules를 공유하지 않는 격리 사본에 설치했다. API는 공식 Responses REST 계약을 Node fetch로 호출하며 OpenAI SDK 설치를 주장하지 않는다.
- `server/operator-main.ts`: 실제 Node HTTP listener, production 모드 확인, 필수 설정 검증, DB pool, 선택적 스키마 마이그레이션, 단일 worker advisory lock, OIDC discovery, API/정적 웹 서빙, 종료 처리.
- `server/pg-runtime.ts`: 공식 pg pool 및 서버 인증서 검증 TLS 강제. URL의 TLS 해제 옵션을 제거한다. 마이그레이션은 기존 상태/예산을 초기화하지 않는 멱등 경로이며 `AX_DB_MIGRATE=true`일 때만 실행한다.
- `server/oidc-auth.ts`: openid-client의 code flow, PKCE S256, state, nonce, ID token/JWKS 서명 검증. 5분짜리 로그인 트랜잭션을 DB에 저장하고 원자적으로 1회 소비한다. 검증된 subject 허용 목록을 적용하고 새 난수 세션을 발급한다. provider token은 저장하거나 브라우저에 반환하지 않는다.
- 세션 handle은 Secure/HttpOnly/SameSite=Lax/__Host 쿠키, DB에는 handle SHA-256과 서버 세션을 저장한다. 세션은 최대 1시간이거나 ID token 만료 시각 중 빠른 시각에 종료한다. 자동 refresh token/무기한 로그인은 없다. 로그아웃은 서버 세션을 철회하고 진행 작업을 중단시킨다.
- `src/HostedApp.tsx`: 로그인 → 소유 프로젝트 목록/불러오기 → RFP 텍스트 입력 또는 TXT/MD 읽기 → 서버 저장 → 4단계 생성 → 결과 JSON 검토 체크 → 명시적 반영 → JSON 다운로드. 새로고침 후 현재 리비전의 미반영/진행 작업 복구. 세션 만료/로그아웃 때 메모리의 프로젝트·결과를 지운다. 브라우저 localStorage에 고객 자료나 세션을 보관하지 않는다.
- `npm run build:operator`는 전용 `dist-operator`를 만든다. 기존 `dist`와 공개 Pages는 변경하지 않았다. 기본 `npm start`는 여전히 기존 로컬 도구이므로 원격 운영에는 `npm run start:operator`를 사용한다.
- `render.yaml`, `.env.operator.example`에 비밀값 없이 필요한 설정을 모았다. 실제 계정/서비스/DB/키는 생성하지 않았다.

## 독립 검수 수정과 근거

1. 지연 저장소 조회/UPDATE 중 logout 뒤 조회 결과 반환 또는 커밋 가능: getProject/getJob/saveProject/applyResult 4건을 수정 전 실패로 재현했다(`v9-race-before.log`). 현재 조회 반환 직전 재인증·세션 검사, 사용자 변경 COMMIT 직전 세션 guard, 변경 응답 반환 직전 재인증을 적용했다. 지연 대기 중 로그아웃/시간 만료 8경로가 통과한다. 취소/등록/목록/작업 복구에도 검사를 적용한다.
2. applyResult 뒤 제목 편집 시 snapshots 유실: 이전 교체 코드를 넣었을 때 회귀 검사 실패를 확인했다(`v9-snapshot-before.log`). 일반 저장에서 이전 스냅샷을 보존한다. 브라우저에서도 4단계 반영 뒤 제목 저장 후 스냅샷 4개 유지 확인.
3. 취소된 runner가 AbortSignal을 무시하면 종료 전 새 요청 입장 가능: active runner가 정리되기 전까지 동시 실행 슬롯을 유지한다. abort 무시 runner 대역으로 다음 사용자 요청 429, 정리 후 입장 성공을 확인했다. 공급자 내부의 이미 처리 중인 요청까지 강제 종료하거나 비용 취소하는 보장은 아니다.

## 검증 결과

- 전체 단위/통합 208개 통과. 기존 195개 포함. 지연 async 저장소 경합, 스냅샷, 취소 슬롯, runtime 설정 차단/TLS 확인 추가.
- TypeScript + 운영자 Vite production 빌드 통과.
- 운영자 Chromium 브라우저 11개 시나리오 통과: 실제 HTTPS 브라우저→서버 API, 로컬 OIDC discovery/authorization/token/JWKS 왕복과 서명, `pg-mem` SQL 대역, 합성 runner. 4단계 생성/검토/반영, 새로고침 결과 복구, A/B 격리, 실패/만료, 로그아웃/콜백 replay, state/nonce/PKCE/issuer/audience/서명/만료/허용 목록 거부. 정확한 증거 위치와 테스트별 범위는 [OIDC 검증 증거](oidc-verification.md)를 참조한다.
- 기존 화면 Chromium 회귀 13개 통과.
- 스크린샷 `operator-workflow.png`는 직접 열어 확인했다. 화면의 노란 배너에 모의 검증이며 실제 AI 호출이 아님을 표시한다.
- 로컬 브라우저에는 API 응답을 가로채는 route mock을 쓰지 않았다. 테스트 전용 실행 파일이 pg-mem과 모의 모델만 주입한다. 테스트 OIDC도 실제 HTTPS/서명/라이브러리 검증을 거친다.
- `npm run test:operator`는 openssl로 임시 로컬 테스트 인증서를 만들고 테스트 프로세스만 해당 CA를 신뢰한 뒤 삭제한다. Node OIDC HTTPS는 CA 검증을 유지한다. 브라우저/Playwright 요청은 합성 TLS 인증서에 한해 ignoreHTTPSErrors:true를 사용한다. Chromium이 설치되어 있어야 하며 이번 환경은 기존 Chromium 사용.
- 실제 PostgreSQL 서버/Neon, 외부 IdP, Render, OpenAI 호출은 아직 검증하지 않았다. pg-mem은 실제 PG의 네트워크/행 잠금/장애 복구 검증을 대신하지 않는다. startup의 advisory lock은 실제 PG에서 최종 확인해야 한다.

## 외부 설정은 한 번에 준비

Render 무료 서비스와 Neon 무료 DB를 기준으로 준비한다. 계정 보유 여부와 계정 접근·서비스 생성·비밀변수 설정 승인은 별개다. 별도 승인 후 다음 항목을 호스팅 서버의 환경변수/비밀 저장소에 넣는다. 실제 값을 채팅·소스·브라우저에 입력하지 않는다.

1. **호스팅**: Render Node 서비스 1개, 외부 HTTPS origin. `AX_PUBLIC_ORIGIN`은 실제 서비스 주소의 origin만 입력한다. `PORT`는 Render 제공값 사용. build `npm ci --include=dev && npm run build:operator`, start `npm run start:operator`. Node는 로컬 검증 버전 24.19.0 예시다. devDependencies는 빌드/tsx 실행에 필요하다.
2. **DB**: Neon PostgreSQL의 **direct/unpooled** 주소를 `DATABASE_URL`에 설정. transaction-pooling 주소를 사용하면 session advisory lock이 worker 수를 보장하지 못한다. 최초 승인된 기동에 `AX_DB_MIGRATE=true`로 테이블을 만들고 이후 false로 돌린다. 운영 DDL을 자동 실행한 적은 없다. DB role은 해당 테이블에 필요한 권한만 준다.
3. **로그인**: 표준 confidential OIDC client, issuer/client ID/client secret. code flow, PKCE S256, `client_secret_post`, discovery/JWKS 사용. exact callback은 `{AX_PUBLIC_ORIGIN}/auth/callback`, 로그아웃 후 앱의 로그인 화면으로 돌아온다. 초기 사용자의 검증된 `sub`를 `AX_OIDC_ALLOWED_SUBJECTS`에 쉼표로 등록한다. 공개 자가가입/임의 이메일 신뢰는 지원하지 않는다.
4. **API/예산**: 서버 전용 `OPENAI_API_KEY`, 승인된 모델/단가, `AX_API_EXECUTION_ENABLED`. 초기 false 유지. 공식 확인 후보 `gpt-5.6-luna`는 Responses/Structured Outputs 지원, 확인 단가 입력 $0.20/출력 $1.20 per 1M tokens. 실제 계정 사용 가능 여부·현재 단가·결제 최소액·세금·자동충전 OFF를 확인한 다음 활성화한다. 승인 테스트 총액 $5에 대해 앱 원장은 $4 추정 누적 한도이며 청구 강제 상한은 아니다.

가입/설정 후 **코드를 새로 연결해야 하는 추상 어댑터는 남아 있지 않다**. 위 설정·DB 스키마·빌드가 갖춰지면 서버 시작 경로가 있다. 다만 실제 공급자별 설정과 원격 런타임은 아직 실검증하지 않았으므로 ‘이미 배포되어 정상 운영 중’이라고 보고하지 않는다.

처음 실행할 검증: API 실행 false 상태에서 로그인/로그아웃·A/B 격리·프로젝트 저장/재시작 복구 → 제한된 합성 RFP 1건 실제 호출 → usage/예산 원장과 공급자 사용량 대조 → 4단계 검토 흐름. 승인되지 않은 실제 유료 호출은 하지 않는다.

## 현재 제품·운영 한계

- 호스팅 단일 인스턴스만 지원한다. advisory lock을 점유한 기존 서버가 있으면 새 서버 기동을 거부한다. 무중단 rolling 배포/다중 worker는 구현하지 않았으며 업데이트 때 기존 인스턴스를 종료한 후 시작하는 유지보수 창이 필요하다. Render 자동 무중단 전환을 성공했다고 가정하면 안 된다.
- PG JSONB 한 행 구조다. 대규모 프로젝트/다중 사용자 부하, 분산 큐, 백업 복구/삭제 UI/보존 기간 운영 정책은 아직 없다. 목록/생성은 소유 범위로 제한한다.
- 새 운영자 화면은 최소 4단계 작업 공간이다. 기존 로컬 도구의 PDF/DOCX 추출, 상세 슬라이드 편집·PPTX 내보내기, 전체 설계 편집 UI까지 모두 옮긴 것은 아니다. 이 화면은 텍스트 입력/TXT·MD와 결과 JSON 검토/내려받기를 제공한다.
- IdP 자체 로그아웃/조직 관리/역할 관리/MFA 정책 설정/이메일 초대/계정 관리 화면은 없다. AX 세션 로그아웃은 구현됐다. 사용 허용 목록은 서버 설정으로 관리한다.
- 외부 모니터링·백업·실제 PG 장애·provider rate limit·실제 모델 품질/가격은 미검증. 실제 생성 산출물의 업무 적합성은 사용자가 검토해야 한다.

공식 확인 자료(2026-10-10):
- https://github.com/panva/openid-client
- https://node-postgres.com/features/ssl
- https://node-postgres.com/features/transactions
- https://github.com/openai/openai-node
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://render.com/docs/node-version
