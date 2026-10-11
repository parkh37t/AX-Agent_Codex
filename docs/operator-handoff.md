# 단일 worker의 Render 교체 대기 — 배포 관측 계약

## 진단과 확인 한계

기준 원격 커밋은 `2f72ca095cdeb9bfc9ae9d8b11eec6df443a4474`다. 기존 operator-main은 DB session advisory lock을 먼저 얻고, 실패하면 `operator_worker_already_running`을 throw하여 HTTP listener를 열지 않았다. Render는 새 인스턴스가 health에 응답해야 교체를 진행하므로 기존 인스턴스가 락을 유지한 채 새 인스턴스가 종료되는 경로가 있었다.

부모가 제공한 실제 배포 실패·generic startup 로그·granted ExclusiveLock 1개는 이 코드 경로와 일치한다. 이 작업에서는 실제 Render 로그/비밀 환경값/Neon DB를 조회하지 않았으므로 실제 실패 원인을 새로운 운영 관측으로 확정한 것은 아니다. 로컬 인계 검사는 old/new 모두 새 lifecycle 코드인 두 인스턴스로 수행했다. 현재 운영 중인 구버전 2f72ca에서 새 버전으로의 실제 Render 인계는 아직 검증하지 않았다. 구버전은 등록 전용이고 AI 실행이 없다는 상태는 부모가 제공한 정보이며, 이번 작업에서 운영 환경값을 읽어 확인하지 않았다.

## 변경된 기동 순서

1. 필수 환경 형식과 빌드/port를 검사한 뒤 HTTP listener를 연다. 계정/secret 값은 로그에 출력하지 않는다.
2. `standby`: advisory lock을 1초 간격으로 시도한다. 소유권을 얻기 전에는 migration, auth 세션 처리, WebWorkflow 생성/중단 작업 복구, 프로젝트 API, 모델 실행을 시작하지 않는다.
3. 새 liveness가 플랫폼 교체 조건을 충족하면 이전 프로세스가 종료되고 PG 연결이 닫힌다. 새 프로세스가 동일한 advisory lock을 획득한다.
4. `initializing`: 소유권 안에서만 선택적 schema migration, OIDC 준비, 중단 작업 복구를 진행한다. 완료 전 업무 경로는 503이다.
5. `active`: 준비 완료 후 기존 인증/업무 라우트를 연결한다. AI 실행 가능 여부는 별도의 `/api/status` executionReady/ready 값으로 계속 확인한다.

이 방식은 **단일 업무 소유자**를 유지한다. 두 프로세스가 잠시 존재할 수 있으나 standby는 업무를 하지 않는다. 교체 중 잠시 503이 발생할 수 있으므로 무중단 업무 가용성을 보장한다고 표현하지 않는다. 플랫폼 deploy live와 앱 준비 완료는 다르다.

## Health 계약

| 경로 | standby/initializing | active | failed/stopped |
|---|---|---|---|
| GET /health/live | 200 (프로세스 대기 가능) | 200 | 503 |
| GET /health/ready | 503, serviceReady=false | 200, serviceReady=true | 503 |
| GET /api/status | 200, ready=false, executionReady=false, phase 표시 | 기존 앱 상태 | 503 |
| 기타 /api/*, /auth/* 및 페이지 | 503 + Retry-After | 기존 라우트 | 503 |

기존 서비스가 `/api/status`를 health로 사용하는 경우에도 이번 수정 배포를 위해 별도 수동 health 설정 변경은 필요하지 않다. 대기 중 이 경로의 200은 liveness 호환이며 본문 ready=false다. 새 설정 예시 render.yaml은 `/health/live`와 autoDeployTrigger="off"를 명시한다. **앱 readiness를 플랫폼 교체 조건으로 쓰면 이전 소유자 종료를 기다리는 순환이 재발하므로 사용하지 않는다.**

serviceReady는 소유권·복구·라우트 준비 완료를 뜻한다. 등록 전용 모드 또는 API 키/실행이 비활성화된 경우에도 이 값이 true일 수 있다. 실제 사용자 로그인/AI 가용성은 /api/status의 identityConfigured/registrationOnly/executionReady/ready를 확인해야 한다.

standby와 초기화를 합쳐 6분 동안만 대기한다. 초과 시 failed로 전환해 liveness도 503으로 닫힌다. 고장난 기존 worker의 락을 강제로 해제하거나 빼앗지 않는다. 이 인스턴스는 소유권을 잃은 뒤 자동으로 다시 활성화되지 않는다.

## 락과 SQL 연결을 함께 제한

`OwnedConnection`은 advisory lock을 보유한 **동일한 PG client**로 모든 인증·프로젝트·작업·예산 SQL을 실행한다. checkout을 직렬화해 트랜잭션 사이에 다른 요청/heartbeat SQL이 섞이지 않게 한다. raw pool을 업무 코드에 전달하지 않는다. 락만 전용 연결에 두고 실제 쓰기를 다른 연결로 계속하는 기존 구조를 제거했다.

- 같은 연결이 종료되면 미완료 transaction과 락이 함께 종료된다. 새 worker가 락을 얻은 뒤 이전 연결의 늦은 UPDATE/COMMIT을 수행할 수 없다.
- error/end 이벤트 또는 heartbeat에서 소유권 상실 확인 시 즉시 HTTP 업무 차단, lifecycle AbortSignal, workflow dispose, 대기 SQL 거부, 전용 연결 destroy를 수행한다.
- heartbeat는 동일 연결/직렬 큐에서 pg_locks를 확인한다(2초). SQL/연결 대기는 10초 timeout을 적용한다. 네트워크 단절 감지는 이벤트/timeout 지연이 있을 수 있지만 동일 PG session에 락과 transaction을 결합해 다른 연결로 쓰는 경로를 두지 않는다.
- workflow dispose 이후 조회/변경 guard도 거부한다. AbortSignal을 무시하는 실행기가 늦게 결과를 반환해도 소유권 없는 SQL 경로로 저장하지 못한다.
- HTTP abort가 이미 공급자에서 처리 중인 외부 API 계산이나 청구를 취소한다고 보장하지 않는다. 이번 검증에서는 유료 API를 쓰지 않았다.
- 전체 앱 DB 작업을 한 연결에서 직렬화하는 소규모 단일 worker 설계다. 처리량 확장/다중 worker/Neon transaction pool 주소 지원은 없다. direct/unpooled 연결이 필요하다.

## 로컬 검증

`tests/operator-lifecycle.test.ts`는 서로 다른 loopback HTTP listener 두 개와 session/transaction/advisory lock 상태를 모사한 DB 대역을 사용한다. 실제 WebWorkflow/PostgresWorkflowStore/Hosted API 경로를 조립한다. 실제 PostgreSQL 서버의 네트워크·락 구현 검증은 아니다.

- 기존 인스턴스가 running job과 락을 보유 → 새 listener liveness 200, API/auth 503, 복구 호출 0 → 이전 stop → 새 소유권 → interrupted_restart 복구 → 새 API 조회/작업 성공.
- 기존 abort 무시 작업의 늦은 결과 저장 차단.
- 락 연결 error/end 각각 fail-closed, 작업 signal abort, 재획득 없음.
- heartbeat의 락 상실 감지, standby timeout, 초기화 중 소유권 유실 후 늦은 activation 차단.
- 동일 연결 checkout 직렬화, 폐기 시 queued/late SQL 거부.

로그의 검사 수와 결과는 인수본 FINAL-MANIFEST를 따른다. 로컬 YAML parse/필드 검사는 수행했다. 공식 Blueprint 전체 JSON Schema 다운로드는 환경 프록시 403으로 차단되어 full schema/Render CLI 검증은 하지 않았다.

## 검수 후 복구 순서 (아직 실행하지 않음)

검수된 소스 push → 부모가 수정 커밋의 배포를 수행 → /health/live 또는 기존 /api/status로 플랫폼 교체 → /health/ready 200와 /api/status 본문을 별도로 확인한다. 그 뒤 등록 OFF/허용 subject 적용 여부를 확인한다. 추가 secret 재입력이나 DB 락 삭제/고객 데이터 변경을 요구하는 코드가 아니다.

검수된 소스는 별도 운영자 브랜치에 보존한다. 실제 배포 trigger, Render 설정/키 조회, DB 스키마·데이터 변경은 수행하지 않는다.

공식 근거: https://render.com/docs/deploys#zero-downtime-deploys , https://render.com/docs/health-checks (2026-10-11 확인).

## 비밀 없는 로그 관측

operator-main의 기존 onTransition 로그는 아래 고정 문자열만 출력한다. credential/sub/사용자 자료/원문 오류를 연결하지 않는다. 정상 전이와 실패 오류 비노출 회귀 검사를 추가했다.

```text
AX worker standby: waiting_for_worker_lock
AX worker initializing: worker_lock_acquired
AX worker active: worker_ready
```

실패 또는 종료는 다음 중 하나다.

```text
AX worker failed: worker_start_timeout
AX worker failed: worker_lock_connection_lost
AX worker failed: worker_lock_lost
AX worker failed: worker_database_session_failed
AX worker failed: worker_initialization_failed
AX worker stopped: worker_stopped
```

필수 설정/빌드/포트 단계에서 listener 이전에 실패하면 `AX operator startup failed. Check required configuration, build and listener.`이다. 원문 exception이나 env 값은 출력하지 않는다.

부모가 공개 fetch를 할 수 없는 경우 Render의 **새 배포 인스턴스** 로그에서 standby → initializing → active 순서를 확인한다. 이전 인스턴스의 로그와 혼합하지 않는다. `active: worker_ready`는 이 프로세스가 락을 얻고 복구/라우트 준비를 마쳤다는 증거다. Google 실제 로그인 성공·허용목록 내용·AI 실행 가능·외부 API 성공까지 증명하지 않는다.

정확한 readiness 응답은 GET `/health/ready`의 HTTP 200 + `phase:"active"`, `reason:"worker_ready"`, `serviceReady:true`이다. `/api/status`의 `ready`, `executionReady`, `identityConfigured`, `registrationOnly`는 실제 앱 기능 상태이며 다른 의미다. 대기 중 `/api/status`의 HTTP 200만 보고 준비 완료로 판단하지 않는다.
