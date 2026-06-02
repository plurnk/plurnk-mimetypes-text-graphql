import { AntlrExtractor, withExtractor } from "@plurnk/plurnk-mimetypes";
import type { ExtractionVisitor } from "@plurnk/plurnk-mimetypes";
import { CharStream, CommonTokenStream } from "antlr4ng";
import { GraphQLLexer } from "./generated/GraphQLLexer.ts";
import { GraphQLParser } from "./generated/GraphQLParser.ts";
import { GraphQLVisitor } from "./generated/GraphQLVisitor.ts";

// application/graphql handler. ANTLR grammar from grammars-v4/graphql.
//
// Parser entry rule: document. The grammar covers both SDL schemas
// (type/input/enum/interface/union/scalar/directive/schema) and
// executable documents (query/mutation/subscription/fragment).
export default class TextGraphql extends AntlrExtractor {
    protected parseTree(content: string): unknown {
        const lexer = new GraphQLLexer(CharStream.fromString(content));
        const tokens = new CommonTokenStream(lexer);
        const parser = new GraphQLParser(tokens);
        parser.removeErrorListeners();
        return parser.document();
    }

    protected createVisitor(): ExtractionVisitor {
        return new TextGraphqlVisitor() as unknown as ExtractionVisitor;
    }
}

// SPEC §3 mapping for GraphQL:
//   type X { ... }              → class; fieldDefinition → field/method
//   input X { ... }             → class; inputValueDefinition → field
//   interface X { ... }         → interface
//   union X = A | B | C         → type
//   enum X { A B C }            → enum
//   scalar X                    → type
//   directive @x on ...         → function (`@x` rendered with leading @)
//   schema { query: Q ... }     → module (top-level entry container)
//   query/mutation/subscription → method (named operations; anon skipped)
//   fragment X on Y { ... }     → method (rendered as `fragment X`)
class TextGraphqlVisitor extends withExtractor(GraphQLVisitor) {
    visitObjectTypeDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        const name = nameText(ctx.name?.());
        if (!name) return null;
        this.addSymbol("class", name, ctx);
        this.visitChildren(ctx);
        return null;
    };

    visitInterfaceTypeDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        const name = nameText(ctx.name?.());
        if (!name) return null;
        this.addSymbol("interface", name, ctx);
        this.visitChildren(ctx);
        return null;
    };

    visitUnionTypeDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        const name = nameText(ctx.name?.());
        if (name) this.addSymbol("type", name, ctx);
        return null;
    };

    visitEnumTypeDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        const name = nameText(ctx.name?.());
        if (name) this.addSymbol("enum", name, ctx);
        return null;
    };

    visitScalarTypeDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        const name = nameText(ctx.name?.());
        if (name) this.addSymbol("type", name, ctx);
        return null;
    };

    visitInputObjectTypeDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        const name = nameText(ctx.name?.());
        if (!name) return null;
        // Grammar quirk: when `input` appears as an argument name inside a
        // field's argumentsDefinition (`createPost(input: CreatePostInput!)`),
        // ANTLR's prediction sometimes resolves the bare `input` token
        // followed by `: TypeName!` as a degenerate inputObjectTypeDefinition
        // with a colon-prefixed name. Skip those spurious matches — real
        // SDL input definitions are followed by `{`, not a type expression.
        if (name.startsWith(":") || name.startsWith("!")) return null;
        this.addSymbol("class", name, ctx);
        const ivs = findDescendants(ctx, "InputValueDefinitionContext");
        for (const iv of ivs) {
            const nm = nameText((iv as { name?: () => unknown }).name?.());
            if (nm) this.addSymbol("field", nm, ctx);
        }
        return null;
    };

    visitFieldDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        const name = nameText(ctx.name?.());
        if (!name) return null;
        // A field with argumentsDefinition reads as a method (resolver
        // that takes inputs); a bare field is a property.
        const args = ctx.argumentsDefinition?.();
        if (args) {
            const params = extractGraphqlArgs(args);
            this.addSymbol("method", name, ctx, params);
        } else {
            this.addSymbol("field", name, ctx);
        }
        return null;
    };

    visitDirectiveDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        const name = nameText(ctx.name?.());
        if (!name) return null;
        const args = ctx.argumentsDefinition?.();
        const params = args ? extractGraphqlArgs(args) : [];
        this.addSymbol("function", `@${name}`, ctx, params);
        return null;
    };

    visitSchemaDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        this.addSymbol("module", "schema", ctx);
        return null;
    };

    visitOperationDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        const name = nameText(ctx.name?.());
        if (!name) return null;
        const opType = ctx.operationType?.()?.getText?.() ?? "query";
        this.addSymbol("method", `${opType} ${name}`, ctx);
        return null;
    };

    visitFragmentDefinition = (ctx: any): null => {
        if (this.inBody) return null;
        const fn = ctx.fragmentName?.();
        const name = nameText(fn);
        if (name) this.addSymbol("method", `fragment ${name}`, ctx);
        return null;
    };
}

function nameText(ctx: unknown): string | null {
    if (!ctx) return null;
    return (ctx as { getText?: () => string }).getText?.() ?? null;
}

function extractGraphqlArgs(args: unknown): string[] {
    if (!args) return [];
    const node = args as { inputValueDefinition?: () => Array<unknown> | unknown };
    const raw = node.inputValueDefinition?.();
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const out: string[] = [];
    for (const a of arr) {
        const nm = nameText((a as { name?: () => unknown }).name?.());
        if (nm) out.push(nm);
    }
    return out;
}

function findDescendants(root: unknown, ctxName: string): unknown[] {
    const out: unknown[] = [];
    const stack: unknown[] = [root];
    while (stack.length > 0) {
        const node = stack.pop() as {
            constructor?: { name?: string };
            getChildCount?: () => number;
            getChild?: (i: number) => unknown;
        };
        if (!node) continue;
        if (node.constructor?.name === ctxName) out.push(node);
        const count = node.getChildCount?.() ?? 0;
        for (let i = 0; i < count; i += 1) stack.push(node.getChild?.(i));
    }
    return out;
}
