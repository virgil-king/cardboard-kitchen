import { test } from "vitest";
import { assert } from "chai";
import { LogDirectory } from "./logdirectory.js";
import * as fs from "fs";

const encoder = new TextEncoder();

test("constructor: enforces max size", () => {
  const path = fs.mkdtempSync("/tmp/LogDirectoryTest");
  const bigDir = new LogDirectory(path, 100);
  bigDir.writeData(encoder.encode("too much data"));

  const smallDir = new LogDirectory(path, 5);

  assert.equal(fs.readdirSync(path).length, 0);
});

test("writeData: creates file", () => {
  const path = fs.mkdtempSync("/tmp/LogDirectoryTest");
  const dir = new LogDirectory(path, 1_000);

  dir.writeData(encoder.encode("data"));

  assert.equal(fs.readdirSync(path).length, 1);
});

test("writeData: enforces max size", () => {
  const path = fs.mkdtempSync("/tmp/LogDirectoryTest");
  const dir = new LogDirectory(path, 10);
  dir.writeData(encoder.encode("7 bytes"));
  const filename = fs.readdirSync(path)[0];

  dir.writeData(encoder.encode("more"));

  const filenames = fs.readdirSync(path);
  assert.equal(filenames.length, 1);
  assert.notEqual(filename, filenames[0]);
});

test("writeData: enforcement deletes oldest file", () => {
  const path = fs.mkdtempSync("/tmp/LogDirectoryTest");
  const dir = new LogDirectory(path, 15);
  dir.writeData(encoder.encode("7 bytes"));
  dir.writeData(encoder.encode("7 bytes"));
  var filenames = fs.readdirSync(path).sort();
  const filename1 = filenames[0];
  const filename2 = filenames[1];

  dir.writeData(encoder.encode("more"));

  filenames = fs.readdirSync(path).sort();
  assert.equal(filenames.length, 2);
  assert.equal(filenames.indexOf(filename2), 0);
  assert.equal(filenames.indexOf(filename1), -1);
});

test("write: directory: size counted correctly", () => {
  const path = fs.mkdtempSync("/tmp/LogDirectoryTest");
  const dir = new LogDirectory(path, 15);

  dir.write((path) => {
    fs.mkdirSync(path);
    fs.writeFileSync(`${path}/a`, "four");
    fs.writeFileSync(`${path}/b`, "four");
  });
  const dirFilename = fs.readdirSync(path)[0];
  dir.writeData(encoder.encode("more"));

  assert.equal(fs.readdirSync(path).sort().indexOf(dirFilename), 0);

  dir.writeData(encoder.encode("more"));
  assert.equal(fs.readdirSync(path).sort().indexOf(dirFilename), -1);
});
