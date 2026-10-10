# 현재 작업을 이어서 사용하는 방법

이 묶음은 **설정·스킬·지식 문서**다. 공개 웹사이트 또는 자동 설치 프로그램은 아니다. 모든 파일은 2026-10-10에 확인한 내용을 기준으로 한다.

## 가장 간단한 재사용

1. ChatGPT 프로젝트나 다음 대화에 `AX-AGENT-KNOWLEDGE.md`를 업로드한다.
2. `docs/PROJECT-INSTRUCTIONS.md`를 프로젝트 지침에 복사한다.
3. `docs/CONTINUE-HERE.md`의 마지막 프롬프트와 이번 작업 요청을 전달한다.

단일 MD에는 AX 설정·인수인계·설계·검증 문서, 두 SKILL.md, Wylie 제작 규칙·출처, 폰트 카탈로그·디자인 토큰, 주요 설정 원문이 들어 있다. 실제 코드 수정·실행에는 소스 저장소와 해당 환경의 도구가 필요하다. 파일 업로드가 모델을 영구 재훈련하거나 로그인·사이트를 복원하지 않는다.

## 코딩 도구에서 스킬로 사용

`.agents/skills/ax-agent-studio/`와 `.agents/skills/wylie-proposal/` **폴더 전체**를 대상 프로젝트의 지원되는 스킬 경로에 복사한다. 참조·자산·서식을 함께 보존한다. 기존 동명 파일이 있으면 비교 후 반영한다. 자동 발견이 되지 않으면 SKILL.md 경로를 지정해 읽도록 요청한다.

Codex의 프로젝트 스킬 경로는 이 묶음의 `.agents/skills/`다. 다른 도구는 그 도구의 실제 스킬 경로를 사용한다. 도구나 계정에 자동으로 설치됐다고 가정하지 않는다. 저장소에서 `AGENTS.md`를 지원하는 도구는 해당 파일을 프로젝트 안내로 읽을 수 있다.

## 파일 안내

| 파일·폴더 | 용도 |
|---|---|
| `AX-AGENT-KNOWLEDGE.md` | 다른 대화에 올릴 통합 지식 |
| `docs/PROJECT-INSTRUCTIONS.md` | 복사해서 사용할 지침 |
| `docs/PROJECT-SETTINGS.md` | 버전·명령·포트·저장·인증·네트워크 등 설정 설명 |
| `docs/CONTINUE-HERE.md` | 개발 인수인계·다음 작업·재개 프롬프트 |
| `.agents/skills/ax-agent-studio/` | 개발·실행·설정 복원 스킬 |
| `.agents/skills/wylie-proposal/` | 제안서 콘텐츠·폰트·도식·레이아웃 제작 스킬과 합성 템플릿 |
| `config/project-environment.snapshot.json` | 비밀값 없는 실제 클라우드 초안 설정 기록 |
| `config-files/` | 앱의 패키지·빌드·테스트 설정 원문 사본 |
| `MANIFEST.json` | 묶음 파일별 크기·SHA-256·역할 |

GitHub 저장소에서 단일 MD는 `downloads/AX-AGENT-KNOWLEDGE.md`에 있다. ZIP에서는 위 안내처럼 최상위에 있다. `config-files/`는 설정 열람용 사본이며 독립적으로 실행할 앱이 아니다. 패키지를 다시 만드는 `python scripts/package_knowledge.py` 명령도 **전체 앱 소스 checkout에서만** 실행한다. 스킬·MD ZIP에는 그 명령에 필요한 앱 소스 전체가 없다.

## 실제 앱 소스와 데이터

앱 소스는 [구현 브랜치](https://github.com/parkh37t/AX-Agent_Codex/tree/codex/ax-agent-studio) 또는 [소스 ZIP](https://github.com/parkh37t/AX-Agent_Codex/raw/refs/heads/codex/ax-agent-studio/downloads/ax-agent-studio.zip)에서 받는다. 소스 ZIP에는 이 스킬과 문서도 포함한다.

스킬·MD 묶음에는 소스 전체·node_modules·사용자 브라우저 데이터·인증 정보·원본 고객 문서·폰트 바이너리가 없다. 사용자 프로젝트는 앱에서 JSON으로 내보내고 새 환경에서 가져온다. 대상 환경의 Codex 계정은 공식 로그인으로 준비한다.

현재 공개 사이트는 배포되지 않았다. CLI 인증은 확인했으나 클라우드의 읽기 전용 상태 경로로 실제 AI 생성은 미검증이다. 상세 실행 방법과 현재 제약은 개발 스킬의 실행 참조와 `docs/authentication.md`를 읽는다.
