import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "client/src/components/ui/**", "client/src/lib/store.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "client/src/features/**/*.ts", "client/src/features/**/*.tsx", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Project-owned domains write only into live projects: their commands open the
    // unit of work with `withLiveProjectTransaction` (server/modules/projects/live-project.ts).
    files: [
      "server/modules/{budget,cash-flow,distribution,documents,evaluation,finance-plan,legal,notes,people,rights,scripts,tasks}/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db/transaction"],
              importNames: ["withTransaction"],
              message: "Project-owned commands use withLiveProjectTransaction so a soft-deleted project accepts no writes.",
            },
          ],
        },
      ],
    },
  },
);
