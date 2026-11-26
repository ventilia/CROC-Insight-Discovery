import type { Company } from "./api";

const cyrillic = [..."абвгдеёжзийклмнопрстуфхцчшщъыьэюя"];
const latin = "a b v g d e yo zh z i y k l m n o p r s t u f kh ts ch sh shch - y - e yu ya".split(" ");
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

function slug(name: string) {
  return [...name.toLowerCase()].map((character) => {
    const index = cyrillic.indexOf(character);
    return index < 0 ? character : latin[index];
  }).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function shortId(id: string) {
  if (!uuid.test(id)) return id;
  const bytes = id.replace(/-/g, "").match(/../g)!;
  return "~" + btoa(bytes.map((byte) => String.fromCharCode(parseInt(byte, 16))).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function longId(id: string) {
  if (!/^~[a-z\d_-]{22}$/i.test(id)) return id;
  const bytes = atob(id.slice(1).replace(/-/g, "+").replace(/_/g, "/"));
  const hex = [...bytes].map((byte) => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

function companySlug(company: Company, companies: Company[]) {
  const name = slug(company.name);
  return name && companies.filter((entry) => slug(entry.name) === name).length === 1 ? name : shortId(company.id);
}

export function resolveCompany(companies: Company[], reference?: string) {
  if (!reference) return undefined;
  return companies.find((entry) => entry.id === longId(reference) || companySlug(entry, companies) === reference);
}

export function internalRoute(address: string) {
  return translate(address, false);
}

export function publicRoute(address: string, companies: Company[]) {
  return translate(address, true, companies);
}

function translate(address: string, isPublic: boolean, companies: Company[] = []) {
  const [path, query] = address.split("?");
  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== "client" && !(segments[0] === "clients" && segments[1])) {
    return path === "/companies" && isPublic ? "/clients" : path === "/clients" && !isPublic ? "/companies" : address;
  }
  const convert = isPublic ? shortId : longId;
  const company = isPublic ? resolveCompany(companies, segments[1]) : undefined;
  segments[0] = isPublic ? "clients" : "client";
  segments[1] = company ? companySlug(company, companies) : convert(segments[1]);
  if (segments[3]) segments[3] = convert(segments[3]);
  const params = new URLSearchParams(query);
  for (const key of ["initiative", "participant", "focus", "shared", "department"]) {
    const value = params.get(key);
    if (value) params.set(key, value.split(",").map(convert).join(","));
  }
  return "/" + segments.join("/") + (params.size ? "?" + params : "");
}
