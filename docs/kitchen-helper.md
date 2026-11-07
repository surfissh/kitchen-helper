# Kitchen Helper — design and implementation notes

[中文](kitchen-helper.zh-CN.md) | English

This document explains how the Kitchen Helper AR application is put together, why the
reducer is separated from FusionUI, and how the HowToCook + DeepSeek pipeline degrades when
the network or the API key is unavailable.

Related documents: [application README](../apps/kitchen-helper/README.md),
[toolchain guide](toolchain.md), [Fedora compatibility](fedora-compatibility.md).

## Goals and constraints

- Run inside the IrisView Client / simulator as a 640×480 monocular AR HUD.
- Help a beginner cook one dish with minimal reading and almost no chrome.
- Pull the recipe from [HowToCook](https://github.com/Anduin2017/HowToCook) and structure it
  with the DeepSeek API.
- No ASR in the MVP: voice is simulated with text (the simulator text channel).
- Assume all SDK features work; the MVP is simulator-only.
- Typing `*` must force one task error so the error screen can be verified.

## Screen flow

```text
home ──confirm──► listening ──text──► loading ──success──► recipe
  ▲                  │                   │                   │
  │                  │ back              │ failure           │ confirm
  │                  ▼                   ▼                   ▼
  └──────────────── home ◄──────────── error ◄────────── prep
                                                             │ all cards removed
                                                             ▼
                                                          cooking
                                                             │ last step
                                                             ▼
                                                            done ──confirm──► home
```

Every transition is decided by `app-src/model/state.ts`. The controller in
`app-src/index.ts` only:

1. polls `takeNavigationAction()` and `takeTextInput()`;
2. feeds actions and clock deltas into the reducer;
3. executes returned effects (`load-recipe`, `ask-assistant`, `persist-completion`);
4. passes the new state to `AppRenderer`.

This separation makes the entire interaction model testable without the simulator.

## Interaction model

| Source       | Action           | Home                          | Prep                                       | Cooking                     |
| ------------ | ---------------- | ----------------------------- | ------------------------------------------ | --------------------------- |
| temple tap   | `activate`       | start listening               | mark card ready; when ready, start cooking | start timer, else next step |
| temple swipe | `up` / `down`    | —                             | switch ingredient/cookware row             | scroll step content         |
| temple swipe | `left` / `right` | move recommendation highlight | move card focus                            | next / previous step        |
| back gesture | `back`           | —                             | back to recipe                             | back to recipe              |
| text box     | command words    | same as above                 | same as above                              | same as above               |
| text box     | other words      | dish request                  | ignored                                    | ask the assistant           |

Command vocabulary is in `parseTextInput()`: `确认/确定/ok/enter`, `上/下/左/右`, `返回/back`,
and `*`. The text channel is also used by `FUSIONUI_DEMO_TEST_USER_TEXT` for automated demos.

## Timer semantics

- A step may declare zero or more timers (`StepTimerSpec[]`). In practice HowToCook recipes
  have 0–3 timed actions.
- On the cooking screen, `activate` first starts **every idle timer of the current step**. If
  no idle timer remains, it advances to the next step (“confirm conflict” rule).
- `left` always advances even if a timer has not been started; `right` goes back.
- Timers are owned by the cooking state, not by a screen, so they keep running while the user
  moves between steps. `visibleTimers()` returns every started timer plus the current step's
  idle timers, rendered as vertical bars.
- Progress is driven by the reducer clock. When a timer reaches zero it becomes `done`, turns
  green and keeps its label/time until the user finishes the dish.
- Step scrolling uses page indexes 0–2; `up/down` changes the page and the renderer animates
  the content offset.

## Preparation focus rules

- Ingredients sit above cookware; the top row is focused first.
- `left/right` clamp at row boundaries (no wrap); `up/down` switches rows when both are
  non-empty.
- Removing the focused card auto-selects the next card (or the previous one at the end). If a
  whole row becomes empty, focus moves to the other row.
- When every card is removed the screen shows “已准备好”; the next `activate` starts cooking.
- Only the cards around the focus are created in the FusionUI tree (window of three per row).
  This keeps the scene light enough for the simulator and matches the “~1.7 cards per row”
  visual density.

## Recipe pipeline

### 1. Search

`https://howtocook.aiursoft.com/Dashboard/Index?q=<dish>` is fetched with
`.AspNetCore.Culture=zh-CN`. The first `/Recipes/Detail/<id>` link and its card title are
parsed. No match produces a `not-found` error.

### 2. Material

The detail page is fetched with the same culture cookie. Two representations are extracted:

1. the “Edit on GitHub” link → canonical Markdown;
2. the visible page text as a fallback.

Markdown is read through `https://api.github.com/repos/Anduin2017/HowToCook/contents/...`
and base64-decoded. Direct raw GitHub access is intentionally not required.

### 3. Structuring

When `DEEPSEEK_API_KEY` is present the Markdown is sent to `deepseek-chat` with a strict JSON
schema prompt (`app-src/recipe/llm.ts`):

```json
{
  "titleZh": "...",
  "titleEn": "...",
  "summaryZh": "...",
  "summaryEn": "...",
  "difficulty": 2,
  "totalMinutes": 15,
  "servingsZh": "...",
  "servingsEn": "...",
  "caloriesKcal": 252,
  "ingredients": [
    { "nameZh": "...", "nameEn": "...", "amountZh": "...", "amountEn": "...", "icon": "tomato" }
  ],
  "cookware": [
    { "nameZh": "...", "nameEn": "...", "amountZh": "...", "amountEn": "...", "icon": "pan" }
  ],
  "steps": [
    {
      "titleZh": "...",
      "titleEn": "...",
      "instructionZh": "...",
      "instructionEn": "...",
      "tipZh": null,
      "tipEn": null,
      "timers": [{ "labelZh": "翻炒", "labelEn": "Stir-fry", "durationSeconds": 20 }],
      "heat": 2,
      "icon": "flame"
    }
  ]
}
```

The response is normalized: values are clamped, icons validated, timer durations bounded,
English fields fall back to Chinese, missing cookware gets a wok + spatula. Invalid JSON or
fewer than two steps raises `invalid` and triggers the error screen.

### 4. Local fallback

Without a key (or when DeepSeek fails) `extractLocalRecipe()` parses the Markdown directly:

- first heading → title; first paragraph → summary;
- `预估烹饪难度` and `预估卡路里` become metadata;
- “必备原料和工具” list → ingredients + cookware (keyword classifier);
- “计算” list → amounts (`name = amount`);
- numbered “操作” items → steps; nested bullets become beginner tips;
- explicit `X 秒/分钟/小时` in a step becomes a timer;
- keywords choose heat (0–3) and an icon.

Three beginner dishes are embedded as fully structured offline snapshots in
`recipe/recommended.ts`; they are used if the network fails for those dishes.

### 5. Assistant Q&A

While cooking, free text opens a modal. With a key, DeepSeek receives the dish, current step,
instruction and tip plus the question, and returns bilingual JSON. Without a key a local
keyword library answers common beginner questions (knife safety, heat, oil splashes, salt,
timing, starch, substitutions). Confirm closes the modal; its timers keep running.

## Error screen and `*`

`*` anywhere forces a `forced` error immediately (no request is made). Pipeline failures map
to:

| Code        | Trigger                                  | Retry                            |
| ----------- | ---------------------------------------- | -------------------------------- |
| `not-found` | HowToCook has no match                   | yes                              |
| `network`   | search/detail fetch failed               | yes                              |
| `llm`       | DeepSeek request/response failed         | yes                              |
| `invalid`   | structured JSON or local parser unusable | yes                              |
| `forced`    | user typed `*`                           | only when it interrupted a query |

The error screen shows a bilingual title/message, a technical detail line, and a retry
action when allowed. Back always returns home.

## Rendering and animation

- All layout is manual absolute positioning on a 640×480 `Board`; font sizes are intentionally
  large (13–44 px) for glanceability.
- Screens have **no header or footer chrome**; only core content is shown.
- Native `AnimationPlayback` clips are rejected by the MVP simulator profile (`release/off`),
  so `ui/anim.ts` animates the public `Style.opacity` from the app clock. This powers fades,
  focus pulses, the listening waveform, progress bars, confetti and the assistant modal.
- **Never animate a widget's position after it has been presented with styles of its own.**
  The simulator validates composition geometry and rejects frames that combine position
  animation with style/opacity changes — or that re-render text inside a moved parent — with
  `Composition geometry proof rejected` on the `reachable-envelope` stage, then
  `The display could not be updated`. The Client reports the app as needing attention, stops
  presenting frames and ignores input. The home recommendation carousel therefore keeps two
  fixed card slots and swaps their contents (text, icon, accent color) instead of sliding
  them; the focused slot is expressed with colors only. Style/opacity animation on widgets
  whose geometry never changes is safe and is what `ui/anim.ts` is used for.
- Icons are generated PNGs (`tools/generate-icons.py`) placed in `src/assets/icons`; the
  bundle resolves them relative to `__dirname` (the packaged `src/` directory).
- A zero-width native view also stalls presentation, so progress fills are never set to 0.

## Configuration and secrets

| Setting                           | Location                                                  |
| --------------------------------- | --------------------------------------------------------- |
| DeepSeek key                      | `app-src/config.ts` placeholder or `DEEPSEEK_API_KEY` env |
| DeepSeek base/model/timeout       | `app-src/config.ts`                                       |
| HowToCook site/repo/timeouts      | `app-src/config.ts`                                       |
| Application identity/capabilities | `FusionUIApp.json`                                        |

`FusionUIApp.json` declares `input.navigation` and `input.text` with `minimumHostVersion: 2`.

The API key is a development placeholder only. A key baked into a `.fuiapp` is readable by
anyone who obtains the package; production must use a backend token proxy.

## Verification

| Check                             | Result                                                                    |
| --------------------------------- | ------------------------------------------------------------------------- |
| `ivt test apps/kitchen-helper`    | pass — 5 files, 36 tests (reducer, parsers, LLM normalization, fallbacks) |
| `ivt package apps/kitchen-helper` | pass — `.fuiapp`, debug-unsigned                                          |
| `ivt smoke apps/kitchen-helper`   | pass — `IrisView application frame 1`                                     |
| Text injection `番茄炒蛋`         | pass — live search + local structuring → recipe screen                    |
| Text injection `*`                | pass — forced error screen                                                |
| Text injection `确认`             | pass — listening screen                                                   |

## Limitations

- No ASR/TTS; text simulates speech.
- Simulator network access is assumed; offline mode covers only three recipes.
- Only one guide flow at a time; no recipe history UI beyond the last dish count.
- Native animation playback is not used because the MVP simulator rejects it.
- Real glasses deployment/signing is out of scope.
