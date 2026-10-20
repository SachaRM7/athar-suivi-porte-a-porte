import ts from 'typescript';

/** Read syntax, including generic calls and expressions such as getClient().functions. */
export function frontendCallables(source, filename = 'source.tsx') {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const names = new Set();
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'httpsCallable') {
      const name = node.arguments[1];
      if (!name || !ts.isStringLiteral(name)) throw new Error(`Callable sans nom statique : ${filename}.`);
      names.add(name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...names].sort();
}
