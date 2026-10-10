import { projectSchema, type Project } from "../../shared/domain";

/** Local synthetic example. It is neither a customer engagement nor AI output. */
export function makeDemoProject(): Project {
  return projectSchema.parse({
    version: 1,
    id: "demo-moa-finance",
    title: "모아 생활금융 앱 리뉴얼",
    client: "모아금융 (가상 고객)",
    brief:
      "가상 고객 모아금융의 생활금융 앱을 위한 합성 체험 예시입니다. 대시보드, 거래 조회, 이체 신청을 하나의 흐름으로 설계하고 제안의 근거가 요구·메뉴·기능·화면까지 이어지는지 확인합니다. 실제 고객 자료나 AI 생성 결과가 아닙니다.",
    stage: "proposal",
    isDemo: true,
    updatedAt: "2026-10-10T00:00:00.000Z",
    handoff: [],
    sources: [
      {
        id: "SRC-001",
        name: "[합성 자료] 모아 생활금융 앱 과업 브리프",
        kind: "rfp",
        readScope: "합성 본문 4개 항목 전체 확인 · 실제 고객 RFP가 아닙니다.",
        text: "[가상 고객 / 체험용 합성 자료]\n1. 회원은 대시보드에서 계좌 요약과 최근 거래를 확인할 수 있어야 한다.\n2. 거래 내역은 기간과 입출금 구분으로 조회하며 조회 결과가 없을 때 안내를 제공한다.\n3. 거래 상세는 목록과 같은 거래 식별자를 사용하고 목록의 검색 조건을 유지해 복귀한다.\n4. 입력과 조회 실패를 정상 결과로 표시하지 않으며 재시도 방법을 안내한다.\n이 본문은 제품 체험을 위해 작성된 예시이며 계약·성과·구현 사실을 증명하지 않는다.",
      },
      {
        id: "SRC-002",
        name: "[합성 자료] 착수 전 업무 인터뷰 발췌",
        kind: "meeting",
        readScope:
          "합성 인터뷰 3개 주제 발췌 · 전체 회의록과 실제 합의는 없습니다.",
        text: "[가상 인터뷰 / 발췌 예시]\n이체: 수취인과 금액을 검토한 뒤 신청한다. 계좌 형식과 이체 한도는 확인이 필요하다.\n접근: 개인회원과 운영 담당자의 조회·관리 권한을 구분하는 방안을 검토한다. 역할별 상세 권한은 아직 미정이다.\n개인화: 맞춤 제안은 고객이 동의한 정보 범위 안에서 검토하자는 의견이 있다. 데이터 확보와 적용 범위가 확정되지 않았다.\n이 기록은 실제 인터뷰 결과가 아니며 발언을 확정 정책으로 사용하지 않는다.",
      },
    ],
    proposal: {
      summary:
        "오늘의 금융 상태를 이해하고 필요한 행동으로 자연스럽게 이어지는 생활금융 경험을 제안합니다. 합성 자료의 요구를 설계 근거로 연결하되 이체 정책·권한·개인화 범위는 별도 확인합니다.",
      winThemes: [
        "계좌 요약부터 거래 조회와 이체 신청까지 하나의 이용 흐름으로 연결합니다.",
        "정상 결과뿐 아니라 빈 결과·입력 오류·요청 실패를 구분해 다음 행동을 안내합니다.",
        "제안의 근거와 요구·기능·화면을 연결해 변경 시 확인할 범위를 드러냅니다.",
      ],
      slides: [
        {
          id: "SLIDE-001",
          title:
            "오늘의 금융 상태에서 다음 행동으로 이어지는 경험을 제안합니다",
          message:
            "대시보드·거래 조회·이체 신청을 분리된 기능이 아닌 하나의 생활금융 여정으로 구성합니다.",
          bullets: [
            "가상 고객 모아금융을 위한 체험 예시",
            "조회에서 행동으로 이어지는 메뉴와 화면",
            "확정되지 않은 정책은 미확정으로 유지",
          ],
          diagram: "statement",
          requirementIds: ["REQ-001", "REQ-002", "REQ-004"],
          evidenceIds: ["SRC-001", "SRC-002"],
          claim: "proposal",
        },
        {
          id: "SLIDE-002",
          title: "조회 결과와 실패 상태를 구분해 이용자의 다음 행동을 돕습니다",
          message:
            "결과가 없을 때와 요청을 처리하지 못했을 때의 안내를 서로 다르게 설계합니다.",
          bullets: [
            "빈 결과: 조건 변경을 안내",
            "입력 오류: 수정할 필드를 표시",
            "요청 실패: 입력을 보존하고 재시도 안내",
          ],
          diagram: "comparison",
          requirementIds: ["REQ-002", "REQ-003", "REQ-004"],
          evidenceIds: ["SRC-001"],
          claim: "proposal",
        },
        {
          id: "SLIDE-003",
          title: "이해·행동·검증의 세 전략으로 화면과 정책을 함께 설계합니다",
          message:
            "금융 정보의 이해, 실행 전 확인, 근거에 따른 검증을 각 수행 영역의 공통 기준으로 둡니다.",
          bullets: [
            "이해: 계좌 요약과 거래 맥락",
            "행동: 수취인·금액 확인과 오류 복구",
            "검증: 요구·정책·상태의 연결",
          ],
          diagram: "strategy",
          requirementIds: ["REQ-001", "REQ-003", "REQ-004"],
          evidenceIds: ["SRC-001", "SRC-002"],
          claim: "proposal",
        },
        {
          id: "SLIDE-004",
          title: "이체 신청은 입력·검토·요청 결과를 나누어 설계합니다",
          message:
            "실제 처리 응답을 받기 전에는 성공으로 표시하지 않으며 한도와 인증 정책은 원문 확인 후 반영합니다.",
          bullets: [
            "입력값의 형식·필수값 확인",
            "수취인과 금액을 다시 검토",
            "정책·실제 연계는 추가 확인",
          ],
          diagram: "process",
          requirementIds: ["REQ-004", "REQ-005"],
          evidenceIds: ["SRC-002"],
          claim: "proposal",
        },
        {
          id: "SLIDE-005",
          title: "범위 확인부터 상태별 검수까지 단계별 기준을 남깁니다",
          message:
            "일정과 투입 인력은 미정이며 산출물과 검토 순서를 먼저 제안합니다.",
          bullets: [
            "분석: 원문과 채택 범위 확인",
            "설계: 메뉴·기능·화면 상태 연결",
            "검수: 수용 기준과 실제 실행 결과 확인",
          ],
          diagram: "roadmap",
          requirementIds: [
            "REQ-001",
            "REQ-002",
            "REQ-003",
            "REQ-004",
            "REQ-005",
          ],
          evidenceIds: ["SRC-001", "SRC-002"],
          claim: "proposal",
        },
        {
          id: "SLIDE-006",
          title: "개인화와 권한 정책의 미확정을 다음 결정으로 남깁니다",
          message:
            "화면이 연결되었다는 사실과 고객 정책·실제 동작을 검증했다는 사실을 구분합니다.",
          bullets: [
            "권한 관리 화면은 아직 설계되지 않음",
            "개인화는 동의·데이터·범위 확인 필요",
            "체험 예시의 목업은 실제 금융 기능이 아님",
          ],
          diagram: "evidence",
          requirementIds: ["REQ-005", "REQ-006"],
          evidenceIds: ["SRC-002"],
          claim: "unresolved",
        },
      ],
    },
    analysis: [
      {
        id: "FIND-001",
        current:
          "합성 브리프는 계좌 요약과 최근 거래를 함께 확인하는 흐름을 요청합니다.",
        impact:
          "조회 화면 사이에서 이용 맥락이 이어지는지 설계 검토가 필요합니다.",
        recommendation:
          "대시보드에서 거래 목록·상세로 이동하고 검색 조건을 보존하는 흐름을 정의합니다.",
        sourceIds: ["SRC-001"],
        claim: "source_claim",
      },
      {
        id: "FIND-002",
        current:
          "합성 인터뷰에 이체 한도·계좌 형식·역할별 권한이 미정으로 남아 있습니다.",
        impact:
          "검증 조건을 임의로 확정하면 잘못된 신청과 권한 허용을 설계할 수 있습니다.",
        recommendation:
          "입력·권한 정책을 확인할 항목으로 분리하고 조건이 확정된 뒤 설계 기준에 반영합니다.",
        sourceIds: ["SRC-002"],
        claim: "unresolved",
      },
      {
        id: "FIND-003",
        current:
          "개인화가 탐색을 돕는다는 방향은 아직 검증되지 않은 가설입니다.",
        impact:
          "효과 수치와 데이터 확보 여부를 성과나 합의로 표현할 수 없습니다.",
        recommendation:
          "대표 이용 과제와 동의 범위를 정한 뒤 비교할 지표·기준선을 수립합니다.",
        sourceIds: [],
        claim: "hypothesis",
      },
    ],
    requirements: [
      {
        id: "REQ-001",
        text: "개인회원은 대시보드에서 계좌 요약과 최근 거래를 확인한다.",
        priority: "must",
        status: "confirmed",
        claim: "source_claim",
        sourceIds: ["SRC-001"],
        acceptance:
          "조회 성공 시 요약과 최근 거래가 표시되고, 조회 실패 시 성공 값 대신 재시도 안내가 표시된다.",
      },
      {
        id: "REQ-002",
        text: "개인회원은 기간과 입출금 구분으로 거래 내역을 조회한다.",
        priority: "must",
        status: "draft",
        claim: "source_claim",
        sourceIds: ["SRC-001"],
        acceptance:
          "조건에 일치하는 거래만 표시한다. 결과가 없으면 조건 변경을 안내하고 종료일이 시작일보다 이르면 입력 오류를 표시한다.",
      },
      {
        id: "REQ-003",
        text: "개인회원은 거래 상세를 확인한 뒤 조회 조건을 유지해 목록으로 돌아간다.",
        priority: "must",
        status: "draft",
        claim: "source_claim",
        sourceIds: ["SRC-001"],
        acceptance:
          "선택한 거래 식별자의 상세가 표시되고 목록 복귀 시 기간·입출금 조건이 유지된다.",
      },
      {
        id: "REQ-004",
        text: "개인회원은 수취인과 금액을 검토한 뒤 이체를 신청한다.",
        priority: "must",
        status: "draft",
        claim: "proposal",
        sourceIds: ["SRC-002"],
        acceptance:
          "필수값이 없으면 신청을 차단한다. 요청 중 중복 신청을 막고 요청 실패 시 입력을 보존한다. 계좌 형식·한도·인증 정책은 별도 확인한다.",
      },
      {
        id: "REQ-005",
        text: "운영 담당자와 개인회원의 조회·관리 권한을 구분한다.",
        priority: "should",
        status: "draft",
        claim: "unresolved",
        sourceIds: ["SRC-002"],
        acceptance:
          "역할별 접근 범위가 채택되면 허용되지 않은 사용자에게 제한 안내를 표시한다. 상세 권한과 관리 화면은 미정이다.",
      },
      {
        id: "REQ-006",
        text: "고객이 동의한 정보로 맞춤 금융 제안을 검토한다.",
        priority: "could",
        status: "draft",
        claim: "hypothesis",
        sourceIds: [],
        acceptance: "",
      },
    ],
    ia: [
      { id: "IA-001", label: "대시보드", parentId: null },
      { id: "IA-002", label: "거래 내역", parentId: null },
      { id: "IA-003", label: "거래 상세", parentId: "IA-002" },
      { id: "IA-004", label: "이체 신청", parentId: null },
      { id: "IA-005", label: "접근 권한", parentId: null },
    ],
    functions: [
      {
        id: "FN-001",
        name: "계좌 요약·최근 거래 조회",
        requirementIds: ["REQ-001"],
        iaId: "IA-001",
      },
      {
        id: "FN-002",
        name: "거래 내역 조건 조회",
        requirementIds: ["REQ-002"],
        iaId: "IA-002",
      },
      {
        id: "FN-003",
        name: "거래 상세 조회·목록 복귀",
        requirementIds: ["REQ-003"],
        iaId: "IA-003",
      },
      {
        id: "FN-004",
        name: "이체 입력 검토·신청",
        requirementIds: ["REQ-004"],
        iaId: "IA-004",
      },
      {
        id: "FN-005",
        name: "역할별 접근 권한 확인",
        requirementIds: ["REQ-005"],
        iaId: "IA-005",
      },
      {
        id: "FN-006",
        name: "맞춤 제안 노출 조건 검토",
        requirementIds: ["REQ-006"],
        iaId: "IA-001",
      },
    ],
    screens: [
      {
        id: "SCR-001",
        title: "나의 금융 대시보드",
        route: "/dashboard",
        kind: "dashboard",
        functionIds: ["FN-001"],
        sections: ["오늘의 계좌 요약", "최근 거래", "이체 신청 바로가기"],
        fields: [
          {
            name: "조회 계좌",
            type: "select",
            required: false,
            rule: "본인에게 조회 권한이 있는 계좌만 선택한다. 실제 계좌 데이터는 연결되지 않았다.",
          },
        ],
        states: ["normal", "empty", "error", "loading"],
        roles: ["개인회원"],
        notes:
          "합성 목업. 실제 잔액·거래 데이터와 연결되지 않았습니다. 조회 실패를 빈 계좌로 표시하지 않습니다.",
      },
      {
        id: "SCR-002",
        title: "거래 내역",
        route: "/transactions",
        kind: "list",
        functionIds: ["FN-002"],
        sections: ["기간·유형 검색", "조회 결과", "거래 상세로 이동"],
        fields: [
          {
            name: "시작일",
            type: "date",
            required: true,
            rule: "종료일 이후일 수 없다. 기본 조회 기간은 고객 확인이 필요하다.",
          },
          {
            name: "종료일",
            type: "date",
            required: true,
            rule: "시작일 이전이면 해당 필드에 오류를 표시한다.",
          },
          {
            name: "거래 구분",
            type: "select",
            required: false,
            rule: "전체·입금·출금. 실제 업무 코드와 매핑 필요.",
          },
        ],
        states: ["normal", "empty", "error", "loading"],
        roles: ["개인회원"],
        notes:
          "합성 거래 목록입니다. 데이터가 없는 상태와 요청 실패를 분리하고 상세에서 돌아올 때 조회 조건을 유지합니다.",
      },
      {
        id: "SCR-003",
        title: "거래 상세",
        route: "/transactions/:id",
        kind: "detail",
        functionIds: ["FN-003"],
        sections: ["거래 식별 정보", "금액·처리 상태", "목록으로 돌아가기"],
        fields: [
          {
            name: "거래 식별자",
            type: "text",
            required: true,
            rule: "목록에서 전달받은 식별자를 사용한다. 임의 변경을 허용하지 않는다.",
          },
        ],
        states: ["normal", "error"],
        roles: ["개인회원"],
        notes:
          "검수 공백 예시: 삭제되거나 조회되지 않는 거래의 빈값 상태가 아직 정의되지 않았습니다. 실제 동작 검증은 미실행입니다.",
      },
      {
        id: "SCR-004",
        title: "이체 신청",
        route: "/transfers/new",
        kind: "form",
        functionIds: ["FN-004"],
        sections: ["받는 분", "보낼 금액", "신청 전 확인"],
        fields: [
          {
            name: "받는 계좌",
            type: "text",
            required: true,
            rule: "필수 입력. 허용 형식과 계좌 확인 방법은 미확정.",
          },
          {
            name: "이체 금액",
            type: "number",
            required: true,
            rule: "0보다 큰 금액. 소수 허용·통화·한도 정책은 고객 확인 필요.",
          },
          {
            name: "받는 분 확인",
            type: "checkbox",
            required: true,
            rule: "표시된 수취인 정보를 확인해야 신청할 수 있도록 제안한다.",
          },
        ],
        states: ["normal", "empty", "error", "loading", "permission"],
        roles: ["개인회원"],
        notes:
          "금융 이체가 실행되지 않는 합성 목업입니다. 계좌·한도·인증 조건은 미확정이며 실제 처리 성공을 증명하지 않습니다.",
      },
    ],
    assumptions: [
      "모아금융과 모든 자료·요구·화면은 체험용 합성 예시입니다. 실제 고객 과업이나 AI 실행 결과가 아닙니다.",
      "이체 한도·계좌 검증·인증 정책과 운영 담당자의 상세 권한은 미확정입니다.",
      "맞춤 제안은 근거가 없는 검증 대상 가설이며 수행 범위에 자동 포함하지 않습니다.",
      "권한 관리·맞춤 제안에는 아직 화면이 없고, 거래 상세의 빈값 상태는 검수 공백으로 남아 있습니다.",
    ],
  });
}
