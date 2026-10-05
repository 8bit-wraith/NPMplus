const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const environmentHash = require('../lib/env-hash');

test('environment hash preserves values and matches the startup CLI', () => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'npmplus-env-test-'));
 try {
  fs.writeFileSync(path.join(directory, 'test.conf'), 'env.A env.B env.A');
  const hash = env => environmentHash(directory, {TV:'5a', ...env});
  assert.notEqual(hash({A:'ab', B:'c'}), hash({A:'a', B:'bc'}));
  assert.notEqual(hash({A:'a\nb'}), hash({A:'ab'}));
  assert.notEqual(hash({}), hash({A:''}));
  assert.notEqual(hash({TV:'5a'}), hash({TV:'5b'}));
  const env = {A:'hello\nworld', B:'雪', TV:'5a'};
  const cli = execFileSync(process.execPath, [path.join(__dirname, '../lib/env-hash.js'), directory], {env, encoding:'utf8', timeout:5000}).trim();
  assert.equal(cli, hash(env));
  fs.writeFileSync(path.join(directory, 'test.conf'), 'env.B env.A');
  assert.equal(hash(env), cli);
 } finally { fs.rmSync(directory, {recursive:true, force:true}); }
});


test('config writer persists the shared hash at the startup reader path', () => {
 const vm = require('node:vm');
 const writes = [];
 const sentinel = 'synthetic-shared-hash';
 const sandbox = {
  module: {exports: {}},
  require: name => {
   if (name === 'fs') return {writeFileSync: (...args) => writes.push(args)};
   if (name === './env-hash') return () => sentinel;
   if (name === 'node:child_process') return {execFile: () => {throw new Error('unexpected execution');}};
   if (name === 'liquidjs') return {Liquid: class {}};
   if (name === '../logger') return {global: {}};
   if (name === 'lodash' || name === './error') return {};
   throw new Error('unexpected dependency: ' + name);
  }
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/utils.js'), 'utf8'), sandbox);
 sandbox.module.exports.writeHash();
 assert.deepEqual(writes, [['/data/npmplus/env.sha512sum', sentinel]]);
});
