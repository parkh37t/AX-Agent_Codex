> **운영자 웹 브랜치 안내:** `codex/ax-operator-api`는 AX OIDC 로그인 + 운영자 OpenAI API 방식입니다. 최신 실행·검증 기준은 `docs/operator-deployment.md`이며, 아래 개인 ChatGPT/CLI 지침은 기존 실행 모드에만 적용합니다. GitHub 소스 보존과 실제 배포·유료 호출은 별도입니다. 테스트용 인증/서명 키는 운영에 사용하지 않습니다.

# AX Agent Studio 작업 안내

이 저장소의 제품 목표는 제안서 작성부터 수주 후 범위 결정, AS-IS 분석, REQ·IA·FN·SCR 화면 설계까지 이어지는 개인용 작업 공간이다. 현재 사용자의 요청을 우선하고 기존 변경·자료를 보존한다.

- 전체 파일·GitHub 위치: `docs/FILE-MAP.md`.
- 시작 문서: `docs/CONTINUE-HERE.md`, `docs/PROJECT-SETTINGS.md`.
- 개발·설정 스킬: `.agents/skills/ax-agent-studio/SKILL.md`.
- 제안서 제작 스킬: `.agents/skills/wylie-proposal/SKILL.md`.
- 구현 브랜치: `codex/ax-agent-studio`. 실제 checkout을 확인하고 임의 reset하지 않는다.
- 설치: Node.js 22.12 이상, `npm ci`.
- 개발: `npm run dev`. 로컬 배포 번들: `npm run build`, `npm start`.
- 검사: `npm test`, `npm run build`; 화면 변경에는 필요한 Playwright 검사, PPTX 변경에는 실제 파일·렌더링 검사.
- 문서·스킬 납품: `python scripts/package_knowledge.py`로 ZIP·통합 MD·해시를 갱신하고 링크와 포장 무결성을 확인한다.

공식 Codex의 ChatGPT 계정 경로를 유지한다. API 키 방식으로 조용히 대체하지 않는다. 인증 상태와 실제 생성 성공을 구분한다. 현재 클라우드에서 확인된 읽기 전용 상태 저장 경로 제약을 우회하기 위해 인증을 복사하거나 보호를 해제하지 않는다.

제안·가설·원문 주장·직접 확인을 구분하고, 요구가 바뀌면 이전 수행 범위 결정을 재확인한다. 스냅샷 실패와 손상 원본 보존 실패 때 사용자 데이터를 덮어쓰지 않는다. 합성 데모·규칙 기반 초안·테스트 대역을 실제 AI 결과로 설명하지 않는다.

GitHub 코드·다운로드 게시와 공개 사이트 배포는 다르다. 현재 공개 사이트는 미배포이고 실제 AI 추론은 미검증이라는 기록이 있다. 새 작업에서 확인한 증거가 있을 때 상태를 갱신한다. 다른 컴퓨터의 loopback 주소를 사용자에게 접속 가능한 공개 사이트로 안내하지 않는다.
