import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import ts from "typescript";

const ALLOWED_JSX_ATTRIBUTE_NAMES = new Set([
  "className",
  "data-testid",
  "eventName",
  "variant",
  "size",
  "href",
  "aria-current",
  "style",
  "role",
  "aria-label",
]);

type Issue = {
  text: string;
  line: number;
  column: number;
};

describe("mobile home copy guard", () => {
  it("rejects inline copy in the mobile home render", () => {
    const filePath = path.join(process.cwd(), "app/m/page.tsx");
    const sourceText = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    let jsxRoot: ts.JsxElement | ts.JsxFragment | null = null;

    const unwrapParentheses = (node: ts.Expression): ts.Expression => {
      let current: ts.Expression = node;
      while (ts.isParenthesizedExpression(current)) {
        current = current.expression;
      }
      return current;
    };

    const findReturn = (node: ts.Node): void => {
      if (ts.isReturnStatement(node) && node.expression) {
        const expression = unwrapParentheses(node.expression);
        if (ts.isJsxElement(expression) || ts.isJsxFragment(expression)) {
          jsxRoot = expression;
          return;
        }
      }
      ts.forEachChild(node, findReturn);
    };

    findReturn(sourceFile);
    expect(jsxRoot).toBeTruthy();

    const issues: Issue[] = [];

    const getNearestJsxAttribute = (ancestors: ReadonlyArray<ts.Node>): ts.JsxAttribute | null => {
      for (let i = ancestors.length - 1; i >= 0; i -= 1) {
        const ancestor = ancestors[i];
        if (ts.isJsxAttribute(ancestor)) {
          return ancestor;
        }
      }
      return null;
    };

    const visit = (node: ts.Node, ancestors: ts.Node[]): void => {
      if (ts.isJsxText(node)) {
        const trimmed = node.getText().trim();
        if (trimmed) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            text: trimmed,
            line: line + 1,
            column: character + 1,
          });
        }
      }

      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const attribute = getNearestJsxAttribute(ancestors);
        if (attribute && attribute.name && ALLOWED_JSX_ATTRIBUTE_NAMES.has(attribute.name.getText())) {
          // attribute-level literals are safe for the known list
        } else {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            text: node.getText(),
            line: line + 1,
            column: character + 1,
          });
        }
      }

      const nextAncestors = [...ancestors, node];
      ts.forEachChild(node, (child) => visit(child, nextAncestors));
    };

    visit(jsxRoot!, []);

    expect(issues).toEqual([]);
  });
});
