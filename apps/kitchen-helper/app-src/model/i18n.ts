/**
 * Bilingual UI copy. The Client reports its display language once at startup;
 * every label is available in Simplified Chinese and English.
 */

import type { Localized, UiLanguage } from "./types.ts";

export function pick(value: Localized, language: UiLanguage): string {
  return language === "zh" ? value.zh : value.en;
}

export const COPY = {
  appName: { zh: "厨房助手", en: "Kitchen Helper" },
  appTagline: { zh: "AR 新手烹饪引导", en: "AR cooking coach for beginners" },
  poweredBy: { zh: "食谱来自 HowToCook", en: "Recipes from HowToCook" },
  homeTitle: { zh: "今天想做点什么？", en: "What are we cooking today?" },
  homeSubtitle: {
    zh: "按下确认键，说出你的菜名",
    en: "Press confirm, then say the dish you want",
  },
  homeRecommend: { zh: "新手推荐", en: "Beginner picks" },
  homeRecent: { zh: "上次完成", en: "Last cooked" },
  homeCompleted: { zh: "已完成 {n} 道菜", en: "{n} dishes completed" },
  homeNoRecent: { zh: "你的第一道菜等着你", en: "Your first dish is waiting" },
  homeSpeakCta: { zh: "按下确认 · 开始点菜", en: "Confirm · Start ordering" },
  homeCarouselHint: { zh: "左右滑动查看推荐", en: "Swipe left or right for picks" },
  listeningTitle: { zh: "我在听", en: "I'm listening" },
  listeningSubtitle: {
    zh: "说出你想做的菜，例如「番茄炒蛋」",
    en: "Say the dish you want, e.g. “tomato and eggs”",
  },
  listeningExampleLabel: { zh: "可以试试", en: "Try saying" },
  listeningCaveat: {
    zh: "MVP 模拟：请在模拟器输入框中发送文字",
    en: "MVP simulation: type into the simulator input box",
  },
  cancel: { zh: "返回", en: "Back" },
  loadingSearch: { zh: "正在搜索 HowToCook 食谱", en: "Searching HowToCook" },
  loadingFetch: { zh: "正在读取菜谱原文", en: "Reading the recipe" },
  loadingStructure: { zh: "AI 正在整理成 AR 步骤", en: "AI is structuring AR steps" },
  loadingFinish: { zh: "马上就好", en: "Almost ready" },
  loadingHint: { zh: "正在为小白的你准备每一步", en: "Preparing every step for a beginner" },
  loadingStep1: { zh: "搜索菜谱", en: "Search" },
  loadingStep2: { zh: "读取原文", en: "Read" },
  loadingStep3: { zh: "AI 结构化", en: "Structure" },
  difficulty: { zh: "难度", en: "Difficulty" },
  duration: { zh: "预计用时", en: "Time" },
  servings: { zh: "份量", en: "Servings" },
  calories: { zh: "热量", en: "Calories" },
  ingredientsCount: { zh: "原料", en: "Ingredients" },
  cookwareCount: { zh: "厨具", en: "Cookware" },
  stepsCount: { zh: "步骤", en: "Steps" },
  minutesUnit: { zh: "分钟", en: "min" },
  kcalUnit: { zh: "千卡", en: "kcal" },
  recipeReadyTitle: { zh: "菜谱准备好了", en: "Your recipe is ready" },
  recipeReadyHint: {
    zh: "确认后先准备原料和厨具，再开始做菜",
    en: "Confirm to prepare ingredients and tools",
  },
  recipeStart: { zh: "按下确认 · 开始准备", en: "Confirm · Start preparing" },
  prepTitle: { zh: "事前准备", en: "Get everything ready" },
  prepSubtitle: {
    zh: "左右切换卡片，上下换行；确认表示已备好",
    en: "Swipe to browse, tap confirm when an item is ready",
  },
  prepIngredientsRow: { zh: "原料", en: "Ingredients" },
  prepCookwareRow: { zh: "厨具", en: "Cookware" },
  prepReady: { zh: "已准备好", en: "All set" },
  prepReadyHint: { zh: "按下确认 · 开始做菜", en: "Confirm · Start cooking" },
  prepProgress: { zh: "已备好 {done}/{total}", en: "{done}/{total} ready" },
  prepRemaining: { zh: "还剩 {n}", en: "{n} left" },
  prepEmptyRow: { zh: "这一行已清空", en: "Nothing left in this row" },
  prepRemoveHint: { zh: "确认 = 已备好，并从列表移除", en: "Confirm = ready, remove from list" },
  prepRowSwitchHint: { zh: "下划切换到厨具", en: "Swipe down for cookware" },
  cooking: { zh: "做菜中", en: "Cooking" },
  stepLabel: { zh: "步骤 {current}/{total}", en: "Step {current}/{total}" },
  stepHint: { zh: "确认 = 开始倒计时 / 下一步", en: "Confirm = start timer / next step" },
  stepScrollHint: { zh: "上下滑动阅读更多", en: "Swipe up/down to read more" },
  stepPrevNextHint: {
    zh: "左划下一步 · 右划上一步",
    en: "Swipe left for next · right for previous",
  },
  timerIdleHint: { zh: "按确认开始倒计时", en: "Confirm to start countdown" },
  timerDone: { zh: "完成", en: "Done" },
  timerLabel: { zh: "计时", en: "Timer" },
  askHint: {
    zh: "直接说出你的疑问，例如「切菜有什么技巧」",
    en: "Ask anything, e.g. “Any knife tips?”",
  },
  heatNone: { zh: "无需开火", en: "No heat" },
  heatLow: { zh: "小火", en: "Low heat" },
  heatMedium: { zh: "中火", en: "Medium heat" },
  heatHigh: { zh: "大火", en: "High heat" },
  assistant: { zh: "厨房助手", en: "Kitchen Helper" },
  assistantThinking: { zh: "正在想…", en: "Thinking…" },
  assistantQuestion: { zh: "你的问题", en: "You asked" },
  assistantClose: { zh: "按确认关闭", en: "Confirm to close" },
  assistantNoKey: {
    zh: "未配置 DeepSeek API Key，先给你一条本地小贴士。",
    en: "No DeepSeek API key configured; here is a local tip.",
  },
  doneTitle: { zh: "完成啦！", en: "Dish complete!" },
  doneSubtitle: { zh: "你已经把这道菜做出来了", en: "You cooked it from start to finish" },
  doneTime: { zh: "用时 {time}", en: "Cooking time {time}" },
  doneSteps: { zh: "共 {n} 步", en: "{n} steps" },
  doneAgain: { zh: "按确认 · 再来一道", en: "Confirm · Cook another dish" },
  doneConfettiHint: { zh: "享受你的作品吧", en: "Enjoy your creation" },
  errorTitle: { zh: "出了点小状况", en: "Something went wrong" },
  errorHint: { zh: "别担心，食材还在", en: "Don't worry, your ingredients are fine" },
  errorRetry: { zh: "按确认 · 重试", en: "Confirm · Retry" },
  errorHome: { zh: "按返回键 · 回到首页", en: "Back · Return home" },
  errorForced: { zh: "已触发强制异常测试（*）", en: "Forced error test triggered (*)" },
  errorForcedDetail: {
    zh: "这是用于验证异常界面的测试入口。返回后可以重新点菜。",
    en: "This path verifies the error screen. Go back and order again.",
  },
  errorNotFound: { zh: "没有找到这道菜", en: "Recipe not found" },
  errorNotFoundDetail: {
    zh: "换个说法试试，或从首页推荐里选一道。",
    en: "Try another name, or pick one of the home recommendations.",
  },
  errorNetwork: { zh: "网络好像不太稳定", en: "The network looks unstable" },
  errorNetworkDetail: {
    zh: "检查网络后重试；已内置的推荐菜谱可以离线使用。",
    en: "Check the connection and retry; built-in picks work offline.",
  },
  errorLlm: { zh: "AI 整理菜谱时卡住了", en: "The AI got stuck structuring the recipe" },
  errorLlmDetail: {
    zh: "可以重试一次，或换一道更常见的菜。",
    en: "Retry once, or pick a more common dish.",
  },
  errorInvalid: { zh: "菜谱内容不完整", en: "The recipe was incomplete" },
  errorInvalidDetail: {
    zh: "这次返回的步骤不够完整，换一道菜或重试。",
    en: "The returned steps were incomplete. Retry or pick another dish.",
  },
  backHome: { zh: "返回首页", en: "Home" },
  confirm: { zh: "确认", en: "Confirm" },
  tap: { zh: "点按", en: "Tap" },
  gestureHint: { zh: "眼镜腿滑动", en: "Temple swipe" },
  voiceHint: { zh: "文字模拟语音", en: "Type to simulate voice" },
  sourceLabel: { zh: "来源", en: "Source" },
  aiStructured: { zh: "DeepSeek 结构化", en: "Structured by DeepSeek" },
  localStructured: { zh: "本地解析（未配置 Key）", en: "Local parser (no API key)" },
  tipPrefix: { zh: "小贴士", en: "Tip" },
  languageLabel: { zh: "中文", en: "EN" },
  step: { zh: "步骤", en: "Step" },
  of: { zh: "/", en: "/" },
  secondsShort: { zh: "秒", en: "s" },
  minutesShort: { zh: "分", en: "m" },
} as const;

export type CopyKey = keyof typeof COPY;

export function text(
  key: CopyKey,
  language: UiLanguage,
  values?: Record<string, string | number>,
): string {
  let value: string = COPY[key][language];
  if (!values) return value;
  for (const [name, replacement] of Object.entries(values)) {
    value = value.split(`{${name}}`).join(String(replacement));
  }
  return value;
}

/** Format `mm:ss`, rounding up so a fresh 20 s timer reads 0:20. */
export function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatMinutes(minutes: number, language: UiLanguage): string {
  const rounded = Math.max(1, Math.round(minutes));
  return language === "zh" ? `${rounded} 分钟` : `${rounded} min`;
}

export function formatStars(difficulty: number): string {
  const count = Math.max(1, Math.min(5, Math.round(difficulty)));
  return "★".repeat(count) + "☆".repeat(5 - count);
}

/** English plural helper used by a handful of counters. */
export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}
