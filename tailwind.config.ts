import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: [
  "./app/**/*.{ts,tsx}",
  "./components/**/*.{ts,tsx}",
  "./lib/**/*.{ts,tsx}",
  "./utils/**/*.{ts,tsx}",
],
};

export default config;
