<template>
  <div>
    <section v-if="!user" class="supabase-auth-panel">
      <div class="auth-card">
        <span class="eyebrow">DRAGONAGE / GM COMMAND CENTER</span>
        <h1>DragonAge 캠페인에<br /><em>로그인하세요.</em></h1>
        <form @submit.prevent="login">
          <label
            >이메일<input v-model.trim="email" type="email" required
          /></label>
          <label
            >비밀번호<input v-model="password" type="password" required
          /></label>
          <p v-if="authError" class="auth-error">{{ authError }}</p>
          <button class="primary-button" type="submit" :disabled="authLoading">
            {{ authLoading ? "로그인 중..." : "로그인" }}
          </button>
        </form>
      </div>
    </section>
    <section v-else-if="!dashboardReady" class="supabase-loading-panel">
      <div class="auth-card">
        <span class="eyebrow">DRAGONAGE / SUPABASE</span>
        <h1>{{ authError || "서버 데이터를 불러오는 중입니다." }}</h1>
        <p v-if="!authError">JSON 기본 데이터는 표시하지 않습니다.</p>
        <button v-if="authError" class="primary-button" @click="loadCampaigns">
          다시 불러오기
        </button>
      </div>
    </section>
    <div v-else class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark">DA</span
          ><span><b>DragonAge</b><small>GM command center</small></span>
        </div>
        <!-- <div class="campaign-switcher">
        <span class="eyebrow">CAMPAIGN</span
        ><strong>{{ campaign.title }}</strong>
      </div> -->
        <nav class="side-nav" aria-label="주요 메뉴">
          <button
            :class="{ active: activeView === 'overview' }"
            @click="activeView = 'overview'"
          >
            <span>▦</span> 전체 현황
          </button>
          <button
            :class="{ active: activeView === 'scenarios' }"
            @click="activeView = 'scenarios'"
          >
            <span>◈</span> 시나리오 트래커
          </button>
          <button
            :class="{
              active: activeView === 'teams' || activeView === 'team-detail',
            }"
            @click="activeView = 'teams'"
          >
            <span>♧</span> 팀 & 캐릭터
          </button>
          <button
            :class="{ active: activeView === 'gallery' }"
            @click="activeView = 'gallery'"
          >
            <span>▧</span> 이미지 갤러리
          </button>
        </nav>
        <div class="sidebar-bottom">
          <div class="storage">
            <span class="eyebrow">LOCAL WORKSPACE</span
            ><strong>수동 저장 모드</strong>
            <div class="storage-bar"><i></i></div>
            <small>저장 버튼으로 브라우저에 저장됩니다.</small>
          </div>
          <button class="side-action" @click="exportData">
            ↓ <span>백업 파일 내보내기</span>
          </button>
          <button class="side-action" @click="triggerImport">
            ↑ <span>백업 파일 불러오기</span>
          </button>
        </div>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept="application/json"
          @change="importData"
        />
      </aside>

      <div class="content-shell">
        <header class="topbar">
          <div>
            <span class="breadcrumb">CAMPAIGN / {{ activeViewLabel }}</span>
            <h1>{{ pageTitle }}</h1>
          </div>
          <div class="top-actions">
            <span class="saved-state"><i></i> {{ saveStatus }}</span>
            <button class="primary-button save-button" @click="saveCampaign">
              저장
            </button>
            <button
              class="icon-button"
              title="다크 모드"
              @click="darkMode = !darkMode"
            >
              {{ darkMode ? "☼" : "☾" }}</button
            ><span class="user-email">{{ user.email }}</span
            ><button class="secondary-button logout-button" @click="logout">
              로그아웃
            </button>
            ><button class="gm-avatar">GM</button>
          </div>
        </header>

        <main class="main-content">
          <section v-if="activeView === 'overview'" class="view-panel">
            <!-- <div class="hero-row">
            <div>
              <p class="eyebrow accent">SESSION 07 · THE DEEP ROADS</p>
              <h2>모든 팀의 여정을<br /><em>한눈에 조율하세요.</em></h2>
              <p class="hero-copy">
                팀별 진행 상황과 중요한 분기 선택을 한 화면에서 비교하고, 다음
                세션을 위한 메모를 남겨보세요.
              </p>
            </div>
            <div class="session-card">
              <span class="eyebrow">NEXT SESSION</span
              ><strong>2024. 10. 26</strong><span>토요일 · 20:00</span
              ><button @click="activeView = 'scenarios'">
                세션 준비하기 <b>→</b>
              </button>
            </div>
          </div> -->
            <!-- <div class="metrics">
            <div class="metric-card">
              <span>전체 진행도</span
              ><strong>{{ overallProgress }}<small>%</small></strong>
              <div class="metric-foot">
                <i class="up">↑ 8.4%</i> 지난 세션 이후
              </div>
            </div>
            <div class="metric-card">
              <span>진행 중인 팀</span
              ><strong
                >{{ activeTeams
                }}<small> / {{ campaign.teams.length }}</small></strong
              >
              <div class="metric-foot">모든 팀이 여정을 시작했습니다</div>
            </div>
            <div class="metric-card">
              <span>기록된 캐릭터</span
              ><strong>{{ characterCount }}<small>명</small></strong>
              <div class="metric-foot">
                {{ galleryImages.length }}개의 이미지 자산
              </div>
            </div>
            <div class="metric-card accent-card">
              <span>GM 메모</span
              ><strong>{{ memoCount }}<small>개</small></strong>
              <div class="metric-foot">검토가 필요한 기록</div>
            </div>
          </div> -->
            <div class="section-heading">
              <div>
                <span class="eyebrow">LIVE OVERVIEW</span>
                <h3>팀별 진행 현황</h3>
              </div>
              <button class="text-button" @click="activeView = 'scenarios'">
                전체 보기 →
              </button>
            </div>
            <div class="team-grid">
              <article
                v-for="team in teams"
                :key="team.id"
                class="team-card"
                @click="selectTeam(team)"
              >
                <div class="team-card-head">
                  <div class="team-symbol" :style="{ background: team.color }">
                    {{ team.name.slice(0, 1) }}
                  </div>
                  <div>
                    <h4>{{ team.name }}</h4>
                    <span>{{ characterCountForTeam(team) }}명의 모험가</span
                    ><span class="region-badge">{{
                      team.region || "지역 미정"
                    }}</span>
                    <ul class="team-character-list">
                      <li
                        v-for="character in team.users || []"
                        :key="character.id"
                      >
                        <template
                          v-if="parseUsername(character.username).characterName"
                        >
                          {{ parseUsername(character.username).characterName }}
                          <small
                            >(PL:
                            {{
                              parseUsername(character.username).playerName
                            }})</small
                          >
                        </template>
                        <template v-else>{{
                          parseUsername(character.username)
                        }}</template>
                      </li>
                    </ul>
                  </div>
                  <span class="card-arrow">↗</span>
                </div>
                <div class="progress-label">
                  <span>시나리오 진행도</span><b>{{ progress(team) }}%</b>
                </div>
                <div class="progress-track">
                  <i
                    :style="{
                      width: progress(team) + '%',
                      background: team.color,
                    }"
                  ></i>
                </div>
                <div class="team-card-foot">
                  <span
                    ><i class="mini-dot" :style="{ background: team.color }"></i
                    >{{ currentScenario(team) }}</span
                  ><span
                    >{{ completedCount(team) }}/{{
                      orderedScenarios.length
                    }}
                    완료</span
                  >
                </div>
                <ol class="scenario-step-list">
                  <li
                    v-for="scenario in orderedScenarios"
                    :key="scenario.id"
                    :class="scenarioStepClass(team, scenario)"
                  >
                    <span class="step-index">{{ scenario.code }}</span>
                    <span class="step-title">{{ scenario.title }}</span>
                    <span class="step-state">{{
                      scenarioState(team, scenario)
                    }}</span>
                  </li>
                </ol>
              </article>
            </div>
            <div class="section-heading scenario-order-heading">
              <div>
                <span class="eyebrow">SCENARIO ORDER</span>
                <h3>시나리오 순서 추적</h3>
              </div>
              <span class="muted">progress_stages · step_number 기준</span>
            </div>
            <ol class="scenario-order-list">
              <li v-for="scenario in orderedScenarios" :key="scenario.id">
                <span class="scenario-order-code">{{ scenario.code }}</span>
                <span>{{ scenario.title }}</span>
                <small>{{ scenario.description }}</small>
              </li>
            </ol>
            <div class="section-heading">
              <div>
                <span class="eyebrow">DECISION BOARD</span>
                <h3>주요 분기 선택 비교</h3>
              </div>
              <span class="muted">최근 업데이트 순</span>
            </div>
            <div class="decision-table">
              <div class="table-head">
                <span>시나리오 / 분기</span
                ><span v-for="team in teams" :key="team.id">{{
                  team.name
                }}</span>
              </div>
              <div
                v-for="scenario in orderedScenarios"
                :key="scenario.id"
                class="table-row"
              >
                <div>
                  <b>{{ scenario.code }}</b
                  ><span>{{ scenario.title }}</span>
                </div>
                <div v-for="team in teams" :key="team.id" class="decision-cell">
                  <span :class="choiceClass(team, scenario)">{{
                    choiceLabel(team, scenario)
                  }}</span
                  ><i v-if="team.scenarios[scenario.id]?.completed">✓</i>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeView === 'scenarios'" class="view-panel">
            <div class="section-heading page-section-heading">
              <div>
                <span class="eyebrow">SHARED SCENARIO LOG</span>
                <h2>시나리오 트래커</h2>
                <p>공통 시나리오와 팀별 독립 기록을 관리합니다.</p>
              </div>
              <span class="muted">progress_stages · step_number 기준</span>
            </div>
            <p v-if="!orderedScenarios.length" class="empty-choice">
              등록된 시나리오가 없습니다. Supabase의 progress_stages 테이블에서
              먼저 단계를 추가해 주세요.
            </p>
            <div v-else class="scenario-layout">
              <div class="scenario-list">
                <button
                  v-for="scenario in orderedScenarios"
                  :key="scenario.id"
                  :class="[
                    'scenario-select',
                    { selected: selectedScenarioId === scenario.id },
                  ]"
                  @click="selectScenario(scenario)"
                >
                  <b>{{ scenario.code }}</b
                  ><span>{{ scenario.title }}</span
                  ><i>{{ scenarioChoices(scenario) }}/{{ teams.length }}</i>
                </button>
              </div>
              <div v-if="selectedScenario" class="scenario-detail">
                <div class="detail-title">
                  <div>
                    <span class="eyebrow">{{ selectedScenario.code }}</span>
                    <h3>{{ selectedScenario.title }}</h3>
                    <p>{{ selectedScenario.description }}</p>
                  </div>
                  <span class="scenario-status">공통 시나리오</span>
                </div>
                <div class="choice-manager">
                  <div class="choice-manager-head">
                    <div>
                      <span class="eyebrow">QUESTIONS & BRANCHES</span>
                      <h4>질문과 선택지</h4>
                    </div>
                    <button
                      class="outline-button"
                      @click="addQuestion(selectedScenario)"
                    >
                      ＋ 질문 추가
                    </button>
                  </div>
                  <div class="choice-manager-list">
                    <div
                      v-for="(
                        question, questionIndex
                      ) in selectedScenario.questions"
                      :key="question.id"
                      class="question-manager"
                    >
                      <div class="question-manager-head">
                        <span class="choice-index">{{
                          questionIndex + 1
                        }}</span>
                        <input
                          v-model="question.prompt"
                          :placeholder="`질문 ${questionIndex + 1}`"
                        />
                        <button
                          class="delete-button"
                          title="질문 삭제"
                          @click="deleteQuestion(selectedScenario, question)"
                        >
                          ×
                        </button>
                      </div>
                      <div class="question-choice-list">
                        <div
                          v-for="(choice, choiceIndex) in question.choices"
                          :key="choice.id"
                          class="choice-manager-row"
                        >
                          <span class="choice-index">{{
                            choiceIndex + 1
                          }}</span>
                          <input
                            v-model="choice.label"
                            :placeholder="`선택지 ${choiceIndex + 1}`"
                          />
                          <button
                            class="delete-button"
                            title="선택지 삭제"
                            @click="
                              deleteChoice(selectedScenario, question, choice)
                            "
                          >
                            ×
                          </button>
                        </div>
                        <button
                          class="add-choice-button"
                          @click="addChoice(question)"
                        >
                          ＋ 선택지 추가
                        </button>
                      </div>
                    </div>
                    <p
                      v-if="!selectedScenario.questions.length"
                      class="empty-choice"
                    >
                      등록된 질문이 없습니다. 질문을 추가해 주세요.
                    </p>
                  </div>
                </div>
                <div class="choice-editor">
                  <div v-for="team in teams" :key="team.id" class="choice-team">
                    <div class="choice-team-name">
                      <span
                        class="team-symbol small"
                        :style="{ background: team.color }"
                        >{{ team.name.slice(0, 1) }}</span
                      ><b>{{ team.name }}</b
                      ><label class="check-label"
                        ><input
                          v-model="
                            team.scenarios[selectedScenario.id].completed
                          "
                          type="checkbox"
                        />
                        완료</label
                      >
                    </div>
                    <div
                      v-for="question in selectedScenario.questions"
                      :key="question.id"
                      class="team-question"
                    >
                      <b>{{ question.prompt }}</b>
                      <div class="choice-options">
                        <label
                          v-for="choice in question.choices"
                          :key="choice.id"
                        >
                          <input
                            v-model="
                              team.scenarios[selectedScenario.id].answers[
                                question.id
                              ]
                            "
                            type="radio"
                            :name="team.id + selectedScenario.id + question.id"
                            :value="choice.id"
                          />
                          <span>{{ choice.label }}</span>
                        </label>
                      </div>
                    </div>
                    <textarea
                      v-model="team.scenarios[selectedScenario.id].gmNote"
                      placeholder="이 팀의 GM 메모를 입력하세요..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            v-else-if="activeView === 'teams' || activeView === 'team-detail'"
            class="view-panel"
          >
            <div class="section-heading page-section-heading">
              <div>
                <span class="eyebrow">PARTY ROSTER</span>
                <h2>
                  {{
                    activeView === "team-detail"
                      ? selectedTeam.name
                      : "팀 & 캐릭터"
                  }}
                </h2>
                <p>
                  {{
                    activeView === "team-detail"
                      ? "선택한 팀의 정보와 캐릭터를 관리합니다."
                      : "팀을 선택해 상세 정보와 캐릭터를 확인하세요."
                  }}
                </p>
              </div>
              <button
                v-if="activeView === 'teams'"
                class="primary-button"
                @click="addTeam"
              >
                ＋ 팀 추가
              </button>
              <button
                v-else
                class="outline-button"
                @click="activeView = 'teams'"
              >
                ← 팀 목록
              </button>
            </div>
            <div
              :class="[
                'team-workspace',
                {
                  'team-detail-only': activeView === 'team-detail',
                  'team-list-only': activeView === 'teams',
                },
              ]"
            >
              <div v-if="activeView === 'teams'" class="roster-list">
                <button
                  v-for="team in teams"
                  :key="team.id"
                  :class="[
                    'roster-team',
                    { selected: selectedTeamId === team.id },
                  ]"
                  @click="selectTeam(team)"
                >
                  <span
                    class="team-symbol"
                    :style="{ background: team.color }"
                    >{{ team.name.slice(0, 1) }}</span
                  ><span
                    ><b>{{ team.name }}</b
                    ><small
                      >{{ team.characters.length }} characters</small
                    ></span
                  ><i>›</i
                  ><b
                    class="delete-mini"
                    title="팀 삭제"
                    @click.stop="deleteTeam(team)"
                    >×</b
                  >
                </button>
              </div>
              <div v-if="activeView === 'team-detail'" class="roster-detail">
                <div class="team-detail-head">
                  <div>
                    <span class="eyebrow">TEAM PROFILE</span>
                    <h3>{{ selectedTeam.name }}</h3>
                    <p>{{ selectedTeam.description }}</p>
                  </div>
                  <button class="outline-button" @click="addCharacter">
                    ＋ 캐릭터 추가
                  </button>
                </div>
                <div class="team-progress-summary">
                  <div class="team-progress-summary-head">
                    <div>
                      <span class="eyebrow">TEAM JOURNEY</span>
                      <h4>시나리오 진행 및 선택</h4>
                    </div>
                    <strong
                      >{{ progress(selectedTeam) }}% <small>완료</small></strong
                    >
                  </div>
                  <div class="progress-track large-progress">
                    <i
                      :style="{
                        width: progress(selectedTeam) + '%',
                        background: selectedTeam.color,
                      }"
                    ></i>
                  </div>
                  <div class="team-scenario-board">
                    <button
                      v-for="scenario in orderedScenarios"
                      :key="scenario.id"
                      class="team-scenario-row"
                      @click="openScenarioFromTeam(scenario)"
                    >
                      <span class="scenario-code">{{ scenario.code }}</span>
                      <span class="team-scenario-name">{{
                        scenario.title
                      }}</span>
                      <span
                        :class="[
                          'team-choice',
                          {
                            'is-empty':
                              !selectedTeam.scenarios[scenario.id]?.choice,
                          },
                        ]"
                      >
                        {{ choiceLabel(selectedTeam, scenario) }}
                      </span>
                      <span
                        :class="[
                          'completion-badge',
                          {
                            complete:
                              selectedTeam.scenarios[scenario.id]?.completed,
                          },
                        ]"
                      >
                        {{
                          selectedTeam.scenarios[scenario.id]?.completed
                            ? "완료"
                            : "진행 전"
                        }}
                      </span>
                      <span class="row-arrow">→</span>
                    </button>
                  </div>
                </div>
                <div class="character-grid">
                  <article
                    v-for="character in selectedTeam.users"
                    :key="character.id"
                    class="character-card"
                    @click="selectedCharacter = character"
                  >
                    <div
                      class="character-avatar"
                      :style="{
                        backgroundImage: character.token_url
                          ? 'url(' + character.token_url + ')'
                          : 'linear-gradient(135deg, ' +
                            selectedTeam.color +
                            ', #242b3d)',
                      }"
                    >
                      <span v-if="!character.token_url">{{
                        characterInitial(character)
                      }}</span>
                    </div>
                    <div>
                      <h4>{{ formattedCharacterName(character) }}</h4>
                      <span
                        >{{ character.class }} · Lv. {{ character.level }}</span
                      ><small>PL {{ characterPlayerName(character) }}</small>
                    </div>
                    <button
                      title="캐릭터 열기"
                      @click.stop="selectedCharacter = character"
                    >
                      ↗
                    </button>
                    <button
                      class="delete-button"
                      title="캐릭터 삭제"
                      @click.stop="deleteCharacter(character)"
                    >
                      ×
                    </button>
                  </article>
                </div>
                <div v-if="selectedCharacter" class="character-sheet">
                  <div class="sheet-header">
                    <div>
                      <span class="eyebrow">CHARACTER SHEET</span>
                      <h3>{{ formattedCharacterName(selectedCharacter) }}</h3>
                      <span
                        >{{ selectedCharacter.race }}
                        {{ selectedCharacter.class }} · Level
                        {{ selectedCharacter.level }}</span
                      >
                    </div>
                    <span class="character-save-state">{{
                      characterSaveStatus
                    }}</span>
                    <button
                      class="outline-button"
                      :disabled="characterSaving"
                      @click="saveCharacter(selectedCharacter)"
                    >
                      {{ characterSaving ? "저장 중..." : "Supabase에 저장" }}
                    </button>
                    <button
                      class="close-button"
                      @click="selectedCharacter = null"
                    >
                      ×
                    </button>
                  </div>
                  <div class="sheet-body">
                    <div class="sheet-identity">
                      <div
                        class="large-avatar"
                        :style="{
                          backgroundImage: selectedCharacter.token_url
                            ? 'url(' + selectedCharacter.token_url + ')'
                            : 'linear-gradient(135deg, ' +
                              selectedTeam.color +
                              ', #242b3d)',
                        }"
                      >
                        {{ characterInitial(selectedCharacter) }}
                      </div>
                      <label
                        >캐릭터 이름<input
                          v-model="selectedCharacter.username" /></label
                      ><label
                        >PL 이름<input
                          v-model="selectedCharacter.player" /></label
                      ><label
                        >토큰 이미지 URL<input
                          v-model="selectedCharacter.token_url"
                          placeholder="https://..."
                      /></label>
                    </div>
                    <div class="sheet-fields">
                      <div class="field-grid">
                        <label
                          >레벨<input
                            v-model.number="selectedCharacter.level"
                            type="number"
                            min="1" /></label
                        ><label
                          >나이<input v-model="selectedCharacter.age" /></label
                        ><label
                          >키<input v-model="selectedCharacter.height" /></label
                        ><label
                          >몸무게<input
                            v-model="selectedCharacter.weight" /></label
                        ><label
                          >종 (RACE)<input
                            v-model="selectedCharacter.race" /></label
                        ><label
                          >배경<input
                            v-model="selectedCharacter.background" /></label
                        ><label
                          >사회 계층<input
                            v-model="selectedCharacter.social_class" /></label
                        ><label
                          >클래스 (CLASS)<input
                            v-model="selectedCharacter.class"
                        /></label>
                      </div>
                      <div class="textarea-grid">
                        <label v-for="field in characterFields" :key="field.key"
                          >{{ field.label
                          }}<textarea
                            v-model="selectedCharacter[field.key]"
                            :placeholder="field.placeholder"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section v-else class="view-panel">
            <div class="section-heading page-section-heading">
              <div>
                <span class="eyebrow">ASSET LIBRARY</span>
                <h2>이미지 갤러리</h2>
                <p>팀과 캐릭터에 연결된 시각 자료를 한곳에서 확인합니다.</p>
              </div>
              <button class="primary-button" @click="addGalleryImage">
                ＋ 이미지 URL 등록
              </button>
              <button class="outline-button" @click="triggerGalleryUpload">
                ↑ 파일 업로드
              </button>
            </div>
            <input
              ref="galleryInput"
              class="visually-hidden"
              type="file"
              accept="image/*"
              @change="uploadGalleryImage"
            />
            <div class="gallery-toolbar">
              <button
                :class="{ selected: galleryFilter === 'all' }"
                @click="galleryFilter = 'all'"
              >
                전체 <b>{{ galleryImages.length }}</b></button
              ><button
                v-for="team in teams"
                :key="team.id"
                :class="{ selected: galleryFilter === team.id }"
                @click="galleryFilter = team.id"
              >
                {{ team.name }} <b>{{ teamImages(team).length }}</b>
              </button>
            </div>
            <div class="gallery-grid">
              <figure
                v-for="image in filteredGallery"
                :key="image.id"
                class="gallery-item"
              >
                <img
                  :src="image.url"
                  :alt="image.caption"
                  @error="image.failed = true"
                />
                <div v-if="image.failed" class="image-fallback">
                  IMAGE<br />NOT FOUND
                </div>
                <figcaption>
                  <b>{{ image.caption }}</b
                  ><span>{{ image.owner }}</span
                  ><button
                    class="gallery-delete"
                    title="이미지 삭제"
                    @click="deleteGalleryImage(image)"
                  >
                    삭제
                  </button>
                </figcaption>
              </figure>
            </div>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>

<script>
import { supabase } from "@/supabase";
import {
  deleteUser,
  getCampaignDetails,
  getCampaigns,
  getProgressStages,
  getTeamsWithUsers,
  saveUser,
  signIn,
  signOut,
} from "@/services/db";

const characterTemplate = (id, username, player, role) => ({
  id,
  username,
  player,
  token_url: "",
  level: 3,
  age: "29",
  height: "178cm",
  weight: "72kg",
  race: "인간",
  background: "변경의 방랑자",
  social_class: "자유민",
  class: role,
  motivation: "잃어버린 진실을 찾는다.",
  goal: "팀과 함께 살아남는다.",
  strengths: "관찰력과 결단력",
  doom: "혼자 모든 것을 짊어진다.",
  languages: "공용어, 고대어",
  traits: "조용하지만 날카롭다.",
  biography: "아직 기록되지 않은 모험가의 전기입니다.",
  gm_secret: "",
  player_gm_secret: "",
  gallery: [],
});
const questionTemplate = (id, prompt, choices) => ({
  id,
  prompt,
  choices,
});
const scenarioTemplate = (id, code, title, description, questions) => ({
  id,
  code,
  title,
  description,
  questions,
});

export default {
  name: "HomeView",
  data() {
    const scenarios = [
      scenarioTemplate(
        "s1",
        "01",
        "잿빛 길목",
        "붉은 리륨 광산으로 향하는 길목에서 낯선 징조를 만납니다.",
        [
          questionTemplate("q1", "무엇을 했습니까?", [
            { id: "a", label: "도움을 요청한다" },
            { id: "b", label: "흔적을 추적한다" },
            { id: "c", label: "우회한다" },
          ]),
          questionTemplate("q2", "발견한 징조에 어떻게 반응합니까?", [
            { id: "a", label: "죽인다" },
            { id: "b", label: "살린다" },
            { id: "c", label: "때린다" },
          ]),
        ]
      ),
      scenarioTemplate(
        "s2",
        "02",
        "잠들지 않는 요새",
        "오래된 요새의 문이 열리고, 안쪽에서 낮은 노래가 들려옵니다.",
        [
          questionTemplate("q1", "요새에 어떻게 들어갑니까?", [
            { id: "a", label: "정면으로 진입한다" },
            { id: "b", label: "비밀 통로를 찾는다" },
          ]),
        ]
      ),
      scenarioTemplate(
        "s3",
        "03",
        "깊은 길의 문턱",
        "지하로 이어지는 문턱에서 각자의 과거가 모습을 드러냅니다.",
        [
          questionTemplate("q1", "문턱에서 무엇을 합니까?", [
            { id: "a", label: "문을 연다" },
            { id: "b", label: "봉인한다" },
          ]),
        ]
      ),
      scenarioTemplate(
        "s4",
        "04",
        "왕좌 아래의 속삭임",
        "돌 아래 잠든 존재가 마지막 거래를 제안합니다.",
        [
          questionTemplate("q1", "마지막 거래에 어떻게 답합니까?", [
            { id: "a", label: "거래를 받아들인다" },
            { id: "b", label: "거부한다" },
          ]),
        ]
      ),
    ];
    const teams = [
      "회색 감시자",
      "붉은 사자단",
      "황혼의 방랑자",
      "철의 서약",
      "별빛 순례자",
      "검은 가시",
    ].map((name, index) => ({
      id: "team-" + (index + 1),
      name,
      region: ["데너림", "오자마", "코르카리", "프리마치", "안티바", "딥 로드"][
        index
      ],
      color: ["#c97954", "#c6a35d", "#6e9c91", "#7289b8", "#ae7898", "#a56b62"][
        index
      ],
      description: "운명으로 묶인 모험가들의 원정대입니다.",
      characters: [
        characterTemplate(
          "c-" + index + "-1",
          ["아델린", "브란", "세라", "토마스", "린", "카엘"][index],
          ["민서", "지훈", "서연", "도윤", "하린", "예준"][index],
          ["전사", "도적", "마법사", "기사", "궁수", "성직자"][index]
        ),
      ],
      scenarios: {},
    }));
    teams.forEach((team, index) =>
      scenarios.forEach((scenario, scenarioIndex) => {
        team.scenarios[scenario.id] = {
          completed: scenarioIndex < index % 3,
          answers:
            scenarioIndex === 0 && index < 3
              ? { q1: ["a", "b", "c"][index] }
              : {},
          gmNote:
            scenarioIndex === 0 && index === 0
              ? "다음 세션에서 낯선 발자국을 강조할 것."
              : "",
        };
      })
    );
    return {
      user: null,
      dashboardReady: false,
      progressStages: [],
      email: "",
      password: "",
      authLoading: false,
      authError: "",
      authSubscription: null,
      activeView: "overview",
      saveStatus: "저장되지 않음",
      characterSaving: false,
      characterSaveStatus: "",
      darkMode: false,
      selectedTeamId: teams[0].id,
      selectedScenarioId: scenarios[0].id,
      selectedCharacter: null,
      galleryFilter: "all",
      characterFields: [
        {
          key: "motivation",
          label: "동기",
          placeholder: "이 캐릭터를 움직이는 것은...",
        },
        {
          key: "goal",
          label: "목표",
          placeholder: "이번 원정에서 이루려는 것...",
        },
        { key: "strengths", label: "장점", placeholder: "캐릭터의 강점..." },
        { key: "doom", label: "파멸", placeholder: "피하고 싶은 운명..." },
        { key: "languages", label: "언어", placeholder: "구사 가능한 언어..." },
        { key: "traits", label: "특징", placeholder: "눈에 띄는 특징..." },
        { key: "biography", label: "전기", placeholder: "캐릭터의 이야기..." },
        {
          key: "gm_secret",
          label: "GM 비밀 메모",
          placeholder: "GM만 볼 수 있는 메모...",
        },
        {
          key: "player_gm_secret",
          label: "플레이어 및 GM 메모",
          placeholder: "공유 가능한 메모...",
        },
      ],
      campaign: {
        version: "1.0.0",
        title: "드래곤 에이지",
        scenarios,
        teams,
        gallery: [
          {
            id: "g1",
            url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
            caption: "잿빛 길목의 풍경",
            owner: "공용 자료",
          },
          {
            id: "g2",
            url: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=800&q=80",
            caption: "오래된 요새",
            owner: "회색 감시자",
          },
          {
            id: "g3",
            url: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80",
            caption: "깊은 길의 문",
            owner: "공용 자료",
          },
        ],
      },
    };
  },
  async mounted() {
    if (!supabase) {
      this.authError =
        ".env 설정을 읽지 못했습니다. 개발 서버를 종료한 뒤 npm run serve로 다시 시작하세요.";
      return;
    }
    const { data } = await supabase.auth.getSession();
    await this.applySession(data.session);
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        await this.applySession(session);
      }
    );
    this.authSubscription = listener.subscription;
  },
  beforeUnmount() {
    this.authSubscription?.unsubscribe();
  },
  computed: {
    activeViewLabel() {
      return {
        overview: "전체 현황",
        scenarios: "시나리오 트래커",
        teams: "팀 & 캐릭터",
        gallery: "이미지 갤러리",
        "team-detail": "팀 상세",
      }[this.activeView];
    },
    pageTitle() {
      return this.activeView === "overview"
        ? "캠페인 현황"
        : this.activeViewLabel;
    },
    selectedTeam() {
      return (
        this.campaign.teams.find((team) => team.id === this.selectedTeamId) ||
        this.campaign.teams[0]
      );
    },
    selectedScenario() {
      return (
        this.orderedScenarios.find(
          (scenario) => scenario.id === this.selectedScenarioId
        ) ||
        this.orderedScenarios[0] ||
        null
      );
    },
    overallProgress() {
      return Math.round(
        this.campaign.teams.reduce(
          (sum, team) => sum + this.progress(team),
          0
        ) / this.campaign.teams.length
      );
    },
    activeTeams() {
      return this.campaign.teams.filter((team) => this.completedCount(team) > 0)
        .length;
    },
    characterCount() {
      return this.campaign.teams.reduce(
        (sum, team) => sum + team.characters.length,
        0
      );
    },
    memoCount() {
      return this.campaign.teams.reduce(
        (sum, team) =>
          sum +
          Object.values(team.scenarios).filter((item) => item.gmNote).length,
        0
      );
    },
    galleryImages() {
      return [
        ...this.campaign.gallery,
        ...this.campaign.teams.flatMap((team) =>
          team.characters.flatMap((character) => character.gallery || [])
        ),
      ];
    },
    filteredGallery() {
      return this.galleryFilter === "all"
        ? this.galleryImages
        : this.galleryImages.filter(
            (image) =>
              image.teamId === this.galleryFilter ||
              image.owner ===
                this.campaign.teams.find(
                  (team) => team.id === this.galleryFilter
                )?.name
          );
    },
    teams() {
      return this.$store.state.teams;
    },
    scenarios() {
      return this.$store.state.scenarios;
    },
    orderedScenarios() {
      return [...this.progressStages]
        .sort((first, second) => first.step_number - second.step_number)
        .map((stage) => ({
          id: stage.step_number,
          code: String(stage.step_number).padStart(2, "0"),
          title: stage.title || stage.name,
          description: stage.description,
          stepNumber: stage.step_number,
          questions: (stage.scenario_questions || []).map((question) => ({
            ...question,
            choices: question.question_choices || question.choices || [],
          })),
        }));
    },
  },
  watch: {
    darkMode(value) {
      document.body.classList.toggle("dark-mode", value);
    },
    teams() {
      this.ensureScenarioRecords();
    },
    orderedScenarios() {
      this.ensureScenarioRecords();
    },
    selectedCharacter() {
      this.characterSaveStatus = "";
    },
  },
  methods: {
    parseUsername(username) {
      if (typeof username !== "string") return username || "이름 없는 유저";
      const match = username
        .trim()
        .match(/^([A-Za-z])\s+(.+?)\s*\[([^\]]+)\]$/);
      if (!match) return username;
      return {
        teamPrefix: match[1],
        playerName: match[2].trim(),
        characterName: match[3].trim(),
      };
    },
    formattedCharacterName(character) {
      const parsed = this.parseUsername(character?.username);
      if (parsed && typeof parsed === "object" && parsed.characterName) {
        return `${parsed.characterName} (PL: ${parsed.playerName})`;
      }
      return character?.username || "이름 없는 캐릭터";
    },
    characterPlayerName(character) {
      const parsed = this.parseUsername(character?.username);
      if (parsed && typeof parsed === "object" && parsed.playerName) {
        return parsed.playerName;
      }
      return character?.player || "미배정";
    },
    characterInitial(character) {
      const parsed = this.parseUsername(character?.username);
      const label =
        (parsed && typeof parsed === "object" && parsed.characterName) ||
        character?.username ||
        "";
      return label.slice(0, 1) || "?";
    },
    async applySession(session) {
      this.user = session?.user || null;
      this.$store.commit("setUser", this.user);
      this.dashboardReady = false;
      if (this.user) {
        await this.loadCampaigns();
      }
    },
    async login() {
      this.authLoading = true;
      this.authError = "";
      try {
        await signIn(this.email, this.password);
      } catch (error) {
        this.authError = error.message || "로그인에 실패했습니다.";
      } finally {
        this.authLoading = false;
      }
    },
    async logout() {
      try {
        await signOut();
        this.user = null;
        this.dashboardReady = false;
        this.authError = "";
        this.$store.commit("setUser", null);
        this.$store.commit("setCurrentCampaign", null);
        this.$store.commit("setTeams", []);
        this.$store.commit("setScenarios", []);
        this.progressStages = [];
      } catch (error) {
        this.authError = error.message || "로그아웃에 실패했습니다.";
      }
    },
    async loadCampaigns() {
      if (!this.user) return;
      this.dashboardReady = false;
      this.authError = "";
      try {
        const campaigns = await getCampaigns(this.user.id);
        const campaign = campaigns[0] || null;
        if (campaign) {
          const results = await Promise.allSettled([
            getCampaignDetails(campaign.id),
            getProgressStages(),
            getTeamsWithUsers(campaign.id),
          ]);
          const [detailsResult, stagesResult, usersResult] = results;
          if (detailsResult.status === "rejected") {
            throw new Error(
              `팀/시나리오 조회 실패: ${
                detailsResult.reason?.message || detailsResult.reason
              }`
            );
          }
          if (stagesResult.status === "rejected") {
            throw new Error(
              `진행 단계 조회 실패: ${
                stagesResult.reason?.message || stagesResult.reason
              }`
            );
          }
          if (usersResult.status === "rejected") {
            throw new Error(
              `팀 유저 조회 실패: ${
                usersResult.reason?.message || usersResult.reason
              }`
            );
          }
          const details = detailsResult.value;
          const progressStages = stagesResult.value;
          const teamsWithUsers = usersResult.value;
          const teams = details.teams.map((team) => ({
            ...team,
            users:
              teamsWithUsers.find(
                (teamWithUsers) => teamWithUsers.id === team.id
              )?.users ||
              team.users ||
              [],
          }));
          teams.forEach((team) => {
            team.characters = team.users;
            team.scenarios = (team.team_scenarios || []).reduce(
              (scenarioMap, record) => {
                scenarioMap[record.step_number] = {
                  completed: Boolean(record.completed),
                  gmNote: record.gm_note || "",
                  answers: (record.team_scenario_answers || []).reduce(
                    (answerMap, answer) => {
                      answerMap[answer.question_id] = answer.choice_id;
                      return answerMap;
                    },
                    {}
                  ),
                };
                return scenarioMap;
              },
              {}
            );
          });
          this.progressStages = [...progressStages].sort(
            (first, second) => first.step_number - second.step_number
          );
          this.$store.commit("setTeams", teams);
          this.$store.commit("setScenarios", details.scenarios);
          const scenarios = details.scenarios.map((scenario) => ({
            ...scenario,
            questions: (scenario.scenario_questions || []).map((question) => ({
              ...question,
              choices: question.question_choices || question.choices || [],
            })),
          }));
          this.campaign = {
            ...campaign,
            teams,
            scenarios,
          };
          this.selectedTeamId = teams[0]?.id || null;
          this.selectedScenarioId = this.progressStages[0]?.step_number || null;
          this.ensureScenarioRecords();
        } else {
          this.$store.commit("setTeams", []);
          this.$store.commit("setScenarios", []);
        }
        this.$store.commit("setCurrentCampaign", campaign);
        if (!campaign) {
          throw new Error(
            `캠페인이 없습니다. campaigns.owner_id가 로그인 사용자(${this.user.id})와 같은지 확인하세요.`
          );
        }
        this.dashboardReady = true;
      } catch (error) {
        this.authError = error.message || "캠페인을 불러오지 못했습니다.";
        this.dashboardReady = false;
      }
    },
    ensureScenarioRecords() {
      this.teams.forEach((team) => {
        if (!team.scenarios) team.scenarios = {};
        this.orderedScenarios.forEach((scenario) => {
          if (!team.scenarios[scenario.id]) {
            team.scenarios[scenario.id] = {
              completed: false,
              gmNote: "",
              answers: {},
            };
          }
        });
      });
    },
    progress(team) {
      return Math.round(
        (this.completedCount(team) / this.orderedScenarios.length) * 100
      );
    },
    completedCount(team) {
      return this.orderedScenarios.filter(
        (scenario) => this.teamScenario(team, scenario)?.completed
      ).length;
    },
    currentScenario(team) {
      const next = this.orderedScenarios.find(
        (scenario) => !this.teamScenario(team, scenario)?.completed
      );
      return next ? next.title : "모든 시나리오 완료";
    },
    selectScenario(scenario) {
      this.selectedScenarioId = scenario.id;
    },
    characterCountForTeam(team) {
      return (team.users || team.characters || []).length;
    },
    teamScenario(team, scenario) {
      if (Array.isArray(team.team_scenarios)) {
        return (
          team.team_scenarios.find(
            (record) => record.step_number === scenario.id
          ) || { completed: false }
        );
      }
      return team.scenarios?.[scenario.id] || { completed: false };
    },
    scenarioState(team, scenario) {
      const record = this.teamScenario(team, scenario);
      return record.completed
        ? "완료"
        : this.currentScenario(team) === scenario.title
        ? "진행 중"
        : "대기";
    },
    scenarioStepClass(team, scenario) {
      return {
        completed: this.teamScenario(team, scenario).completed,
        current: this.currentScenario(team) === scenario.title,
      };
    },
    selectTeam(team) {
      this.selectedTeamId = team.id;
      this.activeView = "team-detail";
      this.selectedCharacter = null;
    },
    openScenarioFromTeam(scenario) {
      this.selectedScenarioId = scenario.id;
      this.activeView = "scenarios";
    },
    scenarioChoices(scenario) {
      return this.teams.filter(
        (team) =>
          Object.keys(this.answerMap(team.scenarios[scenario.id])).length
      ).length;
    },
    choiceLabel(team, scenario) {
      const answers = this.answerMap(team.scenarios[scenario.id]);
      const labels = scenario.questions
        .map((question) => {
          const choice = question.choices.find(
            (item) => item.id === answers[question.id]
          );
          return choice ? choice.label : "미선택";
        })
        .filter(Boolean);
      return labels.length ? labels.join(" / ") : "미선택";
    },
    choiceClass(team, scenario) {
      return Object.keys(this.answerMap(team.scenarios[scenario.id])).length
        ? "chosen"
        : "empty";
    },
    answerMap(record) {
      if (!record) return {};
      return record.answers || (record.choice ? { q1: record.choice } : {});
    },
    teamImages(team) {
      return this.galleryImages.filter(
        (image) => image.owner === team.name || image.teamId === team.id
      );
    },
    addTeam() {
      const index = this.campaign.teams.length + 1;
      const team = {
        id: "team-" + Date.now(),
        name: "새 원정대 " + index,
        region: "미정",
        color: "#8b7aa8",
        description: "새 팀의 설명을 입력하세요.",
        characters: [],
        scenarios: {},
      };
      this.orderedScenarios.forEach((scenario) => {
        team.scenarios[scenario.id] = {
          completed: false,
          answers: {},
          gmNote: "",
        };
      });
      this.campaign.teams.push(team);
      this.selectTeam(team);
    },
    deleteTeam(team) {
      if (
        !window.confirm(
          `'${team.name}' 팀을 삭제할까요? 캐릭터와 팀별 기록도 함께 삭제됩니다.`
        )
      )
        return;
      this.campaign.teams = this.campaign.teams.filter(
        (item) => item.id !== team.id
      );
      if (!this.campaign.teams.length) {
        this.selectedTeamId = null;
        this.selectedCharacter = null;
        return;
      }
      if (this.selectedTeamId === team.id)
        this.selectTeam(this.campaign.teams[0]);
    },
    addCharacter() {
      const team = this.selectedTeam;
      const character = characterTemplate(
        crypto.randomUUID(),
        "새 캐릭터",
        "PL 이름",
        "클래스"
      );
      character.team_id = team.id;
      team.characters.push(character);
      team.users = team.characters;
      this.selectedCharacter = character;
    },
    async deleteCharacter(character) {
      if (
        !window.confirm(
          `'${this.formattedCharacterName(character)}' 캐릭터를 삭제할까요?`
        )
      )
        return;
      const team = this.selectedTeam;
      team.characters = team.characters.filter(
        (item) => item.id !== character.id
      );
      team.users = team.characters;
      if (
        this.selectedCharacter &&
        this.selectedCharacter.id === character.id
      ) {
        this.selectedCharacter = null;
      }
      try {
        await deleteUser(character.id);
      } catch (error) {
        window.alert(
          `Supabase에서 캐릭터를 삭제하지 못했습니다: ${error.message || error}`
        );
      }
    },
    async saveCharacter(character) {
      const team = this.selectedTeam;
      character.team_id = character.team_id || team?.id;
      this.characterSaving = true;
      this.characterSaveStatus = "";
      try {
        const saved = await saveUser(character);
        Object.assign(character, saved);
        this.characterSaveStatus = "저장됨";
      } catch (error) {
        this.characterSaveStatus = "저장 실패";
        window.alert(
          `Supabase에 캐릭터를 저장하지 못했습니다: ${error.message || error}`
        );
      } finally {
        this.characterSaving = false;
      }
    },
    addQuestion(scenario) {
      scenario.questions.push(
        questionTemplate("question-" + Date.now(), "새 질문을 입력하세요.", [
          { id: "choice-" + Date.now(), label: "새 선택지" },
        ])
      );
    },
    deleteQuestion(scenario, question) {
      if (scenario.questions.length <= 1) {
        window.alert("시나리오에는 최소 한 개의 질문이 필요합니다.");
        return;
      }
      if (
        !window.confirm(
          `'${question.prompt}' 질문을 삭제할까요? 팀별 답변도 삭제됩니다.`
        )
      )
        return;
      scenario.questions = scenario.questions.filter(
        (item) => item.id !== question.id
      );
      this.campaign.teams.forEach((team) => {
        delete team.scenarios[scenario.id].answers[question.id];
      });
    },
    addChoice(question) {
      const nextNumber = question.choices.length + 1;
      question.choices.push({
        id: "choice-" + Date.now(),
        label: "새 선택지 " + nextNumber,
      });
    },
    deleteChoice(scenario, question, choice) {
      if (question.choices.length <= 1) {
        window.alert("질문에는 최소 한 개의 선택지가 필요합니다.");
        return;
      }
      if (
        !window.confirm(
          `'${choice.label}' 선택지를 삭제할까요? 해당 선택을 한 팀은 미선택 상태가 됩니다.`
        )
      )
        return;
      question.choices = question.choices.filter(
        (item) => item.id !== choice.id
      );
      this.campaign.teams.forEach((team) => {
        const record = team.scenarios[scenario.id];
        if (record.answers[question.id] === choice.id)
          record.answers[question.id] = "";
      });
    },
    addGalleryImage() {
      const url = window.prompt("등록할 이미지 URL을 입력하세요.");
      if (url)
        this.campaign.gallery.push({
          id: "g-" + Date.now(),
          url,
          caption: "새 이미지",
          owner: "공용 자료",
        });
    },
    triggerGalleryUpload() {
      this.$refs.galleryInput.click();
    },
    uploadGalleryImage(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.campaign.gallery.push({
          id: "g-" + Date.now(),
          url: reader.result,
          caption: file.name,
          owner: "공용 자료",
        });
        event.target.value = "";
      };
      reader.readAsDataURL(file);
    },
    deleteGalleryImage(image) {
      if (!window.confirm(`'${image.caption}' 이미지를 삭제할까요?`)) return;
      this.campaign.gallery = this.campaign.gallery.filter(
        (item) => item.id !== image.id
      );
      this.campaign.teams.forEach((team) => {
        team.characters.forEach((character) => {
          character.gallery = (character.gallery || []).filter(
            (item) => item.id !== image.id
          );
        });
      });
    },
    saveCampaign() {
      this.saveCampaignToDatabase();
    },
    exportData() {
      this.downloadCampaignJson();
    },
    downloadCampaignJson() {
      const blob = new Blob([JSON.stringify(this.campaign, null, 2)], {
        type: "application/json",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "dragonage-campaign-backup.json";
      link.click();
      URL.revokeObjectURL(link.href);
    },
    openCampaignDatabase() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("dragonage-gm-note", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("campaigns");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async saveCampaignToDatabase() {
      try {
        const database = await this.openCampaignDatabase();
        const transaction = database.transaction("campaigns", "readwrite");
        transaction.objectStore("campaigns").put(this.campaign, "current");
        transaction.oncomplete = () => {
          database.close();
          this.saveStatus = "저장됨";
        };
        transaction.onerror = () => {
          database.close();
          this.saveStatus = "저장 실패";
        };
      } catch (error) {
        this.saveStatus = "저장 실패";
        window.alert("브라우저 저장 공간에 데이터를 저장하지 못했습니다.");
      }
    },
    async loadCampaignFromDatabase() {
      if (!window.indexedDB) return null;
      const database = await this.openCampaignDatabase();
      return new Promise((resolve, reject) => {
        const request = database
          .transaction("campaigns", "readonly")
          .objectStore("campaigns")
          .get("current");
        request.onsuccess = () => {
          database.close();
          resolve(request.result || null);
        };
        request.onerror = () => {
          database.close();
          reject(request.error);
        };
      });
    },
    triggerImport() {
      this.$refs.fileInput.click();
    },
    normalizeCampaign(campaign) {
      if (campaign.title === "The Veilbound Chronicle") {
        campaign.title = "DragonAge Campaign";
      }
      campaign.scenarios.forEach((scenario) => {
        if (!scenario.questions) {
          scenario.questions = [
            questionTemplate(
              "q1",
              scenario.description || "무엇을 했습니까?",
              scenario.choices || []
            ),
          ];
          delete scenario.choices;
        }
      });
      campaign.teams.forEach((team) => {
        campaign.scenarios.forEach((scenario) => {
          const record = team.scenarios[scenario.id] || {};
          if (!record.answers) {
            record.answers = record.choice ? { q1: record.choice } : {};
          }
          delete record.choice;
          team.scenarios[scenario.id] = record;
        });
      });
      return campaign;
    },
    importData(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!imported.teams || !imported.scenarios)
            throw new Error("invalid");
          this.campaign = this.normalizeCampaign(imported);
          this.selectedTeamId = imported.teams[0].id;
          this.selectedScenarioId = imported.scenarios[0].id;
          alert("캠페인 JSON을 불러왔습니다.");
        } catch (error) {
          alert("올바른 캠페인 JSON 파일이 아닙니다.");
        }
        event.target.value = "";
      };
      reader.readAsText(file);
    },
  },
};
</script>

<style>
@import url("https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap");
:root {
  --ink: #20232d;
  --muted: #7d8495;
  --line: #e8e9ee;
  --paper: #f8f8f6;
  --panel: #fff;
  --accent: #c97954;
  --navy: #293044;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: "Manrope", sans-serif;
}
button,
input,
textarea {
  font: inherit;
}
button {
  cursor: pointer;
}
.app-shell {
  display: flex;
  min-height: 100vh;
  background: radial-gradient(circle at 78% 3%, #fff 0, transparent 28%),
    var(--paper);
}
.sidebar {
  width: 248px;
  background: #202531;
  color: #f4f2ed;
  padding: 28px 18px 20px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px 34px;
  letter-spacing: -0.02em;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  background: var(--accent);
  color: #fff;
  font: 500 12px "DM Mono";
}
.brand b {
  display: block;
  font-size: 15px;
}
.brand small {
  display: block;
  color: #969baa;
  font-size: 9px;
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
.eyebrow {
  color: var(--muted);
  display: block;
  font: 500 10px "DM Mono";
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.sidebar .eyebrow {
  color: #8c929e;
}
.campaign-switcher {
  border-top: 1px solid #373d4b;
  border-bottom: 1px solid #373d4b;
  padding: 22px 10px;
}
.campaign-switcher strong {
  display: block;
  font-size: 13px;
  margin: 8px 0 14px;
}
.status-dot {
  color: #9fc9aa;
  font: 500 9px "DM Mono";
}
.status-dot:before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #86bb94;
  display: inline-block;
  margin-right: 6px;
}
.side-nav {
  padding-top: 24px;
}
.side-nav button,
.side-action {
  border: 0;
  color: #9fa5b0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 12px 10px;
  text-align: left;
  font-size: 12px;
}
.side-nav button span {
  width: 18px;
  text-align: center;
  font-size: 17px;
}
.side-nav button.active {
  color: #fff;
  background: #313746;
}
.side-nav button.active span {
  color: #d78a65;
}
.sidebar-bottom {
  margin-top: auto;
}
.storage {
  background: #2b303d;
  padding: 16px 14px;
  margin: 0 0 16px;
}
.storage strong {
  display: block;
  font-size: 11px;
  margin: 10px 0;
}
.storage small {
  color: #8e95a1;
  font-size: 9px;
  line-height: 1.5;
}
.storage-bar {
  height: 3px;
  background: #484f5c;
  margin-bottom: 9px;
}
.storage-bar i {
  display: block;
  width: 44%;
  height: 100%;
  background: var(--accent);
}
.side-action {
  font-size: 11px;
  padding: 8px 10px;
}
.visually-hidden {
  display: none;
}
.main-content {
  max-width: 1540px;
  padding: 28px 5.2vw 60px;
  width: 100%;
}
.content-shell {
  flex: 1;
  min-width: 0;
  width: calc(100% - 248px);
}
.topbar {
  background: #303a52;
  color: #f7f4ef;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 58px;
  padding: 10px 5.2vw;
}
@media (min-width: 721px) {
  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
  }
}
.breadcrumb {
  color: #aeb7c9;
  font: 500 10px "DM Mono";
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.topbar h1 {
  font-size: 17px;
  margin: 3px 0 0;
  letter-spacing: -0.04em;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-email {
  color: #bfc7d5;
  font-size: 10px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.logout-button {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.28);
  color: #fff;
  font-size: 10px;
  padding: 6px 10px;
  transition: background 0.18s ease, border-color 0.18s ease;
}
.logout-button:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.5);
}
.supabase-auth-panel {
  align-items: center;
  background: radial-gradient(circle at 75% 10%, #3c4967 0, transparent 36%),
    #202531;
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}
.supabase-loading-panel {
  align-items: center;
  background: #202531;
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}
.supabase-loading-panel .auth-card p {
  color: #7d8495;
  font-size: 11px;
}
.auth-card {
  background: #fff;
  max-width: 390px;
  padding: 32px;
  width: 100%;
}
.auth-card h1 {
  color: #20232d;
  font-size: 30px;
  letter-spacing: -0.06em;
  line-height: 1.1;
  margin: 14px 0 26px;
}
.auth-card h1 em {
  color: var(--accent);
  font-style: normal;
}
.auth-card label {
  color: var(--muted);
  display: block;
  font-size: 10px;
  margin-top: 13px;
}
.auth-card input {
  background: #fafafa;
  border: 1px solid var(--line);
  box-sizing: border-box;
  display: block;
  margin-top: 5px;
  padding: 10px;
  width: 100%;
}
.auth-card .primary-button {
  margin-top: 20px;
  width: 100%;
}
.auth-error {
  color: #a94f48;
  font-size: 10px;
  margin: 13px 0 0;
}
.saved-state {
  color: #bfc7d5;
  font-size: 11px;
}
.saved-state i {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #83b18d;
  border-radius: 50%;
  margin-right: 7px;
}
.save-button {
  padding: 8px 13px;
  font-size: 10px;
}
.icon-button,
.gm-avatar {
  border: 0;
  background: transparent;
  color: #e1e5ec;
  font-size: 18px;
}
.gm-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #fff;
  background: var(--navy);
  font: 500 10px "DM Mono";
}
.hero-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 46px;
}
.accent {
  color: var(--accent);
}
.hero-row h2 {
  font-size: clamp(32px, 4vw, 54px);
  line-height: 1.05;
  letter-spacing: -0.07em;
  margin: 13px 0 18px;
}
.hero-row h2 em {
  color: var(--accent);
  font-style: normal;
}
.hero-copy {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
  max-width: 410px;
  margin: 0;
}
.session-card {
  width: 210px;
  background: #303a52;
  color: #fff;
  padding: 22px;
  position: relative;
  overflow: hidden;
}
.session-card:after {
  content: "07";
  color: #43516f;
  position: absolute;
  right: -3px;
  top: 3px;
  font: 800 70px "Manrope";
}
.session-card strong {
  display: block;
  font-size: 20px;
  margin: 13px 0 4px;
  position: relative;
  z-index: 1;
}
.session-card > span:not(.eyebrow) {
  color: #b7bfd0;
  font-size: 10px;
}
.session-card button {
  display: flex;
  justify-content: space-between;
  width: 100%;
  border: 0;
  border-top: 1px solid #4c5871;
  background: transparent;
  color: #fff;
  margin-top: 23px;
  padding: 13px 0 0;
  font-size: 10px;
  position: relative;
  z-index: 1;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 52px;
}
.metric-card {
  background: var(--panel);
  border: 1px solid var(--line);
  padding: 22px 20px;
  min-height: 125px;
}
.metric-card > span {
  color: var(--muted);
  font-size: 11px;
}
.metric-card strong {
  display: block;
  font-size: 32px;
  margin: 15px 0 10px;
  letter-spacing: -0.05em;
}
.metric-card strong small {
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
}
.metric-foot {
  color: var(--muted);
  font-size: 10px;
}
.up {
  color: #6d9d77;
  font-style: normal;
  margin-right: 5px;
}
.accent-card {
  background: #f1e0d9;
  border-color: #ead1c6;
}
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 20px;
}
.section-heading h3,
.section-heading h2 {
  margin: 7px 0 0;
  font-size: 20px;
  letter-spacing: -0.04em;
}
.text-button,
.muted {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
}
.team-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 50px;
}
.team-card {
  background: var(--panel);
  padding: 21px;
  border: 1px solid var(--line);
  transition: transform 0.2s, box-shadow 0.2s;
}
.team-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 30px #2025310d;
}
.team-card-head {
  display: flex;
  align-items: center;
  gap: 11px;
}
.team-symbol {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: #fff;
  font-weight: 800;
  font-size: 13px;
  flex-shrink: 0;
}
.team-symbol.small {
  width: 25px;
  height: 25px;
  font-size: 10px;
}
.team-card h4,
.character-card h4 {
  margin: 0 0 4px;
  font-size: 13px;
}
.team-card-head span:not(.card-arrow),
.character-card span,
.character-card small {
  color: var(--muted);
  font-size: 10px;
}
.card-arrow {
  color: var(--muted);
  margin-left: auto;
  font-size: 18px;
}
.progress-label,
.team-card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--muted);
  font-size: 10px;
}
.progress-label {
  margin: 28px 0 8px;
}
.progress-label b {
  color: var(--ink);
}
.progress-track {
  height: 5px;
  background: #ebebee;
}
.progress-track i {
  display: block;
  height: 100%;
}
.team-card-foot {
  margin-top: 13px;
}
.region-badge {
  background: #f1e5df;
  color: #a76048 !important;
  display: inline-block;
  font-size: 9px !important;
  margin-left: 7px;
  padding: 4px 7px;
}
.team-character-list {
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.team-character-list li {
  background: var(--paper);
  font-size: 9px;
  padding: 3px 6px;
}
.scenario-order-heading {
  margin-top: 42px;
}
.scenario-order-list {
  background: var(--panel);
  border: 1px solid var(--line);
  display: grid;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
}
.scenario-order-list li {
  align-items: center;
  border-top: 1px solid var(--line);
  display: grid;
  gap: 12px;
  grid-template-columns: 38px minmax(150px, 0.5fr) 1fr;
  padding: 13px 16px;
  font-size: 11px;
}
.scenario-order-list li:first-child {
  border-top: 0;
}
.scenario-order-code {
  color: var(--accent);
  font: 500 10px "DM Mono";
}
.scenario-order-list small {
  color: var(--muted);
  font-size: 10px;
}
.team-character-list small {
  color: var(--muted);
  font-size: 8px;
  margin-left: 3px;
}
.scenario-stage-heading {
  margin-top: 42px;
}
.progress-stage-list {
  background: var(--panel);
  border: 1px solid var(--line);
  display: grid;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
}
.progress-stage-list li {
  align-items: center;
  border-top: 1px solid var(--line);
  display: grid;
  gap: 12px;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  padding: 14px 16px;
}
.progress-stage-list li:first-child {
  border-top: 0;
}
.stage-number {
  color: var(--accent);
  font: 500 11px "DM Mono";
}
.progress-stage-list strong {
  font-size: 11px;
}
.progress-stage-list p {
  color: var(--muted);
  font-size: 10px;
  margin: 4px 0 0;
}
.progress-stage-list time {
  color: var(--muted);
  font: 9px "DM Mono";
}
.tracker-stage-list {
  background: var(--panel);
  border: 1px solid var(--line);
  display: flex;
  gap: 8px;
  list-style: none;
  margin: 0 0 20px;
  overflow-x: auto;
  padding: 10px;
}
.tracker-stage-list li {
  align-items: flex-start;
  border-right: 1px solid var(--line);
  display: flex;
  gap: 8px;
  min-width: 180px;
  padding: 5px 12px 5px 4px;
}
.tracker-stage-list li:last-child {
  border-right: 0;
}
.tracker-stage-list li > span {
  color: var(--accent);
  font: 500 10px "DM Mono";
}
.tracker-stage-list strong,
.tracker-stage-list small {
  display: block;
}
.tracker-stage-list strong {
  font-size: 10px;
}
.tracker-stage-list small {
  color: var(--muted);
  font-size: 9px;
  margin-top: 4px;
}
.scenario-step-list {
  border-top: 1px solid var(--line);
  display: grid;
  gap: 5px;
  list-style: none;
  margin: 16px 0 0;
  padding: 12px 0 0;
}
.scenario-step-list li {
  align-items: center;
  color: var(--muted);
  display: grid;
  font-size: 9px;
  gap: 7px;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  padding: 4px 0;
}
.scenario-step-list li.completed {
  color: #5d8968;
}
.scenario-step-list li.current {
  color: var(--ink);
  font-weight: 700;
}
.step-index {
  color: var(--accent);
  font: 500 9px "DM Mono";
}
.step-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.step-state {
  font-size: 8px;
}
.mini-dot {
  display: inline-block;
  height: 5px;
  width: 5px;
  margin-right: 5px;
  border-radius: 50%;
}
.decision-table {
  background: var(--panel);
  border: 1px solid var(--line);
  overflow-x: auto;
}
.table-head,
.table-row {
  min-width: 850px;
  display: grid;
  grid-template-columns: 1.5fr repeat(6, 1fr);
}
.table-head {
  background: #f4f4f2;
  color: var(--muted);
  font: 500 9px "DM Mono";
  text-transform: uppercase;
  padding: 13px 18px;
}
.table-row {
  border-top: 1px solid var(--line);
  padding: 15px 18px;
  align-items: center;
}
.table-row > div:first-child b {
  color: var(--accent);
  font: 500 10px "DM Mono";
  margin-right: 10px;
}
.table-row > div:first-child span {
  font-size: 11px;
}
.decision-cell {
  color: var(--muted);
  font-size: 10px;
}
.decision-cell i {
  color: #75a081;
  font-style: normal;
  margin-left: 4px;
}
.chosen {
  color: var(--ink);
}
.empty {
  color: #b9bdc5;
}
.page-section-heading {
  align-items: flex-start;
  margin-bottom: 28px;
}
.page-section-heading h2 {
  font-size: 32px;
}
.page-section-heading p,
.team-detail-head p {
  color: var(--muted);
  font-size: 12px;
  margin: 10px 0 0;
}
.primary-button,
.outline-button {
  align-items: center;
  border: 0;
  display: inline-flex;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  padding: 12px 15px;
  font-size: 11px;
  gap: 6px;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease,
    transform 0.18s ease;
}
.primary-button:hover {
  background: #b96748;
  transform: translateY(-1px);
}
.primary-button:focus-visible,
.outline-button:focus-visible,
.add-choice-button:focus-visible,
.delete-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.outline-button {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--line);
}
.outline-button:hover {
  background: var(--paper);
  border-color: #d4a18d;
  color: var(--accent);
}
.scenario-layout,
.team-workspace {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
}
.team-workspace.team-detail-only {
  display: block;
}
.team-workspace.team-list-only {
  display: block;
}
.team-list-only .roster-list {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.scenario-list,
.roster-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.scenario-select,
.roster-team {
  display: flex;
  align-items: center;
  text-align: left;
  gap: 10px;
  border: 1px solid transparent;
  background: transparent;
  padding: 15px 13px;
  color: var(--muted);
}
.scenario-select.selected,
.roster-team.selected {
  background: var(--panel);
  border-color: var(--line);
  color: var(--ink);
}
.scenario-select b {
  font: 500 10px "DM Mono";
  color: var(--accent);
}
.scenario-select span {
  font-size: 11px;
}
.scenario-select i {
  margin-left: auto;
  font: 10px "DM Mono";
  color: var(--muted);
}
.delete-mini {
  color: #b77b6b;
  cursor: pointer;
  font: 500 16px "DM Mono";
  line-height: 1;
  margin-left: 4px;
}
.delete-mini:hover,
.delete-button:hover,
.gallery-delete:hover {
  color: #b24d43;
}
.scenario-detail,
.roster-detail {
  background: var(--panel);
  border: 1px solid var(--line);
  padding: 26px;
}
.detail-title,
.team-detail-head,
.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.character-save-state {
  align-self: center;
  color: var(--accent);
  font: 11px "DM Mono";
  white-space: nowrap;
}
.detail-title h3,
.team-detail-head h3,
.sheet-header h3 {
  font-size: 23px;
  margin: 9px 0;
}
.detail-title p {
  color: var(--muted);
  font-size: 11px;
}
.scenario-status {
  color: var(--accent);
  font: 10px "DM Mono";
}
.choice-manager {
  background: #f7f7f5;
  border: 1px solid var(--line);
  margin: 24px 0 4px;
  padding: 16px;
}
.choice-manager-head,
.team-progress-summary-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.choice-manager-head h4,
.team-progress-summary-head h4 {
  font-size: 13px;
  margin: 7px 0 0;
}
.choice-manager-list {
  display: grid;
  gap: 7px;
  margin-top: 14px;
}
.question-manager {
  background: var(--panel);
  border: 1px solid var(--line);
  padding: 12px;
}
.question-manager-head {
  align-items: center;
  display: flex;
  gap: 9px;
}
.question-manager-head input {
  background: var(--paper);
  border: 1px solid var(--line);
  color: var(--ink);
  flex: 1;
  font-size: 11px;
  outline-color: var(--accent);
  padding: 9px;
}
.question-choice-list {
  border-left: 1px solid var(--line);
  display: grid;
  gap: 6px;
  margin: 10px 0 0 9px;
  padding-left: 16px;
}
.choice-manager-row {
  align-items: center;
  display: flex;
  gap: 9px;
}
.choice-index {
  color: var(--accent);
  font: 500 10px "DM Mono";
  width: 18px;
}
.choice-manager-row input {
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--ink);
  flex: 1;
  font-size: 11px;
  outline-color: var(--accent);
  padding: 9px;
}
.add-choice-button {
  background: transparent;
  border: 1px dashed #d6a18d;
  color: var(--accent);
  cursor: pointer;
  font-size: 10px;
  justify-self: start;
  margin-top: 3px;
  padding: 7px 10px;
  transition: background 0.18s ease, border-color 0.18s ease;
}
.add-choice-button:hover {
  background: #f8ece7;
  border-color: var(--accent);
}
.delete-button {
  background: transparent;
  border: 0;
  color: #b77b6b;
  cursor: pointer;
  flex-shrink: 0;
  font: 500 16px "DM Mono";
  line-height: 1;
  padding: 4px;
}
.empty-choice {
  color: var(--muted);
  font-size: 10px;
  margin: 10px 0 0 27px;
}
.choice-team {
  border-top: 1px solid var(--line);
  padding: 17px 0;
}
.choice-team-name {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 11px;
}
.check-label {
  margin-left: auto;
  color: var(--muted);
  font-size: 10px;
}
.choice-options {
  display: flex;
  gap: 16px;
  margin: 15px 0 12px 34px;
}
.choice-options label {
  color: var(--muted);
  font-size: 10px;
}
.choice-options input,
.check-label input {
  accent-color: var(--accent);
}
.choice-team textarea {
  resize: vertical;
  min-height: 55px;
  margin-left: 34px;
  width: calc(100% - 34px);
}
.roster-team small {
  display: block;
  color: var(--muted);
  font-size: 9px;
  margin-top: 4px;
}
.roster-team i {
  margin-left: auto;
  font-size: 20px;
}
.roster-detail {
  min-width: 0;
}
.team-progress-summary {
  border-bottom: 1px solid var(--line);
  margin: 26px 0 0;
  padding: 18px 0 23px;
}
.team-progress-summary-head strong {
  color: var(--ink);
  font-size: 24px;
  letter-spacing: -0.05em;
}
.team-progress-summary-head strong small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0;
}
.large-progress {
  margin-top: 15px;
}
.team-scenario-board {
  display: grid;
  gap: 5px;
  margin-top: 14px;
}
.team-scenario-row {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--ink);
  display: grid;
  gap: 10px;
  grid-template-columns: 30px minmax(110px, 1fr) minmax(110px, 1.2fr) 54px 20px;
  padding: 10px 8px;
  text-align: left;
  width: 100%;
}
.team-scenario-row:hover {
  background: var(--paper);
  border-color: var(--line);
}
.scenario-code {
  color: var(--accent);
  font: 500 10px "DM Mono";
}
.team-scenario-name,
.team-choice {
  font-size: 10px;
}
.team-choice {
  color: var(--ink);
}
.team-choice.is-empty {
  color: var(--muted);
}
.completion-badge {
  background: #eeeef0;
  color: var(--muted);
  font-size: 9px;
  padding: 4px 6px;
  text-align: center;
}
.completion-badge.complete {
  background: #e4f0e6;
  color: #5d8968;
}
.row-arrow {
  color: var(--muted);
  font-size: 14px;
  text-align: right;
}
.character-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  margin-top: 28px;
}
.character-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--line);
  padding: 11px;
  position: relative;
}
.character-avatar {
  width: 46px;
  height: 46px;
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 20px;
  font-weight: 800;
}
.character-card small {
  display: block;
  margin-top: 6px;
}
.character-card button {
  margin-left: auto;
  background: transparent;
  border: 0;
  color: var(--muted);
}
.character-card .delete-button {
  margin-left: 0;
  color: #b77b6b;
  font-size: 16px;
}
.character-sheet {
  border-top: 1px solid var(--line);
  margin-top: 28px;
  padding-top: 25px;
}
.close-button {
  background: transparent;
  border: 0;
  color: var(--muted);
  font-size: 23px;
}
.sheet-header > div > span:not(.eyebrow) {
  color: var(--muted);
  font-size: 11px;
}
.sheet-body {
  align-items: flex-start;
  display: flex;
  gap: 32px;
  flex-wrap: nowrap;
  margin-top: 22px;
  max-width: 720px;
  width: 100%;
}
.sheet-identity {
  display: grid;
  flex: 0 0 160px;
  gap: 10px;
  min-width: 0;
  width: 160px;
}
.sheet-fields {
  display: grid;
  flex: 1 1 0;
  gap: 10px;
  min-width: 0;
  width: auto;
}
.field-grid,
.textarea-grid {
  display: grid;
  gap: 10px;
  min-width: 0;
  width: 100%;
}
.sheet-fields {
  max-width: 535px;
}
.sheet-body > * {
  min-width: 0;
}
.large-avatar {
  width: 100%;
  aspect-ratio: 1;
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 44px;
  font-weight: 800;
}
.sheet-body label {
  color: var(--muted);
  font-size: 10px;
}
.sheet-body input,
.sheet-body textarea,
.choice-team textarea {
  display: block;
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  border: 1px solid var(--line);
  background: #fafafa;
  color: var(--ink);
  padding: 7px 8px;
  margin-top: 5px;
  outline-color: var(--accent);
  font-size: 10px;
}
.field-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.textarea-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 535px;
  margin-top: 12px;
}
.textarea-grid textarea {
  min-height: 63px;
  resize: vertical;
}
.gallery-toolbar {
  display: flex;
  gap: 7px;
  margin-bottom: 22px;
  overflow-x: auto;
}
.gallery-toolbar button {
  white-space: nowrap;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 9px 12px;
  font-size: 10px;
}
.gallery-toolbar button.selected {
  background: var(--navy);
  color: #fff;
  border-color: var(--navy);
}
.gallery-toolbar b {
  margin-left: 7px;
  font: 10px "DM Mono";
}
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 13px;
}
.gallery-item {
  margin: 0;
  background: var(--panel);
  border: 1px solid var(--line);
}
.gallery-item img {
  display: block;
  width: 100%;
  height: 180px;
  object-fit: cover;
}
.gallery-item figcaption {
  padding: 12px;
}
.gallery-item figcaption b,
.gallery-item figcaption span {
  display: block;
}
.gallery-item figcaption b {
  font-size: 11px;
}
.gallery-item figcaption span {
  color: var(--muted);
  font-size: 9px;
  margin-top: 5px;
}
.gallery-delete {
  border: 0;
  background: transparent;
  color: #b77b6b;
  font-size: 9px;
  margin-top: 10px;
  padding: 0;
}
.image-fallback {
  height: 180px;
  display: grid;
  place-items: center;
  text-align: center;
  background: #303a52;
  color: #8d98ae;
  font: 10px "DM Mono";
}
body.dark-mode {
  --paper: #171a22;
  --panel: #20242e;
  --ink: #f2f1ec;
  --muted: #969baa;
  --line: #363b48;
}
body.dark-mode .app-shell {
  background: radial-gradient(circle at 78% 3%, #292d3b 0, transparent 28%),
    var(--paper);
}
body.dark-mode .metric-card.accent-card {
  background: #48352f;
  border-color: #66463a;
}
body.dark-mode .table-head {
  background: #2b303b;
}
body.dark-mode .sheet-body input,
body.dark-mode .sheet-body textarea,
body.dark-mode .choice-team textarea {
  background: #181b22;
  color: var(--ink);
}
@media (max-width: 1100px) {
  .sidebar {
    width: 205px;
  }
  .main-content {
    padding: 28px 28px 50px;
    width: 100%;
  }
  .content-shell {
    width: calc(100% - 205px);
  }
  .team-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .gallery-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .team-list-only .roster-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .character-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sheet-body {
    gap: 16px;
  }
}
@media (max-width: 720px) {
  .app-shell {
    display: block;
  }
  .sidebar {
    width: 100%;
    padding: 14px;
  }
  .content-shell {
    width: 100%;
  }
  .brand {
    padding: 0 5px 14px;
  }
  .campaign-switcher,
  .sidebar-bottom {
    display: none;
  }
  .side-nav {
    display: flex;
    gap: 3px;
    padding: 0;
    overflow-x: auto;
  }
  .side-nav button {
    white-space: nowrap;
    width: auto;
    padding: 10px 8px;
  }
  .side-nav button span {
    display: none;
  }
  .main-content {
    width: 100%;
    padding: 0 16px 40px;
  }
  .topbar {
    min-height: 52px;
    padding: 9px 16px;
  }
  .topbar h1 {
    font-size: 18px;
  }
  .saved-state {
    display: none;
  }
  .hero-row {
    display: block;
  }
  .hero-row h2 {
    font-size: 38px;
  }
  .session-card {
    margin-top: 24px;
    width: 100%;
  }
  .metrics,
  .team-grid {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .metric-card {
    padding: 15px 13px;
  }
  .metric-card strong {
    font-size: 26px;
  }
  .team-grid {
    grid-template-columns: 1fr;
  }
  .scenario-layout,
  .team-workspace {
    grid-template-columns: 1fr;
  }
  .scenario-list,
  .roster-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .team-list-only .roster-list {
    grid-template-columns: 1fr;
  }
  .scenario-select,
  .roster-team {
    padding: 11px 8px;
  }
  .scenario-select span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail-title,
  .team-detail-head {
    display: block;
  }
  .scenario-status {
    display: block;
    margin-top: 18px;
  }
  .choice-options {
    flex-wrap: wrap;
    margin-left: 0;
  }
  .choice-team textarea {
    margin-left: 0;
    width: 100%;
  }
  .choice-manager-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .team-scenario-row {
    gap: 6px;
    grid-template-columns: 25px minmax(90px, 1fr) 52px 18px;
  }
  .team-choice {
    display: none;
  }
  .character-grid,
  .textarea-grid {
    grid-template-columns: 1fr;
  }
  .sheet-body {
    flex-direction: column;
  }
  .sheet-identity {
    flex-basis: auto;
    width: 100%;
  }
  .sheet-fields {
    flex-basis: auto;
    max-width: 100%;
    width: 100%;
  }
  .large-avatar {
    width: 110px;
  }
  .field-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .gallery-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .gallery-item img,
  .image-fallback {
    height: 130px;
  }
  .page-section-heading h2 {
    font-size: 28px;
  }
}
</style>
