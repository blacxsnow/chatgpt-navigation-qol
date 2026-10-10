"use strict";

const toggle = document.getElementById("enabled");
const statusLabel = document.getElementById("statusText");
const modeField = document.getElementById("mode");

function paintToggle(on) {
  toggle.checked = on;
  statusLabel.textContent = on ? "Enabled" : "Disabled";
}

function paintMode(mode) {
  modeField.value = mode === "prompts" ? "prompts" : "all";
}

async function hydrate() {
  try {
    const saved = await browser.storage.local.get(["enabled", "mode"]);
    paintToggle(saved.enabled !== false);
    paintMode(saved.mode);
  } catch (error) {
    console.error("ChatGPT Navigation QoL: could not load settings", error);
    paintToggle(true);
    paintMode("all");
  }
}

toggle.addEventListener("change", async () => {
  const on = toggle.checked;
  paintToggle(on);
  try {
    await browser.storage.local.set({ enabled: on });
  } catch (error) {
    console.error("ChatGPT Navigation QoL: could not save enabled state", error);
    paintToggle(!on);
  }
});

modeField.addEventListener("change", async () => {
  const mode = modeField.value === "prompts" ? "prompts" : "all";
  paintMode(mode);
  try {
    await browser.storage.local.set({ mode });
  } catch (error) {
    console.error("ChatGPT Navigation QoL: could not save mode", error);
  }
});

hydrate();
