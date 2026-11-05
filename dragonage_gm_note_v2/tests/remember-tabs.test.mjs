import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer, h, reactive, nextTick } from "vue";
import { rememberTabs, readTab, writeTabs, tabMemoryKey } from "../src/services/rememberTabs.mjs";

const memory = new Map();
globalThis.sessionStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
};
const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
  parentNode: () => null, nextSibling: () => null,
});
const store = () => reactive({
  state: { gmUser: { id: "gm" }, userRole: "gm", playerTeamId: null },
  getters: { campaignId: "campaign" },
});
function mount(state, choices = ["1", "2", "3"], entity = "") {
  const app = renderer.createApp({
    name: "TrackerTest",
    mixins: [rememberTabs({ selected: { choices: (vm) => vm.choices } }, () => entity)],
    data: () => ({ selected: null, choices }),
    render() { return h("div", this.selected); },
  });
  app.config.globalProperties.$store = state;
  return { app, vm: app.mount({}) };
}

test("returning to a screen restores the selected scenario instead of the first", () => {
  memory.clear();
  const state = store();
  const first = mount(state);
  first.vm.selected = "3";
  first.app.unmount();
  const second = mount(state);
  assert.equal(second.vm.selected, "3");
  second.app.unmount();
});

test("unavailable selections fall back to an accessible tab", async () => {
  memory.clear();
  const state = store();
  const first = mount(state);
  first.vm.selected = "3";
  first.app.unmount();
  const second = mount(state, ["1", "2"]);
  assert.equal(second.vm.selected, "1");
  second.vm.selected = "2";
  second.vm.choices = ["1"];
  await nextTick();
  assert.equal(second.vm.selected, "1");
  second.app.unmount();
});

test("account, campaign, preview team and detail entity have independent selections", () => {
  memory.clear();
  const state = store();
  const first = mount(state);
  first.vm.selected = "2";
  const initialKey = tabMemoryKey(first.vm);
  state.getters.campaignId = "another";
  assert.equal(first.vm.selected, "1");
  state.getters.campaignId = "campaign";
  assert.equal(first.vm.selected, "2");
  for (const mutate of [
    () => { state.state.gmUser.id = "another-user"; },
    () => { state.state.gmPlayerPreviewMode = true; state.state.gmPreviewTeamId = "team"; },
  ]) {
    mutate();
    assert.notEqual(tabMemoryKey(first.vm), initialKey);
    assert.equal(first.vm.selected, "1");
  }
  assert.notEqual(tabMemoryKey(first.vm, "npc-1"), tabMemoryKey(first.vm, "npc-2"));
  first.app.unmount();
});

test("corrupt or blocked browser storage does not break navigation", () => {
  memory.set("broken", "{bad");
  assert.equal(readTab("broken", "tab", ["all"], "all"), "all");
  const original = globalThis.sessionStorage;
  globalThis.sessionStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  try {
    assert.equal(readTab("key", "tab", ["all"], "all"), "all");
    assert.doesNotThrow(() => writeTabs("key", { tab: "all" }));
  } finally {
    globalThis.sessionStorage = original;
  }
});
