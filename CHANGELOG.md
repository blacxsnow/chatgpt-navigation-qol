# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.0.1]

### Changed
- `Ctrl + ↑` / `Ctrl + ↓` now scrolls to the **beginning** of the message
  instead of centering it.
- More reliable stepping: repeated presses advance one message at a time and no
  longer lose the current position while the scroll is still animating. The
  position resets when you scroll the conversation manually.

## [1.0.0]

### Added
- Navigate between messages in a ChatGPT conversation with `Ctrl + ↑` / `Ctrl + ↓`.
- Centered scroll with a blue highlight on the focused message.
- Toolbar popup with an enable/disable toggle.
- Navigation modes: all messages, or your prompts only.
- Works in both the signed-in and logged-out ChatGPT UIs.
