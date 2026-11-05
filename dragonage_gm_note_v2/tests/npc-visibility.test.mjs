import test from "node:test";
import assert from "node:assert/strict";
import {
  npcVisibilityScope,
  canReadScenarioNpc,
  scopeNpcQuery,
} from "../src/services/npcVisibility.mjs";
const getters = {
  campaignId: "campaign",
  activePlayerTeamId: "own",
  isGM: false,
};
const teams = (progress) => [
  { id: "own", campaign_id: "campaign", progress_step: progress },
  { id: "other", campaign_id: "campaign", progress_step: 20 },
];
const npcs = Array.from({ length: 7 }, (_, i) => ({
  id: i + 1,
  campaign_id: "campaign",
  scenario_step: i + 1,
}));
for (const [progress, expected] of [
  [1, []],
  [5, [1, 2, 3, 4]],
]) {
  test(
    "team progress " + progress + " restricts lists and direct detail access",
    () => {
      const scope = npcVisibilityScope(getters, teams(progress));
      assert.deepEqual(
        npcs.filter((n) => canReadScenarioNpc(scope, n)).map((n) => n.id),
        expected
      );
      assert.equal(canReadScenarioNpc(scope, npcs[progress - 1]), false);
      const filters = [];
      const query = {
        eq: (...a) => {
          filters.push(a);
          return query;
        },
        lte: (...a) => {
          filters.push(a);
          return query;
        },
      };
      scopeNpcQuery(query, scope);
      assert.deepEqual(filters, [
        ["campaign_id", "campaign"],
        ["scenario_step", progress - 1],
      ]);
    }
  );
}
test("unknown team/progress/campaign deny access", () => {
  for (const progress of [null, undefined, "invalid", 0, -1, 1.5])
    assert.equal(npcVisibilityScope(getters, teams(progress)), null);
  assert.equal(npcVisibilityScope(getters, []), null);
  assert.equal(
    npcVisibilityScope({ ...getters, campaignId: "different" }, teams(5)),
    null
  );
  assert.equal(canReadScenarioNpc(null, npcs[0]), false);
});
test("GM reads all; preview follows selected team", () => {
  const scope = npcVisibilityScope({ ...getters, isGM: true }, []);
  assert.equal(
    npcs.every((n) => canReadScenarioNpc(scope, n)),
    true
  );
  assert.equal(
    canReadScenarioNpc(npcVisibilityScope(getters, teams(5)), {
      ...npcs[0],
      campaign_id: "other",
    }),
    false
  );
  assert.equal(
    npcVisibilityScope({ ...getters, isGM: false }, teams(1)).maxStep,
    0
  );
});
