/**
 * Home-screen picks plus fully structured offline snapshots.
 *
 * The snapshots are derived from the public HowToCook recipes (Unlicense) and
 * are only used when the live site and the LLM are unavailable. They keep the
 * simulator demo usable without a network connection or an API key.
 */

import type {
  IconKey,
  Localized,
  PrepItem,
  Recipe,
  RecipeStep,
  RecommendedRecipe,
} from "../model/types.ts";

const zh = (text: string): Localized => ({ zh: text, en: text });

function item(
  id: string,
  nameZh: string,
  nameEn: string,
  amountZh: string,
  amountEn: string,
  icon: IconKey,
): PrepItem {
  return { id, name: { zh: nameZh, en: nameEn }, amount: { zh: amountZh, en: amountEn }, icon };
}

function step(
  id: string,
  title: [string, string],
  instruction: [string, string],
  icon: IconKey,
  heat: 0 | 1 | 2 | 3,
  timers: { label: [string, string]; durationSeconds: number }[] = [],
  tip?: [string, string],
): RecipeStep {
  return {
    id,
    title: { zh: title[0], en: title[1] },
    instruction: { zh: instruction[0], en: instruction[1] },
    tip: tip ? { zh: tip[0], en: tip[1] } : undefined,
    timers: timers.map((timer, index) => ({
      id: `${id}-t${index}`,
      label: { zh: timer.label[0], en: timer.label[1] },
      durationSeconds: timer.durationSeconds,
    })),
    heat,
    icon,
  };
}

export const RECOMMENDED_RECIPES: readonly RecommendedRecipe[] = [
  {
    id: "tomato-eggs",
    title: { zh: "番茄炒蛋", en: "Tomato & Eggs" },
    subtitle: { zh: "酸甜开胃 · 新手零失败", en: "Sweet, tangy, beginner-proof" },
    minutes: 15,
    difficulty: 2,
    icon: "tomato",
    query: "番茄炒蛋",
    accent: "orange",
  },
  {
    id: "cola-wings",
    title: { zh: "可乐鸡翅", en: "Cola Chicken Wings" },
    subtitle: { zh: "咸甜下饭 · 一锅到底", en: "Sticky, savory, one pan" },
    minutes: 40,
    difficulty: 3,
    icon: "meat",
    query: "可乐鸡翅",
    accent: "pink",
  },
  {
    id: "hot-sour-potato",
    title: { zh: "酸辣土豆丝", en: "Hot & Sour Potato" },
    subtitle: { zh: "脆爽快手 · 练刀工", en: "Crisp, quick, knife practice" },
    minutes: 20,
    difficulty: 2,
    icon: "vegetable",
    query: "酸辣土豆丝",
    accent: "teal",
  },
];

const tomatoEggs: Recipe = {
  title: { zh: "番茄炒蛋", en: "Tomato & Scrambled Eggs" },
  summary: {
    zh: "酸甜开胃的家常菜，嫩滑鸡蛋裹着软烂多汁的番茄，备菜到出锅约 15 分钟。",
    en: "A tangy home-style classic: silky eggs folded into juicy tomatoes, about 15 minutes start to finish.",
  },
  difficulty: 2,
  totalMinutes: 15,
  servings: { zh: "1–2 人份", en: "Serves 1–2" },
  caloriesKcal: 252,
  ingredients: [
    item("tomato", "西红柿", "Tomatoes", "2 个（约 360g）", "2 medium (360 g)", "tomato"),
    item("egg", "鸡蛋", "Eggs", "3 个", "3 large", "egg"),
    item("oil", "食用油", "Cooking oil", "2 汤匙", "2 tbsp", "oil"),
    item("salt", "盐", "Salt", "2 g", "2 g", "seasoning"),
    item("sugar", "白糖（可选）", "Sugar (optional)", "1 茶匙", "1 tsp", "seasoning"),
    item("scallion", "葱花（可选）", "Scallions (optional)", "1 汤匙", "1 tbsp", "vegetable"),
  ],
  cookware: [
    item("wok", "炒锅", "Wok", "1 口", "1", "pan"),
    item("spatula", "锅铲", "Spatula", "1 把", "1", "knife"),
    item("bowl", "搅拌碗", "Mixing bowl", "1 个", "1", "bowl"),
  ],
  steps: [
    step(
      "prep-tomato",
      ["处理西红柿", "Prep tomatoes"],
      [
        "西红柿洗净去蒂，切成不超过 4cm 的小块。",
        "Wash and core the tomatoes, then cut into bite-sized chunks.",
      ],
      "tomato",
      0,
      [],
      [
        "想口感更细，可以先用开水烫皮再剥掉。",
        "For a smoother texture, blanch and peel the tomatoes first.",
      ],
    ),
    step(
      "beat-egg",
      ["打蛋液", "Beat the eggs"],
      [
        "鸡蛋打入碗中，加 1g 盐和 1ml 醋，搅匀至起小泡。",
        "Crack the eggs into a bowl with 1 g salt and 1 ml vinegar; beat until frothy.",
      ],
      "egg",
      0,
      [],
      [
        "加一点醋可以去腥，也让鸡蛋更蓬松。",
        "A splash of vinegar removes the smell and makes the eggs fluffier.",
      ],
    ),
    step(
      "scramble-egg",
      ["先炒鸡蛋", "Scramble the eggs"],
      [
        "热锅倒油，油热后倒入蛋液，翻炒到刚凝固、颜色微黄就盛出。",
        "Heat oil in the wok, pour in the eggs and scramble until just set and lightly golden; set aside.",
      ],
      "pan",
      2,
      [],
      [
        "不要洗锅，锅里的油刚好用来炒番茄。",
        "Do not wash the wok; the remaining oil is perfect for the tomatoes.",
      ],
    ),
    step(
      "cook-tomato",
      ["炒西红柿", "Cook the tomatoes"],
      [
        "锅中加入西红柿块，翻炒 20 秒，压出汁水至软烂。",
        "Add the tomatoes and stir-fry for 20 seconds, pressing until soft and juicy.",
      ],
      "flame",
      2,
      [{ label: ["翻炒西红柿", "Stir-fry tomatoes"], durationSeconds: 20 }],
    ),
    step(
      "combine",
      ["合炒调味", "Combine & season"],
      [
        "倒回鸡蛋，加剩余盐、糖和葱花，翻炒均匀。",
        "Return the eggs, add the remaining salt, sugar and scallions; toss to combine.",
      ],
      "sparkle",
      2,
    ),
    step(
      "plate",
      ["关火装盘", "Plate & serve"],
      ["关火，盛盘，趁热享用。", "Turn off the heat, plate and serve while hot."],
      "dish",
      0,
    ),
  ],
  source: {
    provider: "HowToCook",
    pageUrl: "https://howtocook.aiursoft.com/Recipes/Detail/37",
    markdownUrl:
      "https://github.com/Anduin2017/HowToCook/blob/master/dishes/vegetable_dish/西红柿炒鸡蛋.md",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    extractedBy: "local",
  },
};

const colaWings: Recipe = {
  title: { zh: "可乐鸡翅", en: "Cola Chicken Wings" },
  summary: {
    zh: "色泽红亮、咸甜适口，鸡翅软烂入味。重点是煎香和最后收汁，约 40 分钟。",
    en: "Glossy, savory-sweet wings braised in cola. The keys are a good sear and a slow glaze, about 40 minutes.",
  },
  difficulty: 3,
  totalMinutes: 40,
  servings: { zh: "2 人份", en: "Serves 2" },
  caloriesKcal: 960,
  ingredients: [
    item("wings", "鸡翅中", "Chicken wings", "10–12 只", "10–12", "meat"),
    item("cola", "可乐", "Cola", "500 ml", "500 ml", "water"),
    item("soy", "生抽", "Soy sauce", "20 ml", "20 ml", "seasoning"),
    item("sugar", "白糖", "Sugar", "10 g", "10 g", "seasoning"),
    item("ginger", "生姜", "Ginger", "2 片", "2 slices", "other"),
    item("wine", "料酒", "Cooking wine", "20 ml", "20 ml", "oil"),
    item("scallion", "小葱", "Scallion", "1 根", "1", "vegetable"),
    item("salt", "盐", "Salt", "2 g", "2 g", "seasoning"),
  ],
  cookware: [
    item("wok", "炒锅", "Wok", "1 口", "1", "pan"),
    item("spatula", "锅铲", "Spatula", "1 把", "1", "knife"),
    item("bowl", "腌制碗", "Marinating bowl", "1 个", "1", "bowl"),
  ],
  steps: [
    step(
      "blanch",
      ["焯水去腥", "Blanch the wings"],
      [
        "鸡翅冷水下锅，加姜片和料酒，大火煮开约 2 分钟，撇去浮沫后捞出。",
        "Put the wings in cold water with ginger and wine. Boil for about 2 minutes, skim, then drain.",
      ],
      "pot",
      3,
      [{ label: ["焯水", "Blanch"], durationSeconds: 120 }],
    ),
    step(
      "marinate",
      ["改刀腌制", "Score & marinate"],
      [
        "鸡翅两面各划两刀，用生抽抓匀，腌制 10 分钟。",
        "Score both sides of each wing and coat with soy sauce. Marinate for 10 minutes.",
      ],
      "knife",
      0,
      [{ label: ["腌制鸡翅", "Marinate wings"], durationSeconds: 600 }],
      [
        "腌制时可以把鸡翅翻一次面，更均匀。",
        "Flip the wings once while marinating for even flavor.",
      ],
    ),
    step(
      "sear",
      ["煎至金黄", "Sear until golden"],
      [
        "小火起油爆香姜片，下鸡翅煎至两面金黄，翻动防止粘锅。",
        "Heat oil over low heat, aromatize the ginger, then sear the wings until golden on both sides.",
      ],
      "flame",
      1,
    ),
    step(
      "cola",
      ["倒入可乐", "Add the cola"],
      [
        "倒入可乐没过鸡翅，大火煮沸，撇去浮沫后放入葱结。",
        "Pour in cola to cover the wings, bring to a boil, skim the foam and add the scallion knot.",
      ],
      "water",
      3,
    ),
    step(
      "simmer",
      ["调味慢煮", "Season & simmer"],
      [
        "加盐、白糖和生抽调味，转中火慢煮约 15 分钟。",
        "Season with salt, sugar and soy sauce; lower to medium heat and simmer for about 15 minutes.",
      ],
      "timer",
      2,
      [{ label: ["慢煮收味", "Simmer"], durationSeconds: 900 }],
      ["此时可以顺手把台面收拾干净。", "Use the waiting time to wipe down the counter."],
    ),
    step(
      "glaze",
      ["收汁装盘", "Glaze & plate"],
      [
        "捞出葱姜，转小火收汁至挂丝，关火装盘。",
        "Remove the aromatics, reduce over low heat until the sauce glazes the wings, then plate.",
      ],
      "dish",
      1,
      [],
      [
        "收汁时不要用大火，否则容易发苦。",
        "Do not use high heat for the glaze or the sauce can turn bitter.",
      ],
    ),
  ],
  source: {
    provider: "HowToCook",
    pageUrl: "https://howtocook.aiursoft.com/Recipes/Detail/170",
    markdownUrl: "https://github.com/Anduin2017/HowToCook/blob/master/dishes/meat_dish/可乐鸡翅.md",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    extractedBy: "local",
  },
};

const hotSourPotato: Recipe = {
  title: { zh: "酸辣土豆丝", en: "Hot & Sour Potato Slivers" },
  summary: {
    zh: "脆爽开胃的快手小炒，关键是洗掉淀粉、快速焯水和最后大火快炒，约 20 分钟。",
    en: "A crisp, tangy stir-fry. Rinse off the starch, blanch briefly and finish over high heat. About 20 minutes.",
  },
  difficulty: 2,
  totalMinutes: 20,
  servings: { zh: "1–2 人份", en: "Serves 1–2" },
  caloriesKcal: 374,
  ingredients: [
    item("potato", "土豆", "Potatoes", "2 个（约 240g）", "2 (240 g)", "vegetable"),
    item("garlic", "大蒜", "Garlic", "4 瓣", "4 cloves", "other"),
    item("green-pepper", "青椒", "Green pepper", "半个", "½", "vegetable"),
    item("red-pepper", "红椒", "Red pepper", "半个", "½", "vegetable"),
    item("chili", "干辣椒", "Dried chilies", "3 个", "3", "seasoning"),
    item("scallion", "葱", "Scallion", "1 根", "1", "vegetable"),
    item("soy", "生抽", "Soy sauce", "5 ml", "5 ml", "seasoning"),
    item("vinegar", "陈醋", "Aged vinegar", "10 ml", "10 ml", "seasoning"),
    item("salt", "盐", "Salt", "2 g", "2 g", "seasoning"),
    item("oil", "食用油", "Cooking oil", "15 ml", "15 ml", "oil"),
  ],
  cookware: [
    item("wok", "炒锅", "Wok", "1 口", "1", "pan"),
    item("spatula", "锅铲", "Spatula", "1 把", "1", "knife"),
    item("board", "砧板", "Cutting board", "1 块", "1", "board"),
    item("knife", "菜刀", "Chef's knife", "1 把", "1", "knife"),
  ],
  steps: [
    step(
      "cut",
      ["切土豆丝", "Cut the potatoes"],
      [
        "土豆去皮，切成尽量细的丝，也可以用刨丝器。",
        "Peel the potatoes and cut into thin slivers, or use a mandoline.",
      ],
      "knife",
      0,
      [],
      [
        "越细越容易炒脆，但手指也要放稳。",
        "Thinner slivers crisp faster, but keep your fingers safe.",
      ],
    ),
    step(
      "blanch",
      ["洗淀粉焯水", "Rinse & blanch"],
      [
        "土豆丝用清水洗去淀粉，沸水焯 10 秒后立刻沥干。",
        "Rinse the starch off the potatoes, blanch for 10 seconds, then drain immediately.",
      ],
      "water",
      2,
      [{ label: ["焯水", "Blanch"], durationSeconds: 10 }],
      [
        "淀粉洗不干净，下锅就会黏成一团。",
        "Leftover starch makes the slivers stick together in the wok.",
      ],
    ),
    step(
      "aromatics",
      ["准备辅料", "Prep the aromatics"],
      [
        "葱切花，大蒜切末分两份，干辣椒切段，青红椒切丝。",
        "Chop the scallion, divide the garlic into two portions, cut the chilies and slice the peppers.",
      ],
      "board",
      0,
    ),
    step(
      "fry-aromatics",
      ["小火爆香", "Bloom the aromatics"],
      [
        "热锅小火热油，下葱白、一半蒜末和干辣椒爆香。",
        "Heat oil over low heat; add scallion whites, half the garlic and dried chilies.",
      ],
      "flame",
      1,
    ),
    step(
      "stir-fry",
      ["大火翻炒", "Stir-fry"],
      [
        "加入青红椒和土豆丝，大火翻炒至土豆丝变色。",
        "Add the peppers and potato slivers; stir-fry over high heat until they change color.",
      ],
      "pan",
      3,
    ),
    step(
      "season",
      ["调味出锅", "Season & serve"],
      [
        "加生抽、陈醋、剩余蒜末和盐，快速翻匀后撒葱花装盘。",
        "Add soy sauce, vinegar, the rest of the garlic and salt; toss quickly, scatter scallions and plate.",
      ],
      "dish",
      2,
      [],
      ["蒜末最后放，蒜香更冲。", "Add the last garlic at the end to keep its punch."],
    ),
  ],
  source: {
    provider: "HowToCook",
    pageUrl: "https://howtocook.aiursoft.com/Recipes/Detail/29",
    markdownUrl:
      "https://github.com/Anduin2017/HowToCook/blob/master/dishes/vegetable_dish/酸辣土豆丝.md",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    extractedBy: "local",
  },
};

/** Offline snapshots keyed by the dish name a user would say. */
export const OFFLINE_RECIPES: ReadonlyMap<string, Recipe> = new Map([
  ["番茄炒蛋", tomatoEggs],
  ["西红柿炒鸡蛋", tomatoEggs],
  ["番茄炒鸡蛋", tomatoEggs],
  ["tomato eggs", tomatoEggs],
  ["tomato and eggs", tomatoEggs],
  ["可乐鸡翅", colaWings],
  ["cola chicken wings", colaWings],
  ["酸辣土豆丝", hotSourPotato],
  ["hot and sour potato", hotSourPotato],
]);

export function findOfflineRecipe(query: string): Recipe | null {
  const key = query.trim().toLowerCase();
  for (const [name, recipe] of OFFLINE_RECIPES) {
    if (name.toLowerCase() === key) return recipe;
  }
  return null;
}

export function recommendedRecipeById(id: string): RecommendedRecipe | null {
  return RECOMMENDED_RECIPES.find((recipe) => recipe.id === id) ?? null;
}

/** Re-exported helper for tests that need a neutral localizable string. */
export const localized = zh;
