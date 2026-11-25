import test from "node:test";
import assert from "node:assert/strict";
import { parseCrmCsv } from "./crm.ts";
test("CSV из CRM: BOM, русские заголовки, разделители, кавычки и переносы", () => {
  const rows = parseCrmCsv(
    '\uFEFFФИО;Должность;Подразделение;Email;Телефон\r\n"Иванов, Иван";"Архитектор ""ИТ""";"ИТ\nпроект";ivan@example.com;+70000000000',
  );
  assert.equal(rows[0].name, "Иванов, Иван");
  assert.equal(rows[0].jobTitle, 'Архитектор "ИТ"');
  assert.equal(rows[0].department, "ИТ\nпроект");
  assert.equal(
    parseCrmCsv('"name","email"\nAnna,anna@example.com')[0].email,
    "anna@example.com",
  );
});
test("CSV отклоняет незакрытые кавычки, пустые имена, ошибки полей и лимит", () => {
  for (const invalid of [
    'name\n"Иван',
    "email\nfoo@example.com",
    "name,email\n,foo@example.com",
    "name,email\nИван,broken",
    "name,name\nИван,Иван",
    "name,email\nИван",
  ])
    assert.throws(() => parseCrmCsv(invalid));
  assert.throws(() =>
    parseCrmCsv("name\n" + Array(501).fill("Имя").join("\n")),
  );
});
