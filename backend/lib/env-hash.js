const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Shared by startup and config generation: preserve names, value boundaries,
// newlines and the distinction between an unset and an empty variable.
function environmentHash(templateDirectory = '/app/templates', env = process.env) {
	const names = new Set(['TV']);
	for (const file of fs.readdirSync(templateDirectory)) {
		const content = fs.readFileSync(path.join(templateDirectory, file), 'utf8');
		for (const match of content.match(/env\.[A-Z0-9_]+/g) || []) {
			names.add(match.slice(4));
		}
	}
	const entries = [...names].sort().map((name) => [name, env[name] ?? null]);
	return crypto.createHash('sha512').update(JSON.stringify(entries)).digest('hex');
}

module.exports = environmentHash;
if (require.main === module) {
	process.stdout.write(environmentHash(process.argv[2]) + '\n');
}
