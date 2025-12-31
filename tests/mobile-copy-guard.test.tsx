import fs from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("Mobile home copy guard", () => {
  it("prevents inline copy inside app/m/page.tsx", () => {
    const filePath = path.resolve(process.cwd(), "app/m/page.tsx");
    const sourceText = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const inlineCopy: Array<{text: string; line: number; column: number}> = [];

    const record = (node: ts.Node, text: string) => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      inlineCopy.push({ text: text.trim(), line: line + 1, column: character + 1 });
    };

    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        if (node.getText().trim()) {
          record(node, node.getText());
        }
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const parent = node.parent;
        if (ts.isJsxExpression(parent) && parent.expression === node) {
          if (node.text.trim()) {
            record(node, node.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    expect(inlineCopy).toHaveLength(0);
  });
});
