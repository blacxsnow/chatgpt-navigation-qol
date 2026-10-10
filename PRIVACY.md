# Privacy Policy — ChatGPT Navigation QoL

**The extension does not collect, transmit, sell, or share personal data. It does not make network requests.**

## What the extension does

The extension runs a content script on `https://chatgpt.com/*` and `https://chat.openai.com/*` to identify conversation messages and navigate between them.

It accesses message elements only to read their role-related attributes and on-screen position, allowing it to identify the message type, scroll the message into view, and briefly highlight it.

**The extension never reads, copies, stores, or transmits the text or content of your messages.** All processing takes place locally in your browser. The extension makes no network requests.

## Data stored

A single local setting is stored using Firefox's `storage.local`:

- whether the extension is enabled, and
- the navigation mode ("all messages" or "my prompts only").

This data stays on your device and is never transmitted anywhere. Removing the extension deletes it.

## Permissions

- `storage` — to remember the enabled/mode setting locally.
- Host access to `chatgpt.com` and `chat.openai.com` — required to run the content script on those pages only.

## Third parties

None. The extension does not contact any server, analytics service, or remote endpoint.

## Contact

Use the "Support site" / "Support email" links on the extension's addons.mozilla.org listing.
