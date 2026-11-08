# Glide

English | [简体中文](README.zh-CN.md)

A quiet browser extension. A small frosted-glass pill sits in the corner of every page: **back to top · light/dark · reading mode · to bottom**. It stays invisible until you scroll or move the mouse toward it.

Glide asks for one permission, `storage`, to remember your settings. It makes no network requests and collects no data.

> The extension's interface (settings panel, tooltips, reading view) is currently in Simplified Chinese.

## The floating pill
- Four positions: bottom right (default), bottom left, right edge middle, left edge middle (set in the settings panel)
- Hidden by default; fades in while you scroll or when the mouse comes near, and fades out about 1.4 s after you stop
- ↑ hides when you're already at the top, ↓ hides at the bottom
- Works with web apps that scroll inside a container; in reading mode it scrolls the reading view
- Hides itself in fullscreen video and when printing

## Dark mode
- Switching expands as a circle from the button you clicked
- A soft dark gray background (#22242a by default) instead of pure black; images and videos keep their real colors
- **Auto-enable** (pick one):
  - Follow system: turns on for sites you haven't set manually when macOS or Windows switches to dark
  - Schedule: e.g. 19:00–07:00, can cross midnight; switches on time and re-checks right after the computer wakes
  - Off: dark mode only on sites where you turn it on yourself
- **Skips dark sites**: pages that are already dark are never inverted
- Remembers manual choices per site; switching back to whatever the auto rule would pick returns the site to auto

> Windows: Settings → Personalization → Colors → Choose your default app mode → Dark.
> In Chrome, Settings → Appearance → Mode should stay on "Device".

## Settings panel (click the Glide icon in the toolbar)
- Dark mode for this site, with one click to return it to auto
- Don't auto-enable on this site: for sites that don't invert well (you can still turn it on by hand)
- Dark-mode brightness for this site: 60%–140%, affects only this site; click the value to reset
- Auto-enable: follow system / schedule (start and end time) / off
- Background color: Graphite (default), Night Blue, Warm Brown, Ink Green, Pure Black; text brightness slider with live preview
- Pill position: bottom right, bottom left, right middle, left middle

## Reading mode
- Finds the article text and drops navigation, sidebars, comments, share buttons and ads
- Comfortable type size and line length, a reading progress bar, and an estimated reading time
- Open it with the book button on the pill (it stays highlighted while open); close with the same button, Esc, or the × in the top-right corner
- **Typography (Aa, top right)**: font size, line width (narrow / medium / wide), sans or serif, read-aloud speed; remembered for all sites
- **Read aloud (▶, top right)**: reads paragraph by paragraph with your system's built-in voices, highlighting and scrolling to the current paragraph.
  Starts from the first paragraph on screen; click any paragraph while it's reading to jump there.
  Prefers on-device voices (macOS "Tingting", Windows "Xiaoxiao / Huihui"), so no network is needed

## Install (Chrome / Edge / Arc)
1. Get the code: `git clone https://github.com/calabli/glide.git`, or on GitHub click **Code → Download ZIP** and unzip it
2. Open `chrome://extensions` (in Edge, `edge://extensions`)
3. Turn on **Developer mode** in the top-right corner
4. Click **Load unpacked** and choose the `glide` folder

After updating the code, click the reload ↻ button on Glide's card on the extensions page, then refresh the web page.

## Keyboard shortcuts

| Action | macOS | Windows |
| --- | --- | --- |
| Back to top | ⌥⇧↑ | Alt+Shift+↑ |
| To bottom | ⌥⇧↓ | Alt+Shift+↓ |
| Light / dark | ⌥⇧L | Alt+Shift+L |
| Reading mode | ⌥⇧R | Alt+Shift+R |

Change them at `chrome://extensions/shortcuts`.
