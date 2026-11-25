export type CrmContact = {
  name: string;
  jobTitle: string;
  department: string;
  email: string;
  phone: string;
};
const aliases: Record<string, keyof CrmContact> = {
  name: "name",
  фио: "name",
  имя: "name",
  "полное имя": "name",
  jobtitle: "jobTitle",
  должность: "jobTitle",
  position: "jobTitle",
  department: "department",
  отдел: "department",
  подразделение: "department",
  email: "email",
  "e-mail": "email",
  почта: "email",
  phone: "phone",
  телефон: "phone",
};
export function parseCrmCsv(source: string): CrmContact[] {
  if (source.length > 1_000_000)
    throw new Error("Размер файла — не более 1 МБ.");
  source = source.replace(/^\uFEFF/, "");
  // Detect separators outside quoted fields, including quoted header names.
  let quoted = false,
    commas = 0,
    semicolons = 0;
  for (const c of source) {
    if (c === '"') quoted = !quoted;
    if (!quoted && (c === "\n" || c === "\r")) break;
    if (!quoted && c === ",") commas++;
    if (!quoted && c === ";") semicolons++;
  }
  const delimiter = semicolons > commas ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    inQuotes = false,
    closed = false;
  function pushRow() {
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
    row = [];
    field = "";
    closed = false;
    if (rows.length > 501)
      throw new Error("За один раз можно импортировать до 500 контактов.");
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (inQuotes) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
        closed = true;
      } else field += c;
    } else if (c === delimiter) {
      row.push(field.trim());
      field = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      pushRow();
    } else if (c === '"' && !field.trim() && !closed) {
      inQuotes = true;
      field = "";
    } else if (closed && c.trim()) throw new Error("Проверьте кавычки в CSV.");
    else if (c === '"') throw new Error("Проверьте кавычки в CSV.");
    else field += c;
  }
  if (inQuotes) throw new Error("В CSV не закрыты кавычки.");
  pushRow();
  const header = rows.shift() ?? [];
  const keys = header.map((s) => aliases[s.trim().toLocaleLowerCase("ru")]);
  if (!keys.includes("name")) throw new Error("Нужна колонка «ФИО» или name.");
  const known = keys.filter(Boolean);
  if (new Set(known).size !== known.length)
    throw new Error("В файле повторяются колонки.");
  if (!rows.length) throw new Error("В файле нет контактов.");
  return rows.map((values, index) => {
    if (values.length !== header.length)
      throw new Error(
        `Строка ${index + 2}: число колонок не совпадает с заголовком.`,
      );
    const contact: CrmContact = {
      name: "",
      jobTitle: "",
      department: "",
      email: "",
      phone: "",
    };
    keys.forEach((key, i) => {
      if (key) contact[key] = values[i];
    });
    if (!contact.name || contact.name.length > 200)
      throw new Error(`Строка ${index + 2}: проверьте ФИО (до 200 символов).`);
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))
      throw new Error(`Строка ${index + 2}: некорректный email.`);
    return contact;
  });
}
