function positiveNumber(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function ratio(current, maximum) {
  const max = positiveNumber(maximum);
  return max > 0 ? positiveNumber(current) / max : 1;
}

function freezeResources(resources) {
  return Object.freeze({
    compute: positiveNumber(resources?.compute),
    components: positiveNumber(resources?.components),
    shards: positiveNumber(resources?.shards),
  });
}

function candidateCost(candidate) {
  return freezeResources(candidate?.cost);
}

function missingResources(wallet, cost) {
  return freezeResources({
    compute: cost.compute - positiveNumber(wallet?.compute),
    components: cost.components - positiveNumber(wallet?.components),
    shards: cost.shards - positiveNumber(wallet?.shards),
  });
}

function canAfford(missing) {
  return missing.compute === 0 && missing.components === 0 && missing.shards === 0;
}

function recommendedCandidate(candidates) {
  const available = (Array.isArray(candidates) ? candidates : []).filter(
    (candidate) => candidate && typeof candidate.id === "string" && candidate.id.length > 0,
  );
  return available.find((candidate) => candidate.matchesThreat === true)
    ?? available.find((candidate) => candidate.matchesThreat !== false)
    ?? null;
}

function advice(fields) {
  return Object.freeze(fields);
}

function saveFallback() {
  return advice({
    state: "save",
    eyebrow: "HOLD COMPUTE",
    title: "SAVE COMPUTE",
    detail: "No urgent recruitment need. Hold Compute for the next upgrade.",
    role: null,
    agentId: null,
    action: "save",
    cost: null,
    missing: null,
  });
}

/**
 * Returns display-only recruitment guidance from a serializable battlefield
 * snapshot. Candidate order breaks ties deterministically.
 */
export function getRecruitmentAdvice(input = {}) {
  const coreCritical = ratio(input.coreHp, input.coreMaxHp) <= 0.5;
  const immediateBreach = positiveNumber(input.threatCount) >= 4;
  if (coreCritical || immediateBreach) {
    return advice({
      state: "defend",
      eyebrow: "DEFEND CORE",
      title: "CORE IN DANGER",
      detail: "Core integrity is critical. Stabilize the breach before recruiting.",
      role: null,
      agentId: null,
      action: "defend",
      cost: null,
      missing: null,
    });
  }

  if (ratio(input.operatorHp, input.operatorMaxHp) <= 0.35) {
    return advice({
      state: "repair",
      eyebrow: "REPAIR FIRST",
      title: "OPERATOR CRITICAL",
      detail: "Operator integrity is critical. Recover before expanding the warband.",
      role: null,
      agentId: null,
      action: "repair",
      cost: null,
      missing: null,
    });
  }

  const hasRosterSpace = positiveNumber(input.activeAgents) < positiveNumber(input.maxAgents);
  const candidate = hasRosterSpace ? recommendedCandidate(input.candidates) : null;
  if (!candidate) return saveFallback();

  const cost = candidateCost(candidate);
  const missing = missingResources(input, cost);
  const agentName = candidate.id.toUpperCase();
  const role = typeof candidate.role === "string" ? candidate.role : "specialist";
  if (canAfford(missing)) {
    return advice({
      state: "recruit",
      eyebrow: "RECRUIT ADVISED",
      title: `RECRUIT ${agentName}`,
      detail: `${agentName} fills the ${role} role for the current threat.`,
      role,
      agentId: candidate.id,
      action: "recruit",
      cost,
      missing,
    });
  }

  const missingCompute = missing.compute;
  return advice({
    state: "save",
    eyebrow: "HOLD COMPUTE",
    title: `SAVE FOR ${agentName}`,
    detail: missingCompute > 0
      ? `Need ${missingCompute} more Compute to recruit ${agentName}.`
      : `Gather the remaining materials to recruit ${agentName}.`,
    role,
    agentId: candidate.id,
    action: "save",
    cost,
    missing,
  });
}

/**
 * @param {any} previousAdvice
 * @param {any} nextAdvice
 * @param {string | null | undefined} dismissedAgentId
 */
export function shouldShowRecruitPrompt(
  previousAdvice,
  nextAdvice,
  dismissedAgentId = null,
) {
  const nextAgentId = typeof nextAdvice?.agentId === "string"
    ? nextAdvice.agentId
    : null;
  if (nextAdvice?.state !== "recruit" || !nextAgentId) return false;
  if (dismissedAgentId === nextAgentId) return false;
  return !(
    previousAdvice?.state === "recruit" &&
    previousAdvice?.agentId === nextAgentId
  );
}
