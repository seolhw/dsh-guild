Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let node_fs = require("node:fs");
let node_os = require("node:os");
let node_path = require("node:path");
let _deepseek_ai_dsh_settings = require("@deepseek-ai/dsh-settings");
let _deepseek_ai_schemastery = require("@deepseek-ai/schemastery");
_deepseek_ai_schemastery = __toESM(_deepseek_ai_schemastery, 1);
//#region node_modules/.pnpm/es-toolkit@1.52.0/node_modules/es-toolkit/dist/_internal/compareValues.mjs
function nullishRank(value) {
	if (value === null) return 1;
	if (value === void 0) return 2;
	return 0;
}
function compareAscending(a, b) {
	const aRank = nullishRank(a);
	const bRank = nullishRank(b);
	if (aRank < bRank) return -1;
	if (aRank > bRank) return 1;
	if (aRank !== 0) return 0;
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}
function compareValues(a, b, order) {
	return order === "asc" ? compareAscending(a, b) : compareAscending(b, a);
}
//#endregion
//#region node_modules/.pnpm/es-toolkit@1.52.0/node_modules/es-toolkit/dist/array/orderBy.mjs
/**
* Sorts an array of objects based on the given `criteria` and their corresponding order directions.
*
* - If you provide keys, it sorts the objects by the values of those keys.
* - If you provide functions, it sorts based on the values returned by those functions.
*
* The function returns the array of objects sorted in corresponding order directions.
* If two objects have the same value for the current criterion, it uses the next criterion to determine their order.
* If the number of orders is less than the number of criteria, it uses the last order for the rest of the criteria.
*
* @template T - The type of elements in the array.
* @param arr - The array of objects to be sorted.
* @param criteria  - The criteria for sorting. This can be an array of object keys or functions that return values used for sorting.
* @param orders - An array of order directions ('asc' for ascending or 'desc' for descending).
* @returns The sorted array.
*
* @example
* // Sort an array of objects by 'user' in ascending order and 'age' in descending order.
* const users = [
*   { user: 'fred', age: 48 },
*   { user: 'barney', age: 34 },
*   { user: 'fred', age: 40 },
*   { user: 'barney', age: 36 },
* ];
*
* const result = orderBy(users, [obj => obj.user, 'age'], ['asc', 'desc']);
* // result will be:
* // [
* //   { user: 'barney', age: 36 },
* //   { user: 'barney', age: 34 },
* //   { user: 'fred', age: 48 },
* //   { user: 'fred', age: 40 },
* // ]
*/
function orderBy(arr, criteria, orders) {
	return arr.slice().sort((a, b) => {
		const ordersLength = orders.length;
		for (let i = 0; i < criteria.length; i++) {
			const order = ordersLength > i ? orders[i] : orders[ordersLength - 1];
			const criterion = criteria[i];
			const criterionIsFunction = typeof criterion === "function";
			const result = compareValues(criterionIsFunction ? criterion(a) : a[criterion], criterionIsFunction ? criterion(b) : b[criterion], order);
			if (result !== 0) return result;
		}
		return 0;
	});
}
//#endregion
//#region node_modules/.pnpm/es-toolkit@1.52.0/node_modules/es-toolkit/dist/predicate/isPlainObject.mjs
/**
* Checks if a given value is a plain object.
*
* @param value - The value to check.
* @returns True if the value is a plain object, otherwise false.
*
* @example
* ```typescript
* // ✅👇 True
*
* isPlainObject({ });                       // ✅
* isPlainObject({ key: 'value' });          // ✅
* isPlainObject({ key: new Date() });       // ✅
* isPlainObject(new Object());              // ✅
* isPlainObject(Object.create(null));       // ✅
* isPlainObject({ nested: { key: true} });  // ✅
* isPlainObject(new Proxy({}, {}));         // ✅
* isPlainObject({ [Symbol('tag')]: 'A' });  // ✅
*
* // ✅👇 (cross-realms, node context, workers, ...)
* const runInNewContext = await import('node:vm').then(
*     (mod) => mod.runInNewContext
* );
* isPlainObject(runInNewContext('({})'));   // ✅
*
* // ❌👇 False
*
* class Test { };
* isPlainObject(new Test())           // ❌
* isPlainObject(10);                  // ❌
* isPlainObject(null);                // ❌
* isPlainObject('hello');             // ❌
* isPlainObject([]);                  // ❌
* isPlainObject(new Date());          // ❌
* isPlainObject(new Uint8Array([1])); // ❌
* isPlainObject(Buffer.from('ABC'));  // ❌
* isPlainObject(Promise.resolve({})); // ❌
* isPlainObject(Object.create({}));   // ❌
* isPlainObject(new (class Cls {}));  // ❌
* isPlainObject(globalThis);          // ❌,
* ```
*/
function isPlainObject(value) {
	if (!value || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	if (!(proto === null || proto === Object.prototype || Object.getPrototypeOf(proto) === null)) return false;
	return Object.prototype.toString.call(value) === "[object Object]";
}
//#endregion
//#region packages/host/src/index.ts
const name = "dsh-talk";
/** 需要 DSH 内置 service 就绪后才启动（会话分享依赖 sessions / sessionPersistence）。 */
const inject = [
	"settings",
	"webServer",
	"sessions",
	"sessionPersistence"
];
const TALK_NS = (0, _deepseek_ai_dsh_settings.settingsNamespace)("talk");
/**
* 默认后端地址：优先取本地环境变量 BETTER_AUTH_URL（`dsh web` 启动时已从仓库根
* .env 载入），未设置时回退到本地 8787。这是 settings 文档缺 key 时的兜底值。
*/
const DEFAULT_SERVER_URL = process.env.BETTER_AUTH_URL?.trim() || "http://127.0.0.1:8787";
const talkSettingsSchema = _deepseek_ai_schemastery.default.object({
	serverUrl: _deepseek_ai_schemastery.default.string().default(DEFAULT_SERVER_URL),
	handle: _deepseek_ai_schemastery.default.string().default(""),
	/** secret：settings 文档 redact 时会被剥掉，不会随描述接口外泄 */
	token: _deepseek_ai_schemastery.default.string().role("secret").default(""),
	autoReconnect: _deepseek_ai_schemastery.default.boolean().default(true),
	share: _deepseek_ai_schemastery.default.object({ maxSizeMb: _deepseek_ai_schemastery.default.number().default(50) })
});
function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => {
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				const raw = Buffer.concat(chunks).toString("utf8");
				resolve(raw.length > 0 ? JSON.parse(raw) : {});
			} catch (error) {
				reject(error);
			}
		});
		req.on("error", reject);
	});
}
function sendJson(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
const errorOf = (error) => error instanceof Error ? error.message : String(error);
function sanitizePatch(raw) {
	if (!isPlainObject(raw)) return {};
	const patch = {};
	const { serverUrl, handle, token, autoReconnect, share } = raw;
	if (typeof serverUrl === "string" && serverUrl.length > 0) patch.serverUrl = serverUrl;
	if (typeof handle === "string") patch.handle = handle;
	if (typeof token === "string") patch.token = token;
	if (typeof autoReconnect === "boolean") patch.autoReconnect = autoReconnect;
	if (isPlainObject(share)) {
		const maxSizeMb = share.maxSizeMb;
		if (typeof maxSizeMb === "number" && maxSizeMb > 0) patch.share = { maxSizeMb };
	}
	return patch;
}
/**
* BETTER_AUTH_URL 是后端 Server 唯一的环境声明：本地地址就连本地，
* 生产地址就连生产。`dsh web` 启动时会从仓库根 .env 加载它（dsh-app-boot），
* 因此 host 进程可直接读到。设置了它时优先于 settings 里的 serverUrl。
*/
function envServerUrl() {
	const value = process.env.BETTER_AUTH_URL?.trim();
	return value && value.length > 0 ? value : void 0;
}
/** settings 与 BETTER_AUTH_URL 合并后的生效配置：环境变量优先。 */
function effectiveSettings(scope) {
	const current = scope.get();
	const serverUrl = envServerUrl();
	return serverUrl ? {
		...current,
		serverUrl
	} : current;
}
/** 会话包格式版本（host ↔ host；服务端只透传 manifest） */
const SESSION_PACKAGE_VERSION = 1;
function serviceOf(ctx, key) {
	return ctx.get(key);
}
/** 解析下载到的字节：是本机会话包则返回，否则 null */
function parseAgentSessionPackage(bytes) {
	let parsed;
	try {
		parsed = JSON.parse(bytes.toString("utf8"));
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const pack = parsed;
	if (pack.kind !== "agent-session") return null;
	if (!Array.isArray(pack.events)) return null;
	if (typeof pack.header !== "object" || pack.header === null) return null;
	return pack;
}
/** 克隆会话的落地工作区名（用户主目录下的同名目录 + 工作区标题） */
const CLONE_WORKSPACE_NAME = "DSH-Talk";
/**
* 克隆会话的默认落地目录：用户主目录下的 DSH-Talk，不存在则新建。
* 不写死绝对路径 —— 每个用户的家目录不同，用 homedir() 现算。
*/
function ensureCloneWorkspaceDir() {
	const dir = (0, node_path.join)((0, node_os.homedir)(), CLONE_WORKSPACE_NAME);
	(0, node_fs.mkdirSync)(dir, { recursive: true });
	return dir;
}
/**
* 把刚还原的会话挂进「DSH-Talk」工作区。工作区按目录注册：同一目录已注册时
* 直接复用那条记录（标题保持不变），因此重复克隆都落在同一个工作区里。
* 注册表不可用或挂载失败时静默跳过（会话照常可用，只是留在「未分组」）。
*/
async function attachToCloneWorkspace(ctx, sessionId, cwd) {
	const registry = serviceOf(ctx, "workspaceRegistry");
	if (!registry) return;
	try {
		await (await registry.create(cwd, CLONE_WORKSPACE_NAME)).attachSession(sessionId);
	} catch {}
}
function buildSessionPackage(meta, events, inheritedEventCount) {
	return {
		kind: "agent-session",
		manifest: {
			packageVersion: SESSION_PACKAGE_VERSION,
			sessionId: meta.id,
			...meta.cwd ? { cwd: meta.cwd } : {},
			sessionVersion: meta.version,
			eventCount: events.length,
			createdAt: meta.createdAt
		},
		header: {
			version: meta.version,
			id: meta.id,
			createdAt: meta.createdAt,
			...meta.cwd ? { cwd: meta.cwd } : {},
			...meta.parentSession ? { parentSession: meta.parentSession } : {},
			...meta.isSeeded ? { isSeeded: true } : {},
			...inheritedEventCount > 0 ? { inheritedEventCount } : {}
		},
		events: [...events]
	};
}
/** 取会话持久化服务；不可用时就地回 503 并返回 null */
function persistenceOr503(ctx, res) {
	const persistence = serviceOf(ctx, "sessionPersistence");
	if (!persistence) {
		sendJson(res, 503, {
			code: "INTERNAL",
			message: "会话持久化服务不可用"
		});
		return null;
	}
	return persistence;
}
function sessionRoutes(ctx, scope) {
	return [{
		kind: "exact",
		path: "/api/talk/sessions",
		handler: async (_req, res) => {
			const persistence = persistenceOr503(ctx, res);
			if (!persistence) return;
			try {
				sendJson(res, 200, { sessions: orderBy(await persistence.list(), [(s) => s.header.createdAt], ["desc"]).slice(0, 200).map((snapshot) => {
					const header = snapshot.header;
					return {
						id: header.id,
						createdAt: header.createdAt,
						...header.cwd ? { cwd: header.cwd } : {},
						...header.parentSession ? { parentSession: header.parentSession } : {}
					};
				}) });
			} catch (error) {
				sendJson(res, 500, {
					code: "INTERNAL",
					message: errorOf(error)
				});
			}
		}
	}, {
		kind: "exact",
		path: "/api/talk/session-package",
		handler: async (req, res) => {
			const persistence = persistenceOr503(ctx, res);
			if (!persistence) return;
			const sessionId = new URL(req.url ?? "", "http://localhost").searchParams.get("sessionId")?.trim();
			if (!sessionId) {
				sendJson(res, 400, {
					code: "BAD_REQUEST",
					message: "缺少 sessionId"
				});
				return;
			}
			try {
				const handle = await persistence.open(sessionId, "read");
				try {
					const { events } = await handle.read(0);
					const body = Buffer.from(JSON.stringify(buildSessionPackage(handle.header, events, handle.inheritedEventCount)), "utf8");
					const maxBytes = scope.get().share.maxSizeMb * 1024 * 1024;
					if (body.byteLength > maxBytes) {
						sendJson(res, 413, {
							code: "PAYLOAD_TOO_LARGE",
							message: `会话包超过 ${Math.round(maxBytes / 1024 / 1024)} MiB 上限`
						});
						return;
					}
					res.writeHead(200, {
						"content-type": "application/json; charset=utf-8",
						"content-length": String(body.byteLength)
					});
					res.end(body);
				} finally {
					await handle.close();
				}
			} catch (error) {
				sendJson(res, 500, {
					code: "INTERNAL",
					message: errorOf(error)
				});
			}
		}
	}];
}
function talkRoutes(ctx, scope) {
	return [
		{
			kind: "exact",
			path: "/api/talk/config",
			handler: async (req, res) => {
				if (req.method === "GET") {
					sendJson(res, 200, effectiveSettings(scope));
					return;
				}
				if (req.method === "POST") {
					try {
						const patch = sanitizePatch(await readJsonBody(req));
						if (Object.keys(patch).length === 0) {
							sendJson(res, 400, {
								code: "BAD_REQUEST",
								message: "empty patch"
							});
							return;
						}
						await scope.update(patch);
						sendJson(res, 200, effectiveSettings(scope));
					} catch (error) {
						sendJson(res, 500, {
							code: "INTERNAL",
							message: errorOf(error)
						});
					}
					return;
				}
				sendJson(res, 405, {
					code: "BAD_REQUEST",
					message: "method not allowed"
				});
			}
		},
		{
			kind: "exact",
			path: "/api/talk/clone",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					sendJson(res, 405, {
						code: "BAD_REQUEST",
						message: "method not allowed"
					});
					return;
				}
				try {
					const body = await readJsonBody(req);
					const downloadUrl = typeof body.downloadUrl === "string" ? body.downloadUrl : "";
					const wantedCwd = typeof body.cwd === "string" && (0, node_path.isAbsolute)(body.cwd) ? body.cwd : void 0;
					let url;
					try {
						url = new URL(downloadUrl);
					} catch {
						sendJson(res, 400, {
							code: "BAD_REQUEST",
							message: "downloadUrl 无效"
						});
						return;
					}
					const allowed = new URL(effectiveSettings(scope).serverUrl).host;
					if (url.host !== allowed) {
						sendJson(res, 400, {
							code: "BAD_REQUEST",
							message: `只允许从 ${allowed} 下载`
						});
						return;
					}
					const started = Date.now();
					const response = await fetch(downloadUrl);
					if (!response.ok) {
						sendJson(res, 502, {
							code: "INTERNAL",
							message: `下载失败 HTTP ${response.status}`
						});
						return;
					}
					const bytes = Buffer.from(await response.arrayBuffer());
					const pack = parseAgentSessionPackage(bytes);
					if (!pack) {
						sendJson(res, 422, {
							code: "MANIFEST_INVALID",
							message: "仅支持 DSH 会话包，无法还原该分享"
						});
						return;
					}
					const store = serviceOf(ctx, "sessions");
					if (!store) {
						sendJson(res, 503, {
							code: "INTERNAL",
							message: "会话服务不可用"
						});
						return;
					}
					const cwd = wantedCwd ?? ensureCloneWorkspaceDir();
					const session = store.create(void 0, {
						seed: pack.events,
						meta: { cwd }
					});
					await store.flush(session);
					await attachToCloneWorkspace(ctx, session.id, cwd);
					sendJson(res, 200, {
						bytes: bytes.byteLength,
						elapsedMs: Date.now() - started,
						sessionId: session.id
					});
				} catch (error) {
					sendJson(res, 500, {
						code: "INTERNAL",
						message: errorOf(error)
					});
				}
			}
		},
		...sessionRoutes(ctx, scope)
	];
}
function apply(ctx) {
	const scope = ctx.settings.register(TALK_NS, talkSettingsSchema, { applies: "live" });
	const disposers = [];
	for (const route of talkRoutes(ctx, scope)) disposers.push(ctx.webServer.register(route));
	ctx.effect(() => () => {
		for (const dispose of disposers) dispose();
	}, "dsh-talk: config api");
}
//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
