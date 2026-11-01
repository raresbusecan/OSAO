/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

function evaluate(source, context = {}, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(source, { fileName: 'test.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    if (!(name in mocks)) throw new Error(`Missing test dependency: ${name}`);
    return mocks[name];
  }, console, Date, Promise, Map, Set, __DEV__: false, ...context });
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

// Select real render functions, effects and JSX handlers for navigation tests.
function loadSelected(file, select, context) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches = [];
  function visit(node) {
    const selected = select(node, source);
    if (selected) matches.push(selected);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (matches.length !== 1) throw new Error(`Expected one selection in ${file}, found ${matches.length}`);
  return evaluate(`exports.selected = ${matches[0].getText(source).replace(/^export\s+(default\s+)?/, '')}`, context).selected;
}

const loadFunction = (file, name, context) => loadSelected(file, (node) => ts.isFunctionDeclaration(node) && node.name?.text === name ? node : null, context);
const loadEffect = (file, marker, context) => loadSelected(file, (node, source) => ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes(marker) ? node.arguments[0] : null, context);
const loadFocus = (file, marker, context) => loadSelected(file, (node, source) => ts.isCallExpression(node) && node.expression.getText(source) === 'useFocusEffect' && node.arguments[0]?.getText(source).includes(marker) ? node.arguments[0] : null, { useCallback: (fn) => fn, ...context });
const loadPress = (file, testID, context) => loadSelected(file, (node, source) => {
  if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return null;
  const attrs = node.attributes.properties;
  const id = attrs.find((a) => a.name?.getText(source) === 'testID');
  if (!id?.initializer?.getText(source).includes(testID)) return null;
  return attrs.find((a) => a.name?.getText(source) === 'onPress')?.initializer?.expression ?? null;
}, context);

module.exports = { loadModule, loadCallback, loadFunction, loadEffect, loadFocus, loadPress };
