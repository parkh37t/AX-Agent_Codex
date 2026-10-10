> **v9 후속 구현 완료:** 이 문서의 미구현 연결 항목은 [최신 배포·검증 문서](operator-deployment.md)를 우선 참조하세요. 아래는 v8 구현 기록입니다.

# 운영자 API 방식 전환 — 비용 없는 구현·검증 결과

사용자 승인으로 개인 ChatGPT 구독/SIWC 경로를 주 경로에서 제외하고, 설치 없는 웹 + AX 자체 사용자 로그인 + 운영자 소유 OpenAI API 과금으로 전환했다. API 테스트 총 예산 5달러는 승인됐으나 결제·키 생성/설정·실제 유료 호출·외부 계정/호스팅/OAuth 등록은 수행하지 않았다.

당시 최신 코드는 Library 소스 사본에만 있었다. 현재 소스 위치와 실행 경로는 operator-deployment.md를 따른다. 공개 소스 a1c64cd 및 Pages 905296b는 변경하지 않았다. 공개 사이트는 여전히 수동 모드이며 실제 AI·사용자 로그인 연동이 완료됐다고 표시하지 않는다. 이 문서는 이전 P1 및 WEB-ONLY-READINESS의 개인 구독 관련 계획보다 우선한다.

## 구현한 것

- server/responses-runner.ts: 공식 Responses REST 어댑터. 고정 https://api.openai.com/v1/responses 주소, 모델 설정 가능, structured output JSON schema, store:false, 도구 호출 없음. 실제 Wylie 로컬 참조와 해시를 사용한다.
- 공식 openai-node SDK 문서와 Structured Outputs 문서를 확인했다. 추가 패키지 설치 없이 Node 내장 fetch로 공식 REST 계약을 구현했다. SDK를 설치하거나 실제 호출한 것은 아니다. SDK 기본 자동 재시도에 의존하지 않는다.
- 서버 비밀변수 accessor에서만 운영자 키를 전달한다. 키가 없거나 실행이 비활성화되거나 모델/단가가 없으면 503으로 닫힌다. 키·provider 원문 오류·응답 본문을 로그로 출력하지 않는다. 브라우저가 키·모델·단가를 선택하지 못한다.
- server/hosted-api.ts: HTTPS 출처/Host 검사, 동일 출처 JSON 요청, AX 세션 쿠키 계약, 사용자 소유 프로젝트 CRUD 일부, 작업 등록/조회/취소, 명시적 결과 반영, 로그아웃. 모의 인증은 운영에서 거부한다. 로그인 제공자 자체와 로그인 화면/callback은 미구현이다.
- server/operator-service.ts: 승인된 PostgreSQL pool, 실제 OIDC 기반 AX 세션 어댑터, 서버 환경변수를 받아 조립하는 함수. 자체 listener를 열거나 계정·키를 만들지 않는다. 인증·저장·실행 준비를 분리해 표시한다.
- server/web-workflow.ts: 사용자 소유권·리비전·검토 무효화·취소 저장 실패 보호를 유지하고, 명시적 결과 반영/스냅샷/생성 이력, 전역·사용자별 동시 작업 수, 일일 요청 수, 비용 예약과 사용량 기록을 추가했다.
- server/postgres-workflow-store.ts: PostgreSQL JSONB 한 행을 트랜잭션/행 잠금으로 갱신하는 소규모 테스트용 저장 어댑터. node-postgres 호환 pool 주입 계약이다. 실제 pg 드라이버 구성·DB 연결·스키마 생성은 아직 실행하지 않았다.
- shared/domain.ts: operator_api 생성 이력 구분을 추가했다. 기존 로컬 CLI 모드는 코드에 남아 있으나 새 서비스의 로그인/과금 경로로 사용하지 않는다.

## 최소 비용 정책

초기 서버 설정 기본값은 전역 동시 작업 1, 사용자별 동시 작업 1, 사용자별 하루 등록 10건이다. 서로 다른 idempotencyKey도 동시 작업 수 제한에 포함된다. 같은 키·같은 입력은 같은 작업을 반환하며, 다른 입력에 같은 키를 쓰면 거부한다.

API 설정 기본값은 요청 JSON 200,000 bytes, 출력 최대 4,096 tokens, 수신 응답 최대 2MB, 총 제한 시간 120초, 자동 재시도 0회다. 명시적으로 설정해도 429만 최대 1회 재시도하며 매 시도 비용을 별도로 예약한다. 네트워크/5xx 등 과금 여부가 불명확한 실패는 자동 재호출하지 않는다. 시간 초과/취소 시 HTTP AbortSignal을 전달하고, 결과 저장도 거부한다. 요청 취소가 공급자 측 비용을 되돌린다는 보장은 없다.

앱 테스트 예산 원장은 초기 4달러로 시작하며 기간 자동 초기화가 없는 누적 한도다. 요청 bytes를 보수적인 입력 token 상한으로 사용하고 설정한 모델 단가·출력 제한으로 최대 비용을 예약한다. 실제 API 응답에 usage가 있을 때만 해당 토큰 수를 기록하고 설정 단가로 추정 비용을 정산한다. usage가 없거나 통신 실패/취소로 확인할 수 없으면 예약을 유지한다. 결과 검증 실패라도 이미 반환된 usage는 보존한다. 임의의 성공 토큰 수를 만들어 넣지 않는다.

이 원장은 청구서가 아니며 모델 가격 변경·캐시/부가 과금·세금·서비스 외 사용까지 보장하는 결제 상한이 아니다. OpenAI 프로젝트 예산이 실제 강제 차단인지 별도 확인 없이 hard limit이라고 부르지 않는다. 자동충전 OFF와 결제 조건은 아직 설정하지 않았다. 선불 최소 결제액과 세금 때문에 총 지출 5달러를 넘을 수 있으므로 실제 결제 직전 확인이 필요하다. 모든 테스트는 대역 응답으로 실행했으며 실제 API 비용은 발생시키지 않았다.

## 로그인·호스팅 선택안

권장 구조: 같은 출처의 웹/API + AX 자체 서버 세션 + 관리형 OIDC 로그인 + PostgreSQL. 세션 어댑터는 검증된 OIDC 신원을 AX 사용자/계정/워크스페이스 범위로 매핑하고, 만료·취소를 서버에서 확인해야 한다. 브라우저가 전달한 사용자 ID를 신뢰하는 구현은 없다. 공급자 선택, client 등록, callback, PKCE/state/nonce 및 ID token 검증, 서버 세션 발급·영속 보관을 실제로 연결하는 작업은 남았다.

무료 테스트 후보는 Render 무료 Node 서비스와 Neon Free PostgreSQL이다. Render 무료는 유휴 시 sleep하고 재시작/재배포 시 로컬 파일을 잃으므로 파일 저장소/SQLite를 이 원격 배포에 사용하지 않는다. 무료 Render PostgreSQL의 30일 만료 조건 때문에 외부 영속 DB 후보를 분리했다. Neon 무료의 현재 안내는 프로젝트당 1GB/월 100 CUh지만 계정 생성과 이용조건 확인은 하지 않았다.

이번 PostgreSQL 구현은 단일 서비스/worker 인스턴스의 작은 테스트용이다. 모든 상태를 한 JSONB 행으로 잠가 단순하고 보수적으로 처리한다. 여러 worker, 무중단 교체, 분산 lease/잡 큐, 대규모 RFP, 외부 파일 보관/삭제 정책은 지원하지 않는다. 서버 시작 시 남은 queued/running을 실패로 복구하고 자동 재실행하지 않는다. 동시 서비스 두 개를 띄우면 서로의 실행을 중단된 작업으로 취급할 수 있으므로 단일 인스턴스를 강제해야 한다. DB는 인증·프로젝트·작업·예산을 영속 보관하는 구성으로 연결해야 하며, 실제 호스팅을 준비했다고 과장하지 않는다.

## 모델·외부 설정 명세 — 아직 적용하지 않음

확인한 저비용 후보 API model ID는 gpt-5.6-luna다. 공식 문서는 Responses와 Structured Outputs 지원 및 입력 $0.20/출력 $1.20 per 1M tokens를 안내한다(2026-10-10 확인). 코드에 가격/모델을 고정하지 않았으며 사용할 모델의 최신 가격을 운영자가 설정해야 한다.

필요한 서버 설정 이름:
- OPENAI_API_KEY: 서버 비밀 저장소 전용. 문서/브라우저/소스/로그에 값을 넣지 않는다.
- AX_API_EXECUTION_ENABLED: 실제 호출 승인 전 false.
- AX_API_MODEL: 승인 후 선택한 모델 ID.
- AX_INPUT_USD_PER_MILLION / AX_OUTPUT_USD_PER_MILLION: 승인 모델의 확인된 단가. 미설정이면 실행 불가.
- DB 연결 정보: 승인된 pg pool 구성에만 전달. TLS로 연결하고 인증정보를 클라이언트에 반환하지 않는다.
- HTTPS origin 및 OIDC 제공자/서버 세션 저장소 설정: 공급자 승인·등록 후 적용.

PostgresWorkflowStore.schemaSql은 준비된 스키마 문자열일 뿐 실제 실행하지 않았다. 데이터베이스·키·로그인 공급자·실행 승인 없이 현재 코드를 바로 배포할 수 있다고 안내하지 않는다. 기존 Pages를 그대로 두고 API 서버만 공개해 자동 연결되었다고 주장하지 않는다. 실제 AX 로그인 UI와 서버 API를 연결한 새 웹 배포도 다음 승인 범위에서 필요하다.

## 검증 및 남은 작업

- 전체 단위/통합 테스트 195개: 기존 172개 포함, 새 API/HTTP/DB계약·비용/제한 관련 23개 추가.
- TypeScript 포함 정적 production 빌드 통과. 공개 Pages 파일은 갱신하지 않았다.
- HTTP 합성 검증: 모의 Responses 결과로 네 단계 생성→명시적 검토→스냅샷/반영. A/B 소유권, 출처/CSRF 계약, 로그인 없음/저장 없음 차단, body 제한 확인.
- API 대역 검증: 키 없음/비활성/단가 없음, 요청/출력/응답 크기, 취소/시간초과, 재시도 정책, refusal/incomplete/잘못된 JSON, usage 누락/보존.
- PostgreSQL은 mock client로 SQL transaction/rollback/commit 전 취소 및 비동기 워크플로 연결 계약을 검증했다. 실제 PostgreSQL 서버에 접속한 검증은 아니다.
- 실제 로그인 공급자 검증, pg driver/DB 실접속, Render/Neon 서비스 생성, 실제 OpenAI API 호출, 결제·충전·키 설정은 모두 미실행.

다음은 ① 로그인 제공자와 무료 호스팅 계정 선택·승인 ② 실제 세션 어댑터/pg pool 및 새 웹 연결 ③ 결제 조건·자동충전·서버 비밀키를 승인된 범위에서 설정 ④ 합성 자료 1건의 제한된 실제 유료 호출과 사용량 대조다. 이번 코드·모의 테스트 완료와 전체 원격 서비스 완료는 다르다.

공식 근거:
- https://github.com/openai/openai-node
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://render.com/docs/free
- https://neon.com/blog/neon-free-plan-1-gb-per-project
- https://node-postgres.com/features/transactions
