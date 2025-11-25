import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: [
    "./app/**/*.{ts,tsx,css}",
    "./components/**/*.{ts,tsx,css}",
    "./schemas/**/*.{ts,tsx,css}",
    "./utils/**/*.{ts,tsx,css}",
    "./tests/**/*.{ts,tsx,css}",
  ],
};

export default config;
