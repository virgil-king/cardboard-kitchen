import { test } from "vitest";
import { assert } from "chai";
import * as fs from "fs";
import { SqlitePersistentLog } from "./persistentlog.js";
import { tmpdir } from "node:os";
import { sep } from "node:path";

test("all(): fresh database: returns empty list", () => {
  const db = createLog();

  assert.equal(db.all().length, 0);
});

test("insert(): inserted value appears in all()", () => {
  const db = createLog();
  const item = { cost: 7, data: new Uint8Array([3]) };

  db.insert([item]);

  const result = db.all()[0];
  assert.equal(result.cost, item.cost);
  assert.deepEqual(result.data, item.data);
});

test("all(): values returned in order", () => {
  const db = createLog();
  db.insert([
    { cost: 2, data: new Uint8Array() },
    { cost: 3, data: new Uint8Array() },
  ]);

  assert.deepEqual(
    db.all().map((it) => it.cost),
    [2, 3]
  );
});

test("insert(): purges oldest items to honor max cost", () => {
  const db = createLog(10);
  db.insert([
    { cost: 3, data: new Uint8Array([1]) },
    { cost: 3, data: new Uint8Array([2]) },
  ]);

  db.insert([{ cost: 7, data: new Uint8Array([3]) }]);

  const remaining = db.all();
  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].data[0], 2);
  assert.equal(remaining[1].data[0], 3);
});

test("newerThan(): returns newer but not older items", () => {
  const db = createLog();
  db.insert([
    { cost: 3, data: new Uint8Array([1]) },
    { cost: 3, data: new Uint8Array([2]) },
    { cost: 3, data: new Uint8Array([3]) },
  ]);
  const firstItemRowid = db.all()[0].rowid;

  const result = db.newerThan(firstItemRowid);

  assert.equal(result.length, 2);
  assert.equal(result[0].data[0], 2);
  assert.equal(result[1].data[0], 3);
});

function createLog(maxCost: number = 1000): SqlitePersistentLog {
  const dir = fs.mkdtempSync(`${tmpdir}${sep}PersistentLogTest`);
  const path = `${dir}${sep}test.db`;
  return new SqlitePersistentLog(path, maxCost);
}
