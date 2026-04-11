/**
 * GraphQL, gRPC, and WebSocket detector.
 *
 * GraphQL:  .graphql SDL files, gql`` template literals, Apollo Server typeDefs,
 *           Pothos SchemaBuilder, Strawberry (Python), graphene (Python)
 * gRPC:     .proto service/rpc definitions
 * WebSocket: Socket.io events, ws events, native WebSocket handlers
 */

import { relative } from "node:path";
import { readFileSafe } from "../scanner.js";
import type { RouteInfo, ProjectInfo } from "../types.js";

// ---------- GraphQL ----------

export async function detectGraphQLRoutes(
  files: string[],
  project: ProjectInfo
): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];

  // SDL files (.graphql / .gql)
  const sdlFiles = files.filter((f) => f.endsWith(".graphql") || f.endsWith(".gql"));
  for (const file of sdlFiles) {
    const content = await readFileSafe(file);
    if (!content) continue;
    const rel = relative(project.root, file).replace(/\\/g, "/");
    routes.push(...extractSDLOperations(content, rel));
  }

  // JS/TS files — gql template literals + Apollo typeDefs + Pothos
  const tsJsFiles = files.filter((f) =>
    /\.(ts|tsx|js|jsx|mjs)$/.test(f) && !f.includes("node_modules")
  );
  for (const file of tsJsFiles) {
    const content = await readFileSafe(file);
    if (!content) continue;
    if (
      !content.includes("graphql") &&
      !content.includes("gql`") &&
      !content.includes("typeDefs") &&
      !content.includes("SchemaBuilder") &&
      !content.includes("buildSchema")
    ) continue;

    const rel = relative(project.root, file).replace(/\\/g, "/");

    // gql template literals: gql`...`
    const gqlTagPattern = /gql`([\s\S]*?)`/g;
    let match: RegExpExecArray | null;
    while ((match = gqlTagPattern.exec(content)) !== null) {
      routes.push(...extractSDLOperations(match[1], rel));
    }

    // Apollo Server / graphql-yoga inline typeDefs string
    const typeDefsPattern = /typeDefs\s*=\s*[`'"]([\s\S]*?)[`'"]/g;
    while ((match = typeDefsPattern.exec(content)) !== null) {
      routes.push(...extractSDLOperations(match[1], rel));
    }

    // Pothos SchemaBuilder: t.queryField("name", ...) / t.mutationField(...) / t.subscriptionField(...)
    const pothosMethods = ["queryField", "mutationField", "subscriptionField", "queryFields", "mutationFields"];
    for (const method of pothosMethods) {
      const re = new RegExp(`\\.${method}\\s*\\(\\s*["'\`]([\\w]+)["'\`]`, "g");
      while ((match = re.exec(content)) !== null) {
        const operationType = method.startsWith("query")
          ? "QUERY"
          : method.startsWith("mutation")
          ? "MUTATION"
          : "SUBSCRIPTION";
        routes.push({
          method: operationType,
          path: match[1],
          file: rel,
          tags: [],
          framework: "graphql",
          confidence: "regex",
        });
      }
    }
  }

  // Python — Strawberry + graphene
  const pyFiles = files.filter((f) => f.endsWith(".py"));
  for (const file of pyFiles) {
    const content = await readFileSafe(file);
    if (!content) continue;
    if (!content.includes("strawberry") && !content.includes("graphene")) continue;

    const rel = relative(project.root, file).replace(/\\/g, "/");

    // Strawberry: @strawberry.type / @strawberry.input + resolver functions
    // @strawberry.mutation / @strawberry.query / @strawberry.subscription
    const strawberryOps = [
      { decorator: "@strawberry.query", method: "QUERY" },
      { decorator: "@strawberry.mutation", method: "MUTATION" },
      { decorator: "@strawberry.subscription", method: "SUBSCRIPTION" },
    ];
    for (const { decorator, method } of strawberryOps) {
      const idx = content.indexOf(decorator);
      if (idx === -1) continue;
      // Find function name after decorator
      const after = content.slice(idx + decorator.length, idx + decorator.length + 200);
      const fnMatch = after.match(/def\s+(\w+)/);
      if (fnMatch) {
        routes.push({
          method,
          path: fnMatch[1],
          file: rel,
          tags: [],
          framework: "graphql",
          confidence: "regex",
        });
      }
    }

    // Strawberry @strawberry.type class: collect resolver methods
    const typeClassPat = /@strawberry\.type[\s\S]{0,20}class\s+Query\b|@strawberry\.type[\s\S]{0,20}class\s+Mutation\b/;
    if (typeClassPat.test(content)) {
      // Extract method names from Query / Mutation classes
      const queryMethods = content.matchAll(/\bdef\s+(\w+)\s*\(self/g);
      for (const m of queryMethods) {
        if (m[1] !== "__init__") {
          const isInMutation = isInsideMutationClass(content, m.index ?? 0);
          routes.push({
            method: isInMutation ? "MUTATION" : "QUERY",
            path: m[1],
            file: rel,
            tags: [],
            framework: "graphql",
            confidence: "regex",
          });
        }
      }
    }

    // graphene: graphene.ObjectType subclasses with resolve_ methods
    const grapheneResolvers = content.matchAll(/def\s+resolve_(\w+)\s*\(/g);
    for (const m of grapheneResolvers) {
      routes.push({
        method: "QUERY",
        path: m[1],
        file: rel,
        tags: [],
        framework: "graphql",
        confidence: "regex",
      });
    }
    const grapheneMutations = content.matchAll(/class\s+(\w+)\s*\(graphene\.Mutation\)/g);
    for (const m of grapheneMutations) {
      routes.push({
        method: "MUTATION",
        path: m[1],
        file: rel,
        tags: [],
        framework: "graphql",
        confidence: "regex",
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}:${r.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractSDLOperations(sdl: string, file: string): RouteInfo[] {
  const routes: RouteInfo[] = [];

  // type Query { fieldName(args): ReturnType }
  const typeBlocks: { type: string; body: string }[] = [];
  const typeBlockPat = /\b(type|extend type)\s+(Query|Mutation|Subscription)\s*\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = typeBlockPat.exec(sdl)) !== null) {
    typeBlocks.push({ type: m[2], body: m[3] });
  }

  for (const { type, body } of typeBlocks) {
    const method =
      type.toLowerCase() === "query"
        ? "QUERY"
        : type.toLowerCase() === "mutation"
        ? "MUTATION"
        : "SUBSCRIPTION";

    // Each line is either a field definition or blank/comment
    for (const line of body.split("\n")) {
      const cleaned = line.trim().replace(/#.*$/, "");
      if (!cleaned) continue;
      // fieldName(args...): ReturnType  OR  fieldName: ReturnType
      const fieldMatch = cleaned.match(/^(\w+)\s*[:(]/);
      if (fieldMatch) {
        routes.push({
          method,
          path: fieldMatch[1],
          file,
          tags: [],
          framework: "graphql",
          confidence: "ast",
        });
      }
    }
  }

  return routes;
}

function isInsideMutationClass(content: string, idx: number): boolean {
  // Walk backwards to find the nearest class definition
  const before = content.slice(0, idx);
  const lastClass = before.lastIndexOf("class ");
  if (lastClass === -1) return false;
  const classLine = content.slice(lastClass, lastClass + 100);
  return /class\s+Mutation\b/.test(classLine);
}

// ---------- gRPC ----------

export async function detectGRPCRoutes(
  files: string[],
  project: ProjectInfo
): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  const protoFiles = files.filter((f) => f.endsWith(".proto"));

  for (const file of protoFiles) {
    const content = await readFileSafe(file);
    if (!content) continue;
    const rel = relative(project.root, file).replace(/\\/g, "/");

    // service ServiceName { rpc MethodName (RequestType) returns (ResponseType); }
    const serviceBlocks = content.matchAll(/service\s+(\w+)\s*\{([^}]*)\}/g);
    for (const serviceMatch of serviceBlocks) {
      const serviceName = serviceMatch[1];
      const body = serviceMatch[2];

      const rpcDefs = body.matchAll(/rpc\s+(\w+)\s*\((\w+)\)\s+returns\s+\((\w+)\)/g);
      for (const rpc of rpcDefs) {
        routes.push({
          method: "RPC",
          path: `/${serviceName}/${rpc[1]}`,
          file: rel,
          tags: [],
          framework: "grpc",
          requestType: rpc[2],
          responseType: rpc[3],
          confidence: "ast",
        });
      }
    }
  }

  return routes;
}

// ---------- WebSocket ----------

export async function detectWebSocketRoutes(
  files: string[],
  project: ProjectInfo
): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];

  const relevantFiles = files.filter(
    (f) => /\.(ts|tsx|js|jsx|mjs|py|rb)$/.test(f) && !f.includes("node_modules")
  );

  for (const file of relevantFiles) {
    const content = await readFileSafe(file);
    if (!content) continue;
    if (
      !content.includes("socket") &&
      !content.includes("WebSocket") &&
      !content.includes("ws.") &&
      !content.includes("channel") &&
      !content.includes("Channel")
    ) continue;

    const rel = relative(project.root, file).replace(/\\/g, "/");

    // Socket.io server: io.on('connection', ...) / socket.on('eventName', ...)
    const socketOnPat = /(?:socket|io|ws)\.on\s*\(\s*["'`]([^"'`]+)["'`]/g;
    let m: RegExpExecArray | null;
    while ((m = socketOnPat.exec(content)) !== null) {
      const eventName = m[1];
      if (eventName === "connection" || eventName === "disconnect") continue; // lifecycle, not app events
      routes.push({
        method: "WS",
        path: eventName,
        file: rel,
        tags: [],
        framework: "websocket",
        confidence: "regex",
      });
    }

    // Socket.io rooms: socket.join('room')
    const roomPat = /socket\.join\s*\(\s*["'`]([^"'`]+)["'`]/g;
    const seenRooms = new Set<string>();
    while ((m = roomPat.exec(content)) !== null) {
      if (!seenRooms.has(m[1])) {
        seenRooms.add(m[1]);
        routes.push({
          method: "WS-ROOM",
          path: m[1],
          file: rel,
          tags: [],
          framework: "websocket",
          confidence: "regex",
        });
      }
    }

    // Phoenix channels: channel "room:*", MyChannel (Elixir)
    const phoenixChannelPat = /channel\s+"([^"]+)"/g;
    while ((m = phoenixChannelPat.exec(content)) !== null) {
      routes.push({
        method: "WS",
        path: m[1],
        file: rel,
        tags: [],
        framework: "websocket",
        confidence: "regex",
      });
    }

    // Rails ActionCable: class RoomChannel < ApplicationCable::Channel
    if (file.endsWith(".rb")) {
      const acPat = /class\s+(\w+Channel)\s*<\s*(?:\w+::)*Channel/g;
      while ((m = acPat.exec(content)) !== null) {
        routes.push({
          method: "WS",
          path: m[1].replace(/Channel$/, "").replace(/([A-Z])/g, (_, c, i) => (i > 0 ? "_" : "") + c.toLowerCase()),
          file: rel,
          tags: ["ActionCable"],
          framework: "websocket",
          confidence: "regex",
        });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}:${r.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
