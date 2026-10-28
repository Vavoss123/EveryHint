# EveryHint design system — source audit, 2026-10-28

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
