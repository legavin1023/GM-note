<template>
  <span class="auto-link-text"
    ><template v-for="(part, index) in parts" :key="index"
      ><a
        v-if="part.href"
        :href="part.href"
        target="_blank"
        rel="noopener noreferrer"
        @click.stop
        >{{ part.text }}</a
      ><template v-else>{{ part.text }}</template></template
    ></span
  >
</template>

<script>
import { autoLinkParts } from "@/services/autoLinks.mjs";

export default {
  name: "AutoLinkText",
  props: {
    text: { type: String, default: "" },
  },
  computed: {
    parts() {
      return autoLinkParts(this.text);
    },
  },
};
</script>

<style scoped>
.auto-link-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.auto-link-text a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
