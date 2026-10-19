/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

function evaluate(source, context = {}, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    if (!(name in mocks)) throw new Error(`Missing test dependency: ${name}`);
    return mocks[name];
  }, console, Date, Promise, Map, Set, ...context });
  return exports;
}

function loadModule(file, mocks = {}, context = {}) {
  return evaluate(fs.readFileSync(path.join(root, file), 'utf8'), context, mocks);
}

// Execute the real callback with controlled dependencies, without a native renderer.
function loadCallback(file, name, context) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!initializer) throw new Error(`Callback ${name} was not found`);
  return evaluate(`exports.callback = ${initializer.getText(source)}`, context).callback;
}

module.exports = { loadModule, loadCallback };
