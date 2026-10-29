# EveryHint design system — source audit, 2026-10-28

## P11 privacy and release polish (2026-10-29)

Update controls use existing buttons/status surfaces, a brand-coloured native progress bar, explicit Cancel and Restart/install, and a native Later-default restart confirmation. The disabled Check button is accompanied by the exact missing signing/feed/key explanation. Untrusted remote HTML/release notes are not rendered. The user chose to retain the unconfigured state pending signing/hosting; it does not silently check or download.

Preserve EverySession #E01A34, offline Poppins headings/Inter body, warm neutrals and light/dark/system tokens. Settings adds a labelled native checkbox, configuration/error/limitation text and local version/unconfigured update state using existing panels and spacing. Persistent status says “Window protection: configured/off/not confirmed”; narrow compact mode uses “Privacy: set/off/?” with a complete accessible label and limitation tooltip. Configuration wording never asserts receiver invisibility. The compact 125% Live geometry regression exposed status wrapping; shorter nowrap copy restores visible question/answer/emergency controls and passes the existing check. No UI library or component redesign was introduced. Human Narrator/high-contrast/mixed-DPI/visual acceptance stays pending; automated screenshots are not human verification.

## P10 Calendar, People, memory and pre-call surfaces

Calendar/People reuse existing dashboard navigation, semantic surfaces, brand #E01A34, Poppins/Inter, cards, pill actions, forms/checkboxes/focus and scroll conventions. No EverySession source, palette, font, token, icon dependency or theme generator changed. Calendar has real locked/disconnected/empty/stale/cache states, day/seven-day/upcoming filters and supplied event/preparation/reminder details. People separates imported snapshots/manual overrides; saved choices show real titles/dates. Memory lives on People; privacy preferences live in Settings.

Preparation follows source selection → exact removable payload → fresh remote acknowledgement → streamed draft → deliberate copy/export/optional save. Source provenance/evidence and missing facts remain visible. Optional Live context lists staged source text with separate disabled-by-default enable/remote controls. Calendar suggestions and notification copy offer preparation/capture choice without joining/recording. Notification titles are generic unless chosen.

The compiled fixture-backed screenshots are in `artifacts/p10/`, produced by `scripts/smoke-context.mjs`; normal UI ships no sample records. Existing appearance/minimum-width/draft/focus regression smoke remains. Machine checks/screenshots do not replace human DPI, multi-monitor, keyboard, screen-reader, contrast/opacity or Windows-toast acceptance.

## Authentic source

EverySession was located locally at `C:\Users\Victor\OneDrive\Documents\mmaapp\MMAsyncApp`. `app.json` identifies the app as **EverySession**, version 1.1.0. Its repository HEAD at inspection was `1256e54dffebfd7b839d8b4b849dd62d22f372e5`; the working tree was clean. This source is read-only throughout this milestone. No EverySession component, configuration, asset or Git state is changed.

The source of truth is the actual mobile implementation, cross-checked against `EVERYSESSION_DESIGN_SYSTEM.md`. The audit is useful documentation, not an independent replacement for the code.

| Inspected source, relative to EverySession root | Verified evidence |
| --- | --- |
| `src/theme/colors.ts` | Fixed brand red, maroon, neutral surfaces, text, border, success and danger |
| `src/theme/clubTheme.ts` | Default red; accent darkening/lightening; contextual club gradients and foreground selection |
| `src/theme/typography.ts`, `App.tsx` | Poppins 600/700/800 headings; Inter 400/500/600/700 operational text; bundled font loading |
| `src/theme/index.ts` | Spacing 4/8/12/16/20/28; radii 10/14/26 |
| `src/components/Button.tsx` | Pill fill/outline, Inter 700/14px, loading/disabled states, contrast-aware label |
| `src/components/Card.tsx` | Opaque white, 14px radius/padding, 1px warm-grey border, no ordinary card shadow |
| `src/components/form.tsx` | Pale inputs, 10px corners, Inter labels/body, bounded modal sheet, fade |
| `src/components/GradientHeader.tsx`, `src/navigation/MainTabs.tsx` | Bounded accent header; simple icon navigation, explicit active destination |
| `src/screens/LoginScreen.tsx`, `EVERYSESSION_DESIGN_SYSTEM.md` | Poppins identity, restrained faceted red hero, compact hierarchy and clear content sheet |
| `assets/icon.png`, `assets/adaptive-icon.png`, notification assets | Existing EverySession assets inspected; not copied as an EveryHint logo |
| `node_modules/@expo-google-fonts/{inter,poppins}` | Authentic local font faces; their `LICENSE_FONT` files specify SIL OFL 1.1 |

PeerDesk's viewer CSS also mentions EverySession accents, but is a sibling adaptation and is **not** the palette authority. No public web search result was used to invent EverySession colours. No Cluely design, artwork or logo is copied.

## Confirmed palette and typography

| Source token | Confirmed value | Desktop use |
| --- | --- | --- |
| red / danger | `#E01A34` | Brand, primary buttons, capture emphasis and labelled destructive actions |
| maroon | `#5C0F26` | Deep brand identity |
| redDark | `#8C1030` | Defined in source but not an active mobile control; available as brand reference |
| bg / white | `#FFFFFF` | Light canvas/cards |
| surface | `#F6F5F5` | Secondary surfaces and inputs |
| border | `#EAE8E8` | Decorative dividers and card boundaries |
| text | `#181818` | Primary light-theme copy |
| muted | `#7A7878` | Source metadata; desktop secondary copy is slightly darker to meet contrast targets |
| redTint | `#FBE1E4` | Brand-tinted status/selection surface |
| success | `#1E8E5A` | Source success accent; desktop uses a darker success ink on pale surfaces |

Poppins headings and Inter body are bundled locally, with their original OFL notices. No remote font/CDN request is introduced. System sans-serif and monospace fallbacks remain available. The desktop scale normalises the mobile half-pixel sizes: 11/12px metadata, 14px body, 16/20/24px headings. Body copy uses a comfortable line height. Font swapping during local load is a desktop adaptation; exact pixel parity with React Native rendering is not claimed.

## Desktop extensions and boundaries

EverySession has no verified canonical dark palette or warning token. EveryHint's dark surfaces, warning/information semantics, hover/pressed states, stronger keyboard focus, accessible control borders, opacity setting, responsive dashboard rail and window elevation are **documented desktop extensions**, not invented EverySession source values. The source's club-colour customisation is not an EveryHint feature in this milestone.

Primary geometry follows the source: 14px cards, 10px inputs, pill actions, 4–28px spacing, restrained borders, little elevation. The desktop shell uses the same visual hierarchy across compact overlay, expanded assistant and dashboard. The compact overlay fits its existing 190px height; emergency capture controls remain outside scrolling/collapsible content. Navigation at narrow widths wraps/scrolls without hiding the current destination or Stop.

Tokens are centralised in `resources/design-tokens.json`; `scripts/build-theme.mjs` generates `src/renderer/src/theme/tokens.css`. Run `npm run theme:build` after token changes. Components use semantic variables for brand, surface, text, border, status, interaction, type, spacing, radii and elevation. Native window/tray colours consume the same token source. Local font declarations are in `theme/fonts.css`. Light is the verified-brand default; Dark and System are user-selectable desktop adaptations.

WCAG-conscious checks cover at least 4.5:1 for normal text/primary actions and 3:1 for focus/control boundaries. The original light border is decorative; interactive controls get a stronger outline. State also has text/icons. Disabled controls are labelled and never the sole route to Pause/Stop. Reduced-motion preferences disable transitions. Native opacity is limited to 80–100%; contrast is assessed at full opacity because the underlying desktop is outside the app's control.

## Acceptance

Automated checks: token generation consistency, contrast pairs, legacy settings migration, appearance validation, real Electron light/dark/system selection, all layouts, narrow/zoomed windows, panel collapse, keyboard focus, unchanged capture/AI consent gates and local font loading. Screenshots are app-only, synthetic and ignored under `artifacts/`.

Manual Windows checks remain: 100/125/150/200% display scaling, mixed-DPI/multi-monitor movement, native resize/drag/opacity, high contrast and screen reader, visible focus with keyboard-only navigation, real capture/transcription/AI workflows, tray/hotkey conflicts, text reflow and light/dark visual review against the actual EverySession app. Source matching is code-verified; human pixel/brand acceptance is not claimed. No screenshot reference for a desktop EverySession dark theme exists.

## P9 controls

Modes, Knowledge, language preferences and template editors reuse the same brand red, local Poppins/Inter, semantic surfaces/borders, pill buttons, 14px cards, 10px fields, spacing and focus states. The existing vector icon system gains a simple Coding glyph; chosen mode icons render on cards. One compact title-bar mode selector stays consistent across overlay, assistant and dashboard, with narrow-width brand text adaptation. Scoped personal-page styles give text fields, checkboxes, fieldsets and wrapping action rows the same controls as P8. No new visual identity, remote font/asset or fake document/meeting is introduced. Real empty/locked/error/processing/partial states and exact excerpt/source disclosure are functional. Template preview uses labelled placeholders, never fabricated user notes.

P9 app-only screenshots are ignored under `artifacts/p9/`; automated compact/narrow/theme/focus regressions remain distinct from the still-open physical Windows DPI, high-contrast, Narrator and human visual acceptance checklist.
