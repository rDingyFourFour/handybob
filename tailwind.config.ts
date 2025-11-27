import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: [
    // Keep Tailwind aware of all app, component, and lib UI files (including HbCard/dashboard widgets).
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
};

export default config;
