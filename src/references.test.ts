import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertHandlerConformance } from "@plurnk/plurnk-mimetypes/conformance";
import TextGraphql from "./TextGraphql.ts";

const metadata = { mimetype: "application/graphql", glyph: "◈", extensions: [".graphql", ".gql"] };
const h = () => new TextGraphql(metadata);

const SRC = `"""A blog node."""
interface Node {
  id: ID!
}

type User implements Node {
  id: ID!
  name: String!
  posts: [Post!]!
}

type Post implements Node {
  id: ID!
  author: User!
  status: PostStatus!
}

enum PostStatus { DRAFT PUBLISHED }

union SearchResult = User | Post

type Mutation {
  createPost(input: CreatePostInput!): Post!
}

input CreatePostInput {
  authorId: ID!
}
`;

describe("TextGraphql — references (type graph)", () => {
    it("field types are type edges through list/non-null wrappers, scoped to the type", () => {
        const refs = h().references(SRC);
        assert.ok(refs.some((r) => r.name === "Post" && r.kind === "type" && r.container === "User"), "User.posts: [Post!]!");
        assert.ok(refs.some((r) => r.name === "User" && r.kind === "type" && r.container === "Post"), "Post.author: User!");
        assert.ok(refs.some((r) => r.name === "PostStatus" && r.kind === "type" && r.container === "Post"));
    });

    it("built-in scalars (ID/String) emit no ref", () => {
        const refs = h().references(SRC);
        assert.ok(!refs.some((r) => r.name === "ID" || r.name === "String"));
    });

    it("implements is an inherit edge; union members are type edges", () => {
        const refs = h().references(SRC);
        assert.ok(refs.some((r) => r.name === "Node" && r.kind === "inherit" && r.container === "User"));
        assert.ok(refs.some((r) => r.name === "Node" && r.kind === "inherit" && r.container === "Post"));
        assert.ok(refs.some((r) => r.name === "User" && r.kind === "type" && r.container === "SearchResult"));
    });

    it("passes the SPEC §16 conformance invariants", async () => {
        await assertHandlerConformance(h(), {
            source: SRC,
            decoyNames: ["blog", "DRAFT", "PUBLISHED"],
            expectJoins: [
                { refName: "Node", container: "User" },
                { refName: "Post", container: "User" },
                { refName: "PostStatus", container: "Post" },
            ],
            expectRefs: [
                { name: "Node", kind: "inherit" },
                { name: "Post", kind: "type" },
                { name: "PostStatus", kind: "type" },
            ],
        });
    });
});
