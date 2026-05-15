import type { Article, Category } from "./types";
import { MODULE_3_ARTICLES } from "./module-3";
import { MODULE_4_ARTICLES } from "./module-4";
import { MODULE_5_ARTICLES } from "./module-5";
import { BONUS_ARTICLES } from "./bonus";

export const CATEGORIES: Category[] = [
  { id: "module-3", label: "Module 3, Fulfillment" },
  { id: "module-4", label: "Module 4, Advanced Implementation" },
  { id: "module-5", label: "Module 5, AI Integration" },
  { id: "bonus", label: "Bonus, Live Class SOPs" },
];

export const ARTICLES: Article[] = [
  ...MODULE_3_ARTICLES,
  ...MODULE_4_ARTICLES,
  ...MODULE_5_ARTICLES,
  ...BONUS_ARTICLES,
];
