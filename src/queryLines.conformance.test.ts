import { describe, it } from "node:test";
import { assertQueryLineConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextGraphql.ts";

// #41: BOTH dialects carry real source lines.
const h = new Handler({"mimetype":"application/graphql","glyph":"🟪","extensions":[".graphql",".gql"]});
const src = "type Q { a: Int }\n";

describe("#41 query-line conformance (both dialects)", () => {
    it("jsonpath", async () => { await assertQueryLineConformance(h, [{ source: src, dialect: "jsonpath", pattern: "$..*" }]); });
    it("xpath", async () => { await assertQueryLineConformance(h, [{ source: src, dialect: "xpath", pattern: "//*" }]); });
});
