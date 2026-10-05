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
		const hash = (env) => environmentHash(directory, { TV: '5a', ...env });
		assert.notEqual(hash({ A: 'ab', B: 'c' }), hash({ A: 'a', B: 'bc' }));
		assert.notEqual(hash({ A: 'a\nb' }), hash({ A: 'ab' }));
		assert.notEqual(hash({}), hash({ A: '' }));
		assert.notEqual(hash({ TV: '5a' }), hash({ TV: '5b' }));
		const env = { A: 'hello\nworld', B: '雪', TV: '5a' };
		const cli = execFileSync(process.execPath, [path.join(__dirname, '../lib/env-hash.js'), directory], { env, encoding: 'utf8', timeout: 5000 }).trim();
		assert.equal(cli, hash(env));
		fs.writeFileSync(path.join(directory, 'test.conf'), 'env.B env.A');
		assert.equal(hash(env), cli);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('config writer persists the shared hash at the startup reader path', () => {
	const vm = require('node:vm');
	const writes = [];
	const sentinel = 'synthetic-shared-hash';
	const sandbox = {
		module: { exports: {} },
		require: (name) => {
			if (name === 'fs') return { writeFileSync: (...args) => writes.push(args) };
			if (name === './env-hash') return () => sentinel;
			if (name === 'node:child_process')
				return {
					execFile: () => {
						throw new Error('unexpected execution');
					},
				};
			if (name === 'liquidjs') return { Liquid: class {} };
			if (name === '../logger') return { global: {} };
			if (name === 'lodash' || name === './error') return {};
			throw new Error('unexpected dependency: ' + name);
		},
	};
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/utils.js'), 'utf8'), sandbox);
	sandbox.module.exports.writeHash();
	assert.deepEqual(writes, [['/data/npmplus/env.sha512sum', sentinel]]);
});

test('startup hash gate regenerates only on change and stops on hash failure', () => {
	const { spawnSync } = require('node:child_process');
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'npmplus-startup-test-'));
	try {
		const stored = path.join(directory, 'hash');
		const source = fs.readFileSync(path.join(__dirname, '../../rootfs/usr/local/bin/envs.sh'), 'utf8');
		const start = source.indexOf('export TV="5a"');
		const end = source.indexOf('\nexec migration.sh', start);
		assert.ok(start >= 0 && end > start);
		const gate = source.slice(start, end).replaceAll('/data/npmplus/env.sha512sum', stored);
		const run = (fail) => spawnSync('/bin/sh', ['-c', 'node() { ' + (fail ? 'return 7;' : 'printf current;') + ' };\n' + gate + '\nprintf "gate-result:%s" "${REGENERATE_ALL:-false}"'], { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 5000 });
		assert.match(run(false).stdout, /gate-result:true$/);
		fs.writeFileSync(stored, 'current');
		assert.match(run(false).stdout, /gate-result:false$/);
		fs.writeFileSync(stored, 'old');
		assert.match(run(false).stdout, /gate-result:true$/);
		const failed = run(true);
		assert.equal(failed.status, 1);
		assert.doesNotMatch(failed.stdout, /gate-result:/);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
