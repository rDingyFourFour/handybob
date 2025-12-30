import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

describe("mobile home copy guard", () => {
  it("does not render inline text literals outside the approved copy map", () => {
    const filePath = path.join(process.cwd(), "app/m/page.tsx");
    const contents = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(filePath, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const inlineTexts: string[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        const value = node.getText();
        if (value.trim()) {
          inlineTexts.push(value.trim());
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    expect(inlineTexts).toEqual([]);
  });
});
