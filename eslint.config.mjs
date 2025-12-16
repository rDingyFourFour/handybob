import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "app_disabled/**",
  ]),
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          name: "@/lib/domain/twilio.server",
          message: "Import the Twilio dialer only from server actions, pages, or domain helpers.",
        },
      ],
    },
  },
  {
    files: [
      "app/(app)/calls/actions/**/*.ts",
      "app/(app)/calls/actions/**/*.tsx",
      "app/api/**/*.ts",
      "app/api/**/*.tsx",
      "lib/domain/**/*.ts",
      "lib/domain/**/*.tsx",
      "tests/**/*.ts",
      "tests/**/*.tsx",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
