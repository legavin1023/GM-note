// A missing or invalid team position must never reveal scenario NPCs.
export function npcVisibilityScope(getters, teams) {
  const campaignId = getters.campaignId;
  if (getters.isGM && campaignId) return { campaignId, maxStep: null };
  const team = teams.find((row) => row.id === getters.activePlayerTeamId);
  const progress = Number(team?.progress_step);
  if (
    !campaignId ||
    !team ||
    team.campaign_id !== campaignId ||
    !Number.isInteger(progress) ||
    progress < 1
  )
    return null;
  return { campaignId, maxStep: progress - 1 };
}

export function canReadScenarioNpc(scope, npc) {
  const step = Number(npc?.scenario_step);
  return Boolean(
    scope &&
      npc &&
      npc.campaign_id === scope.campaignId &&
      Number.isInteger(step) &&
      step >= 1 &&
      (scope.maxStep === null || step <= scope.maxStep)
  );
}

export function scopeNpcQuery(query, scope) {
  query = query.eq("campaign_id", scope.campaignId);
  return scope.maxStep === null
    ? query
    : query.lte("scenario_step", scope.maxStep);
}
