<template>
  <section class="tagged-posts-panel" aria-label="이 캐릭터가 언급된 작품 글">
    <div class="tagged-posts-heading">
      <div>
        <span class="eyebrow">MENTIONED ARTWORK</span>
        <h3>{{ characterName || "캐릭터" }} 언급 글</h3>
      </div>
      <button
        class="outline-button"
        type="button"
        :disabled="loading"
        @click="loadPosts"
      >
        새로고침
      </button>
    </div>

    <p v-if="loading" class="tagged-posts-state">글을 불러오는 중…</p>
    <div v-else-if="error" class="tagged-posts-state error" role="alert">
      <p>{{ error }}</p>
      <button class="outline-button" type="button" @click="loadPosts">
        다시 불러오기
      </button>
    </div>
    <p v-else-if="!posts.length" class="tagged-posts-state">
      이 캐릭터가 언급된 작품 글이 없습니다.
    </p>
    <div v-else class="tagged-post-list">
      <article v-for="post in posts" :key="post.id" class="tagged-post card">
        <div class="tagged-post-meta">
          <strong>{{ post.nickname || "이전 작성자" }}</strong>
          <time :datetime="post.created_at">{{
            formatDate(post.created_at)
          }}</time>
        </div>
        <p v-if="post.content" class="tagged-post-content">
          {{ post.content }}
        </p>
        <div v-if="post.image_urls.length" class="tagged-post-images">
          <button
            v-for="(url, index) in post.image_urls"
            :key="`${post.id}-${index}`"
            class="tagged-post-image"
            type="button"
            :class="{ spoiler: post.is_spoiler && !revealed[post.id] }"
            :aria-label="
              post.is_spoiler && !revealed[post.id]
                ? '스포일러 이미지 보기'
                : '작품 이미지 보기'
            "
            @click="
              post.is_spoiler && !revealed[post.id]
                ? reveal(post.id)
                : openPost(post)
            "
          >
            <img :src="url" alt="작품 첨부 이미지" loading="lazy" />
            <span v-if="post.is_spoiler && !revealed[post.id]"
              >스포일러 · 눌러서 보기</span
            >
          </button>
        </div>
        <div class="tagged-post-footer">
          <span v-if="post.is_spoiler" class="spoiler-label">스포일러</span>
          <router-link class="text-button" :to="postRoute(post)">
            작품 게시판에서 보기 →
          </router-link>
        </div>
      </article>
    </div>
  </section>
</template>

<script>
import { supabase } from "@/supabase";

export default {
  name: "CharacterTaggedPostsPanel",
  props: {
    characterId: { type: String, required: true },
    characterName: { type: String, default: "" },
  },
  data() {
    return { posts: [], loading: false, error: "", revealed: {} };
  },
  watch: {
    characterId: {
      immediate: true,
      handler() {
        this.loadPosts();
      },
    },
  },
  methods: {
    async loadPosts() {
      if (!this.characterId) return;
      this.loading = true;
      this.error = "";
      try {
        const { data, error } = await supabase
          .from("team_art_posts")
          .select(
            "id, team_id, nickname, content, image_paths, is_spoiler, created_at"
          )
          .contains("character_tags", [this.characterId])
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = await Promise.all(
          (data || []).map(async (post) => {
            const paths = Array.isArray(post.image_paths)
              ? post.image_paths
              : [];
            const imageUrls = await Promise.all(
              paths.map(async (path) => {
                if (/^https?:\/\//i.test(path)) return path;
                const { data: signed, error: signedError } =
                  await supabase.storage
                    .from("free-board-images")
                    .createSignedUrl(path, 3600);
                return signedError ? "" : signed?.signedUrl || "";
              })
            );
            return { ...post, image_urls: imageUrls.filter(Boolean) };
          })
        );
        this.posts = rows;
        this.revealed = {};
      } catch (error) {
        this.posts = [];
        this.error = `언급된 작품 글을 불러오지 못했습니다. (${
          error.message || error
        })`;
      } finally {
        this.loading = false;
      }
    },
    reveal(postId) {
      this.revealed = { ...this.revealed, [postId]: true };
    },
    openPost(post) {
      this.$router.push(this.postRoute(post));
    },
    postRoute(post) {
      return {
        name: "free-board",
        query: {
          characterId: this.characterId,
          postId: post.id,
          ...(post.team_id ? { teamId: post.team_id } : {}),
        },
      };
    },
    formatDate(value) {
      return value ? new Date(value).toLocaleString("ko-KR") : "";
    },
  },
};
</script>

<style scoped>
.tagged-posts-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}
:global(.memory-tabs) {
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
:global(.memory-tabs::-webkit-scrollbar) {
  display: none;
}
:global(.memory-tab) {
  flex: 0 0 auto;
  white-space: nowrap;
}
.tagged-posts-heading,
.tagged-post-meta,
.tagged-post-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.tagged-post-meta {
  padding-inline: 0;
}
.tagged-posts-heading > div {
  padding-left: 14px;
}
.tagged-posts-heading h3 {
  margin: 4px 0 0;
}
.tagged-post-list {
  display: grid;
  gap: 12px;
}
.tagged-post {
  min-width: 0;
  padding: 14px;
}
.tagged-post-meta time,
.tagged-posts-state {
  color: var(--muted);
  font-size: 12px;
}
.tagged-post-content {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.tagged-post-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tagged-post-image {
  position: relative;
  width: min(180px, 42vw);
  height: 180px;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: var(--line);
  cursor: pointer;
}
.tagged-post-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tagged-post-image.spoiler img {
  filter: blur(12px);
}
.tagged-post-image span {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 8px;
  color: #fff;
  background: rgba(20, 20, 20, 0.45);
  font-size: 12px;
}
.tagged-post-footer {
  justify-content: flex-end;
  margin-top: 10px;
}
.spoiler-label {
  margin-right: auto;
  color: var(--muted);
  font-size: 11px;
}
.tagged-posts-state.error {
  color: var(--danger, #a33);
}
@media (max-width: 520px) {
  .tagged-post {
    padding: 11px;
  }
  .tagged-post-image {
    width: min(140px, 40vw);
    height: 140px;
  }
}
</style>
