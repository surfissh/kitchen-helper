/** Pure, unit-testable application logic. */

export type UiLanguage = "zh" | "en";

export function uiLanguage(displayLanguage: "zh" | "en"): UiLanguage {
  return displayLanguage;
}

export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

export function launchLabel(launches: number, language: UiLanguage): string {
  if (language === "zh") return `第 ${launches} 次启动`;
  return `Launch ${launches}`;
}

export function subtitle(language: UiLanguage): string {
  return language === "zh"
    ? "TypeScript 应用已在模拟器中运行"
    : "A TypeScript application running in the simulator";
}
