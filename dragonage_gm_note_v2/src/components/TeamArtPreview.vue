<template>
  <div class="team-art-preview">
    <section class="section-block token-strip">
      <div class="section-heading">
        <div>
          <h3 class="section-title">캐릭터 토큰</h3>
        </div>
      </div>
      <div v-if="tokens.length" class="token-grid">
        <figure
          v-for="character in tokens"
          :key="character.id"
          class="token-card card"
        >
          <img
            :src="character.token_url"
            :alt="`${character.character_name || '캐릭터'} 토큰`"
          />
          <figcaption>{{ character.character_name || "이름 없음" }}</figcaption>
        </figure>
      </div>
      <p v-else class="empty-state">등록된 캐릭터 토큰이 없습니다.</p>
    </section>

    <section class="section-block team-art-section">
      <div class="section-heading">
        <div>
          <span class="eyebrow">TEAM ARTWORK</span>
          <h3 class="section-title">팀 작품 게시판</h3>
          <p class="muted">이 팀의 작품과 댓글을 모아 보여줍니다.</p>
        </div>
        <router-link
          :to="{ name: 'free-board', query: { teamId } }"
          class="outline-button"
        >
          게시판 열기
        </router-link>
      </div>

      <p v-if="loading" class="empty-state">작품을 불러오는 중입니다.</p>
      <p v-else-if="error" class="empty-state error-text" role="alert">
        작품을 불러오지 못했습니다.
        <button class="text-button" type="button" @click="loadPosts">
          다시 시도
        </button>
      </p>
      <p v-else-if="!posts.length" class="empty-state">
        아직 올라온 작품이 없습니다.
      </p>
      <div v-else class="art-grid">
        <article v-for="post in posts" :key="post.id" class="art-card card">
          <div class="art-author">
            <img
              class="art-author-avatar"
              :src="post.avatar_url || defaultAvatar"
              :alt="`${post.nickname || '사용자'} 프로필`"
              @error="useDefaultAvatar"
            />
            <strong>{{ post.nickname || "사용자" }}</strong>
            <time :datetime="post.created_at">{{
              formatDate(post.created_at)
            }}</time>
          </div>
          <div
            v-if="post.is_spoiler && !revealed[post.id]"
            class="spoiler-cover"
          >
            <span>스포일러가 포함된 작품입니다.</span>
            <button
              class="secondary-button"
              type="button"
              @click="reveal(post.id)"
            >
              작품 보기
            </button>
          </div>
          <div
            class="art-media"
            :class="{ blurred: post.is_spoiler && !revealed[post.id] }"
          >
            <p v-if="post.content" class="art-content">{{ post.content }}</p>
            <img
              v-for="(url, index) in post.image_urls"
              :key="`${post.id}-${index}`"
              :src="url"
              :alt="`작품 이미지 ${index + 1}`"
              loading="lazy"
            />
          </div>
          <p class="art-comment-count">
            댓글 {{ post.comments?.length || 0 }}개
          </p>
          <section
            class="preview-comments"
            :aria-label="`${post.nickname} 게시글 댓글`"
          >
            <div
              v-for="comment in post.comments || []"
              :key="comment.id"
              class="preview-comment"
            >
              <img
                :src="comment.avatar_url || defaultAvatar"
                :alt="`${comment.nickname || '사용자'} 프로필`"
                @error="useDefaultAvatar"
              />
              <div class="preview-comment-copy">
                <div class="preview-comment-meta">
                  <strong>{{ comment.nickname || "사용자" }}</strong>
                  <small v-if="comment.player_name"
                    >({{ comment.player_name }})</small
                  >
                  <time :datetime="comment.created_at">{{
                    formatDate(comment.created_at)
                  }}</time>
                </div>
                <p>{{ comment.content }}</p>
              </div>
            </div>
            <form
              v-if="!isPlayerPreview"
              class="preview-comment-form"
              @submit.prevent="submitComment(post)"
            >
              <label class="sr-only" :for="`team-art-comment-${post.id}`">
                댓글 내용
              </label>
              <textarea
                :id="`team-art-comment-${post.id}`"
                v-model="commentDrafts[post.id]"
                rows="2"
                maxlength="4000"
                placeholder="댓글을 입력하세요"
                :disabled="commentPosting[post.id]"
              />
              <button
                class="secondary-button"
                type="submit"
                :disabled="
                  commentPosting[post.id] || !commentDrafts[post.id]?.trim()
                "
              >
                {{ commentPosting[post.id] ? "등록 중…" : "댓글 등록" }}
              </button>
              <p
                v-if="commentErrors[post.id]"
                class="comment-error"
                role="alert"
              >
                {{ commentErrors[post.id] }}
              </p>
            </form>
            <p v-else class="preview-comment-readonly">
              플레이어 미리보기에서는 댓글을 등록할 수 없습니다.
            </p>
          </section>
        </article>
      </div>
    </section>
  </div>
</template>

<script>
import { supabase } from "@/supabase";

const BUCKET = "free-board-images";
const DEFAULT_AVATAR = `${process.env.BASE_URL}image/default.webp`;

export default {
  name: "TeamArtPreview",
  props: {
    teamId: { type: String, required: true },
    characters: { type: Array, default: () => [] },
  },
  data() {
    return {
      posts: [],
      commentDrafts: {},
      commentPosting: {},
      commentErrors: {},
      loading: true,
      error: false,
      revealed: {},
      isGM: false,
      userId: "",
      defaultAvatar: DEFAULT_AVATAR,
    };
  },
  computed: {
    isPlayerPreview() {
      return this.$store.getters.isPlayerPreview;
    },
    tokens() {
      return this.characters.filter((character) => character.token_url?.trim());
    },
  },
  mounted() {
    this.loadPosts();
  },
  watch: {
    teamId() {
      this.loadPosts();
    },
  },
  methods: {
    async loadPosts() {
      this.loading = true;
      this.error = false;
      const [{ data: authData }, { data: gm }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("current_user_is_gm"),
      ]);
      this.userId = authData.user?.id || "";
      this.isGM = gm === true;
      const { data, error } = await supabase
        .from("team_art_posts")
        .select(
          "id, user_id, nickname, avatar_url, content, image_paths, is_spoiler, created_at, team_art_comments(id, post_id, user_id, nickname, avatar_url, content, created_at)"
        )
        .eq("team_id", this.teamId)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) {
        console.error("[TeamArtPreview] load posts", error);
        this.error = true;
        this.loading = false;
        return;
      }
      const rows = data || [];
      const profiles = await this.loadAuthorProfiles(
        rows.flatMap((post) => [post, ...(post.team_art_comments || [])])
      );
      this.posts = await Promise.all(
        rows.map(async (post) => {
          const comments = (post.team_art_comments || []).map((comment) => ({
            ...comment,
            nickname: this.authorDisplayName(comment, profiles),
            player_name: this.authorPlayerName(comment, profiles),
            avatar_url: this.authorAvatar(comment, profiles),
          }));
          return {
            ...post,
            comments,
            nickname: this.authorDisplayName(post, profiles),
            avatar_url: this.authorAvatar(post, profiles),
            image_urls: await Promise.all(
              (post.image_paths || []).map((path) => this.resolveImage(path))
            ),
          };
        })
      );
      this.loading = false;
    },
    async loadAuthorProfiles(posts) {
      const userIds = [
        ...new Set(posts.map((post) => post.user_id).filter(Boolean)),
      ];
      if (!userIds.length) return {};
      const { data, error } = await supabase.rpc("team_art_author_profiles", {
        p_user_ids: userIds,
      });
      if (error) {
        console.warn("[TeamArtPreview] author token images unavailable", error);
      }
      const profiles = Object.fromEntries(
        (data || []).map((profile) => [profile.user_id, profile])
      );
      const { data: names, error: namesError } = await supabase.rpc(
        "team_art_author_display_names",
        { p_user_ids: userIds }
      );
      if (!namesError) {
        (names || []).forEach((name) => {
          profiles[name.user_id] = { ...profiles[name.user_id], ...name };
        });
      }
      return profiles;
    },
    authorDisplayName(author, profiles) {
      const profile = profiles[author.user_id];
      if (profile?.character_name) return profile.character_name;
      if (/^player-[0-9a-f-]{36}$/i.test(author.nickname || ""))
        return profile?.is_gm ? "마스터" : "플레이어";
      return author.nickname || "사용자";
    },
    authorPlayerName(author, profiles) {
      return profiles[author.user_id]?.player_name || "";
    },
    authorAvatar(author, profiles) {
      const profile = profiles[author.user_id];
      if (profile?.is_gm || (this.isGM && author.user_id === this.userId)) {
        return DEFAULT_AVATAR;
      }
      return profile?.token_url || author.avatar_url || DEFAULT_AVATAR;
    },
    async submitComment(post) {
      const content = (this.commentDrafts[post.id] || "").trim();
      if (!content || this.commentPosting[post.id] || this.isPlayerPreview)
        return;
      this.commentPosting = { ...this.commentPosting, [post.id]: true };
      this.commentErrors = { ...this.commentErrors, [post.id]: "" };
      const { data: authData, error: authError } =
        await supabase.auth.getUser();
      if (authError || !authData.user) {
        this.commentErrors = {
          ...this.commentErrors,
          [post.id]: "로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
        };
        this.commentPosting = { ...this.commentPosting, [post.id]: false };
        return;
      }
      const { error } = await supabase.from("team_art_comments").insert({
        post_id: post.id,
        user_id: authData.user.id,
        content,
      });
      if (error) {
        this.commentErrors = {
          ...this.commentErrors,
          [post.id]: `댓글을 등록하지 못했습니다: ${error.message}`,
        };
        this.commentPosting = { ...this.commentPosting, [post.id]: false };
        return;
      }
      this.commentDrafts = { ...this.commentDrafts, [post.id]: "" };
      this.commentPosting = { ...this.commentPosting, [post.id]: false };
      await this.loadPosts();
    },
    useDefaultAvatar(event) {
      event.target.src = DEFAULT_AVATAR;
    },
    async resolveImage(path) {
      if (/^(https?:|data:)/i.test(path)) return path;
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600);
      if (error) {
        const legacy = await supabase.storage
          .from("post-images")
          .createSignedUrl(path, 3600);
        if (legacy.error) {
          console.error("[TeamArtPreview] image URL", error, legacy.error);
          return "";
        }
        return legacy.data.signedUrl;
      }
      return data.signedUrl;
    },
    reveal(id) {
      this.revealed = { ...this.revealed, [id]: true };
    },
    formatDate(value) {
      if (!value) return "";
      return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
        new Date(value)
      );
    },
  },
};
</script>

<style scoped>
.team-art-preview {
  display: grid;
  gap: 24px;
}
.token-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(125px, 1fr));
  gap: 12px;
}
.token-card {
  margin: 0;
  padding: 10px;
  text-align: center;
}
.token-card img {
  display: block;
  width: 100%;
  height: 150px;
  object-fit: contain;
}
.token-card figcaption {
  margin-top: 7px;
  color: var(--ink);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.team-art-section .section-heading {
  align-items: flex-end;
}
.team-art-section .section-heading p {
  margin: 5px 0 0;
  font-size: 12px;
}
.art-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: 12px;
}
.art-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 14px;
}
.art-author {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ink);
  font-size: 12px;
}
.art-author-avatar {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  object-fit: cover;
  border-radius: 50%;
  background: var(--line);
}
.art-author time,
.art-comment-count {
  color: var(--muted);
  font-size: 11px;
}
.art-media {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.art-media.blurred {
  filter: blur(12px);
  user-select: none;
}
.art-media img {
  width: 100%;
  max-height: 260px;
  object-fit: contain;
  border-radius: 4px;
  background: var(--paper);
}
.art-content {
  margin: 0;
  color: var(--ink);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.spoiler-cover {
  position: absolute;
  z-index: 1;
  inset: 45px 14px 35px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--panel) 78%, transparent);
  text-align: center;
  color: var(--ink);
}
.art-comment-count {
  margin: 10px 0 0;
}
.preview-comments {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.preview-comment {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-width: 0;
}
.preview-comment > img {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  object-fit: cover;
  border-radius: 50%;
  background: var(--line);
}
.preview-comment-copy {
  min-width: 0;
  flex: 1;
}
.preview-comment-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
}
.preview-comment-meta strong {
  color: var(--ink);
  overflow-wrap: anywhere;
}
.preview-comment-meta time,
.preview-comment-readonly {
  color: var(--muted);
  font-size: 10px;
}
.preview-comment-copy p {
  margin: 4px 0 0;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.preview-comment-form {
  display: grid;
  gap: 7px;
  margin-top: 2px;
}
.preview-comment-form textarea {
  width: 100%;
  min-height: 58px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  resize: vertical;
}
.preview-comment-form button {
  justify-self: end;
  padding: 6px 10px;
  font-size: 11px;
}
.comment-error {
  margin: 0;
  color: var(--error);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.preview-comment-readonly {
  margin: 0;
}
.error-text {
  color: var(--error);
}
@media (max-width: 600px) {
  .token-grid {
    grid-template-columns: repeat(auto-fill, minmax(95px, 1fr));
  }
  .token-card img {
    height: 115px;
  }
  .team-art-section .section-heading {
    align-items: flex-start;
  }
}
</style>
