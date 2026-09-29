import { ROLE_LIMITS, VALID_ROLE_IDS } from "./role-limits.ts";

const FUNCTION_NAME = "two-rooms-identity-game";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
function dictionaryValues(name: string): string[] {
  try {
    const value = JSON.parse(Deno.env.get(name) ?? "{}");
    return value && typeof value === "object" ? Object.values(value).filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
const SERVICE_KEY = dictionaryValues("SUPABASE_SECRET_KEYS").find((key) => key.startsWith("sb_secret_"))
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  ?? "";
const PUBLIC_KEYS = new Set([
  ...dictionaryValues("SUPABASE_PUBLISHABLE_KEYS"),
  ...(Deno.env.get("SUPABASE_ANON_KEY") ? [Deno.env.get("SUPABASE_ANON_KEY")!] : []),
]);
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "no-store",
};

type RoomRow = {
  room_code: string;
  owner_token_hash: string;
  capacity: number;
  role_ids: string[];
  status: "waiting" | "dealt";
  created_at: string;
  dealt_at: string | null;
};

type PlayerRow = {
  id: string;
  nickname: string;
  seat: number;
  is_owner: boolean;
  player_token_hash?: string;
};

class GameError extends Error {
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.status = status;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

function fail(code: string, status = 400): never {
  throw new GameError(code, status);
}

function validCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function normalizeNickname(value: unknown): { name: string; key: string } {
  if (typeof value !== "string") fail("invalid_nickname");
  const name = value.normalize("NFKC").trim();
  if (!name || Array.from(name).length > 16 || /[\u0000-\u001f\u007f]/.test(name)) fail("invalid_nickname");
  return { name, key: name.toLocaleLowerCase("zh-CN") };
}

function validateDeck(capacity: number, ids: unknown): string[] {
  if (!Number.isInteger(capacity) || capacity < 4 || capacity > 40) fail("invalid_capacity");
  if (!Array.isArray(ids) || ids.length !== capacity) fail("invalid_deck");
  const counts = new Map<string, number>();
  for (const id of ids) {
    if (typeof id !== "string" || !Object.hasOwn(ROLE_LIMITS, id)) fail("invalid_deck");
    const next = (counts.get(id) ?? 0) + 1;
    if (next > ROLE_LIMITS[id]) fail("invalid_deck");
    counts.set(id, next);
  }
  return ids.slice();
}

function hashHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function tokenHash(token: unknown): Promise<string> {
  if (!validToken(token)) fail("token_invalid", 401);
  return hashHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

function requireEnvironment(): void {
  if (!SUPABASE_URL || !SERVICE_KEY) fail("backend_not_configured", 503);
}

function serviceHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "apikey": SERVICE_KEY,
    "content-type": "application/json",
  };
  if (SERVICE_KEY.startsWith("eyJ")) headers.authorization = "Bearer " + SERVICE_KEY;
  return headers;
}

async function decodeFailure(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const detail = JSON.parse(text);
    const message = String(detail.message ?? detail.error ?? "");
    if (/room_code|two_rooms_identity_rooms_pkey|duplicate key/i.test(message)) return "room_code_collision";
    if (/nickname_key|two_rooms_identity_players_room_code_nickname_key_key/i.test(message)) return "nickname_taken";
    return message || "database_error";
  } catch {
    return text || "database_error";
  }
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  requireEnvironment();
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    const message = await decodeFailure(response);
    throw new GameError(message, response.status >= 500 ? 503 : 400);
  }
  return await response.json() as T;
}

async function rows<T>(table: string, query: Record<string, string>): Promise<T[]> {
  requireEnvironment();
  const params = new URLSearchParams(query);
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?" + params.toString(), {
    headers: serviceHeaders(),
  });
  if (!response.ok) throw new GameError(await decodeFailure(response), 503);
  return await response.json() as T[];
}

function randomInteger(max: number): number {
  if (!Number.isInteger(max) || max < 1) throw new Error("invalid_random_range");
  const range = 0x100000000;
  const cutoff = Math.floor(range / max) * max;
  const sample = new Uint32Array(1);
  do { crypto.getRandomValues(sample); } while (sample[0] >= cutoff);
  return sample[0] % max;
}

function shuffle<T>(items: T[]): T[] {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInteger(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

async function getRoomRow(code: string): Promise<RoomRow> {
  const found = await rows<RoomRow>("two_rooms_identity_rooms", {
    select: "room_code,owner_token_hash,capacity,role_ids,status,created_at,dealt_at",
    room_code: "eq." + code,
    limit: "1",
  });
  if (!found[0]) fail("room_not_found", 404);
  return found[0];
}

async function getRoomView(code: string, playerToken: string, ownerToken: string) {
  if (!validCode(code)) fail("invalid_room_code");
  const memberHash = await tokenHash(playerToken);
  const room = await getRoomRow(code);
  const mine = await rows<PlayerRow & { player_token_hash: string }>("two_rooms_identity_players", {
    select: "id,nickname,seat,is_owner,player_token_hash",
    room_code: "eq." + code,
    player_token_hash: "eq." + memberHash,
    limit: "1",
  });
  if (!mine[0]) fail("not_a_player", 403);
  const roster = await rows<PlayerRow>("two_rooms_identity_players", {
    select: "id,nickname,seat,is_owner",
    room_code: "eq." + code,
    order: "seat.asc",
  });
  let ownRole: { id: string; instanceId: string } | null = null;
  if (room.status === "dealt") {
    const assignment = await rows<{ role_id: string; instance_id: string }>("two_rooms_identity_assignments", {
      select: "role_id,instance_id",
      room_code: "eq." + code,
      player_id: "eq." + mine[0].id,
      limit: "1",
    });
    if (!assignment[0] || !Object.hasOwn(ROLE_LIMITS, assignment[0].role_id)) fail("assignment_unavailable", 503);
    ownRole = { id: assignment[0].role_id, instanceId: assignment[0].instance_id };
  }
  const suppliedOwnerHash = ownerToken && validToken(ownerToken) ? await tokenHash(ownerToken) : "";
  return {
    roomCode: room.room_code,
    capacity: room.capacity,
    playerCount: roster.length,
    players: roster.map(({ nickname, seat, is_owner }) => ({ nickname, seat, isOwner: is_owner })),
    isOwner: Boolean(suppliedOwnerHash && suppliedOwnerHash === room.owner_token_hash),
    status: room.status,
    createdAt: room.created_at,
    dealtAt: room.dealt_at,
    ownRole,
  };
}

async function createRoom(body: Record<string, unknown>) {
  const capacity = Number(body.capacity);
  const roleIds = validateDeck(capacity, body.roleIds);
  const ownerHash = await tokenHash(body.ownerToken);
  const playerHash = await tokenHash(body.playerToken);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = String(1000 + randomInteger(9000));
    try {
      return await rpc("two_rooms_identity_create_room", {
        p_code: code,
        p_capacity: capacity,
        p_role_ids: roleIds,
        p_owner_token_hash: ownerHash,
        p_player_token_hash: playerHash,
      });
    } catch (error) {
      if (error instanceof GameError && error.message === "room_code_collision") continue;
      throw error;
    }
  }
  fail("room_code_unavailable", 503);
}

async function joinRoom(body: Record<string, unknown>) {
  const code = body.roomCode;
  if (!validCode(code)) fail("invalid_room_code");
  const nickname = normalizeNickname(body.nickname);
  const memberHash = await tokenHash(body.playerToken);
  return await rpc("two_rooms_identity_join_room", {
    p_code: code,
    p_nickname: nickname.name,
    p_nickname_key: nickname.key,
    p_player_token_hash: memberHash,
  });
}

async function startDeal(body: Record<string, unknown>) {
  const code = body.roomCode;
  if (!validCode(code)) fail("invalid_room_code");
  const ownerHash = await tokenHash(body.ownerToken);
  const room = await getRoomRow(code);
  if (ownerHash !== room.owner_token_hash) fail("not_owner", 403);
  if (room.status === "dealt") return { success: true, alreadyDealt: true };
  const players = await rows<PlayerRow>("two_rooms_identity_players", {
    select: "id,nickname,seat,is_owner",
    room_code: "eq." + code,
    order: "seat.asc",
  });
  if (players.length !== room.capacity) fail("room_not_full");
  const deck = validateDeck(room.capacity, room.role_ids);
  const shuffledRoles = shuffle(deck);
  const assignments = players.map((player, index) => ({
    player_id: player.id,
    role_id: shuffledRoles[index],
    instance_id: crypto.randomUUID(),
  }));
  return await rpc("two_rooms_identity_deal_room", {
    p_code: code,
    p_owner_token_hash: ownerHash,
    p_assignments: assignments,
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  try {
    const apiKey = request.headers.get("apikey") ?? "";
    if (!apiKey || !PUBLIC_KEYS.has(apiKey)) fail("unauthorized", 401);
    const body = await request.json() as Record<string, unknown>;
    let result: unknown;
    switch (body.action) {
      case "createRoom":
        result = await createRoom(body);
        break;
      case "joinRoom":
        result = await joinRoom(body);
        break;
      case "getRoom":
        result = { success: true, room: await getRoomView(String(body.roomCode ?? ""), String(body.playerToken ?? ""), String(body.ownerToken ?? "")) };
        break;
      case "startDeal":
        result = await startDeal(body);
        break;
      default:
        fail("invalid_action");
    }
    return json(result);
  } catch (error) {
    if (error instanceof GameError) return json({ success: false, error: error.message }, error.status);
    console.error(FUNCTION_NAME + " failed", error);
    return json({ success: false, error: "server_error" }, 500);
  }
});
