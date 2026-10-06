<template>
  <section class="home-dashboard">
    <header class="home-heading">
      <div>
        <span class="eyebrow">DRAGONAGE / HOME</span>
        <h2>안녕하세요, {{ displayName }}님</h2>
        <p>새 공지와 팀 작품 게시판 소식을 확인하세요.</p>
      </div>
      <button
        class="secondary-button"
        type="button"
        :disabled="loading"
        @click="loadDashboard"
      >
        새로고침
      </button>
    </header>

    <p v-if="authError" class="home-error" role="alert">{{ authError }}</p>

    <div class="home-grid">
      <section class="home-panel home-panel--notices card">
        <header class="panel-heading">
          <div>
            <span class="eyebrow">ANNOUNCEMENTS</span>
            <h3>전체공지</h3>
          </div>
          <router-link class="text-link" :to="{ name: 'notices' }"
            >모두 보기</router-link
          >
        </header>
        <p v-if="sectionErrors.notices" class="panel-error" role="alert">
          {{ sectionErrors.notices }}
        </p>
        <p v-else-if="loading && !notices.length" class="panel-state">
          불러오는 중…
        </p>
        <p v-else-if="!notices.length" class="panel-state">
          새 공지가 없습니다.
        </p>
        <div v-else class="preview-list">
          <router-link
            v-for="notice in notices"
            :key="notice.id"
            class="preview-item notice-preview"
            :to="{ name: 'notice-detail', params: { noticeId: notice.id } }"
          >
            <strong>{{ notice.title }}</strong>
            <span>{{ excerpt(notice.content) }}</span>
          </router-link>
        </div>
      </section>

      <section class="home-panel card">
        <header class="panel-heading">
          <div>
            <span class="eyebrow">LATEST WORKS</span>
            <h3>{{ isGM ? "새 작품 글" : "우리 팀 새 글" }}</h3>
          </div>
          <router-link class="text-link" :to="boardLink"
            >게시판 보기</router-link
          >
        </header>
        <p v-if="sectionErrors.posts" class="panel-error" role="alert">
          {{ sectionErrors.posts }}
        </p>
        <p v-else-if="loading && !posts.length" class="panel-state">
          불러오는 중…
        </p>
        <p v-else-if="!posts.length" class="panel-state">
          새 작품 글이 없습니다.
        </p>
        <div v-else class="preview-list">
          <router-link
            v-for="post in posts"
            :key="post.id"
            class="preview-item work-preview"
            :to="postLink(post.team_id)"
          >
            <div class="preview-author">
              <img
                :src="post.avatar_url || defaultAvatar"
                alt=""
                @error="useDefaultAvatar"
              />
              <strong>{{ post.nickname || "사용자" }}</strong>
              <span v-if="isGM && teamName(post.team_id)" class="team-label">{{
                teamName(post.team_id)
              }}</span>
            </div>
            <div class="work-preview-media">
              <div
                class="work-preview-content"
                :class="{
                  'work-preview-content--blurred':
                    post.is_spoiler && !revealedSpoilers[post.id],
                }"
              >
                <span class="work-excerpt">{{
                  excerpt(post.content) || "이미지 작품"
                }}</span>
                <img
                  v-if="imageUrl(post)"
                  class="work-thumb"
                  :src="imageUrl(post)"
                  alt="첨부 작품 미리보기"
                />
              </div>
              <span
                v-if="post.is_spoiler && !revealedSpoilers[post.id]"
                class="work-spoiler-cover"
                role="button"
                tabindex="0"
                aria-label="스포일러 작품 미리보기 공개"
                @click.stop.prevent="revealPostSpoiler(post.id)"
                @keydown.enter.stop.prevent="revealPostSpoiler(post.id)"
                @keydown.space.stop.prevent="revealPostSpoiler(post.id)"
              >
                스포일러 작품 · 눌러서 보기
              </span>
            </div>
            <time :datetime="post.created_at">{{
              formatDate(post.created_at)
            }}</time>
          </router-link>
        </div>
      </section>

      <section class="home-panel card">
        <header class="panel-heading">
          <div>
            <span class="eyebrow">LATEST COMMENTS</span>
            <h3>새 댓글</h3>
          </div>
          <router-link class="text-link" :to="boardLink"
            >게시판 보기</router-link
          >
        </header>
        <p v-if="sectionErrors.comments" class="panel-error" role="alert">
          {{ sectionErrors.comments }}
        </p>
        <p v-else-if="loading && !comments.length" class="panel-state">
          불러오는 중…
        </p>
        <p v-else-if="!comments.length" class="panel-state">
          새 댓글이 없습니다.
        </p>
        <div v-else class="preview-list">
          <router-link
            v-for="comment in comments"
            :key="comment.id"
            class="preview-item comment-preview"
            :to="postLink(comment.post?.team_id)"
          >
            <div class="preview-author">
              <img
                :src="comment.avatar_url || defaultAvatar"
                alt=""
                @error="useDefaultAvatar"
              />
              <strong>{{ comment.nickname || "사용자" }}</strong>
              <time :datetime="comment.created_at">{{
                formatDate(comment.created_at)
              }}</time>
            </div>
            <span>{{ excerpt(comment.content) || "이미지 댓글" }}</span>
            <small v-if="comment.post?.content"
              >원글: {{ excerpt(comment.post.content, 72) }}</small
            >
          </router-link>
        </div>
      </section>
    </div>
  </section>
</template>

<script>
import { supabase } from "@/supabase";

const DEFAULT_AVATAR = `${process.env.BASE_URL}image/default.webp`;

export default {
  name: "HomeDashboardView",
  data() {
    return {
      loading: true,
      isGM: false,
      userId: "",
      teamId: "",
      displayName: "모험가",
      teams: [],
      notices: [],
      posts: [],
      comments: [],
      sectionErrors: { notices: "", posts: "", comments: "" },
      authError: "",
      revealedSpoilers: {},
      defaultAvatar: DEFAULT_AVATAR,
    };
  },
  computed: {
    isPlayerPreview() {
      return this.$store.getters.isPlayerPreview;
    },
    boardLink() {
      return this.isGM
        ? { name: "free-board" }
        : { name: "free-board", query: { teamId: this.teamId } };
    },
  },
  async mounted() {
    await this.loadDashboard();
  },
  watch: {
    "$store.state.gmPreviewTeamId"(teamId) {
      if (this.isPlayerPreview && teamId) this.loadDashboard();
    },
    "$store.state.gmPlayerPreviewMode"() {
      this.loadDashboard();
    },
  },
  methods: {
    async loadDashboard() {
      this.loading = true;
      this.authError = "";
      this.sectionErrors = { notices: "", posts: "", comments: "" };
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user)
          throw new Error(
            "로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요."
          );
        this.userId = userData.user.id;
        this.displayName = userData.user.user_metadata?.username || "마스터";

        const { data: gm, error: gmError } = await supabase.rpc(
          "current_user_is_gm"
        );
        if (gmError) throw gmError;
        const isMaster = gm === true;
        this.isGM = isMaster && !this.isPlayerPreview;

        if (isMaster) {
          const { data: gmProfile, error: gmProfileError } = await supabase
            .from("users")
            .select("username")
            .eq("id", userData.user.id)
            .maybeSingle();
          if (gmProfileError) {
            console.warn("Master username could not be loaded", gmProfileError);
          }
          this.displayName =
            gmProfile?.username?.trim() ||
            userData.user.user_metadata?.username ||
            "마스터";
          this.teams = (this.$store.state.teams || []).filter(
            (team) => !this.isPlayerPreview || !team.is_frozen
          );
          if (this.isPlayerPreview) {
            this.teamId = this.$store.getters.activePlayerTeamId || "";
            const previewTeam = this.teams.find(
              (team) => team.id === this.teamId
            );
            const previewCharacter =
              previewTeam?.characters?.find((character) => character.player) ||
              previewTeam?.characters?.[0];
            this.displayName =
              previewCharacter?.character_name ||
              previewCharacter?.player ||
              "플레이어";
          }
        } else {
          const { data: context, error: contextError } = await supabase.rpc(
            "player_character_context"
          );
          if (contextError) throw contextError;
          this.teamId = context?.[0]?.team_id || "";
          const { data: profile, error: profileError } = await supabase.rpc(
            "player_team_profiles"
          );
          if (profileError) throw profileError;
          const ownProfile = (profile || []).find(
            (item) => item.id === context?.[0]?.character_id
          );
          this.displayName =
            ownProfile?.character_name ||
            ownProfile?.player ||
            this.displayName;
          this.teams = (this.$store.state.teams || []).filter(
            (team) => !team.is_frozen
          );
        }
      } catch (error) {
        console.error("[Home] authentication context", error);
        this.authError = error.message || "계정 정보를 불러오지 못했습니다.";
        this.loading = false;
        return;
      }

      await Promise.all([
        this.loadNotices(),
        this.loadPosts(),
        this.loadComments(),
      ]);
      this.loading = false;
    },
    async loadNotices() {
      const { data, error } = await supabase
        .from("notices")
        .select("id, title, content, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) {
        console.error("[Home] notices", error);
        this.sectionErrors.notices = `전체공지를 불러오지 못했습니다. (${error.message})`;
      } else this.notices = data || [];
    },
    async loadPosts() {
      let query = supabase
        .from("team_art_posts")
        .select(
          "id, team_id, user_id, nickname, avatar_url, content, image_paths, is_spoiler, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(3);
      if (!this.isGM) query = query.eq("team_id", this.teamId);
      const { data, error } = await query;
      if (error) {
        console.error("[Home] artwork posts", error);
        this.sectionErrors.posts = `작품 글을 불러오지 못했습니다. migration_team_art_board.sql 적용 여부를 확인해 주세요. (${error.message})`;
      } else this.posts = await this.withAuthorAvatars(data || []);
    },
    async loadComments() {
      let query = supabase
        .from("team_art_comments")
        .select(
          "id, post_id, user_id, nickname, avatar_url, content, created_at, post:team_art_posts!inner(id, team_id, content)"
        )
        .order("created_at", { ascending: false })
        .limit(5);
      if (!this.isGM) query = query.eq("team_art_posts.team_id", this.teamId);
      const { data, error } = await query;
      if (error) {
        console.error("[Home] artwork comments", error);
        this.sectionErrors.comments = `최근 댓글을 불러오지 못했습니다. 게시판 설정을 확인해 주세요. (${error.message})`;
      } else this.comments = await this.withAuthorAvatars(data || []);
    },
    async withAuthorAvatars(rows) {
      const userIds = [
        ...new Set(rows.map((row) => row.user_id).filter(Boolean)),
      ];
      let profiles = {};
      if (userIds.length) {
        const { data, error } = await supabase.rpc("team_art_author_profiles", {
          p_user_ids: userIds,
        });
        if (error) {
          console.warn("[Home] author token images unavailable", error);
        } else {
          profiles = Object.fromEntries(
            (data || []).map((profile) => [profile.user_id, profile])
          );
        }
        const { data: names, error: namesError } = await supabase.rpc(
          "team_art_author_display_names",
          { p_user_ids: userIds }
        );
        if (!namesError) {
          (names || []).forEach((name) => {
            profiles[name.user_id] = { ...profiles[name.user_id], ...name };
          });
        }
      }
      return rows.map((row) => {
        const profile = profiles[row.user_id];
        const isMaster =
          profile?.is_gm || (this.isGM && row.user_id === this.userId);
        return {
          ...row,
          nickname: this.authorDisplayName(row, profile),
          avatar_url: isMaster
            ? DEFAULT_AVATAR
            : profile?.token_url || row.avatar_url || DEFAULT_AVATAR,
        };
      });
    },
    authorDisplayName(author, profile) {
      if (profile?.character_name) return profile.character_name;
      if (/^player-[0-9a-f-]{36}$/i.test(author.nickname || ""))
        return profile?.is_gm ? "마스터" : "플레이어";
      return author.nickname || "사용자";
    },
    postLink(teamId) {
      return this.isGM
        ? { name: "free-board", query: teamId ? { teamId } : {} }
        : {
            name: "free-board",
            query: this.teamId ? { teamId: this.teamId } : {},
          };
    },
    teamName(id) {
      return this.teams.find((team) => team.id === id)?.name || "";
    },
    imageUrl(post) {
      if (Array.isArray(post.image_paths) && post.image_paths.length) {
        const path = post.image_paths[0];
        if (/^(https?:|data:)/i.test(path)) return path;
      }
      return "";
    },
    revealPostSpoiler(postId) {
      this.revealedSpoilers = {
        ...this.revealedSpoilers,
        [postId]: true,
      };
    },
    excerpt(value, max = 110) {
      const text = String(value || "")
        .replace(/\s+/g, " ")
        .trim();
      return text.length > max ? `${text.slice(0, max)}…` : text;
    },
    formatDate(value) {
      if (!value) return "";
      return new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value));
    },
    useDefaultAvatar(event) {
      event.target.src = DEFAULT_AVATAR;
    },
  },
};
</script>

<style scoped>
.home-dashboard {
  width: min(1120px, 100%);
  margin: 0 auto;
}
.home-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}
.home-heading h2 {
  margin: 5px 0;
  color: var(--ink);
}
.home-heading p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
.home-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}
.home-panel {
  min-width: 0;
  padding: 18px;
}
.home-panel--notices {
  grid-column: 1 / -1;
}
.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.panel-heading h3 {
  margin: 3px 0 0;
  color: var(--ink);
  font-size: 17px;
}
.text-link {
  color: var(--accent);
  font-size: 12px;
  white-space: nowrap;
}
.preview-list {
  display: grid;
  gap: 7px;
}
.preview-item {
  display: grid;
  min-width: 0;
  gap: 5px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--ink);
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}
.preview-item:hover,
.preview-item:focus-visible {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, var(--panel));
  outline: none;
}
.preview-item strong,
.preview-item > span,
.preview-item small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  overflow-wrap: anywhere;
}
.preview-item > span,
.preview-item small {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
.preview-item time {
  color: var(--muted);
  font-size: 10px;
}
.preview-author {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.preview-author img {
  width: 23px;
  height: 23px;
  flex: 0 0 auto;
  object-fit: cover;
  border-radius: 50%;
  background: var(--line);
}
.preview-author strong {
  font-size: 12px;
}
.preview-author time {
  margin-left: auto;
  white-space: nowrap;
}
.team-label {
  margin-left: auto;
  color: var(--muted);
  font-size: 10px;
}
.work-thumb {
  width: 100%;
  max-height: 125px;
  object-fit: cover;
  border-radius: 4px;
}
.work-preview-media {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border-radius: 4px;
}
.work-preview-content {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.work-preview-content--blurred {
  filter: blur(8px);
  user-select: none;
}
.work-spoiler-cover {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 10px;
  background: color-mix(in srgb, var(--panel) 72%, transparent);
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
}
.work-spoiler-cover:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -3px;
}
.panel-state,
.panel-error {
  margin: 0;
  padding: 18px 10px;
  color: var(--muted);
  text-align: center;
  font-size: 12px;
}
.panel-error,
.home-error {
  color: var(--error);
}
.home-error {
  margin: 0 0 14px;
}
@media (max-width: 760px) {
  .home-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .home-panel {
    padding: 15px;
  }
}
@media (max-width: 520px) {
  .home-heading {
    align-items: flex-start;
  }
  .home-heading h2 {
    font-size: 20px;
  }
  .home-heading .secondary-button {
    padding: 8px 10px;
    white-space: nowrap;
  }
}
</style>
