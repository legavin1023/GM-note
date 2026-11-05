import test from "node:test";
import assert from "node:assert/strict";
import {
  activityDetailLines,
  activityPreview,
} from "../src/services/activityDetails.mjs";

test("updates show every changed field with previous and next values", () => {
  const log = {
    feature: "팀 정보",
    operation: "UPDATE",
    entity_label: "그리핀",
    details: [
      { label: "진행 시나리오", before: "1", after: "5" },
      { label: "지역", before: "페렐던", after: "오를레이" },
    ],
  };
  assert.deepEqual(activityDetailLines(log), [
    "진행 시나리오: 1 → 5",
    "지역: 페렐던 → 오를레이",
  ]);
  assert.ok(activityPreview(log).includes("그리핀"));
  assert.ok(activityPreview(log).includes("1 → 5"));
});
test("NPC ratings and comments keep NPC identity and registered values", () => {
  const log = {
    feature: "주요 NPC 평점",
    operation: "INSERT",
    entity_label: "모리건",
    details: [{ label: "평점", after: "4" }],
  };
  assert.equal(activityPreview(log), "주요 NPC 평점 등록 · 모리건 · 평점: 4");
  assert.deepEqual(
    activityDetailLines({
      ...log,
      feature: "주요 NPC 댓글",
      details: [{ label: "내용", after: "다시 만나고 싶어요" }],
    }),
    ["내용: 다시 만나고 싶어요"]
  );
});
test("deletes show deleted values; missing fields and older logs remain readable", () => {
  assert.deepEqual(
    activityDetailLines({
      operation: "DELETE",
      details: [{ label: "제목", before: "삭제된 글" }],
    }),
    ["제목: 삭제된 글"]
  );
  assert.deepEqual(activityDetailLines({ details: null }), []);
  assert.deepEqual(
    activityDetailLines({
      operation: "UPDATE",
      details: [null, { label: "설명", after: "새 설명" }],
    }),
    ["설명: 없음 → 새 설명"]
  );
});
