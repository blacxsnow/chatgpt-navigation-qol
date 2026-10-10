# ChatGPT Navigation QoL

A small Firefox extension that makes navigating long ChatGPT conversations
faster. Press **Ctrl + ↑ / Ctrl + ↓** to jump to the previous or next message,
which is scrolled into view and briefly highlighted.

It is deliberately minimal and self-contained: it does not open tabs, does not
run a background page, does not touch the network, and does not collect any
data. It only runs on `chatgpt.com` and `chat.openai.com`.

## Why I built this

I use ChatGPT regularly for research and work. In long conversations, scrolling
back and forth to find a particular message becomes tedious, especially when I
want to revisit an earlier question or follow the discussion from a specific
point.

ChatGPT previously supported convenient keyboard navigation between messages
using `Ctrl + ↑` and `Ctrl + ↓`. After changes to the interface, this
functionality stopped working as it had before.

Rather than continue scrolling manually, I built this extension to restore that
workflow.

## Features

- **Message navigation:** Move between messages in a ChatGPT conversation using
  `Ctrl + ↑` and `Ctrl + ↓`.
- **Two navigation modes** (switchable from the toolbar popup):
  - Navigate between user messages only.
  - Navigate between user messages and assistant responses.
- **Simple toggle:** Switch between the two modes using a lightweight control.
- The focused message is centered and flashes a blue outline so you can see
  where you are.
- **Shift is left untouched**, so native text selection keeps working.
- A toolbar switch enables/disables the extension at any time.

The extension is designed to make long conversations easier to navigate without
changing how ChatGPT itself works.

## Scope

This extension currently focuses on keyboard-based message navigation.
Additional features, if any, will be documented as they are implemented and
tested.

## Install

### From addons.mozilla.org (recommended)

Once published, install it from its AMO listing page.

### Temporary (for testing)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` (or the packaged `.xpi`).
4. Reload any open ChatGPT tab.

Temporary add-ons are removed when Firefox restarts.

## Usage

1. Open a ChatGPT conversation.
2. Press **Ctrl + ↑** or **Ctrl + ↓** to move between messages.
3. Open the toolbar popup to enable/disable the extension or change what
   Ctrl + ↑ / Ctrl + ↓ visits.

## How it works

ChatGPT is a single-page app; the conversation is a scrollable region
containing one element per message. ChatGPT serves two different markups —
a full one when signed in and a "lightweight" one when logged out — so the
extension tries several selectors in order and uses the first that matches.

- **Signed-in UI**
  - scroller: `[data-app-action-timeline-scroll]`
  - message: `[data-chatgpt-search-unit-key]` (value encodes turn + role, e.g.
    `fallback-turn-2:0:user` / `fallback-turn-2:1:assistant`)
- **Logged-out ("lightweight") UI**
  - scroller: `[role="region"][aria-label="Conversation"]`
  - message: `li[data-message-role="user|assistant"]`
- **Legacy fallbacks:** `[data-message-author-role]`, `article[data-turn]`,
  `article[data-testid^="conversation-turn-"]`.

Role is read from the search-unit key suffix, `data-message-role`, or
`data-message-author-role`/`data-turn`.

On `Ctrl + ↑` / `Ctrl + ↓` the script:

1. collects the visible messages (or only the `:user` ones, depending on mode);
2. finds the message currently nearest the center of the scroller;
3. moves one step in the requested direction, scrolls it to the center with
   `scrollIntoView({ block: "center" })`, and flashes a highlight;
4. calls `preventDefault()` so ChatGPT's editor does not also move the caret.

The keydown listener is attached in the **capture phase on `window`** so it runs
before ChatGPT's own handlers. It only reacts to `Ctrl + ArrowUp/Down` without
Shift or Alt, leaving every other shortcut and text selection untouched.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3). |
| `content.js` | All navigation logic (runs on ChatGPT pages). |
| `popup.html` / `popup.css` / `popup.js` | Toolbar popup UI. |
| `icons/` | Extension icons. |
| `README.md`, `LICENSE`, `CHANGELOG.md`, `PRIVACY.md` | Documentation. |

## Development

- No build step and no runtime dependencies: the source is plain JavaScript.
- Syntax-check the sources:

  ```bash
  node --check content.js
  node --check popup.js
  ```

- Lint the extension with Mozilla's tool:

  ```bash
  npx web-ext lint --source-dir .
  ```

- Run it live:

  ```bash
  npx web-ext run --source-dir .
  ```

## Privacy

See [PRIVACY.md](PRIVACY.md). The extension collects and transmits no data.

## License

MIT — see [LICENSE](LICENSE).
