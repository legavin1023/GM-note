/**
 * scenarios.js — 시나리오 원본 관련 Supabase 함수
 *
 * 시나리오 원본 (scenarios, scenario_questions, question_choices) 과
 * 팀별 플레이 기록 (team_scenarios, team_scenario_answers) 을 완전히 분리.
 */
import { supabase } from "@/supabase";

// ─────────────────────────────────────────
// 시나리오 원본 조회
// ─────────────────────────────────────────

/**
 * 캠페인의 모든 시나리오 조회 (질문 + 선택지 포함)
 */
export async function getScenarios(campaignId) {
  const { data, error } = await supabase
    .from("scenarios")
    .select(
      `
      id, campaign_id, code, title, description, sort_order, created_at,
      scenario_questions(
        id, scenario_id, prompt, sort_order, step_number,
        question_choices(id, question_id, label, sort_order)
      )
    `
    )
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[Supabase] SCENARIOS/QUESTIONS/CHOICES ERROR", error);
    throw error;
  }

  return (data || []).map((s, scenarioIndex) => ({
    ...s,
    code: s.code || `S${String(s.sort_order || scenarioIndex + 1).padStart(2, "0")}`,
    questions: (s.scenario_questions || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((q, questionIndex) => ({
        ...q,
        code: `Q${String(q.sort_order || questionIndex + 1).padStart(2, "0")}`,
        choices: (q.question_choices || []).sort(
          (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
        ).map((choice, index) => ({ ...choice, code: choice.code || String.fromCharCode(65 + index) })),
      })),
  }));
}

/**
 * 시나리오 단일 조회
 */
export async function getScenario(scenarioId) {
  const { data, error } = await supabase
    .from("scenarios")
    .select(
      `
      id, campaign_id, code, title, description, sort_order, created_at,
      scenario_questions(
        id, scenario_id, prompt, sort_order, step_number,
        question_choices(id, question_id, label, sort_order)
      )
    `
    )
    .eq("id", scenarioId)
    .single();

  if (error) throw error;

  return {
    ...data,
    questions: (data.scenario_questions || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((q, questionIndex) => ({
        ...q,
        code: `Q${String(q.sort_order || questionIndex + 1).padStart(2, "0")}`,
        choices: (q.question_choices || []).sort(
          (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
        ).map((choice, index) => ({ ...choice, code: choice.code || String.fromCharCode(65 + index) })),
      })),
  };
}

// ─────────────────────────────────────────
// 팀별 플레이 기록 조회
// ─────────────────────────────────────────

/**
 * 특정 팀의 모든 시나리오 기록 조회 (answers 포함)
 */
export async function getTeamScenarios(teamId) {
  const { data, error } = await supabase
    .from("team_scenarios")
    .select(
      `
      id, team_id, scenario_id, completed, gm_note, step_number, created_at, updated_at,
      team_scenario_answers(
        id, team_scenario_id, question_id, choice_id, created_at
      )
    `
    )
    .eq("team_id", teamId);

  if (error) throw error;
  return data || [];
}

/**
 * 시나리오별 모든 팀의 기록 조회 (비교 테이블용)
 */
export async function getAllTeamScenariosForScenario(scenarioId) {
  const { data, error } = await supabase
    .from("team_scenarios")
    .select(
      `
      id, team_id, scenario_id, completed, gm_note, updated_at,
      team_scenario_answers(
        id, team_scenario_id, question_id, choice_id
      )
    `
    )
    .eq("scenario_id", scenarioId);

  if (error) throw error;
  return data || [];
}

/**
 * 팀 + 시나리오 조합의 기록 조회 또는 생성
 */
export async function getOrCreateTeamScenario(teamId, scenarioId) {
  // 먼저 조회
  const { data: existing, error: lookupError } = await supabase
    .from("team_scenarios")
    .select("*")
    .eq("team_id", teamId)
    .eq("scenario_id", scenarioId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    // answers 별도 조회
    const { data: answers } = await supabase
      .from("team_scenario_answers")
      .select("*")
      .eq("team_scenario_id", existing.id);
    return { ...existing, team_scenario_answers: answers || [] };
  }

  // 없으면 생성
  const { data: created, error } = await supabase
    .from("team_scenarios")
    .insert({ team_id: teamId, scenario_id: scenarioId, completed: false, gm_note: "" })
    .select()
    .single();

  if (error) throw error;
  return { ...created, team_scenario_answers: [] };
}

/** Get or create a team record for one progress_stages row. */
export async function getOrCreateTeamProgressStage(teamId, stepNumber) {
  const { data: existing, error: lookupError } = await supabase
    .from("team_scenarios")
    .select("*")
    .eq("team_id", teamId)
    .eq("step_number", stepNumber)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    const { data: answers, error: answersError } = await supabase
      .from("team_scenario_answers")
      .select("id, team_scenario_id, question_id, choice_id")
      .eq("team_scenario_id", existing.id);
    if (answersError) throw answersError;
    return { ...existing, team_scenario_answers: answers || [] };
  }

  const { data, error } = await supabase
    .from("team_scenarios")
    .insert({ team_id: teamId, step_number: stepNumber, completed: false, gm_note: "" })
    .select()
    .single();
  if (error) throw error;
  return { ...data, team_scenario_answers: [] };
}

/** Load team progress rows used by dashboard progress summaries. */
export async function getTeamProgressRecords(teamIds) {
  if (!teamIds.length) return [];
  const { data, error } = await supabase
    .from("team_scenarios")
    .select(`
      id, team_id, scenario_id, step_number, completed, gm_note, updated_at,
      team_scenario_answers(id, team_scenario_id, question_id, choice_id)
    `)
    .in("team_id", teamIds)
    .not("step_number", "is", null);
  if (error) throw error;
  return data || [];
}

/** Load questions and choices attached to progress_stages.step_number. */
export async function getProgressStageQuestions() {
  const { data, error } = await supabase
    .from("scenario_questions")
    .select("id, scenario_id, step_number, prompt, sort_order, question_choices(id, question_id, label, sort_order)")
    .not("step_number", "is", null)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[Supabase] PROGRESS STAGE QUESTIONS ERROR", error);
    throw error;
  }
  return (data || []).map((question, index) => ({
    ...question,
    code: `Q${String(question.sort_order || index + 1).padStart(2, "0")}`,
    choices: (question.question_choices || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((choice, choiceIndex) => ({ ...choice, code: String.fromCharCode(65 + choiceIndex) })),
  }));
}

export async function getProgressStageWithQuestions(stepNumber) {
  const { data: stage, error: stageError } = await supabase
    .from("progress_stages")
    .select("step_number, title, description")
    .eq("step_number", stepNumber)
    .single();
  if (stageError) throw stageError;
  const questions = await getProgressStageQuestions();
  return {
    id: String(stage.step_number),
    step_number: stage.step_number,
    code: `S${String(stage.step_number).padStart(2, "0")}`,
    title: stage.title,
    description: stage.description,
    questions: questions.filter((question) => question.step_number === stage.step_number),
  };
}

/** Add a question and its answer choices to one progress stage. */
export async function addProgressStageQuestion(stepNumber, prompt, choiceLabels) {
  const cleanPrompt = String(prompt || "").trim();
  const labels = (choiceLabels || []).map((label) => String(label || "").trim()).filter(Boolean);
  if (!cleanPrompt) throw new Error("질문 내용을 입력하세요.");
  if (labels.length < 2) throw new Error("선택지를 두 개 이상 입력하세요.");

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("로그인 정보가 없어 질문을 저장할 수 없습니다.");

  const { data: existingQuestions, error: listError } = await supabase
    .from("scenario_questions")
    .select("sort_order")
    .eq("step_number", stepNumber)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (listError) throw listError;

  const { data: question, error: questionError } = await supabase
    .from("scenario_questions")
    .insert({
      owner_id: user.id,
      step_number: stepNumber,
      prompt: cleanPrompt,
      sort_order: (Number(existingQuestions?.[0]?.sort_order) || 0) + 1,
    })
    .select("id, step_number, prompt, sort_order")
    .single();
  if (questionError) throw questionError;

  const { error: choicesError } = await supabase.from("question_choices").insert(
    labels.map((label, index) => ({
      question_id: question.id,
      label,
      sort_order: index + 1,
    }))
  );
  if (choicesError) {
    await supabase.from("scenario_questions").delete().eq("id", question.id);
    throw choicesError;
  }
  return question;
}

// ─────────────────────────────────────────
// 팀별 플레이 기록 저장
// ─────────────────────────────────────────

/**
 * 완료 여부 + GM 메모 저장
 */
export async function saveTeamScenarioStatus(
  teamScenarioId,
  { completed, gmNote }
) {
  const { data, error } = await supabase
    .from("team_scenarios")
    .update({
      completed: Boolean(completed),
      gm_note: gmNote || "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", teamScenarioId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 질문별 선택 저장 (UPSERT)
 * - question_id + team_scenario_id 조합은 유일해야 함
 * - choice_id가 해당 question의 선택지인지 먼저 검증
 */
export async function saveTeamScenarioAnswer(
  teamScenarioId,
  questionId,
  choiceId
) {
  // 검증: choiceId가 해당 questionId에 속하는지 확인
  if (choiceId) {
    const { data: choice, error: checkError } = await supabase
      .from("question_choices")
      .select("id, question_id")
      .eq("id", choiceId)
      .eq("question_id", questionId)
      .maybeSingle();

    if (checkError) throw checkError;
    if (!choice) {
      throw new Error(
        `선택지(${choiceId})가 질문(${questionId})에 속하지 않습니다.`
      );
    }
  }

  if (!choiceId) {
    // 선택 해제: 기존 row 삭제
    const { error } = await supabase
      .from("team_scenario_answers")
      .delete()
      .eq("team_scenario_id", teamScenarioId)
      .eq("question_id", questionId);

    if (error) throw error;
    return null;
  }

  // UPSERT (team_scenario_id + question_id unique 제약 필요)
  const { data, error } = await supabase
    .from("team_scenario_answers")
    .upsert(
      { team_scenario_id: teamScenarioId, question_id: questionId, choice_id: choiceId },
      { onConflict: "team_scenario_id,question_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Save one scenario and its editable question/choice tree. */
export async function saveScenarioDefinition(scenario) {
  const scenarioPayload = {
    campaign_id: scenario.campaign_id,
    code: scenario.code,
    title: scenario.title || "",
    description: scenario.description || "",
    sort_order: Number(scenario.sort_order) || 0,
  };
  const scenarioQuery = scenario.id && !String(scenario.id).startsWith("local_")
    ? supabase.from("scenarios").update(scenarioPayload).eq("id", scenario.id)
    : supabase.from("scenarios").insert(scenarioPayload);
  const { data: savedScenario, error: scenarioError } = await scenarioQuery.select().single();
  if (scenarioError) throw scenarioError;

  for (const [qi, question] of (scenario.questions || []).entries()) {
    const qPayload = {
      scenario_id: savedScenario.id,
      prompt: question.prompt || "",
      sort_order: Number(question.sort_order) || qi + 1,
      step_number: question.step_number || null,
    };
    const qQuery = question.id && !String(question.id).startsWith("local_")
      ? supabase.from("scenario_questions").update(qPayload).eq("id", question.id)
      : supabase.from("scenario_questions").insert(qPayload);
    const { data: savedQuestion, error: qError } = await qQuery.select().single();
    if (qError) throw qError;

    for (const [ci, choice] of (question.choices || []).entries()) {
      const cPayload = {
        question_id: savedQuestion.id,
        label: choice.label || "",
        sort_order: Number(choice.sort_order) || ci + 1,
      };
      const cQuery = choice.id && !String(choice.id).startsWith("local_")
        ? supabase.from("question_choices").update(cPayload).eq("id", choice.id)
        : supabase.from("question_choices").insert(cPayload);
      const { data: savedChoice, error: cError } = await cQuery.select().single();
      if (cError) throw cError;
      choice.id = savedChoice.id;
    }
    question.id = savedQuestion.id;
  }
  scenario.id = savedScenario.id;
  scenario.campaign_id = savedScenario.campaign_id;
  return scenario;
}

export async function deleteScenarioQuestion(questionId) {
  const { error } = await supabase.from("scenario_questions").delete().eq("id", questionId);
  if (error) throw error;
}

export async function deleteQuestionChoice(choiceId) {
  const { error } = await supabase.from("question_choices").delete().eq("id", choiceId);
  if (error) throw error;
}

// ─────────────────────────────────────────
// JSON Import/Export
// ─────────────────────────────────────────

/**
 * JSON 데이터를 DB에 반영 (code 기반 UPSERT)
 * - 기존 팀 기록 보호: code가 같으면 업데이트, 새 code면 생성
 * - JSON에서 빠진 항목은 is_active=false (삭제 안 함)
 */
export async function importScenariosFromJson(campaignId, jsonData) {
  const results = [];

  for (const scenarioJson of jsonData.scenarios) {
    // 시나리오 UPSERT
    const scenarioPayload = {
          campaign_id: campaignId,
          code: scenarioJson.code,
          title: scenarioJson.title,
          description: scenarioJson.description || "",
          sort_order: scenarioJson.sort_order || 0,
    };
    const { data: existingScenario, error: lookupScenarioError } = await supabase
      .from("scenarios").select("id").eq("campaign_id", campaignId)
      .eq("code", scenarioJson.code).maybeSingle();
    if (lookupScenarioError) throw lookupScenarioError;
    const scenarioQuery = existingScenario
      ? supabase.from("scenarios").update(scenarioPayload).eq("id", existingScenario.id)
      : supabase.from("scenarios").insert(scenarioPayload);
    const { data: scenarioRow, error: sError } = await scenarioQuery.select().single();

    if (sError) throw sError;
    results.push({ scenario: scenarioRow, questions: [] });

    // 질문 UPSERT
    for (const questionJson of scenarioJson.questions || []) {
      const questionPayload = {
            scenario_id: scenarioRow.id,
            prompt: questionJson.prompt,
            sort_order: questionJson.sort_order || 0,
            step_number: questionJson.step_number || null,
      };
      const { data: existingQuestion, error: lookupQuestionError } = await supabase
        .from("scenario_questions").select("id").eq("scenario_id", scenarioRow.id)
        .eq("sort_order", questionPayload.sort_order).maybeSingle();
      if (lookupQuestionError) throw lookupQuestionError;
      const questionQuery = existingQuestion
        ? supabase.from("scenario_questions").update(questionPayload).eq("id", existingQuestion.id)
        : supabase.from("scenario_questions").insert(questionPayload);
      const { data: questionRow, error: qError } = await questionQuery.select().single();

      if (qError) throw qError;

      // 선택지 UPSERT
      for (const choiceJson of questionJson.choices || []) {
        const choicePayload = {
          question_id: questionRow.id,
          label: choiceJson.label,
          sort_order: choiceJson.sort_order || 0,
        };
        const { data: existingChoice, error: lookupChoiceError } = await supabase
          .from("question_choices").select("id").eq("question_id", questionRow.id)
          .eq("sort_order", choicePayload.sort_order).maybeSingle();
        if (lookupChoiceError) throw lookupChoiceError;
        const choiceQuery = existingChoice
          ? supabase.from("question_choices").update(choicePayload).eq("id", existingChoice.id)
          : supabase.from("question_choices").insert(choicePayload);
        const { error: cError } = await choiceQuery;

        if (cError) throw cError;
      }

      results[results.length - 1].questions.push(questionRow);
    }
  }

  return results;
}

/**
 * 현재 DB의 시나리오 구조를 JSON으로 내보내기 (팀 기록 제외)
 */
export async function exportScenariosToJson(campaignId) {
  const scenarios = await getScenarios(campaignId);

  return {
    campaign: "dragon-age",
    exportedAt: new Date().toISOString(),
    scenarios: scenarios.map((s) => ({
      code: s.code,
      title: s.title,
      description: s.description,
      sort_order: s.sort_order,
      questions: (s.questions || []).map((q) => ({
        code: q.code,
        step_number: q.step_number,
        prompt: q.prompt,
        sort_order: q.sort_order,
        choices: (q.choices || []).map((c) => ({
          code: c.code,
          label: c.label,
          sort_order: c.sort_order,
        })),
      })),
    })),
  };
}

/**
 * 전체 캠페인 백업 (시나리오 + 팀 기록 포함)
 */
export async function exportFullBackup(campaignId, teams) {
  const scenarios = await getScenarios(campaignId);

  const teamsBackup = await Promise.all(
    teams.map(async (team) => {
      const teamScenarios = await getTeamScenarios(team.id);
      return {
        id: team.id,
        name: team.name,
        description: team.description,
        region: team.region,
        color: team.color,
        sort_order: team.sort_order,
        progress_step: team.progress_step,
        characters: (team.characters || []).map((c) => ({
          id: c.id,
          username: c.username,
          player: c.player,
          token_url: c.token_url,
          level: c.level,
          race: c.race,
          class: c.class,
          // gm_secret은 백업에도 포함
          gm_secret: c.gm_secret,
        })),
        scenarios: teamScenarios.map((ts) => ({
          scenario_id: ts.scenario_id,
          completed: ts.completed,
          gm_note: ts.gm_note,
          answers: (ts.team_scenario_answers || []).map((a) => ({
            question_id: a.question_id,
            choice_id: a.choice_id,
          })),
        })),
      };
    })
  );

  return {
    campaign: "dragon-age",
    exportedAt: new Date().toISOString(),
    scenarios: scenarios.map((s) => ({
      id: s.id,
      code: s.code,
      title: s.title,
      description: s.description,
      sort_order: s.sort_order,
      questions: (s.questions || []).map((q) => ({
        id: q.id,
        code: q.code,
        prompt: q.prompt,
        sort_order: q.sort_order,
        choices: (q.choices || []).map((c) => ({
          id: c.id,
          code: c.code,
          label: c.label,
          sort_order: c.sort_order,
        })),
      })),
    })),
    teams: teamsBackup,
  };
}
