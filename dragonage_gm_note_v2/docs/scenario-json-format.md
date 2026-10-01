# DragonAge 시나리오 JSON 포맷 가이드

이 문서는 드래곤에이지 TRPG 캠페인 추적 사이트에서 사용하는 시나리오 JSON 구조와 작성 방법을 설명합니다.
초보자도 쉽게 JSON 파일을 수정하고 관리할 수 있도록 안내합니다.

---

## 1. 기본 파일 구조

시나리오 JSON 파일은 전체 캠페인의 **시나리오 원본 정의**를 담고 있으며, 플레이 기록(팀 선택 결과, GM 메모)은 포함되지 않습니다.

```json
{
  "campaign": "dragon-age",
  "scenarios": [
    {
      "code": "S01",
      "title": "시나리오 제목",
      "description": "시나리오 개요 설명",
      "sort_order": 1,
      "questions": [
        {
          "code": "Q01",
          "step_number": 1,
          "prompt": "플레이어들에게 주어지는 질문/분기 문구",
          "sort_order": 1,
          "choices": [
            {
              "code": "A",
              "label": "첫 번째 선택지 문구",
              "sort_order": 1
            },
            {
              "code": "B",
              "label": "두 번째 선택지 문구",
              "sort_order": 2
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 2. 주요 필드 설명

### 2-1. 최상위 필드
| 필드명 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `campaign` | string | 필수 | 캠페인 식별자 (예: `"dragon-age"`) |
| `scenarios` | array | 필수 | 시나리오 객체들의 배열 |

---

### 2-2. Scenario (시나리오) 객체
| 필드명 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `code` | string | **필수** | 시나리오 식별 코드 (예: `"S01"`, `"S02"`). 데이터베이스에서 덮어쓰기/업데이트 기준으로 사용되므로 고유해야 합니다. |
| `title` | string | **필수** | 시나리오 제목 (예: `"잿빛 길목"`) |
| `description` | string | 선택 | 시나리오 배경 및 요약 설명 |
| `sort_order` | number | 선택 | 화면에 표시될 시나리오 순서 (기본값: `1`, `2`, `3`...) |
| `questions` | array | 선택 | 질문/분기 객체들의 배열 |

---

### 2-3. Question (질문/분기) 객체
| 필드명 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `code` | string | **필수** | 해당 시나리오 안에서 고유한 질문 코드 (예: `"Q01"`, `"Q02"`) |
| `prompt` | string | **필수** | 질문 내용 문구 (예: `"낯선 징조에 어떻게 반응합니까?"`) |
| `step_number` | number | 선택 | 진행 단계 번호 (progress_stages 단계) |
| `sort_order` | number | 선택 | 질문 표시 순서 |
| `choices` | array | 선택 | 선택지 객체들의 배열 |

---

### 2-4. Choice (선택지) 객체
| 필드명 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `code` | string | **필수** | 해당 질문 안에서 고유한 선택지 코드 (예: `"A"`, `"B"`, `"C"`) |
| `label` | string | **필수** | 선택지 문구 (예: `"도움을 요청한다"`, `"흔적을 추적한다"`) |
| `sort_order` | number | 선택 | 선택지 표시 순서 |

---

## 3. 코드(Code) 시스템과 데이터 보호 규칙

웹사이트에서는 `code` 식별자 (`S01`, `Q01`, `A` 등)를 기반으로 데이터를 업데이트합니다.

1. **질문 문구 수정**: 질문 문구(`prompt`)나 선택지 문구(`label`)를 변경해도 `code`가 동일하다면 기존 팀들의 선택 기록이 유지됩니다.
2. **신규 시나리오 추가**: 새로운 `code` (예: `S05`)를 추가하고 Import 하면 기존 기록 손상 없이 새 시나리오가 추가됩니다.
3. **데이터 삭제 금지**: JSON에서 특정 질문이나 시나리오를 제외하고 불러오더라도 과거 팀의 플레이 기록 보호를 위해 DB 데이터가 강제로 삭제되지 않습니다. (is_active 플래그 적용)

---

## 4. 실전 예제 JSON

다음 내용을 복사하여 `.json` 파일로 저장한 뒤 관리자 메뉴의 **[JSON 가져오기]** 화면에서 등록할 수 있습니다.

```json
{
  "campaign": "dragon-age",
  "scenarios": [
    {
      "code": "S01",
      "title": "가을폭포의 사건",
      "description": "가을폭포 마을에서 발생한 의문의 사건을 조사합니다.",
      "sort_order": 1,
      "questions": [
        {
          "code": "Q01",
          "step_number": 1,
          "prompt": "플레이어들은 사건 현장에서 어떻게 행동했는가?",
          "sort_order": 1,
          "choices": [
            { "code": "A", "label": "마을 사람을 직접 돕는다", "sort_order": 1 },
            { "code": "B", "label": "단서를 수집하고 사건을 조사한다", "sort_order": 2 },
            { "code": "C", "label": "위험을 피해 마을을 떠난다", "sort_order": 3 }
          ]
        },
        {
          "code": "Q02",
          "step_number": 1,
          "prompt": "비밀 교단과의 조우에서 어떤 선택을 했는가?",
          "sort_order": 2,
          "choices": [
            { "code": "A", "label": "설득을 시도하여 대화로 해결한다", "sort_order": 1 },
            { "code": "B", "label": "무력을 사용해 제압한다", "sort_order": 2 }
          ]
        }
      ]
    },
    {
      "code": "S02",
      "title": "사라진 사람들",
      "description": "지하 통로를 통해 실종된 마을 주민들의 흔적을 추적합니다.",
      "sort_order": 2,
      "questions": [
        {
          "code": "Q01",
          "step_number": 2,
          "prompt": "갈림길에서 어느 통로를 선택했는가?",
          "sort_order": 1,
          "choices": [
            { "code": "A", "label": "침수된 왼쪽 통로", "sort_order": 1 },
            { "code": "B", "label": "낙석 위험이 있는 오른쪽 통로", "sort_order": 2 }
          ]
        }
      ]
    }
  ]
}
```
