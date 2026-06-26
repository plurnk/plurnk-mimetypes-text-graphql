import { describe, it } from "node:test";
import { assertQueryLineConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextGraphql.ts";

// #41: structural matches carry source-line spans (coverage gate).
const h = new Handler({"mimetype":"application/graphql","glyph":"🟪","extensions":[".graphql",".gql"]});

describe("#41 query-line conformance", () => {
    it("every structural match carries a source-line span", async () => {
        await assertQueryLineConformance(h, [{ source: "type Q { a: Int }\n", dialect: "jsonpath", pattern: "$..*" }]);
    });
});
