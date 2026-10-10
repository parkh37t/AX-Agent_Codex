# 실행 환경과 사이트 확인

기준일 2026-10-10. 현재 구현은 `parkh37t/AX-Agent_Codex`의 `codex/ax-agent-studio` 브랜치다.

## 새 컴퓨터에서 실행

Node.js 22.12 이상과 npm을 준비한다. macOS·Linux 또는 Windows WSL2를 권장한다. Node, 앱, Codex를 같은 OS 사용자·환경에서 실행한다.

새 폴더에 소스를 받을 때만 다음을 실행한다. 기존 checkout에서는 먼저 로컬 변경을 확인하고 재복제·초기화하지 않는다.

```sh
git clone --branch codex/ax-agent-studio https://github.com/parkh37t/AX-Agent_Codex.git
cd AX-Agent_Codex
npm ci
```

`npm ci`는 공식 `@openai/codex@0.162.1`을 포함한다. 별도 전역 CLI 설치가 필요 없다. ChatGPT 이용 권한이 있는 계정으로 로그인해야 생성할 수 있다.

```sh
npm run codex:login
npm run dev
```

명령을 실행한 **같은 컴퓨터**의 브라우저에서 `http://127.0.0.1:5173`을 연다. 개발 서버는 터미널이 살아 있어야 한다. ChatGPT 웹 로그인만으로 CLI에 로그인된 것은 아니다. 이미 원하는 계정으로 로그인되어 있으면 다시 로그인하지 않는다.

배포용 번들을 로컬에서 사용하는 방법:

```sh
npm run build
npm start
```

이때 브라우저 주소는 같은 컴퓨터의 `http://127.0.0.1:4318`이다. 이는 외부 배포 주소가 아니다.

## 사이트가 보이지 않는 이유와 진단

| 상황 | 의미와 조치 |
|---|---|
| GitHub README나 ZIP만 열림 | 소스가 게시된 상태다. 웹사이트 배포는 수행되지 않았다. |
| 다른 클라우드 머신에서만 서버 실행 | 사용자 PC의 localhost와 다른 머신이다. 이 관리형 onboarding UI는 loopback 미리보기를 제공하지 않는다. |
| 개발 주소가 열리지 않음 | 같은 컴퓨터에서 `npm run dev`가 정상 실행 중인지 확인한다. |
| `npm start`인데 5173 접속 | 프로덕션 로컬 주소는 4318이다. |
| 4318 포트 충돌 | 자신이 시작한 기존 AX bridge만 종료하고 모드를 바꾼다. 무관한 프로세스는 종료하지 않는다. |
| 화면은 보이지만 AI 연결 불가 | CLI 인증, 옵션 호환성, 저장 경로 쓰기 권한, 네트워크, 계정 한도를 각각 확인한다. |
| 정적 호스팅에서 자료 추출·AI가 실패 | 정적 프런트엔드만으로 Node bridge와 Codex가 실행되지 않는다. 호스팅 방식 변경 설계가 필요하다. |

현재 공개 사이트 URL은 없다. 기존 벤치마크 `parkh37t.github.io/con-ai/`를 AX의 배포 주소로 안내하지 않는다. 사이트가 필요하면 공개 데모 또는 개인용 실행 방식을 결정해 별도로 구현·검증한다. 현재 스킬 패키지 작성은 그 배포를 수행하지 않는다.

## ChatGPT 구독 연결

브라우저 → 로컬 Express bridge → 공식 Codex CLI → OpenAI 구조다. 별도 API 키를 받지 않으며 API-key 로그인은 실행을 거부한다. 사용 가능 모델과 Codex 한도는 ChatGPT 플랜·조직 정책에 따른다. ChatGPT 구독을 범용 API 크레딧으로 바꾸는 기능이 아니다.

앱의 `/api/status`는 설치·인증 방식·버전·실행 준비를 정규화한다. CLI의 원문 로그인 상태는 키 일부를 표시할 수 있으므로 로그 전체를 공유하지 않는다. 브라우저의 `X-AX-Session`은 로컬 요청용 난수이며 OpenAI 인증 토큰과 다르다. 실제 생성 시 프로젝트 자료가 해당 계정의 Codex 서비스로 전송된다.

`AX_CODEX_BIN`은 선택적인 실행파일 지정값이다. 기본값은 npm이 제공하는 프로젝트 로컬 `codex`다. HTTP 요청으로 임의 실행파일이나 셸 명령을 지정할 수 없다. 다른 CLI 버전의 자동 호환을 가정하지 않는다.

현재 클라우드는 로그인 성공과 실제 생성 성공이 다르다. 읽기 전용 Codex 상태 경로 때문에 모델 실행 전 중단된 사실이 확인되어 있다. 정상적인 사용자 PC에서 작은 합성 요청의 완료·JSON 형식·결과 반영을 확인하는 것이 남은 작업이다.

## 검증 명령

```sh
npm test
npm run build
npm run test:e2e
```

E2E에는 Chromium이 필요하다. 현재 클라우드에는 `/usr/bin/chromium`이 있다. 다른 환경은 Playwright의 일반 브라우저 설치 절차를 사용하거나 `PLAYWRIGHT_CHROMIUM_PATH`를 지정한다. 브라우저 테스트는 AI 응답을 대역으로 제공하며 구독 추론 검증이 아니다.

출처: [앱 README](https://github.com/parkh37t/AX-Agent_Codex/tree/codex/ax-agent-studio), [인증 상세](https://github.com/parkh37t/AX-Agent_Codex/blob/codex/ax-agent-studio/docs/authentication.md).
