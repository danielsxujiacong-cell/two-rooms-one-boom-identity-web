import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { roles } = require("../src/data/roles.js");
const base = roles.filter((role) => !role.isAdvanced);
const advanced = roles.filter((role) => role.isAdvanced);
assert.equal(base.length, 5, "base role count");
assert.equal(advanced.length, 93, "advanced role count");
assert.equal(new Set(roles.map((role) => role.id)).size, roles.length, "role IDs must be unique");
assert.equal(roles.length, 98, "total role count");
assert.ok(roles.every((role) => role.nameZh && role.nameEn && role.ability), "every card keeps names and ability text");
console.log("Role library passed: 5 base role types, 93 advanced variants, 98 unique role entries.");
