export function tabMemoryKey(vm, entity = "") {
  const state = vm.$store.state;
  return JSON.stringify([
    "gm-note-tabs-v1",
    state.gmUser?.id || "guest",
    vm.$store.getters.campaignId || "",
    state.userRole,
    state.gmPlayerPreviewMode ? state.gmPreviewTeamId : state.playerTeamId,
    vm.$options.name,
    entity,
  ]);
}

export function readTab(key, field, choices, fallback) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "{}")[field];
    return choices.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeTabs(key, values) {
  try {
    sessionStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Navigation still works when browser storage is unavailable.
  }
}

// Remember only navigation selections, with each screen defining valid tabs.
export function rememberTabs(fields, entity = () => "") {
  return {
    created() {
      let previousKey;
      this.$watch(
        () => tabMemoryKey(this, entity(this)),
        (key) => {
          if (previousKey) this.saveRememberedTabs(previousKey);
          previousKey = key;
          this.restoreRememberedTabs();
        },
        { immediate: true, flush: "sync" }
      );
      for (const [field, config] of Object.entries(fields)) {
        this.$watch(
          () => config.choices(this),
          (choices) => {
            if (choices.length && !choices.includes(this[field])) {
              this[field] = this.rememberedTab(field);
            }
          }
        );
      }
    },
    beforeUnmount() {
      this.saveRememberedTabs();
    },
    methods: {
      rememberedTab(field) {
        const config = fields[field];
        const choices = config.choices(this);
        return readTab(
          tabMemoryKey(this, entity(this)),
          field,
          choices,
          config.fallback ?? choices[0] ?? null
        );
      },
      restoreRememberedTabs() {
        for (const field of Object.keys(fields)) {
          this[field] = this.rememberedTab(field);
        }
      },
      saveRememberedTabs(key = tabMemoryKey(this, entity(this))) {
        const values = {};
        for (const [field, config] of Object.entries(fields)) {
          if (config.choices(this).includes(this[field])) {
            values[field] = this[field];
          }
        }
        writeTabs(key, values);
      },
    },
  };
}
