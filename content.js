"use strict";

// ChatGPT Navigation QoL
//
// Adds Ctrl+Up / Ctrl+Down navigation between messages in a ChatGPT
// conversation. Self-contained: no tab opening, no background page, and no
// network access.
//
// Selectors verified against the live ChatGPT DOM (2026):
//   - Each message:        [data-chatgpt-search-unit-key]  ("fallback-turn-N:M:user|assistant")
//   - Conversation scroller: [data-app-action-timeline-scroll]
// Older attributes are kept as fallbacks in case the UI changes back.

const MESSAGE_SELECTORS = [
  // Signed-in UI: each message carries a search-unit key ("fallback-turn-N:M:role").
  "[data-chatgpt-search-unit-key]",
  // Logged-out / "lightweight" UI: each message is <li data-message-role="user|assistant">.
  "li[data-message-role]",
  "[data-message-role]",
  // Older / alternate markup.
  "[data-message-author-role]",
  "article[data-turn]",
  'article[data-testid^="conversation-turn-"]'
];

const SCROLLER_SELECTORS = [
  "[data-app-action-timeline-scroll]",
  '[role="region"][aria-label="Conversation"]',
  ".thread-scroll-container"
];

const HIGHLIGHT_CLASS = "cgmn-nav-highlight";
const HIGHLIGHT_STYLE_ID = "cgmn-nav-highlight-style";
const READY_ATTR = "data-cgmn-ready";

let extensionEnabled = false;
let userOnlyMode = false;
let navigationListenersAttached = false;
let highlightedMessage = null;
let highlightTimer = 0;
let missingMessagesWarned = false;

function isElementVisible(el) {
  return Boolean(el) && (el.getClientRects().length > 0 || el.offsetParent !== null);
}

function roleOf(el) {
  const key = el.getAttribute?.("data-chatgpt-search-unit-key");
  if (key) {
    if (key.endsWith(":user")) return "user";
    if (key.endsWith(":assistant")) return "assistant";
  }

  const role = el.getAttribute?.("data-message-role");
  if (role) return role;

  const direct = el.getAttribute?.("data-message-author-role") || el.getAttribute?.("data-turn");
  if (direct) return direct;

  const inner = el.querySelector?.("[data-message-role], [data-message-author-role], [data-turn]");
  return inner?.getAttribute?.("data-message-role") ||
    inner?.getAttribute?.("data-message-author-role") ||
    inner?.getAttribute?.("data-turn") || null;
}

function getAllMessages() {
  for (const selector of MESSAGE_SELECTORS) {
    const visible = Array.from(document.querySelectorAll(selector)).filter(isElementVisible);
    if (!visible.length) continue;

    // If the markup nests one match inside another, keep only the outermost.
    const set = new Set(visible);
    return visible.filter((node) => {
      let parent = node.parentElement;
      while (parent) {
        if (set.has(parent)) return false;
        parent = parent.parentElement;
      }
      return true;
    });
  }
  return [];
}

function getTurns(userOnly) {
  const messages = getAllMessages();
  if (!userOnly) return messages;
  return messages.filter((el) => roleOf(el) === "user");
}

function conversationScroller() {
  for (const selector of SCROLLER_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function isScrollable(el) {
  if (!(el instanceof Element)) return false;
  if (el.scrollHeight <= el.clientHeight + 4) return false;
  const overflowY = getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

function scrollContainerFor(el) {
  const explicit = conversationScroller();
  if (explicit) return explicit;

  let node = el?.parentElement || null;
  while (node && node !== document.documentElement) {
    if (isScrollable(node)) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function ensureHighlightStyle() {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent =
    "." + HIGHLIGHT_CLASS + "{" +
    "outline:2px solid #3b5bff;outline-offset:4px;border-radius:12px;" +
    "transition:outline-color .15s ease;}";
  (document.head || document.documentElement).appendChild(style);
}

function clearNavigationHighlight() {
  if (highlightTimer) {
    clearTimeout(highlightTimer);
    highlightTimer = 0;
  }
  if (highlightedMessage) {
    highlightedMessage.classList.remove(HIGHLIGHT_CLASS);
    highlightedMessage = null;
  }
}

function highlightTurn(el) {
  ensureHighlightStyle();
  clearNavigationHighlight();
  el.classList.add(HIGHLIGHT_CLASS);
  highlightedMessage = el;
  highlightTimer = setTimeout(() => {
    el.classList.remove(HIGHLIGHT_CLASS);
    if (highlightedMessage === el) highlightedMessage = null;
    highlightTimer = 0;
  }, 1200);
}

// Index of the message currently closest to the middle of the scroll viewport.
// Using the centre means that after we centre a message, re-running this returns
// that same message, so repeated presses move one step at a time.
function currentTurnIndex(turns, container) {
  const rect = container.getBoundingClientRect();
  const viewportCenter = rect.top + rect.height / 2;
  let bestIndex = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < turns.length; i += 1) {
    const turnRect = turns[i].getBoundingClientRect();
    const turnCenter = turnRect.top + turnRect.height / 2;
    const distance = Math.abs(turnCenter - viewportCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function navigateTurns(direction, userOnly) {
  const turns = getTurns(userOnly);
  if (!turns.length) return false;

  const container = scrollContainerFor(turns[0]);
  const index = currentTurnIndex(turns, container);
  const nextIndex = Math.max(0, Math.min(turns.length - 1, index + direction));

  if (nextIndex === index) {
    // Already at the first/last message: still flash the highlight so the user
    // gets feedback that the boundary was reached.
    highlightTurn(turns[nextIndex]);
    return true;
  }

  const target = turns[nextIndex];
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  highlightTurn(target);
  return true;
}

function swallowEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function handleKeydown(event) {
  if (!extensionEnabled) return;
  if (event.defaultPrevented) return;
  if (event.metaKey) return;
  if (!event.ctrlKey || event.shiftKey || event.altKey) return;

  const direction = event.key === "ArrowDown" ? 1 : (event.key === "ArrowUp" ? -1 : 0);
  if (direction === 0) return;

  let handled = false;
  try {
    handled = navigateTurns(direction, userOnlyMode);
  } catch (error) {
    console.error("ChatGPT Navigation QoL: navigation failed", error);
  }

  if (handled) {
    swallowEvent(event);
  } else if (!missingMessagesWarned) {
    missingMessagesWarned = true;
    console.info("ChatGPT Navigation QoL: no messages found with the current selectors.");
  }
}

// Capture on window so this runs before ChatGPT's own handlers, which may stop
// propagation at document level.
function setListeners(enabled) {
  extensionEnabled = enabled;

  if (enabled && !navigationListenersAttached) {
    window.addEventListener("keydown", handleKeydown, true);
    navigationListenersAttached = true;
    if (document.documentElement) document.documentElement.setAttribute(READY_ATTR, "1");
    return;
  }

  if (!enabled && navigationListenersAttached) {
    window.removeEventListener("keydown", handleKeydown, true);
    navigationListenersAttached = false;
    clearNavigationHighlight();
  }
}

async function initializeExtensionState() {
  let enabled = true;
  let mode = "all";
  try {
    const stored = await browser.storage.local.get(["enabled", "mode"]);
    enabled = stored.enabled !== false;
    mode = stored.mode === "prompts" ? "prompts" : "all";
  } catch (error) {
    console.error("ChatGPT Navigation QoL: cannot read enabled state", error);
  }

  userOnlyMode = mode === "prompts";
  setListeners(enabled);

  const markReady = () => {
    if (extensionEnabled && document.documentElement) {
      document.documentElement.setAttribute(READY_ATTR, "1");
    }
  };
  markReady();
  document.addEventListener("DOMContentLoaded", markReady, { once: true });
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.enabled) setListeners(changes.enabled.newValue !== false);
  if (changes.mode) userOnlyMode = changes.mode.newValue === "prompts";
});

initializeExtensionState();
