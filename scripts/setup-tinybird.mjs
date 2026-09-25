// Creates the Tinybird data sources via the Datasources API.
// Usage: node --env-file=.env.local scripts/setup-tinybird.mjs
// (Alternative with the CLI: cd tinybird && tb --cloud deploy)
import { readFileSync, readdirSync } from "fs";

const host = (process.env.TINYBIRD_HOST || "https://api.tinybird.co").replace(/\/$/, "");
const token = process.env.TINYBIRD_TOKEN;
if (!token) throw new Error("TINYBIRD_TOKEN missing");

for (const file of readdirSync("tinybird/datasources")) {
  const name = file.replace(".datasource", "");
  const src = readFileSync(`tinybird/datasources/${file}`, "utf8");
  const schema = src.split("SCHEMA >")[1].split("ENGINE")[0].trim().split("\n").map((l) => l.trim()).join(" ");
  const params = new URLSearchParams({ name, schema, format: "ndjson", mode: "create", engine: "MergeTree", engine_sorting_key: "timestamp" });
  const res = await fetch(`${host}/v0/datasources?${params}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  console.log(name, res.status, (await res.text()).slice(0, 300));
}
