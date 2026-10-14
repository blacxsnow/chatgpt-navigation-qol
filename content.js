"use strict";

// ChatGPT Navigation QoL
//
// Adds Ctrl+Up / Ctrl+Down navigation between messages in a ChatGPT
// conversation. Self-contained: no tab opening, no background page, and no
// network access.
//
// Selectors verified against the live ChatGPT DOM (2026):
//   - Each message:          [data-chatgpt-search-unit-key]  ("fallback-turn-N:M:user|assistant")
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

const TOP_GAP = 12;            // gap kept between the viewport top and the message
const SCROLL_SETTLE_MS = 700;  // ignore our own scroll events for this long
const HIGHLIGHT_MS = 1400;     // how long the blue outline stays visible

let extensionEnabled = false;
let userOnlyMode = false;
let navigationListenersAttached = false;
let highlightedMessage = null;
let highlightTimer = 0;
let highlightReapplyTimers = [];
let missingMessagesWarned = false;

// Explicit navigation cursor. It keeps repeated key presses moving one message
// at a time even while a smooth scroll is still animating; it is reset whenever
// the conversation changes or the user scrolls manually.
let navIndex = -1;
let navKey = "";
let suppressScrollResetUntil = 0;

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

// A stable identity for a message, used to re-find it if ChatGPT re-renders
// the node while the highlight is showing.
function messageKey(el) {
  return el.getAttribute?.("data-chatgpt-search-unit-key") ||
    el.getAttribute?.("id") || el.id || null;
}

function findMessageByKey(key) {
  if (!key) return null;
  const escaped = (window.CSS && CSS.escape) ? CSS.escape(key) : key.replace(/["\\]/g, "\\$&");
  for (const selector of [
    `[data-chatgpt-search-unit-key="${escaped}"]`,
    `[id="${escaped}"]`
  ]) {
    try {
      const el = document.querySelector(selector);
      if (el) return el;
    } catch {
      // Ignore an invalid selector and try the next one.
    }
  }
  return null;
}

function clearHighlightTimers() {
  if (highlightTimer) {
    clearTimeout(highlightTimer);
    highlightTimer = 0;
  }
  highlightReapplyTimers.forEach(clearTimeout);
  highlightReapplyTimers = [];
}

function clearNavigationHighlight() {
  clearHighlightTimers();
  if (highlightedMessage) {
    highlightedMessage.classList.remove(HIGHLIGHT_CLASS);
    highlightedMessage = null;
  }
}

function highlightTurn(el) {
  ensureHighlightStyle();
  clearNavigationHighlight();

  const key = messageKey(el);
  const apply = (node) => {
    if (!node) return;
    node.classList.add(HIGHLIGHT_CLASS);
    highlightedMessage = node;
  };

  apply(el);

  // If ChatGPT swaps the message node out mid-highlight, re-apply by key.
  highlightReapplyTimers = [250, 600].map((delay) => setTimeout(() => {
    if (highlightedMessage && highlightedMessage.isConnected) return;
    apply(findMessageByKey(key));
  }, delay));

  highlightTimer = setTimeout(clearNavigationHighlight, HIGHLIGHT_MS);
}

function conversationKey(userOnly) {
  return location.pathname + location.search + "|" + (userOnly ? "user" : "all");
}

// Index of the message at the top (or, for upward moves, the bottom) of the
// visible part of the scroller.
function visibleIndex(turns, container, fromBottom) {
  const rect = container.getBoundingClientRect();
  const visibleTop = Math.max(rect.top, 0) + 2;
  const visibleBottom = Math.min(rect.bottom, window.innerHeight) - 2;

  if (fromBottom) {
    let index = 0;
    for (let i = 0; i < turns.length; i += 1) {
      if (turns[i].getBoundingClientRect().top < visibleBottom) index = i;
    }
    return index;
  }

  for (let i = 0; i < turns.length; i += 1) {
    if (turns[i].getBoundingClientRect().bottom > visibleTop) return i;
  }
  return turns.length - 1;
}

// Scroll so the top of the message sits near the top of the visible area
// ("beginning of the message"), instead of centering it.
function scrollMessageToStart(target, container) {
  const containerTop = Math.max(container.getBoundingClientRect().top, 0);
  const delta = target.getBoundingClientRect().top - containerTop - TOP_GAP;

  if (typeof container.scrollBy === "function") {
    container.scrollBy({ top: delta, behavior: "smooth" });
  } else {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  suppressScrollResetUntil = Date.now() + SCROLL_SETTLE_MS;
}

function navigateTurns(direction, userOnly) {
  const turns = getTurns(userOnly);
  if (!turns.length) return false;

  const container = scrollContainerFor(turns[0]);
  const key = conversationKey(userOnly);

  if (navKey !== key || navIndex < 0 || navIndex >= turns.length) {
    navKey = key;
    navIndex = visibleIndex(turns, container, direction < 0);
  }

  const nextIndex = Math.max(0, Math.min(turns.length - 1, navIndex + direction));
  navIndex = nextIndex;

  const target = turns[nextIndex];
  scrollMessageToStart(target, container);
  highlightTurn(target);
  return true;
}

// A manual scroll invalidates the stored cursor, so the next key press starts
// again from whatever the user is actually looking at.
function handleScrollReset() {
  if (Date.now() < suppressScrollResetUntil) return;
  navIndex = -1;
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
    document.addEventListener("scroll", handleScrollReset, true);
    navigationListenersAttached = true;
    if (document.documentElement) document.documentElement.setAttribute(READY_ATTR, "1");
    return;
  }

  if (!enabled && navigationListenersAttached) {
    window.removeEventListener("keydown", handleKeydown, true);
    document.removeEventListener("scroll", handleScrollReset, true);
    navigationListenersAttached = false;
    navIndex = -1;
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
  if (changes.mode) {
    userOnlyMode = changes.mode.newValue === "prompts";
    navIndex = -1;
  }
});

initializeExtensionState();
