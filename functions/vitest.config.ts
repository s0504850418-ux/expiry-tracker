import { defineConfig } from "vitest/config";

// תצורה מפורשת ומבודדת מ-vite.config.ts של הפרונטאנד (תיקיית האם) —
// כדי שלא יהיה תלוי בפלאגינים שרלוונטיים רק לבנייה של האפליקציה
// (למשל vite-plugin-pwa), ולא בזליגה אקראית של resolve config בין
// שני חלקי המונוריפו.
export default defineConfig({
  root: __dirname,
  test: {
    include: ["test/**/*.test.ts"],
  },
});
