# Google 최초 사용자 등록 대기 — 운영자 설정

현재 GitHub 기준은 `codex/ax-operator-api`의 `ea5c96027fd947b8ed8b8ede2547791fb4042094`다. 등록 대기 변경은 위 기준에 추가된 별도 변경이다. GitHub 소스 반영과 실제 배포는 별개다. 기존 코드는 허용 목록 없는 기동을 거부하고 미허용 계정의 callback을 401로 끝냈다. 검증된 subject를 본인에게 보여주는 경로는 없었다.

## 기본 폐쇄와 명시적 등록 모드

새 서버 설정은 `AX_OIDC_REGISTRATION_ENABLED=false`가 기본이다. 값이 정확히 `true`인 경우에만 미허용 사용자의 등록 확인 화면을 제공한다. 허용 목록을 임시로 전체 허용으로 바꾸는 코드가 아니다.

- 빈 `AX_OIDC_ALLOWED_SUBJECTS` + 등록 모드 OFF: 기동 거부.
- 빈 허용 목록 + 명시적 등록 모드 ON: 로그인/등록 확인만 가능. `/api/status`는 registrationOnly=true, ready=false. 프로젝트·세션·작업 API는 503으로 차단한다.
- 허용 목록 있음 + 등록 모드 OFF: 기존 동작. 허용된 사용자만 앱 세션, 그 외 callback 401.
- 허용 목록 있음 + 등록 모드 ON: 기존 허용 사용자 로그인은 유지한다. 미허용 사용자는 별도 등록 레코드만 받으며 앱 API는 401. 등록 대기 레코드를 앱 세션 쿠키에 넣어도 세션으로 인정하지 않는다.

## 검증된 sub 확인 흐름

`/auth/login` → OIDC code/PKCE/state/nonce → 서버 token 교환 → openid-client의 issuer/aud/expiry/nonce 및 JWKS 서명 검증 → 허용되지 않은 subject인 경우에만 `/auth/registration`으로 이동한다.

서버가 검증한 sub와 issuer를 해당 브라우저에만 보여준다. 쿼리스트링/폼으로 보낸 subject는 신뢰하거나 사용하지 않는다. `__Host-ax-registration`이라는 별도 Secure/HttpOnly/SameSite=Lax 쿠키를 쓰고 DB에는 난수 handle 해시와 등록 목적 레코드만 저장한다. 앱 세션·프로젝트·AI 작업은 발급/생성하지 않는다. 이전 앱 세션이 있으면 미허용 계정으로 전환할 때 철회하고 쿠키를 지운다.

확인 기한은 5분과 검증된 ID token 만료 중 더 빠른 값이다. 새로고침으로 기한을 연장하지 않는다. 재로그인 시작 시 이전 등록/로그인 레코드를 삭제하여 오래된 handle을 재사용할 수 없게 한다. 인증 실패·만료 시 원문 token/secret/claims를 오류 화면에 노출하지 않는다. HTML 표시값은 escape 처리한다. no-store/no-referrer/CSP를 유지한다.

등록 화면 URL에는 sub, access token, ID token, refresh token, registration handle이 없다. 표준 OIDC callback의 일회용 code/state는 프로토콜상 쿼리에 오지만, 최종 등록 화면은 `/auth/registration`으로 query 없이 이동한다. provider token은 저장·표시하지 않고 offline access/refresh token을 요청하지 않는다. 브라우저 새로고침은 일반 GET이며 토큰 갱신이 아니다.

관리자는 사용자가 전달한 **검증된 sub와 issuer**를 확인한 후 기존 목록에 그 sub를 명시적으로 추가한다. 등록 대기 레코드의 자동 승격/API는 없다. 승인 설정 반영 후 사용자가 새로 로그인해야 앱 세션을 받는다. 최초 등록이 끝나면 등록 모드를 다시 false로 닫는다. 등록 화면에서 버튼을 눌러 스스로 허용 목록을 바꿀 수 없다.

## Google 최소 scope

현재 요청은 `openid`만 사용한다. Google 공식 문서에서 sub는 기본 ID token 식별자이며 email/profile은 추가 정보에 해당한다. 이번 기능은 이메일·이름·사진이 필요 없으므로 요청/표시/저장하지 않는다. Google 콘솔 등록과 실제 계정 연동 검증은 아직 하지 않았다.

공식 근거: https://developers.google.com/identity/openid-connect/openid-connect (2026-10-11 확인)

## 합성 검증

- 기존 정상 로그인/OIDC 부정 응답/4단계 브라우저 회귀 11개.
- 등록 모드 + 빈 allowlist 브라우저 12개.
- 등록 모드 + 기존 allowlist 브라우저 12개.
- 등록 검사: self-only 표시, session 미발급, 프로젝트 읽기/쓰기·AI API 차단, pending handle을 session으로 오용 거부, 타 브라우저/쿼리 sub 거부, refresh 기한 유지, 기한 만료, 재시도 handle 교체·기존 handle 폐기, callback 재사용, 로그인 flow 만료, Origin CSRF 차단, 기존 허용 사용자 회귀. state/nonce/PKCE/issuer/aud/signature/response issuer/expired token 각각은 subject 표시 전에 거부.
- 악성 subject의 `</textarea>` 탈출·img 이벤트·script·따옴표·앰퍼샌드가 문자 그대로 표시되고 DOM/스크립트를 만들지 않는 회귀 검사 포함.
- 테스트 서버는 로컬 HTTPS OIDC와 메모리 생성 서명 키, pg-mem을 사용한다. Node는 테스트 CA를 검증하고 Playwright만 합성 인증서 예외를 사용한다. 외부 자격증명이나 실제 Google 호출은 없다.

재현 명령:

```sh
npm test
npm run build:operator
npm run test:operator
AX_TEST_REGISTRATION=empty npm run test:operator
AX_TEST_REGISTRATION=mixed npm run test:operator
```

`AX_TEST_REGISTRATION`은 테스트 fixture/config에만 있다. 운영 서버는 이 변수를 읽지 않는다. `AX_OIDC_REGISTRATION_ENABLED`와 혼동하지 않는다.

실제 Google client/credential, Render 환경변수, Neon DB 설정과 배포 실행은 이 변경에서 수행하지 않는다. 외부 서비스 생성 상태와 계정 연결/배포 성공은 별개다.
