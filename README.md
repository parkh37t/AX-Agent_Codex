# AX Agent Studio — 운영자 웹

RFP → 전략 → 제안서 → 화면 설계를 서버에서 생성하고, 사용자가 결과를 검토한 뒤 반영하는 웹 앱입니다. 최종 사용자는 설치 없이 HTTPS 사이트에서 AX 계정으로 로그인합니다. 운영자가 OpenAI API 비용을 부담합니다.

현재 브랜치 `codex/ax-operator-api`는 검증된 소스 보존용입니다. **운영자 서비스는 아직 배포하지 않았고 실제 API 호출도 하지 않았습니다.** 기존 GitHub Pages는 이전 수동 모드이며 이 서버에 연결되지 않았습니다.

## 설치 없는 웹을 준비하는 순서

1. Render 무료 Node 서비스에서 이 브랜치를 선택합니다. 구성 예시는 [render.yaml](render.yaml)입니다. 이 파일은 서비스 생성이나 배포를 자동 승인하지 않습니다.
2. Neon 무료 PostgreSQL의 직접 연결 주소와 표준 OIDC 제공자의 confidential client를 준비합니다. 로그인 callback은 `{HTTPS origin}/auth/callback`, 사용자는 검증된 subject 허용 목록으로 제한합니다.
3. [.env.operator.example](.env.operator.example)의 설정 이름을 호스팅 환경변수에 등록합니다. 실제 DB 비밀번호·OIDC secret·OpenAI 키는 서버 비밀 저장소에만 넣습니다.
4. API 실행을 끈 상태에서 승인된 DB 초기화와 빌드·기동을 수행하고 로그인·저장·사용자 격리를 확인합니다.
5. 결제 조건과 사용량 제한을 확인한 다음, 승인된 예산 안에서 합성 자료의 실제 호출을 검증합니다. 이후 사용자는 제공된 HTTPS 주소만 열면 됩니다.

상세 설정·검증 범위·단일 인스턴스 제약은 [운영자 배포 안내](docs/operator-deployment.md)를 따릅니다. 별도 외부 계정 연결과 배포 승인이 필요합니다.

## 개발자 명령

Node.js 22.12 이상(검증 환경 24.19.0). 아래 설치는 운영자/개발자 서버용이며 최종 사용자는 실행하지 않습니다.

```sh
npm ci --include=dev
npm test
npm run build:operator
npm run start:operator
```

`start:operator`는 필수 OIDC·DB·HTTPS origin 설정 없이는 시작하지 않습니다. `AX_DB_MIGRATE=true`는 승인된 DB 스키마 초기화에만 사용하고, API 실행은 기본 비활성 상태입니다.

```sh
npm run test:operator
```

브라우저 검사는 설치된 Chromium과 openssl이 필요합니다. 테스트용 HTTPS OIDC 제공자·메모리 서명 키·pg-mem·합성 생성 응답만 사용합니다. 테스트 서버는 production에서 실행을 거부합니다.

## 검증과 제공 범위

- 단위/통합 208개, 기존 화면 브라우저 13개 통과.
- 운영자 브라우저 11개 통과: 4단계 흐름·reload 복구·사용자 격리·세션 철회·OIDC 부정 응답 검증. [상세 증거 안내](docs/oidc-verification.md)
- TypeScript 및 운영자 production 빌드 통과. 실제 외부 IdP·PostgreSQL·Render·OpenAI 호출은 미검증.
- 새 웹 화면은 텍스트 RFP/TXT·MD, 4단계 결과 검토·반영, 프로젝트 JSON 내보내기를 제공합니다. 기존 로컬 도구의 PDF/DOCX·PPTX·상세 편집 전체는 아직 옮기지 않았습니다.
- 단일 서버/worker만 지원합니다. Neon direct 연결의 advisory lock을 사용하며 다중 인스턴스·무중단 rolling 배포는 지원하지 않습니다.

기존 CLI·수동 웹 모드는 소스에 남아 있습니다. `npm start`/`npm run dev`와 [기존 연결 안내](docs/authentication.md)는 이전 로컬 실행 방식이며 운영자 웹의 시작 명령이 아닙니다. Wylie 제안 스킬은 [.agents/skills/wylie-proposal](.agents/skills/wylie-proposal)에 있습니다. 이전 downloads 묶음은 이 브랜치 최신 소스의 대체물이 아닙니다.
