import { describe, it } from "node:test";
import assert from "node:assert/strict";
import TextGraphql from "./TextGraphql.ts";

const metadata = {
    mimetype: "application/graphql",
    glyph: "🟪",
    extensions: [".graphql", ".gql"] as const,
};

describe("TextGraphql — instantiation", () => {
    it("instantiates with metadata", () => {
        const h = new TextGraphql(metadata);
        assert.equal(h.mimetype, "application/graphql");
        assert.equal(h.glyph, "🟪");
    });
});

describe("TextGraphql — extract", () => {
    it("extracts object type with fields", () => {
        const h = new TextGraphql(metadata);
        const src = [
            "type User {",
            "    id: ID!",
            "    name: String!",
            "    email: String",
            "}",
        ].join("\n");
        const syms = h.extractRaw(src);
        const u = syms.find((s) => s.name === "User" && s.kind === "class");
        assert.ok(u);
        assert.ok(syms.find((s) => s.name === "id" && s.kind === "field"));
        assert.ok(syms.find((s) => s.name === "name" && s.kind === "field"));
        assert.ok(syms.find((s) => s.name === "email" && s.kind === "field"));
    });

    it("extracts field with arguments as method", () => {
        const h = new TextGraphql(metadata);
        const src = [
            "type Query {",
            "    user(id: ID!): User",
            "    posts(authorId: ID, limit: Int = 10): [Post!]!",
            "}",
        ].join("\n");
        const syms = h.extractRaw(src);
        const userQ = syms.find((s) => s.name === "user");
        assert.ok(userQ);
        assert.equal(userQ.kind, "method");
        assert.deepEqual(userQ.params, ["id"]);
        const postsQ = syms.find((s) => s.name === "posts");
        assert.ok(postsQ);
        assert.equal(postsQ.kind, "method");
        assert.deepEqual(postsQ.params, ["authorId", "limit"]);
    });

    it("extracts input types as class kind", () => {
        const h = new TextGraphql(metadata);
        const src = [
            "input CreateUserInput {",
            "    email: String!",
            "    name: String!",
            "}",
        ].join("\n");
        const syms = h.extractRaw(src);
        const i = syms.find((s) => s.name === "CreateUserInput");
        assert.ok(i);
        assert.equal(i.kind, "class");
        assert.ok(syms.find((s) => s.name === "email" && s.kind === "field"));
    });

    it("extracts interfaces", () => {
        const h = new TextGraphql(metadata);
        const src = [
            "interface Node {",
            "    id: ID!",
            "}",
        ].join("\n");
        const syms = h.extractRaw(src);
        const i = syms.find((s) => s.name === "Node");
        assert.ok(i);
        assert.equal(i.kind, "interface");
    });

    it("extracts unions as type kind", () => {
        const h = new TextGraphql(metadata);
        const src = "union SearchResult = User | Post | Comment";
        const syms = h.extractRaw(src);
        const u = syms.find((s) => s.name === "SearchResult");
        assert.ok(u);
        assert.equal(u.kind, "type");
    });

    it("extracts enums", () => {
        const h = new TextGraphql(metadata);
        const src = [
            "enum Role {",
            "    ADMIN",
            "    USER",
            "    GUEST",
            "}",
        ].join("\n");
        const syms = h.extractRaw(src);
        const r = syms.find((s) => s.name === "Role");
        assert.ok(r);
        assert.equal(r.kind, "enum");
    });

    it("extracts scalars as type", () => {
        const h = new TextGraphql(metadata);
        const src = "scalar DateTime";
        const syms = h.extractRaw(src);
        const d = syms.find((s) => s.name === "DateTime");
        assert.ok(d);
        assert.equal(d.kind, "type");
    });

    it("extracts directive definitions as function (with @ prefix)", () => {
        const h = new TextGraphql(metadata);
        const src = "directive @deprecated(reason: String) on FIELD_DEFINITION | ENUM_VALUE";
        const syms = h.extractRaw(src);
        const d = syms.find((s) => s.name === "@deprecated");
        assert.ok(d);
        assert.equal(d.kind, "function");
        assert.deepEqual(d.params, ["reason"]);
    });

    it("extracts named query operations as method", () => {
        const h = new TextGraphql(metadata);
        const src = [
            "query GetUser($id: ID!) {",
            "    user(id: $id) { id name }",
            "}",
        ].join("\n");
        const syms = h.extractRaw(src);
        const q = syms.find((s) => s.name === "query GetUser");
        assert.ok(q);
        assert.equal(q.kind, "method");
    });

    it("extracts named mutation operations", () => {
        const h = new TextGraphql(metadata);
        // Note: arg named `data` rather than `input` because grammars-v4's
        // GraphQL grammar can't accept `input` as an argument name (it's
        // hard-keyworded). Real mutations idiomatically use `(input: ...)`.
        const src = [
            "mutation CreateUser($data: CreateUserInput!) {",
            "    createUser(data: $data) { id }",
            "}",
        ].join("\n");
        const syms = h.extractRaw(src);
        const m = syms.find((s) => s.name === "mutation CreateUser");
        assert.ok(m);
        assert.equal(m.kind, "method");
    });

    it("extracts fragment definitions", () => {
        const h = new TextGraphql(metadata);
        const src = [
            "fragment UserFields on User {",
            "    id",
            "    name",
            "    email",
            "}",
        ].join("\n");
        const syms = h.extractRaw(src);
        const f = syms.find((s) => s.name === "fragment UserFields");
        assert.ok(f);
        assert.equal(f.kind, "method");
    });

    it("returns empty array for empty input", () => {
        const h = new TextGraphql(metadata);
        assert.deepEqual(h.extractRaw(""), []);
    });

    it("does not throw on malformed source", () => {
        const h = new TextGraphql(metadata);
        assert.doesNotThrow(() => h.extractRaw("type { broken"));
        assert.doesNotThrow(() => h.extractRaw("@@ totally bogus"));
    });
});

describe("TextGraphql — framework integration", () => {
    it("renders extracted hierarchy via format()", () => {
        const h = new TextGraphql(metadata);
        const out = h.symbolsRaw("type Answer { id: ID! }");
        assert.ok(out.includes("class Answer"));
        assert.ok(out.includes("field id"));
    });

    it("inherits jsonpath query against the symbol outline", async () => {
        const h = new TextGraphql(metadata);
        const src = "type User { id: ID! }";
        const t = await h.query(src, "jsonpath", "$.User");
        assert.equal(t.length, 1);
    });
});

// Real-world smoke against a representative GraphQL schema.
describe("TextGraphql — real-world smoke (blog-shape schema)", () => {
    const SRC = [
        "scalar DateTime",
        "scalar UUID",
        "",
        "directive @auth(role: Role) on FIELD_DEFINITION | OBJECT",
        "",
        "enum Role {",
        "    ADMIN",
        "    USER",
        "    GUEST",
        "}",
        "",
        "interface Node {",
        "    id: ID!",
        "}",
        "",
        "type User implements Node {",
        "    id: ID!",
        "    email: String!",
        "    name: String!",
        "    posts: [Post!]!",
        "    createdAt: DateTime!",
        "}",
        "",
        "type Post implements Node {",
        "    id: ID!",
        "    title: String!",
        "    body: String!",
        "    author: User!",
        "    publishedAt: DateTime",
        "}",
        "",
        "input CreatePostInput {",
        "    title: String!",
        "    body: String!",
        "    authorId: ID!",
        "}",
        "",
        "type Query {",
        "    user(id: ID!): User",
        "    posts(authorId: ID, limit: Int = 10): [Post!]!",
        "    me: User",
        "}",
        "",
        "type Mutation {",
        "    createPost(data: CreatePostInput!): Post!",
        "    deletePost(id: ID!): Boolean!",
        "}",
        "",
        "union SearchResult = User | Post",
    ].join("\n");

    it("surfaces scalars, directive, enum, interface, types, input, union, query+mutation fields", () => {
        const h = new TextGraphql(metadata);
        const syms = h.extractRaw(SRC);
        const names = new Set(syms.map((s) => s.name));

        assert.ok(names.has("DateTime"));
        assert.ok(names.has("UUID"));
        assert.ok(names.has("@auth"));
        assert.ok(names.has("Role"));
        assert.ok(names.has("Node"));
        assert.ok(names.has("User"));
        assert.ok(names.has("Post"));
        assert.ok(names.has("CreatePostInput"));
        assert.ok(names.has("Query"));
        assert.ok(names.has("Mutation"));
        assert.ok(names.has("SearchResult"));

        assert.ok(names.has("user"));
        assert.ok(names.has("posts"));
        assert.ok(names.has("me"));
        assert.ok(names.has("createPost"));
        assert.ok(names.has("deletePost"));
    });

    it("kind discrimination", () => {
        const h = new TextGraphql(metadata);
        const syms = h.extractRaw(SRC);
        const byNameKind = new Map(syms.map((s) => [`${s.name}:${s.kind}`, s]));
        assert.ok(byNameKind.has("DateTime:type"));
        assert.ok(byNameKind.has("@auth:function"));
        assert.ok(byNameKind.has("Role:enum"));
        assert.ok(byNameKind.has("Node:interface"));
        assert.ok(byNameKind.has("User:class"));
        assert.ok(byNameKind.has("CreatePostInput:class"));
        assert.ok(byNameKind.has("SearchResult:type"));
        assert.ok(byNameKind.has("user:method"));
        assert.ok(byNameKind.has("me:field"));
        assert.ok(byNameKind.has("createPost:method"));
    });
});
