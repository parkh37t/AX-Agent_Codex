# OIDC 검증 증거 — v10

## v9 증거 위치 확인 및 범위 정정

업로드한 v9 ZIP의 SHA-256은 `3a2e478b61959cfebd27b5d796447a6bd9857631c2a72b7f54a0a95b698b21e8`이다. 해당 로컬 업로드 원본을 다시 열어 아래 파일이 실제 포함된 것을 확인했다.

- 최상위 `logs/v9-browser.log`: `npm run test:operator` / Playwright Chromium 3개 통과 기록.
- 내부 `ax-agent-local-review-source.zip` → `ax-agent-studio/tests/fixtures/hosted-server.ts`: 4,850 bytes. 로컬 HTTPS OIDC discovery/authorize/token/JWKS 제공자, 메모리 생성 RS256 키, pg-mem 대역 및 실제 인증 모듈 조립.
- 같은 내부 소스 ZIP의 `tests/e2e/operator.spec.ts`: 4,765 bytes. 브라우저 로그인/4단계/격리/철회/로그아웃/콜백 replay 및 nonce·서명·허용 목록 거부 검사.
- 같은 소스 ZIP의 `scripts/test-operator.mjs`: 784 bytes. 임시 합성 TLS 인증서 생성/삭제와 Node CA 설정.
- 같은 소스 ZIP의 `playwright.operator.config.ts`: 482 bytes. 실제 로컬 HTTPS 서버를 구동하는 설정.

`logs/v9-unit.log`의 208개는 위 브라우저 검사를 포함하지 않는다. 앞서 보고한 OIDC 검증은 별도의 브라우저 3개에 근거했다. v9에서 state/PKCE/issuer/aud 각각을 변조한 부정 검사를 실행했다고 주장하지 않는다. 이 항목은 v10에 추가했다.

TLS 설명도 명확히 정정한다. **Node OIDC 클라이언트의 HTTPS 요청은 `NODE_EXTRA_CA_CERTS`로 테스트 CA를 추가하고 인증서 검증을 유지한다. Playwright 브라우저/요청 컨텍스트는 합성 인증서 때문에 `ignoreHTTPSErrors:true`를 사용한다.** 이전 문서의 포괄적인 “TLS 검증을 끄지 않는다”는 표현은 브라우저까지 포함하면 부정확했다. 운영 코드의 DB TLS 검증 및 OIDC ID token 서명 검증을 끄는 옵션은 없다.

## v10 실제 실행

명령: `npm run test:operator`. 로그: `logs/v10-browser.log`. **11개 통과**.

| 검사 | 실제 경로와 판정 |
|---|---|
| 정상 세션/4단계 | 브라우저 → 로컬 HTTPS OIDC authorize → callback → 서버 token 교환 → JWKS/서명·claims 검증 → DB AX 세션 → 보호 API. 합성 RFP 4단계 반영, reload 복구, A/B 격리, 실패/철회 검증 |
| 로그아웃/replay | 서버 세션 철회 후 API 401, callback 재사용 401 |
| state 변조 | authorize 응답의 state 불일치. callback 401, AX 세션 쿠키 미발급, 보호 API 401 |
| nonce 변조 | 서명은 유효하지만 ID token nonce 불일치. 동일하게 거부 |
| PKCE 불일치 | 제공자에 저장한 code challenge를 바꾸어 실제 token endpoint에서 verifier와 S256 불일치 → invalid_grant → callback 거부 |
| ID token issuer | 유효 서명이나 iss가 discovery issuer와 다름 → 거부 |
| audience | 유효 서명이나 aud가 client ID와 다름 → 거부 |
| signature | JWKS와 다른 메모리 생성 RSA 키로 서명 → 거부 |
| authorization issuer | authorize 응답의 iss가 설정 issuer와 다름 → 거부 |
| expired token | 만료된 exp를 가진 서명 토큰 → 거부 |
| allowlist | 유효한 로그인 subject C가 허용 목록 A/B에 없음 → 거부 |

각 부정 검사는 이름을 분리하여 로그에 표시하고 callback HTTP 401, AX 세션 쿠키 없음, 보호 API 401을 모두 확인한다. 브라우저 API route interception으로 로그인 성공을 대신하지 않는다. 테스트 전용 관리 경로/합성 secret/메모리 서명 키는 `tests/fixtures/hosted-server.ts`에만 있으며 production entrypoint는 이를 import하지 않는다. NODE_ENV=test 외에는 해당 실행 파일이 즉시 거부된다.

## 이번 인수 ZIP에서 바로 찾기

- `evidence/current/`: 현재 테스트 소스·설정·실행 스크립트·인증 모듈을 중첩 ZIP 없이 읽을 수 있는 사본.
- `evidence/v9/`: 이전 v9 소스 ZIP에서 꺼낸 당시 테스트 파일 사본. 과거 수행 증거 확인용이다.
- `evidence/OIDC-FILE-HASHES.json`: 파일별 경로/크기/SHA-256.
- `logs/v9-browser.log`, `logs/v10-browser.log`: 과거/현재 실행 기록.
- 최신 전체 소스의 기준은 여전히 `ax-agent-local-review-source.zip`이다. evidence/current와 소스 ZIP의 해당 바이트 일치를 포장 시 검증했다.

외부 IdP 계정·실제 자격증명·실제 OpenAI 호출은 사용하지 않았다. PostgreSQL은 pg-mem 대역이다. 실제 외부 제공자/PG/Render 검증은 별도 남아 있다. 이번 수정은 테스트와 증거·문서 정정이며 운영 인증 로직 변경은 없다.
