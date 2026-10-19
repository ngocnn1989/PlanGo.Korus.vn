// Regression: checkPhone previously read an out-of-scope `validation` object.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/custom/LeadForm.astro', import.meta.url), 'utf8');
const client = /<script>([\s\S]*?)<\/script>/.exec(source)?.[1];
assert.ok(client, 'real form client script exists');
const ast = ts.createSourceFile('LeadForm.ts', client, ts.ScriptTarget.Latest, true);
const declarations = ast.statements.filter((statement) =>
  (ts.isFunctionDeclaration(statement) && statement.name?.text === 'checkPhone')
  || (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((item) => item.name.getText(ast) === 'PHONE_ALLOWED')));
assert.equal(declarations.length, 2, 'load actual validator and allowed-character rule');
const compiled = ts.transpileModule(declarations.map((item) => item.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = vm.createContext({});
vm.runInContext(`${compiled}\nthis.validatePhone = checkPhone;`, context);
const messages = { phoneHasLetters: 'letters', invalidPhone: 'invalid', phoneTooShort: 'short', phoneTooLong: 'long' };
const cases = [
  ['abc', 'letters'], ['123', 'short'], ['12345678901234567890', 'long'],
  ['+1 23', 'invalid'], ['0945 469 037', null], ['0945.469.037', null],
  ['+84 945 469 037', null], ['+1 202 555 0123', null],
];
for (const [phone, expected] of cases) assert.equal(context.validatePhone(phone, messages), expected);
console.log(`test-lead-form-validation: PASS (${cases.length} invalid/formatted/international cases; actual form validator, no outer validation variable)`);
