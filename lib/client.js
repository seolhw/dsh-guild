window.__ModuleLoader__.load({
	id: "dsh-talk",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		//#region packages/types/src/entities.ts
		/**
		* 消息可「撤回」（作者删除）的有效窗口。
		* 超过该时间后作者不能删除自己的消息，只能编辑（moderator 删除不受此限）。
		*/
		const MESSAGE_RETRACT_MS = 12e4;
		/**
		* 权限位（bitfield）。角色自带一组基础权限，频道再用 overwrite 对
		* @everyone / 角色 / 成员 逐个叠加 allow/deny；解析见 server/src/lib/permissions.ts。
		*
		* 命名与语义对齐 Discord：频道级位可作 overwrite 目标，社区级位只能挂在角色上
		* （见 PERMISSION_INFO 的 scope）。位序即 UI 展示顺序，新增位一律追加。
		*/
		const Permission = {
			/** 查看频道：看不到 = 频道不下发、不可订阅、不可读消息 */
			VIEW_CHANNEL: 1,
			/** 发送消息：在主频道与讨论组里发言 */
			SEND_MESSAGES: 2,
			/** 创建讨论组/话题 */
			CREATE_THREAD: 4,
			/** 管理讨论组：改名/归档/删除/加人/标记解决 */
			MANAGE_THREADS: 8,
			/** 管理消息：改/删/撤回他人消息 */
			MANAGE_MESSAGES: 16,
			/** 管理频道：新建/改名/删除频道、调整顺序、管理频道权限覆盖 */
			MANAGE_CHANNEL: 32,
			/** 管理社区：改社区资料、隐私与短标识（删社区/转让仅 owner） */
			MANAGE_COMMUNITY: 64,
			/** 管理角色：增删改角色、调整层级、给成员分配角色（受层级限制） */
			MANAGE_ROLES: 128,
			/** 邀请成员：邀请注册用户加入社区 */
			INVITE_MEMBERS: 256,
			/** 移除成员（踢人，可被邀请码重新加入） */
			KICK_MEMBERS: 512,
			/** 封禁成员：移出并阻止重新加入、管理封禁名单 */
			BAN_MEMBERS: 1024,
			/** 管理员：等价于拥有全部权限且忽略频道覆盖（仍不能转让/删除社区） */
			ADMINISTRATOR: 2048
		};
		Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.CREATE_THREAD | Permission.MANAGE_THREADS | Permission.MANAGE_MESSAGES | Permission.MANAGE_CHANNEL | Permission.MANAGE_COMMUNITY | Permission.MANAGE_ROLES | Permission.INVITE_MEMBERS | Permission.KICK_MEMBERS | Permission.BAN_MEMBERS | Permission.ADMINISTRATOR;
		Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.CREATE_THREAD;
		/**
		* 建社区时预置的「管理员」角色名（权限位只有 ADMINISTRATOR）。
		* 只是预设：可改名、可删除、不会自动分配给任何人。
		*/
		const DEFAULT_ADMIN_ROLE_NAME = "管理员";
		/** 全部权限位元数据（顺序即 UI 顺序） */
		const PERMISSION_INFO = [
			{
				bit: Permission.VIEW_CHANNEL,
				label: "查看频道",
				hint: "看不到则频道不下发、不可订阅、不可读消息",
				scope: "channel"
			},
			{
				bit: Permission.SEND_MESSAGES,
				label: "发送消息",
				hint: "在频道与讨论组里发言",
				scope: "channel"
			},
			{
				bit: Permission.CREATE_THREAD,
				label: "创建讨论组",
				hint: "在频道里开讨论组/话题",
				scope: "channel"
			},
			{
				bit: Permission.MANAGE_THREADS,
				label: "管理讨论组",
				hint: "改名/归档/删除讨论组、加人、标记解决",
				scope: "channel"
			},
			{
				bit: Permission.MANAGE_MESSAGES,
				label: "管理消息",
				hint: "改/删/撤回他人消息",
				scope: "channel"
			},
			{
				bit: Permission.MANAGE_CHANNEL,
				label: "管理频道",
				hint: "新建/改名/删除频道、调整顺序、管理频道权限覆盖",
				scope: "channel"
			},
			{
				bit: Permission.MANAGE_COMMUNITY,
				label: "管理社区",
				hint: "改社区资料、隐私与短标识（删除/转让仅 owner）",
				scope: "community"
			},
			{
				bit: Permission.MANAGE_ROLES,
				label: "管理角色",
				hint: "增删改角色、调整层级、给成员分配角色（受层级限制）",
				scope: "community"
			},
			{
				bit: Permission.INVITE_MEMBERS,
				label: "邀请成员",
				hint: "邀请已注册用户加入社区",
				scope: "community"
			},
			{
				bit: Permission.KICK_MEMBERS,
				label: "移除成员",
				hint: "把成员移出社区（可被邀请码重新加入）",
				scope: "community"
			},
			{
				bit: Permission.BAN_MEMBERS,
				label: "封禁成员",
				hint: "移出并禁止重新加入、管理封禁名单",
				scope: "community"
			},
			{
				bit: Permission.ADMINISTRATOR,
				label: "管理员",
				hint: "拥有全部权限并忽略频道覆盖（删除/转让社区仍仅 owner）",
				scope: "community"
			}
		];
		/** 可作频道覆盖目标的权限位（ADMINISTRATOR 与社区级位不可覆盖） */
		const CHANNEL_OVERWRITE_PERMISSIONS = PERMISSION_INFO.filter((p) => p.scope === "channel");
		/** @everyone 覆盖用固定 targetId（避免 null 主键） */
		const EVERYONE_TARGET_ID = "@everyone";
		//#endregion
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
		//#region node_modules/.pnpm/es-toolkit@1.52.0/node_modules/es-toolkit/dist/array/partition.mjs
		function partition(arr, isInTruthy) {
			const truthy = [];
			const falsy = [];
			for (let i = 0; i < arr.length; i++) {
				const item = arr[i];
				if (isInTruthy(item, i, arr)) truthy.push(item);
				else falsy.push(item);
			}
			return [truthy, falsy];
		}
		//#endregion
		//#region node_modules/.pnpm/es-toolkit@1.52.0/node_modules/es-toolkit/dist/array/sortBy.mjs
		/**
		* Sorts an array of objects based on the given `criteria`.
		*
		* - If you provide keys, it sorts the objects by the values of those keys.
		* - If you provide functions, it sorts based on the values returned by those functions.
		*
		* The function returns the array of objects sorted in ascending order.
		* If two objects have the same value for the current criterion, it uses the next criterion to determine their order.
		*
		* @template T - The type of the objects in the array.
		* @param arr - The array of objects to be sorted.
		* @param criteria - The criteria for sorting. This can be an array of object keys or functions that return values used for sorting.
		* @returns The sorted array.
		*
		* @example
		* const users = [
		*  { user: 'foo', age: 24 },
		*  { user: 'bar', age: 7 },
		*  { user: 'foo', age: 8 },
		*  { user: 'bar', age: 29 },
		* ];
		*
		* sortBy(users, ['user', 'age']);
		* sortBy(users, [obj => obj.user, 'age']);
		* // results will be:
		* // [
		* //   { user : 'bar', age: 7 },
		* //   { user : 'bar', age: 29 },
		* //   { user : 'foo', age: 8 },
		* //   { user : 'foo', age: 24 },
		* // ]
		*/
		function sortBy(arr, criteria) {
			return orderBy(arr, criteria, ["asc"]);
		}
		//#endregion
		//#region node_modules/.pnpm/es-toolkit@1.52.0/node_modules/es-toolkit/dist/array/uniq.mjs
		/**
		* Creates a duplicate-free version of an array.
		*
		* This function takes an array and returns a new array containing only the unique values
		* from the original array, preserving the order of first occurrence.
		*
		* @template T - The type of elements in the array.
		* @param arr - The array to process.
		* @returns A new array with only unique values from the original array.
		*
		* @example
		* const array = [1, 2, 2, 3, 4, 4, 5];
		* const result = uniq(array);
		* // result will be [1, 2, 3, 4, 5]
		*/
		function uniq(arr) {
			return [...new Set(arr)];
		}
		//#endregion
		//#region packages/client/src/config.ts
		var HostConfigError = class extends Error {
			status;
			constructor(message, status) {
				super(message);
				this.status = status;
			}
		};
		/** 从错误响应体里取出可读文案：优先 JSON 的 message，其次原文，最后 fallback */
		function errorMessageFrom(text, fallback) {
			if (text.length === 0) return fallback;
			try {
				const data = JSON.parse(text);
				if (typeof data.message === "string" && data.message.length > 0) return data.message;
			} catch {}
			return text;
		}
		async function hostFetch(input, init) {
			const res = await fetch(input, init);
			const text = await res.text();
			if (!res.ok) throw new HostConfigError(errorMessageFrom(text, ""), res.status);
			return text.length > 0 ? JSON.parse(text) : {};
		}
		function hostConfigGet() {
			return hostFetch("/api/talk/config");
		}
		function hostConfigSet(patch) {
			return hostFetch("/api/talk/config", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(patch)
			});
		}
		/** GET /api/talk/sessions —— 本机可分享的 DSH 会话 */
		function hostSessions() {
			return hostFetch("/api/talk/sessions");
		}
		/** GET /api/talk/session-package —— 打包一个会话，返回包体原始文本 */
		async function hostSessionPackage(sessionId) {
			const res = await fetch(`/api/talk/session-package?sessionId=${encodeURIComponent(sessionId)}`);
			const text = await res.text();
			if (!res.ok) throw new HostConfigError(errorMessageFrom(text, `打包失败 HTTP ${res.status}`), res.status);
			return text;
		}
		/** POST /api/talk/clone —— 让 host 下载分享包；会话包会直接还原成本地会话 */
		function hostClone(downloadUrl, cwd) {
			return hostFetch("/api/talk/clone", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(cwd ? {
					downloadUrl,
					cwd
				} : { downloadUrl })
			});
		}
		//#endregion
		//#region packages/client/src/reminders.ts
		const STORAGE_KEY = "dsh-talk.reminder-settings";
		const DEFAULT_SETTINGS = {
			desktop: false,
			dnd: false
		};
		/** 读本机提醒设置（损坏或不可用时回落到默认值） */
		function getReminderSettings() {
			try {
				const raw = localStorage.getItem(STORAGE_KEY);
				if (raw === null) return { ...DEFAULT_SETTINGS };
				const parsed = JSON.parse(raw);
				return {
					desktop: parsed.desktop === true,
					dnd: parsed.dnd === true
				};
			} catch {
				return { ...DEFAULT_SETTINGS };
			}
		}
		/** 写本机提醒设置，返回合并后的结果 */
		function saveReminderSettings(patch) {
			const next = {
				...getReminderSettings(),
				...patch
			};
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			} catch {}
			return next;
		}
		/** 浏览器是否支持桌面通知 */
		function notificationsSupported() {
			return typeof Notification !== "undefined";
		}
		/** 请求通知授权；返回是否已授权（已拒绝时直接返回 false，不再弹授权框） */
		async function requestNotificationPermission() {
			if (!notificationsSupported()) return false;
			if (Notification.permission === "granted") return true;
			if (Notification.permission === "denied") return false;
			return await Notification.requestPermission() === "granted";
		}
		/** 弹一条桌面通知；点击后聚焦本页面。前置条件由调用方判定 */
		function showDesktopNotification(title, body) {
			if (!notificationsSupported() || Notification.permission !== "granted") return;
			try {
				const notification = new Notification(title, {
					body,
					tag: "dsh-talk-mention"
				});
				notification.onclick = () => {
					window.focus();
					notification.close();
				};
			} catch {}
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
		//#region node_modules/.pnpm/es-toolkit@1.52.0/node_modules/es-toolkit/dist/object/pickBy.mjs
		/**
		* Creates a new object composed of the properties that satisfy the predicate function.
		*
		* This function takes an object and a predicate function, and returns a new object that
		* includes only the properties for which the predicate function returns true.
		*
		* @template T - The type of object.
		* @param obj - The object to pick properties from.
		* @param shouldPick - A predicate function that determines
		* whether a property should be picked. It takes the property's key and value as arguments and returns `true`
		* if the property should be picked, and `false` otherwise. Numeric keys are passed as strings.
		* @returns A new object with the properties that satisfy the predicate function.
		*
		* @example
		* const obj = { a: 1, b: 'pick', c: 3 };
		* const shouldPick = (value) => typeof value === 'string';
		* const result = pickBy(obj, shouldPick);
		* // result will be { b: 'pick' }
		*/
		function pickBy(obj, shouldPick) {
			const result = {};
			const keys = Object.keys(obj);
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				const objectKey = key;
				const value = obj[objectKey];
				if (shouldPick(value, key)) result[objectKey] = value;
			}
			return result;
		}
		//#endregion
		//#region packages/client/src/server.ts
		var ServerApiError = class extends Error {
			status;
			code;
			requestId;
			details;
			constructor(status, code, message, requestId, details) {
				super(message);
				this.status = status;
				this.code = code;
				this.requestId = requestId;
				this.details = details;
			}
		};
		const errorMessage$1 = (data, text) => {
			if (data && typeof data === "object") {
				const maybe = data;
				if (typeof maybe.message === "string" && maybe.message.length > 0) return maybe.message;
				if (typeof maybe.error === "string" && maybe.error.length > 0) return maybe.error;
				if (maybe.error && typeof maybe.error === "object") {
					const first = Object.values(maybe.error)[0];
					if (Array.isArray(first) && typeof first[0] === "string") return first[0];
				}
			}
			return text.length > 0 ? text : "request failed";
		};
		/** 读取响应体并尽力解析 JSON；空体或非 JSON 时 data 为 null */
		async function readJson(res) {
			const text = await res.text();
			if (text.length === 0) return {
				data: null,
				text
			};
			try {
				return {
					data: JSON.parse(text),
					text
				};
			} catch {
				return {
					data: null,
					text
				};
			}
		}
		/** 非 2xx 统一抛 ServerApiError；2xx 返回解析后的 JSON（空体为 null） */
		async function parseResponse(res) {
			const { data, text } = await readJson(res);
			if (!res.ok) {
				const err = data;
				throw new ServerApiError(res.status, err?.code ?? "AUTH_ERROR", errorMessage$1(data, text), err?.requestId, err?.details);
			}
			return data;
		}
		function toQuery(params) {
			const entries = Object.entries(pickBy(params, (v) => v !== void 0 && v !== null && String(v).length > 0));
			if (entries.length === 0) return "";
			return `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")}`;
		}
		const NETWORK_RETRY_MAX = 4;
		const NETWORK_RETRY_BASE_MS = 1e3;
		const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
		async function fetchWithRetry(input, init) {
			let lastError;
			for (let attempt = 0; attempt <= NETWORK_RETRY_MAX; attempt += 1) try {
				return await fetch(input, init);
			} catch (error) {
				lastError = error;
				if (attempt === NETWORK_RETRY_MAX) break;
				await sleep(NETWORK_RETRY_BASE_MS * (attempt + 1));
			}
			throw lastError;
		}
		var ServerClient = class {
			baseUrl;
			token;
			constructor(baseUrl, token = null) {
				this.baseUrl = baseUrl.replace(/\/+$/, "");
				this.token = token;
			}
			get hasToken() {
				return this.token !== null && this.token.length > 0;
			}
			setToken(token) {
				this.token = token;
			}
			url(path) {
				return `${this.baseUrl}${path}`;
			}
			async call(method, path, body, auth = false) {
				const headers = {};
				if (body !== void 0) headers["content-type"] = "application/json";
				if (auth && this.hasToken) headers.authorization = `Bearer ${this.token}`;
				const init = {
					method,
					headers
				};
				if (body !== void 0) init.body = JSON.stringify(body);
				return parseResponse(await fetchWithRetry(this.url(path), init));
			}
			/** 登录/注册专用：同时从响应头/body 收集会话 token（Bearer 用） */
			async authCall(method, path, body) {
				const headers = { "content-type": "application/json" };
				if (this.hasToken) headers.authorization = `Bearer ${this.token}`;
				const res = await fetchWithRetry(this.url(path), {
					method,
					headers,
					body: JSON.stringify(body)
				});
				const data = await parseResponse(res);
				const tokenFromHeader = res.headers.get("set-auth-token");
				const tokenFromBody = isPlainObject(data) && typeof data.token === "string" ? data.token : null;
				return {
					user: isPlainObject(data) && isPlainObject(data.user) ? data.user : null,
					token: tokenFromHeader ?? tokenFromBody
				};
			}
			/** POST /api/auth/sign-up/email —— 邮箱注册（用户名可选） */
			signUpEmail(body) {
				return this.authCall("POST", "/api/auth/sign-up/email", body);
			}
			/** POST /api/auth/sign-in/email —— 邮箱登录 */
			signInEmail(body) {
				return this.authCall("POST", "/api/auth/sign-in/email", body);
			}
			/** POST /api/auth/sign-in/username —— 用户名登录 */
			signInUsername(body) {
				return this.authCall("POST", "/api/auth/sign-in/username", body);
			}
			/** POST /api/auth/sign-out —— 登出（吊销当前会话）。Better Auth 要求 JSON body */
			signOut() {
				return this.call("POST", "/api/auth/sign-out", {}, true);
			}
			/**
			* GET /api/auth/get-session —— 当前登录态。
			* 注意：token 失效/被吊销时返回 200 + null（不是 401），调用方需判空。
			*/
			getSession() {
				return this.call("GET", "/api/auth/get-session", void 0, true);
			}
			/** POST /api/auth/change-password —— 修改密码 */
			changePassword(body) {
				return this.call("POST", "/api/auth/change-password", body, true);
			}
			/** POST /api/auth/update-user —— 改资料/改用户名。
			* 注意：Better Auth 该端点仅返回 { status: true }，不含 user；
			* 需要更新后的 user 请再调 getSession()。 */
			updateUser(body) {
				return this.call("POST", "/api/auth/update-user", body, true);
			}
			/** POST /api/auth/send-verification-email —— 重发验证邮件 */
			sendVerificationEmail(body) {
				return this.call("POST", "/api/auth/send-verification-email", body);
			}
			/** POST /api/auth/email-otp/send-verification-otp —— 发送 6 位邮箱验证码 */
			sendVerificationOtp(body) {
				return this.call("POST", "/api/auth/email-otp/send-verification-otp", body);
			}
			/** POST /api/auth/email-otp/verify-email —— 校验 6 位验证码；token 非空时已自动登录 */
			verifyEmail(body) {
				return this.authCall("POST", "/api/auth/email-otp/verify-email", body);
			}
			/** POST /api/auth/request-password-reset —— 忘记密码：发重置邮件 */
			requestPasswordReset(body) {
				return this.call("POST", "/api/auth/request-password-reset", body);
			}
			/** POST /api/auth/reset-password —— 用邮件里的 token 重设密码 */
			resetPassword(body) {
				return this.call("POST", "/api/auth/reset-password", body);
			}
			/** POST /api/auth/email-otp/request-password-reset —— 忘记密码：向邮箱发 6 位重置验证码 */
			requestPasswordResetOtp(email) {
				return this.call("POST", "/api/auth/email-otp/request-password-reset", { email });
			}
			/** POST /api/auth/email-otp/reset-password —— 用验证码重设密码（应用内完成） */
			resetPasswordWithOtp(body) {
				return this.call("POST", "/api/auth/email-otp/reset-password", body);
			}
			/** GET /api/communities/discover —— 公开社区目录（模糊搜索 + 排序） */
			discoverCommunities(opts = {}) {
				const qs = toQuery({
					q: opts.q ?? "",
					sort: opts.sort ?? "",
					limit: opts.limit ?? 20,
					offset: opts.offset ?? 0
				});
				return this.call("GET", `/api/communities/discover${qs}`, void 0, true);
			}
			/** GET /api/communities/mine —— 我加入的社区（含未读概览） */
			myCommunities() {
				return this.call("GET", "/api/communities/mine", void 0, true);
			}
			/** GET /api/communities/:id —— 社区详情（频道 + 我的角色） */
			getCommunity(communityId) {
				return this.call("GET", `/api/communities/${communityId}`, void 0, true);
			}
			/** POST /api/communities —— 创建社区 */
			createCommunity(body) {
				return this.call("POST", "/api/communities", body, true);
			}
			/** POST /api/communities/join-by-code —— 邀请码加入（私有/公开通用） */
			joinByCode(body) {
				return this.call("POST", "/api/communities/join-by-code", body, true);
			}
			/** POST /api/communities/:id/join —— 直接加入公开社区 */
			joinCommunity(communityId) {
				return this.call("POST", `/api/communities/${communityId}/join`, {}, true);
			}
			/** POST /api/communities/:id/leave —— 退出社区（owner 不能退） */
			leaveCommunity(communityId) {
				return this.call("POST", `/api/communities/${communityId}/leave`, {}, true);
			}
			/** DELETE /api/communities/:id —— 删除社区（仅 owner；内容级联清除） */
			deleteCommunity(communityId) {
				return this.call("DELETE", `/api/communities/${communityId}`, void 0, true);
			}
			/** POST /api/communities/:id/channels —— 新建频道（owner/admin） */
			createChannel(communityId, body) {
				return this.call("POST", `/api/communities/${communityId}/channels`, body, true);
			}
			/** PATCH /api/communities/:id —— 改社区（owner/admin） */
			updateCommunity(communityId, body) {
				return this.call("PATCH", `/api/communities/${communityId}`, body, true);
			}
			/** POST /api/communities/:id/invites —— 邀请已注册用户入社区（owner/admin） */
			createInvite(communityId, body) {
				return this.call("POST", `/api/communities/${communityId}/invites`, body, true);
			}
			/** POST /api/invites/:id/accept —— 接受社区邀请并加入 */
			acceptInvite(inviteId) {
				return this.call("POST", `/api/invites/${inviteId}/accept`, {}, true);
			}
			/** POST /api/invites/:id/decline —— 拒绝社区邀请 */
			declineInvite(inviteId) {
				return this.call("POST", `/api/invites/${inviteId}/decline`, {}, true);
			}
			/** GET /api/notifications —— 我的站内信（新→旧，带未读数） */
			listNotifications(opts = {}) {
				const qs = toQuery({
					limit: opts.limit ?? 20,
					onlyUnread: opts.onlyUnread ? "1" : ""
				});
				return this.call("GET", `/api/notifications${qs}`, void 0, true);
			}
			/** POST /api/notifications/:id/read —— 标记一条站内信已读 */
			markNotificationRead(notificationId) {
				return this.call("POST", `/api/notifications/${notificationId}/read`, {}, true);
			}
			/** POST /api/notifications/read-all —— 全部已读 */
			markAllNotificationsRead() {
				return this.call("POST", "/api/notifications/read-all", {}, true);
			}
			/** GET /api/communities/:id/members —— 成员列表（须是成员；可按角色 id 过滤） */
			listMembers(communityId, query = {}) {
				const qs = toQuery({
					roleId: query.roleId ?? "",
					q: query.q ?? "",
					limit: query.limit ?? 100,
					offset: query.offset ?? 0
				});
				return this.call("GET", `/api/communities/${communityId}/members${qs}`, void 0, true);
			}
			/** PUT /api/communities/:id/members/:userId/roles —— 设置成员角色全集（MANAGE_CHANNEL） */
			setMemberRoles(communityId, userId, body) {
				return this.call("PUT", `/api/communities/${communityId}/members/${userId}/roles`, body, true);
			}
			/** POST /api/communities/:id/transfer-owner —— 转让所有权（仅 owner） */
			transferOwner(communityId, body) {
				return this.call("POST", `/api/communities/${communityId}/transfer-owner`, body, true);
			}
			/** GET /api/communities/:id/roles —— 社区全部角色（成员可见） */
			listRoles(communityId) {
				return this.call("GET", `/api/communities/${communityId}/roles`, void 0, true);
			}
			/** POST /api/communities/:id/roles —— 新建角色（MANAGE_ROLES） */
			createRole(communityId, body) {
				return this.call("POST", `/api/communities/${communityId}/roles`, body, true);
			}
			/** PUT /api/communities/:id/roles/order —— 整体重排角色层级（MANAGE_ROLES，order 从高到低） */
			reorderRoles(communityId, body) {
				return this.call("PUT", `/api/communities/${communityId}/roles/order`, body, true);
			}
			/** PATCH /api/communities/:id/roles/:roleId —— 改角色（MANAGE_ROLES） */
			updateRole(communityId, roleId, body) {
				return this.call("PATCH", `/api/communities/${communityId}/roles/${roleId}`, body, true);
			}
			/** DELETE /api/communities/:id/roles/:roleId —— 删角色（MANAGE_CHANNEL） */
			deleteRole(communityId, roleId) {
				return this.call("DELETE", `/api/communities/${communityId}/roles/${roleId}`, void 0, true);
			}
			/** GET /api/channels/:id/overwrites —— 频道的权限覆盖列表（MANAGE_CHANNEL） */
			listChannelOverwrites(channelId) {
				return this.call("GET", `/api/channels/${channelId}/overwrites`, void 0, true);
			}
			/** PUT /api/channels/:id/overwrites/:targetType/:targetId —— 写入覆盖（MANAGE_CHANNEL） */
			setChannelOverwrite(channelId, targetType, targetId, body) {
				return this.call("PUT", `/api/channels/${channelId}/overwrites/${targetType}/${encodeURIComponent(targetId)}`, body, true);
			}
			/** DELETE /api/channels/:id/overwrites/:targetType/:targetId —— 清除覆盖（MANAGE_CHANNEL） */
			deleteChannelOverwrite(channelId, targetType, targetId) {
				return this.call("DELETE", `/api/channels/${channelId}/overwrites/${targetType}/${encodeURIComponent(targetId)}`, void 0, true);
			}
			/** DELETE /api/communities/:id/members/:userId —— 踢人（owner/admin，不能踢 owner） */
			removeMember(communityId, userId) {
				return this.call("DELETE", `/api/communities/${communityId}/members/${userId}`, void 0, true);
			}
			/** GET /api/communities/:id/bans —— 封禁列表（owner/admin） */
			listBans(communityId) {
				return this.call("GET", `/api/communities/${communityId}/bans`, void 0, true);
			}
			/** POST /api/communities/:id/bans —— 封禁（按 userId 或 handleOrEmail） */
			banUser(communityId, body) {
				return this.call("POST", `/api/communities/${communityId}/bans`, body, true);
			}
			/** DELETE /api/communities/:id/bans/:userId —— 解封 */
			unbanUser(communityId, userId) {
				return this.call("DELETE", `/api/communities/${communityId}/bans/${userId}`, void 0, true);
			}
			/** PATCH /api/channels/:id —— 频道改名/主题/类型（owner/admin） */
			updateChannel(channelId, body) {
				return this.call("PATCH", `/api/channels/${channelId}`, body, true);
			}
			/** DELETE /api/channels/:id —— 删频道（owner/admin） */
			deleteChannel(channelId) {
				return this.call("DELETE", `/api/channels/${channelId}`, void 0, true);
			}
			/** GET /api/channels/:id/messages —— 历史（desc 新→旧；cursor=某条 createdAt 翻更早）
			*  threadId 传讨论组 id 时返回该讨论组消息；缺省为主频道直接消息 */
			listMessages(channelId, opts = {}) {
				const query = toQuery({
					cursor: opts.cursor ?? "",
					limit: opts.limit ?? 50,
					direction: opts.direction ?? "desc",
					threadId: opts.threadId ?? ""
				});
				return this.call("GET", `/api/channels/${channelId}/messages${query}`, void 0, true);
			}
			/** POST /api/channels/:id/messages —— 发消息 */
			createMessage(channelId, body) {
				return this.call("POST", `/api/channels/${channelId}/messages`, body, true);
			}
			/** PATCH /api/messages/:id —— 编辑消息（作者或 owner/admin） */
			updateMessage(messageId, body) {
				return this.call("PATCH", `/api/messages/${messageId}`, body, true);
			}
			/** DELETE /api/messages/:id —— 删除消息（作者或 owner/admin） */
			deleteMessage(messageId) {
				return this.call("DELETE", `/api/messages/${messageId}`, void 0, true);
			}
			/** POST /api/messages/:id/reactions —— 切换表情回应（已回应过则取消），返回最新聚合 */
			toggleMessageReaction(messageId, emoji) {
				const body = { emoji };
				return this.call("POST", `/api/messages/${messageId}/reactions`, body, true);
			}
			/** POST /api/messages/:id/pin —— 置顶消息（社区 MANAGE_MESSAGES） */
			pinMessage(messageId) {
				return this.call("POST", `/api/messages/${messageId}/pin`, void 0, true);
			}
			/** DELETE /api/messages/:id/pin —— 取消置顶 */
			unpinMessage(messageId) {
				return this.call("DELETE", `/api/messages/${messageId}/pin`, void 0, true);
			}
			/** GET /api/channels/:id/pins —— 该房间的置顶消息（threadId 非空时取讨论组内的） */
			listPinned(channelId, threadId = null) {
				const query = toQuery({ threadId: threadId ?? "" });
				return this.call("GET", `/api/channels/${channelId}/pins${query}`, void 0, true);
			}
			/** GET /api/channels/:id/read-state —— 未读快照 */
			getReadState(channelId) {
				return this.call("GET", `/api/channels/${channelId}/read-state`, void 0, true);
			}
			/** POST /api/channels/:id/read-state —— 上报已读 */
			markRead(channelId, body) {
				return this.call("POST", `/api/channels/${channelId}/read-state`, body, true);
			}
			/** GET /api/communities/:id/online —— 社区当前在线成员（聚合各房间后按用户去重） */
			communityOnline(communityId) {
				return this.call("GET", `/api/communities/${communityId}/online`, void 0, true);
			}
			/** GET /api/channels/:channelId/threads —— 频道讨论组（默认活跃；archived=all 含归档） */
			listThreads(channelId, archived = void 0) {
				const query = toQuery({ archived: archived ?? "" });
				return this.call("GET", `/api/channels/${channelId}/threads${query}`, void 0, true);
			}
			/** POST /api/channels/:channelId/threads —— 创建讨论组（可带起点消息） */
			createThread(channelId, body) {
				return this.call("POST", `/api/channels/${channelId}/threads`, body, true);
			}
			/** GET /api/threads/:id —— 讨论组详情（含我未读） */
			getThread(threadId) {
				return this.call("GET", `/api/threads/${threadId}`, void 0, true);
			}
			/** PATCH /api/threads/:id —— 改名 / 改可见性 / 改密码（发起人或 owner/admin） */
			updateThread(threadId, patch) {
				return this.call("PATCH", `/api/threads/${threadId}`, patch, true);
			}
			/** POST /api/threads/:id/join —— 凭密码进入私密讨论组（公开组幂等；无密码的私密组 403） */
			joinThread(threadId, passcode) {
				const body = {};
				if (passcode !== void 0 && passcode.length > 0) body.passcode = passcode;
				return this.call("POST", `/api/threads/${threadId}/join`, body, true);
			}
			/** GET /api/threads/:id/members —— 讨论组成员名单（需可进入该讨论组） */
			listThreadMembers(threadId) {
				return this.call("GET", `/api/threads/${threadId}/members`, void 0, true);
			}
			/** POST /api/threads/:id/members —— 直接把社区成员拉入讨论组 */
			addThreadMember(threadId, userId) {
				return this.call("POST", `/api/threads/${threadId}/members`, { userId }, true);
			}
			/** DELETE /api/threads/:id/members/:userId —— 移除成员（移除自己即退出） */
			removeThreadMember(threadId, userId) {
				return this.call("DELETE", `/api/threads/${threadId}/members/${userId}`, void 0, true);
			}
			/** GET /api/threads/:id/candidates?q= —— 可拉入的社区成员（尚未在组内） */
			listThreadCandidates(threadId, q) {
				const query = toQuery({ q: q ?? "" });
				return this.call("GET", `/api/threads/${threadId}/candidates${query}`, void 0, true);
			}
			/** POST /api/threads/:id/archive —— 手动归档 */
			archiveThread(threadId) {
				return this.call("POST", `/api/threads/${threadId}/archive`, {}, true);
			}
			/** POST /api/threads/:id/reopen —— 恢复活跃 */
			reopenThread(threadId) {
				return this.call("POST", `/api/threads/${threadId}/reopen`, {}, true);
			}
			/** DELETE /api/threads/:id —— 删除讨论组 */
			deleteThread(threadId) {
				return this.call("DELETE", `/api/threads/${threadId}`, void 0, true);
			}
			/** GET /api/threads/:id/read-state —— 我在讨论组的已读 */
			getThreadReadState(threadId) {
				return this.call("GET", `/api/threads/${threadId}/read-state`, void 0, true);
			}
			/** POST /api/threads/:id/read-state —— 上报读到讨论组的哪条 */
			markThreadRead(threadId, body) {
				return this.call("POST", `/api/threads/${threadId}/read-state`, body, true);
			}
			/** GET /api/messages/search —— 社区内消息搜索（关键词 + 可选频道/作者/时间/@我 筛选，倒序） */
			searchMessages(communityId, q, opts = {}) {
				const query = toQuery({
					communityId,
					q,
					cursor: opts.cursor ?? "",
					limit: opts.limit ?? 20,
					channelId: opts.channelId ?? "",
					authorId: opts.authorId ?? "",
					from: opts.from ?? "",
					to: opts.to ?? "",
					mentionsMe: opts.mentionsMe ? "true" : ""
				});
				return this.call("GET", `/api/messages/search${query}`, void 0, true);
			}
			/** POST /api/shares/agent-session —— 登记一条 DSH 会话分享（包体已直传 R2） */
			createAgentSessionShare(body) {
				return this.call("POST", "/api/shares/agent-session", body, true);
			}
			/** GET /api/shares/:id —— 分享详情（含 downloadUrl） */
			getShare(shareId) {
				return this.call("GET", `/api/shares/${shareId}`, void 0, true);
			}
			/**
			* PUT /api/r2/objects —— 直传一个附件文件（body = 文件原始字节，非 JSON）。
			* 文件名为非 ASCII 时浏览器不允许放进请求头，故 X-File-Name 用 URL 编码传输。
			*/
			async uploadObject(file) {
				if (!this.hasToken) throw new ServerApiError(401, "UNAUTHORIZED", "未登录");
				const headers = {
					authorization: `Bearer ${this.token}`,
					"x-file-name": encodeURIComponent(file.name)
				};
				if (file.type.length > 0) headers["content-type"] = file.type;
				return parseResponse(await fetch(this.url("/api/r2/objects"), {
					method: "PUT",
					headers,
					body: file
				}));
			}
		};
		//#endregion
		//#region packages/client/src/ws.ts
		var TalkSocket = class {
			url;
			events;
			ws = null;
			heartbeat = null;
			constructor(url, events = {}) {
				this.url = url;
				this.events = events;
			}
			get connected() {
				return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
			}
			connect() {
				if (this.ws !== null) return;
				const ws = new WebSocket(this.url);
				this.ws = ws;
				ws.onopen = () => {
					this.events.onOpen?.();
				};
				ws.onmessage = (ev) => {
					try {
						const frame = JSON.parse(String(ev.data));
						this.events.onFrame?.(frame);
					} catch (error) {
						this.events.onError?.(error);
					}
				};
				ws.onclose = (ev) => {
					this.ws = null;
					this.stopHeartbeat();
					this.events.onClose?.(ev.code, ev.reason);
				};
				ws.onerror = (ev) => {
					this.events.onError?.(ev);
				};
			}
			/** 发送一帧（未连接时静默丢弃）。 */
			send(frame) {
				if (!this.connected) return false;
				this.ws?.send(JSON.stringify(frame));
				return true;
			}
			/**
			* 心跳：按服务端 EvtHello.heartbeatIntervalSec 开启；
			* 取 interval*0.8 秒发一次 ping。
			*/
			startHeartbeat(intervalSec) {
				this.stopHeartbeat();
				const periodMs = Math.max(5e3, intervalSec * 800);
				this.heartbeat = window.setInterval(() => {
					this.send({
						type: "ping",
						payload: { clientTime: Date.now() }
					});
				}, periodMs);
			}
			stopHeartbeat() {
				if (this.heartbeat !== null) {
					clearInterval(this.heartbeat);
					this.heartbeat = null;
				}
			}
			close() {
				this.stopHeartbeat();
				this.ws?.close();
				this.ws = null;
			}
		};
		//#endregion
		//#region packages/client/src/store.ts
		const INITIAL_VIEW = {
			communityId: null,
			community: null,
			communityLoading: false,
			channelId: null,
			threadId: null,
			messages: [],
			nextCursor: null,
			messagesLoading: false,
			loadingOlder: false,
			sending: false,
			live: false,
			communityOnlineCount: 0,
			communityOnlineMembers: [],
			replyingTo: null,
			typing: [],
			focusMessageId: null,
			members: [],
			membersLoading: false
		};
		let state = {
			open: false,
			busy: false,
			phase: "booting",
			settings: null,
			me: null,
			meEmail: null,
			communities: [],
			error: "",
			toast: "",
			confirm: null,
			view: INITIAL_VIEW,
			pendingEmail: null,
			pendingEmailReason: null,
			inboxOpen: false,
			notifications: [],
			inboxLoading: false,
			inboxUnread: 0,
			inboxBusyId: null,
			reminderSettings: {
				desktop: false,
				dnd: false
			},
			view: { ...INITIAL_VIEW },
			reminderSettings: getReminderSettings()
		};
		const listeners = /* @__PURE__ */ new Set();
		let toastTimer = null;
		function setState(patch) {
			state = {
				...state,
				...patch
			};
			for (const listener of listeners) listener();
		}
		function patchView(patch) {
			setState({ view: {
				...state.view,
				...patch
			} });
		}
		function makeServer(settings) {
			return new ServerClient(settings.serverUrl, settings.token);
		}
		function serverOf() {
			const settings = state.settings;
			if (!settings || settings.token.length === 0) return null;
			return makeServer(settings);
		}
		const errorText = (error) => error instanceof Error ? error.message : String(error);
		function toUser(auth) {
			const emailPrefix = auth.email.split("@")[0] || auth.id;
			const createdAt = Number.isNaN(Date.parse(auth.createdAt)) ? Date.now() : Date.parse(auth.createdAt);
			return {
				id: auth.id,
				handle: auth.username || emailPrefix,
				displayName: auth.name || null,
				avatarUrl: auth.image,
				createdAt
			};
		}
		/** update-user 只回 { status: true }，要拿更新后的 user 得再拉一次会话 */
		async function refreshedUser(server) {
			const session = await server.getSession();
			return session?.user ? toUser(session.user) : null;
		}
		/** 通知条（自动消失） */
		function notify(message) {
			setState({ toast: message });
			if (toastTimer !== null) window.clearTimeout(toastTimer);
			toastTimer = window.setTimeout(() => setState({ toast: "" }), 3200);
		}
		/** 提前关闭通知条（Toast 动画结束后调用） */
		function dismissToast() {
			if (toastTimer !== null) {
				window.clearTimeout(toastTimer);
				toastTimer = null;
			}
			setState({ toast: "" });
		}
		/**
		* 站内确认弹窗（替代 window.confirm）：
		* confirmResolver 保存本次弹窗的 Promise resolver，弹窗关闭时以 true/false 结算，
		* 调用点即可像 window.confirm 一样顺序书写。
		*/
		let confirmResolver = null;
		/** 弹出站内确认弹窗，resolve 用户是否确认 */
		function askConfirm(options) {
			settleConfirm(false);
			return new Promise((resolve) => {
				confirmResolver = resolve;
				setState({ confirm: {
					title: options.title,
					message: options.message,
					confirmLabel: options.confirmLabel ?? "确认",
					cancelLabel: options.cancelLabel ?? "取消",
					danger: options.danger ?? false
				} });
			});
		}
		/** 结算并关闭当前确认弹窗（由 ConfirmDialog 的按钮 / 关闭回调调用） */
		function settleConfirm(ok) {
			const resolve = confirmResolver;
			confirmResolver = null;
			if (resolve !== null) resolve(ok);
			if (state.confirm !== null) setState({ confirm: null });
		}
		/** 清空站内信状态（登出 / 切换账号时调用） */
		function resetInbox() {
			setState({
				inboxOpen: false,
				notifications: [],
				inboxLoading: false,
				inboxUnread: 0,
				inboxBusyId: null
			});
		}
		function useTalkState() {
			const [, force] = (0, react.useReducer)((x) => x + 1, 0);
			(0, react.useEffect)(() => {
				listeners.add(force);
				return () => {
					listeners.delete(force);
				};
			}, []);
			return state;
		}
		function activateTalk() {
			if (!state.open) {
				setState({ open: true });
				refresh();
			}
			bindPresenceListeners();
		}
		function deactivateTalk() {
			if (!state.open) return;
			closeRealtime();
			unbindPresenceListeners();
			setState({ open: false });
		}
		/**
		* 是否为「邮箱尚未验证」被 Better Auth 拒绝（requireEmailVerification 生效时
		* sign-in 返回 403 + code EMAIL_NOT_VERIFIED，见 lib/auth.ts）。
		* 以 code 为主、403 + 文案为兜底，避免不同版本响应体差异导致漏判。
		*/
		function isEmailNotVerified(error) {
			if (!(error instanceof ServerApiError)) return false;
			if (error.code === "EMAIL_NOT_VERIFIED") return true;
			return error.status === 403 && /not verified|verify your email/i.test(error.message);
		}
		/** 邮箱/用户名登录（Better Auth），成功后写 host token/handle */
		async function login(mode, account, password) {
			const settings = state.settings;
			if (!settings) throw new Error("尚未就绪");
			const server = makeServer(settings);
			try {
				const { user, token } = mode === "email" ? await server.signInEmail({
					email: account,
					password
				}) : await server.signInUsername({
					username: account,
					password
				});
				if (!token || !user) throw new Error("服务端未返回会话 token");
				await applySession({
					user,
					token
				});
				notify("登录成功");
			} catch (error) {
				if (!isEmailNotVerified(error)) throw error;
				if (mode !== "email") throw new Error("该账号的邮箱尚未验证，请改用邮箱登录完成验证");
				const email = account.trim();
				setState({
					pendingEmail: email,
					pendingEmailReason: "login",
					error: ""
				});
				try {
					await server.sendVerificationOtp({
						email,
						type: "email-verification"
					});
				} catch {}
			}
		}
		/** 邮箱注册：用户名由服务端从邮箱 @ 前缀自动派生，客户端不再提交。昵称可选。 */
		async function register(input) {
			const settings = state.settings;
			if (!settings) throw new Error("尚未就绪");
			const body = {
				name: input.name?.trim() || input.email.split("@")[0] || "dsh-user",
				email: input.email,
				password: input.password
			};
			await makeServer(settings).signUpEmail(body);
			setState({
				pendingEmail: input.email.trim(),
				pendingEmailReason: "register",
				error: ""
			});
		}
		/** 校验邮箱验证码；验证成功且 autoSignInAfterVerification 开启时自动登录 */
		async function verifyOtp(otp) {
			const settings = state.settings;
			const email = state.pendingEmail;
			if (!settings || !email) throw new Error("请先注册并获取验证码");
			const result = await makeServer(settings).verifyEmail({
				email,
				otp: otp.trim()
			});
			if (!result.user) throw new Error("验证失败，请重试");
			if (result.token) {
				await applySession({
					user: result.user,
					token: result.token
				});
				notify("邮箱验证成功，已自动登录");
				return;
			}
			setState({
				pendingEmail: null,
				pendingEmailReason: null
			});
			notify("邮箱验证成功，请登录");
		}
		/** 重新发送邮箱验证码 */
		async function resendVerificationOtp() {
			const settings = state.settings;
			const email = state.pendingEmail;
			if (!settings || !email) throw new Error("尚未就绪");
			await makeServer(settings).sendVerificationOtp({
				email,
				type: "email-verification"
			});
			notify("验证码已重新发送");
		}
		/** 从验证码界面返回登录页 */
		function cancelVerification() {
			setState({
				pendingEmail: null,
				pendingEmailReason: null
			});
		}
		/**
		* 忘记密码 step1：请求把 6 位重置验证码发到邮箱。
		* 服务端对「邮箱不存在」也返回成功（防探测），文案由调用方统一提示。
		*/
		async function requestPasswordResetOtp(email) {
			const settings = state.settings;
			if (!settings) throw new Error("尚未就绪");
			await makeServer(settings).requestPasswordResetOtp(email.trim());
		}
		/** 忘记密码 step2：用邮箱收到的验证码重设密码（成功后回登录页手动登录） */
		async function resetPasswordWithOtp(input) {
			const settings = state.settings;
			if (!settings) throw new Error("尚未就绪");
			await makeServer(settings).resetPasswordWithOtp({
				email: input.email.trim(),
				otp: input.otp.trim(),
				password: input.password
			});
		}
		async function applySession(result) {
			setState({
				busy: true,
				error: ""
			});
			try {
				const me = toUser(result.user);
				const next = await hostConfigSet({
					token: result.token,
					handle: me.handle
				});
				const communities = await makeServer(next).myCommunities();
				settleConfirm(false);
				resetInbox();
				setState({
					busy: false,
					phase: "ready",
					settings: next,
					me,
					meEmail: result.user.email,
					communities,
					view: { ...INITIAL_VIEW }
				});
				refreshInboxUnread();
			} catch (error) {
				setState({
					busy: false,
					phase: "anon",
					error: errorText(error)
				});
				throw error;
			}
		}
		/** 修改昵称（displayName）：调用 Better Auth update-user，成功后同步本地 me。 */
		async function updateUserNickname(nickname) {
			const server = serverOf();
			if (!server) return false;
			const trimmed = nickname.trim();
			if (trimmed.length === 0) return false;
			if (trimmed === (state.me?.displayName ?? "")) {
				notify("昵称没有变化");
				return false;
			}
			try {
				const body = { name: trimmed };
				await server.updateUser(body);
				const me = await refreshedUser(server) ?? state.me;
				if (!me) {
					notify("无法获取最新用户信息");
					return false;
				}
				setState({ me });
				notify("昵称已更新");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/**
		* 修改用户名（@handle）：客户端先做字符集/长度预检，最终以服务端校验为准
		* （唯一性、每周一次都由服务端强制），成功后同步本地 me 与 host 侧 handle。
		*/
		async function updateUserUsername(username) {
			const server = serverOf();
			if (!server) return false;
			const trimmed = username.trim();
			if (trimmed.length === 0) return false;
			if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
				notify("用户名只能包含大小写字母和数字");
				return false;
			}
			if (trimmed.length < 4) {
				notify("用户名至少需要 4 个字符");
				return false;
			}
			if (trimmed.length > 16) {
				notify("用户名最多 16 个字符");
				return false;
			}
			if (trimmed.toLowerCase() === (state.me?.handle ?? "").toLowerCase()) {
				notify("用户名没有变化");
				return false;
			}
			try {
				const body = { username: trimmed };
				await server.updateUser(body);
				const me = await refreshedUser(server) ?? state.me;
				if (!me) {
					notify("无法获取最新用户信息");
					return false;
				}
				setState({ me });
				if (state.settings && state.settings.handle !== me.handle) try {
					setState({ settings: await hostConfigSet({ handle: me.handle }) });
				} catch {}
				notify("用户名已更新");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 修改密码：调用 Better Auth change-password（服务端校验当前密码） */
		async function changePassword(input) {
			const server = serverOf();
			if (!server) return false;
			try {
				await server.changePassword(input);
				notify("密码已更新");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 上传一张图片到 R2，返回公开 URL；失败返回 null（内部已 toast） */
		async function uploadImage(file) {
			const server = serverOf();
			if (!server) return null;
			if (!file.type.startsWith("image/")) {
				notify("请选择图片文件");
				return null;
			}
			try {
				return (await server.uploadObject(file)).url;
			} catch (error) {
				notify(errorText(error));
				return null;
			}
		}
		/**
		* 更新本机提醒设置。开启桌面通知前先要浏览器授权：
		* 被拒绝时给出提示并保持原状，避免出现「开关亮着却弹不出来」。
		*/
		async function updateReminderSettings(patch) {
			if (patch.desktop === true) {
				if (!await requestNotificationPermission()) {
					notify("浏览器未授予通知权限，请在站点设置里允许通知后重试");
					return;
				}
			}
			setState({ reminderSettings: saveReminderSettings(patch) });
		}
		/** 被 @ 且页面在后台时弹桌面通知（受设置与浏览器授权双重约束） */
		function notifyMention(item) {
			const { desktop, dnd } = state.reminderSettings;
			if (!desktop || dnd || !document.hidden) return;
			const who = item.author.displayName ?? item.author.handle;
			const text = item.content.replace(/\s+/g, " ").trim();
			showDesktopNotification(`${who} 在 DSH Talk 提到了你`, text.length > 120 ? `${text.slice(0, 120)}…` : text);
		}
		/** 修改用户头像：先上传拿 URL，再更新 Better Auth user.image，并同步本地 me */
		async function updateUserAvatar(file) {
			const server = serverOf();
			if (!server) return false;
			const url = await uploadImage(file);
			if (!url) return false;
			try {
				await server.updateUser({ image: url });
				const me = await refreshedUser(server) ?? state.me;
				if (!me) {
					notify("无法获取最新用户信息");
					return false;
				}
				setState({ me });
				notify("头像已更新");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 移除用户头像，回退到字母头像 */
		async function removeUserAvatar() {
			const server = serverOf();
			if (!server) return false;
			try {
				await server.updateUser({ image: null });
				const me = await refreshedUser(server) ?? state.me;
				if (!me) {
					notify("无法获取最新用户信息");
					return false;
				}
				setState({ me });
				notify("已移除头像");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		async function logout() {
			closeRealtime();
			settleConfirm(false);
			const settings = state.settings;
			if (settings && settings.token.length > 0) try {
				await makeServer(settings).signOut();
			} catch {}
			try {
				await hostConfigSet({ token: "" });
			} catch {}
			setState({
				open: true,
				phase: "anon",
				me: null,
				meEmail: null,
				communities: [],
				error: "",
				view: { ...INITIAL_VIEW },
				settings: settings === null ? null : {
					...settings,
					token: ""
				},
				pendingEmail: null,
				pendingEmailReason: null
			});
			resetInbox();
		}
		async function refresh() {
			setState({
				phase: "booting",
				busy: true,
				error: ""
			});
			try {
				const settings = await hostConfigGet();
				if (settings.token.length === 0) {
					resetInbox();
					setState({
						phase: "anon",
						busy: false,
						settings,
						pendingEmail: null,
						pendingEmailReason: null
					});
					return;
				}
				const server = makeServer(settings);
				const session = await server.getSession();
				if (!session?.session || !session.user) {
					resetInbox();
					setState({
						phase: "anon",
						busy: false,
						settings,
						pendingEmail: null,
						pendingEmailReason: null
					});
					return;
				}
				const me = toUser(session.user);
				if (settings.handle !== me.handle) try {
					await hostConfigSet({ handle: me.handle });
				} catch {}
				const communities = await server.myCommunities();
				setState({
					busy: false,
					phase: "ready",
					settings: settings.handle === me.handle ? settings : {
						...settings,
						handle: me.handle
					},
					me,
					meEmail: session.user.email,
					communities
				});
				refreshInboxUnread();
			} catch (error) {
				if (error instanceof ServerApiError && error.status === 401) {
					resetInbox();
					setState({
						phase: "anon",
						busy: false,
						me: null,
						meEmail: null,
						communities: [],
						settings: state.settings,
						pendingEmail: null,
						pendingEmailReason: null
					});
					return;
				}
				setState({
					phase: "error",
					busy: false,
					error: errorText(error)
				});
			}
		}
		/** 后台重取社区列表（加入/退出/未读变化后调用，不打断当前浏览） */
		async function refreshCommunities() {
			const server = serverOf();
			if (!server) return;
			try {
				setState({ communities: await server.myCommunities() });
			} catch {}
		}
		/** 打开收件箱并拉取我的站内信 */
		async function openInbox() {
			const server = serverOf();
			if (!state.open || !server) return;
			setState({
				inboxOpen: true,
				inboxLoading: true
			});
			try {
				const res = await server.listNotifications({ limit: 50 });
				setState({
					notifications: res.items,
					inboxUnread: res.unread,
					inboxLoading: false
				});
			} catch (error) {
				setState({ inboxLoading: false });
				notify(errorText(error));
			}
		}
		function closeInbox() {
			setState({ inboxOpen: false });
		}
		/** 轻量刷新未读数（角标 / 定时轮询用） */
		async function refreshInboxUnread() {
			const server = serverOf();
			if (!server || !state.open) return;
			try {
				const res = await server.listNotifications({ limit: 1 });
				if (res.unread !== state.inboxUnread) setState({ inboxUnread: res.unread });
			} catch {}
		}
		function mapNotification(item, patch) {
			return {
				...item,
				...patch
			};
		}
		/** 接受某条邀请类站内信（成功即入会并打开社区） */
		async function acceptInvite(inviteId) {
			const server = serverOf();
			if (!server || state.inboxBusyId !== null) return false;
			setState({ inboxBusyId: inviteId });
			try {
				const joined = await server.acceptInvite(inviteId);
				setState({
					inboxBusyId: null,
					inboxOpen: false
				});
				notify(`已加入社区「${joined.name}」`);
				await refreshCommunities();
				await openCommunity(joined.id);
				refreshInboxUnread();
				return true;
			} catch (error) {
				setState({ inboxBusyId: null });
				notify(errorText(error));
				return false;
			}
		}
		/** 拒绝某条邀请类站内信 */
		async function declineInvite(inviteId) {
			const server = serverOf();
			if (!server || state.inboxBusyId !== null) return false;
			setState({ inboxBusyId: inviteId });
			try {
				await server.declineInvite(inviteId);
				setState({
					inboxBusyId: null,
					notifications: state.notifications.map((n) => n.kind === "invite" && n.data?.inviteId === inviteId ? mapNotification(n, {
						isRead: true,
						invite: n.invite ? {
							...n.invite,
							status: "declined"
						} : n.invite
					}) : n)
				});
				notify("已拒绝该邀请");
				refreshInboxUnread();
				return true;
			} catch (error) {
				setState({ inboxBusyId: null });
				notify(errorText(error));
				return false;
			}
		}
		/** 全部已读 */
		async function markAllNotificationsRead() {
			const server = serverOf();
			if (!server) return;
			try {
				await server.markAllNotificationsRead();
				setState({
					notifications: state.notifications.map((n) => mapNotification(n, { isRead: true })),
					inboxUnread: 0
				});
			} catch (error) {
				notify(errorText(error));
			}
		}
		function backToCommunities() {
			closeRealtime();
			setState({ view: { ...INITIAL_VIEW } });
		}
		async function openCommunity(communityId) {
			const server = serverOf();
			if (!server) return;
			closeRealtime();
			patchView({
				communityId,
				community: null,
				communityLoading: true,
				channelId: null,
				threadId: null,
				messages: [],
				nextCursor: null,
				live: false,
				communityOnlineCount: 0,
				communityOnlineMembers: [],
				replyingTo: null,
				focusMessageId: null
			});
			try {
				const detail = await server.getCommunity(communityId);
				patchView({
					community: detail,
					communityLoading: false
				});
				if (detail.isMember) {
					refreshCommunityMembers(communityId);
					const first = detail.channels[0];
					if (first) selectChannel(first.id);
				}
			} catch (error) {
				patchView({ communityLoading: false });
				notify(errorText(error));
			}
		}
		async function createCommunity(input) {
			const server = serverOf();
			if (!server) return false;
			try {
				const body = { name: input.name };
				if (input.description !== void 0 && input.description.length > 0) body.description = input.description;
				if (input.privacy !== void 0) body.privacy = input.privacy;
				if (input.iconUrl !== void 0) body.iconUrl = input.iconUrl;
				const created = await server.createCommunity(body);
				await refreshCommunities();
				await openCommunity(created.id);
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		async function joinCommunityByCode(inviteCode) {
			const server = serverOf();
			if (!server) return false;
			try {
				const joined = await server.joinByCode({ inviteCode: inviteCode.trim() });
				await refreshCommunities();
				await openCommunity(joined.id);
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 发现公开社区（社区目录；支持关键词搜索与排序） */
		async function discoverCommunities(opts = {}) {
			const server = serverOf();
			if (!server) return [];
			try {
				return (await server.discoverCommunities({
					q: opts.q?.trim() ?? "",
					sort: opts.sort ?? "hot",
					limit: 20,
					offset: opts.offset ?? 0
				})).items;
			} catch (error) {
				notify(errorText(error));
				return [];
			}
		}
		/** 直接加入公开社区（发现页用；私有社区需邀请码走 joinCommunityByCode） */
		async function joinPublicCommunity(communityId) {
			const server = serverOf();
			if (!server) return false;
			try {
				const joined = await server.joinCommunity(communityId);
				await refreshCommunities();
				await openCommunity(joined.id);
				notify(`已加入社区「${joined.name}」`);
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		async function leaveCommunity(communityId) {
			const server = serverOf();
			if (!server) return;
			try {
				await server.leaveCommunity(communityId);
				if (state.view.communityId === communityId) backToCommunities();
				await refreshCommunities();
				notify("已退出社区");
			} catch (error) {
				notify(errorText(error));
			}
		}
		/** 删除社区（仅 owner 可见入口）；服务端级联清除频道/消息/成员 */
		async function deleteCommunity(communityId) {
			const server = serverOf();
			if (!server) return false;
			try {
				await server.deleteCommunity(communityId);
				if (state.view.communityId === communityId) backToCommunities();
				await refreshCommunities();
				notify("社区已删除");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 重新拉取当前社区详情（编辑/建频道后刷新频道列表等） */
		async function reloadCommunityDetail() {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return;
			try {
				const detail = await server.getCommunity(communityId);
				patchView({
					community: detail,
					communityLoading: false
				});
				const channelId = state.view.channelId;
				if (channelId !== null && !detail.channels.some((c) => c.id === channelId)) {
					closeRealtime();
					patchView({
						channelId: null,
						threadId: null,
						messages: [],
						nextCursor: null,
						live: false
					});
				}
			} catch (error) {
				notify(errorText(error));
			}
		}
		/** 编辑社区资料 */
		async function updateCommunity(patch) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				const body = {};
				if (patch.name !== void 0) body.name = patch.name;
				if (patch.description !== void 0) body.description = patch.description;
				if (patch.privacy !== void 0) body.privacy = patch.privacy;
				if (patch.iconUrl !== void 0) body.iconUrl = patch.iconUrl;
				await server.updateCommunity(communityId, body);
				await reloadCommunityDetail();
				await refreshCommunities();
				notify("社区资料已更新");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 邀请已注册用户入社区（owner/admin）；目标会收到站内信 + 邮件 */
		async function inviteMember(handleOrEmail) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			const who = handleOrEmail.trim();
			if (!who) return false;
			try {
				notify(`已向 ${(await server.createInvite(communityId, { handleOrEmail: who })).invitee.handle} 发送邀请（站内信 + 邮件）`);
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 拉成员列表 */
		async function listMembers() {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return [];
			try {
				return (await server.listMembers(communityId)).items;
			} catch (error) {
				notify(errorText(error));
				return [];
			}
		}
		/** 当前社区里带 ADMINISTRATOR 位的自定义角色（层级从高到低） */
		function adminRoles() {
			return (state.view.community?.roles ?? []).filter((r) => !r.isEveryone && (r.permissions & Permission.ADMINISTRATOR) !== 0).sort((a, b) => b.position - a.position);
		}
		/**
		* 「设为管理员」会分配的角色：优先预置名「管理员」，其次层级最高的那个；
		* 社区里还没有任何带 ADMINISTRATOR 位的角色时返回 null（由 ensureAdminRole 新建）。
		*/
		function adminRole() {
			const admins = adminRoles();
			return admins.find((r) => r.name === "管理员") ?? admins[0] ?? null;
		}
		/**
		* 取当前社区「管理员」角色 id；社区里没有带 ADMINISTRATOR 位的角色时，
		* 按预置规格（名称 + 仅 ADMINISTRATOR 位）新建一个。仅供「设为管理员」快捷入口使用，
		* 权限与层级仍由服务端裁决。
		*/
		async function ensureAdminRole() {
			const existing = adminRole();
			if (existing !== null) return existing.id;
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return null;
			try {
				await server.createRole(communityId, {
					name: DEFAULT_ADMIN_ROLE_NAME,
					permissions: Permission.ADMINISTRATOR
				});
				notify(`已创建「${DEFAULT_ADMIN_ROLE_NAME}」角色`);
				await reloadCommunityDetail();
				return adminRole()?.id ?? null;
			} catch (error) {
				notify(errorText(error));
				return null;
			}
		}
		/** 设置成员的角色全集（@everyone 不需传） */
		async function setMemberRoles(userId, roleIds) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				await server.setMemberRoles(communityId, userId, { roleIds });
				notify("成员角色已更新");
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 转让社区所有权（仅 owner） */
		async function transferOwner(userId) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				await server.transferOwner(communityId, { userId });
				notify("所有权已转让");
				await reloadCommunityDetail();
				await refreshCommunities();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 新建角色 */
		async function createRole(body) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				await server.createRole(communityId, body);
				notify("角色已创建");
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 修改角色（名/色/权限位；@everyone 不可改名。层级请用 reorderRoles） */
		async function updateRole(roleId, body) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				await server.updateRole(communityId, roleId, body);
				notify("角色已更新");
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 整体重排角色层级（orderedIds 从高到低，必须含全部自定义角色） */
		async function reorderRoles(orderedIds) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				await server.reorderRoles(communityId, { roleIds: orderedIds });
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 删除角色（@everyone 不可删） */
		async function deleteRole(roleId) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				await server.deleteRole(communityId, roleId);
				notify("角色已删除");
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 拉某频道的覆盖列表 */
		async function listChannelOverwrites(channelId) {
			const server = serverOf();
			if (!server) return [];
			try {
				return (await server.listChannelOverwrites(channelId)).items;
			} catch (error) {
				notify(errorText(error));
				return [];
			}
		}
		/** 写入/覆盖某目标在该频道的 allow/deny 位 */
		async function setChannelOverwrite(channelId, targetType, targetId, body) {
			const server = serverOf();
			if (!server) return false;
			try {
				await server.setChannelOverwrite(channelId, targetType, targetId, body);
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 清除某目标在该频道的覆盖 */
		async function deleteChannelOverwrite(channelId, targetType, targetId) {
			const server = serverOf();
			if (!server) return false;
			try {
				await server.deleteChannelOverwrite(channelId, targetType, targetId);
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 移除成员 */
		async function kickMember(userId) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				await server.removeMember(communityId, userId);
				notify("已移除该成员");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 按成员行封禁（userId）；服务端会同时把 TA 移出成员 */
		async function banUser(userId, reason) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				const body = { userId };
				if (reason?.trim()) body.reason = reason.trim();
				notify(`已封禁 @${(await server.banUser(communityId, body)).user.handle}`);
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 拉取该社区封禁列表（含用户快照） */
		async function listBannedUsers() {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return [];
			try {
				return (await server.listBans(communityId)).items;
			} catch {
				return [];
			}
		}
		/** 解封 */
		async function unbanUser(userId) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				await server.unbanUser(communityId, userId);
				notify("已解封该用户");
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 新建频道（owner/admin），创建后自动进入 */
		async function createChannel(input) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return false;
			try {
				const body = { name: input.name };
				if (input.topic !== void 0) body.topic = input.topic;
				if (input.kind !== void 0) body.kind = input.kind;
				const created = await server.createChannel(communityId, body);
				await reloadCommunityDetail();
				await selectChannel(created.id);
				notify("频道已创建");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 编辑频道（改名/主题/类型等） */
		async function updateChannelById(channelId, patch) {
			const server = serverOf();
			if (!server) return false;
			try {
				await server.updateChannel(channelId, patch);
				await reloadCommunityDetail();
				notify("频道已更新");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/**
		* 频道排序（owner/admin）：与相邻频道交换位置。
		* 频道列表按 position 升序渲染，但历史数据 position 可能重复，
		* 因此按当前顺序整体重排为 0..n-1，只 PATCH 真正变化的频道。
		*/
		async function moveChannel(channelId, direction) {
			const server = serverOf();
			const community = state.view.community;
			if (!server || !community) return false;
			const ordered = [...community.channels];
			const index = ordered.findIndex((c) => c.id === channelId);
			const swapIndex = direction === "up" ? index - 1 : index + 1;
			if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return false;
			const current = ordered[index];
			const target = ordered[swapIndex];
			if (!current || !target) return false;
			const reordered = ordered.map((c) => {
				if (c.id === current.id) return target;
				if (c.id === target.id) return current;
				return c;
			});
			try {
				for (const [position, channel] of reordered.entries()) if (channel.position !== position) await server.updateChannel(channel.id, { position });
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 删除频道（owner/admin）；若正打开该频道则关闭它 */
		async function deleteChannelById(channelId) {
			const server = serverOf();
			if (!server) return false;
			try {
				await server.deleteChannel(channelId);
				if (state.view.channelId === channelId) {
					closeRealtime();
					patchView({
						channelId: null,
						threadId: null,
						messages: [],
						nextCursor: null,
						live: false
					});
				}
				await reloadCommunityDetail();
				notify("频道已删除");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 在主频道创建讨论组（可带起点消息与可见性）；成功后打开它 */
		async function createThreadInChannel(channelId, input) {
			const server = serverOf();
			if (!server) return null;
			try {
				const body = { name: input.name.trim() };
				if (input.starterMessageId) body.starterMessageId = input.starterMessageId;
				if (input.visibility !== void 0) body.visibility = input.visibility;
				if (input.passcode !== void 0) body.passcode = input.passcode;
				const created = await server.createThread(channelId, body);
				notify(`已创建讨论组「${created.name}」`);
				await reloadCommunityDetail();
				await openThread({
					id: created.id,
					channelId
				});
				return created;
			} catch (error) {
				notify(errorText(error));
				return null;
			}
		}
		/** 凭密码进入私密讨论组；成功后刷新频道讨论组列表并打开它 */
		async function joinThreadWithPasscode(threadId, passcode) {
			const server = serverOf();
			if (!server) return false;
			try {
				const joined = await server.joinThread(threadId, passcode.trim());
				notify(`已加入讨论组「${joined.name}」`);
				await reloadCommunityDetail();
				await openThread({
					id: joined.id,
					channelId: joined.channelId
				});
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 编辑讨论组（改名 / 改可见性 / 改密码），成功后刷新社区详情 */
		async function updateThread(threadId, patch) {
			const server = serverOf();
			if (!server) return false;
			try {
				await server.updateThread(threadId, patch);
				await reloadCommunityDetail();
				notify("讨论组已更新");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 拉讨论组成员列表（失败返回 []） */
		async function listThreadMembers(threadId) {
			const server = serverOf();
			if (!server) return [];
			try {
				return (await server.listThreadMembers(threadId)).items;
			} catch (error) {
				notify(errorText(error));
				return [];
			}
		}
		/** 拉可拉入的社区成员候选（支持关键词搜索；失败返回 []） */
		async function listThreadCandidates(threadId, q = "") {
			const server = serverOf();
			if (!server) return [];
			try {
				return (await server.listThreadCandidates(threadId, q.trim())).items;
			} catch (error) {
				notify(errorText(error));
				return [];
			}
		}
		/** 直接把社区成员拉入讨论组 */
		async function addThreadMember(threadId, userId) {
			const server = serverOf();
			if (!server) return false;
			try {
				notify(`已把 @${(await server.addThreadMember(threadId, userId)).user.handle} 拉入讨论组`);
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 移除讨论组成员（userId 传自己即退出） */
		async function removeThreadMember(threadId, userId) {
			const server = serverOf();
			if (!server) return false;
			try {
				await server.removeThreadMember(threadId, userId);
				notify(userId === state.me?.id ? "已退出讨论组" : "已移出该成员");
				await reloadCommunityDetail();
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 手动归档 / 恢复讨论组活跃 */
		async function setThreadArchived(threadId, archived) {
			const server = serverOf();
			if (!server) return false;
			try {
				if (archived) await server.archiveThread(threadId);
				else await server.reopenThread(threadId);
				await reloadCommunityDetail();
				notify(archived ? "讨论组已归档（24h 无人发言也会自动归档）" : "讨论组已恢复活跃");
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		let socket = null;
		let reconnectTimer = null;
		function closeRealtime() {
			if (reconnectTimer !== null) {
				window.clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			if (socket !== null) {
				socket.close();
				socket = null;
			}
			if (state.view.live) patchView({ live: false });
		}
		/** 窗口不可见 / 失焦视为「离开」，否则「在线」；离线由断连自动处理 */
		function desiredPresence() {
			if (typeof document === "undefined") return "online";
			if (document.visibilityState === "hidden" || !document.hasFocus()) return "away";
			return "online";
		}
		/** 上报当前在线状态到当前房间（未连接时静默丢弃） */
		function pushPresence() {
			socket?.send({
				type: "presence.set",
				payload: { kind: desiredPresence() }
			});
		}
		let presenceBound = false;
		function onPresenceSignal() {
			pushPresence();
		}
		/**
		* 房间 presence 增量（DO 实时扇出）：
		* - online / away 直接并入社区在线快照 —— 上线即时可见，不等 30s 轮询；
		* - offline 改为去抖重拉：房间帧只能证明「离开了本房间」，用户可能仍在线于
		*   同社区的其他频道，社区级名单以 REST 聚合结果为准（避免误判离线）。
		*/
		function applyPresenceUpdate(member) {
			if (member.presence === "offline") {
				if (presenceRefreshTimer !== null) return;
				presenceRefreshTimer = window.setTimeout(() => {
					presenceRefreshTimer = null;
					loadCommunityOnline();
				}, 500);
				return;
			}
			presenceFrameAt.set(member.userId, Date.now());
			const current = state.view.communityOnlineMembers;
			const next = current.some((m) => m.userId === member.userId) ? current.map((m) => m.userId === member.userId ? member : m) : [...current, member];
			patchView({
				communityOnlineMembers: next,
				communityOnlineCount: next.length
			});
		}
		let presenceRefreshTimer = null;
		/** 实时 presence 帧的到达时间（userId → ms），用于判断快照是否比本地状态更旧 */
		const presenceFrameAt = /* @__PURE__ */ new Map();
		/**
		* 用 REST 快照替换在线名单，但保留「本次请求发起之后」由实时帧更新的成员：
		* 快照取的是请求发起那一刻的 DO 状态，可能还没包含刚建立连接的自己/他人，
		* 直接覆盖会把已显示的在线状态打回旧值（表现为再等一轮 30s 轮询）。
		*/
		function mergePresenceSnapshot(snapshot, requestStartedAt) {
			const fresher = state.view.communityOnlineMembers.filter((m) => (presenceFrameAt.get(m.userId) ?? 0) > requestStartedAt);
			if (fresher.length === 0) return snapshot;
			const merged = new Map(snapshot.map((m) => [m.userId, m]));
			for (const m of fresher) merged.set(m.userId, m);
			return [...merged.values()];
		}
		function bindPresenceListeners() {
			if (presenceBound) return;
			presenceBound = true;
			document.addEventListener("visibilitychange", onPresenceSignal);
			window.addEventListener("focus", onPresenceSignal);
			window.addEventListener("blur", onPresenceSignal);
		}
		function unbindPresenceListeners() {
			if (!presenceBound) return;
			presenceBound = false;
			document.removeEventListener("visibilitychange", onPresenceSignal);
			window.removeEventListener("focus", onPresenceSignal);
			window.removeEventListener("blur", onPresenceSignal);
		}
		function wsUrl(roomId) {
			const settings = state.settings;
			const base = (settings?.serverUrl ?? "http://127.0.0.1:8787").replace(/^http/, "ws");
			const token = settings?.token ?? "";
			return `${base}/ws?token=${encodeURIComponent(token)}&channelId=${encodeURIComponent(roomId)}`;
		}
		/** 当前正在看的「房间」：讨论组优先，否则主频道 */
		function roomIdOf() {
			const { threadId, channelId } = state.view;
			return threadId ?? channelId;
		}
		/** 本房间其他人的输入态（key = userId）；随 evt.typing 刷新、到期自动清除 */
		const typingByUser = /* @__PURE__ */ new Map();
		let typingSweeper = null;
		/** 我上一次上报输入的时间（节流：同一房间最多 3s 一次） */
		let lastTypingSentAt = 0;
		function syncTypingView() {
			patchView({ typing: [...typingByUser.values()] });
		}
		/** 记录/刷新某人的输入态；首次出现时启动到期清扫定时器 */
		function applyTyping(member) {
			typingByUser.set(member.userId, member);
			syncTypingView();
			if (typingSweeper !== null) return;
			typingSweeper = window.setInterval(() => {
				const now = Date.now();
				let changed = false;
				for (const [userId, item] of [...typingByUser.entries()]) if (item.expiresAt <= now) {
					typingByUser.delete(userId);
					changed = true;
				}
				if (changed) syncTypingView();
				if (typingByUser.size === 0 && typingSweeper !== null) {
					window.clearInterval(typingSweeper);
					typingSweeper = null;
				}
			}, 1e3);
		}
		/** 切换房间时清掉输入态（上一个房间的人不该出现在新房间里） */
		function resetTyping() {
			if (typingSweeper !== null) {
				window.clearInterval(typingSweeper);
				typingSweeper = null;
			}
			if (typingByUser.size === 0 && state.view.typing.length === 0) return;
			typingByUser.clear();
			syncTypingView();
		}
		/**
		* 我在当前房间输入：节流上报给服务端（≥3s 一次），由服务端扇出给同房间其他人。
		* 未连接时静默丢弃（断线期间不补发）。
		*/
		function notifyTyping() {
			const now = Date.now();
			if (now - lastTypingSentAt < 3e3) return;
			if (!socket?.send({
				type: "typing",
				payload: { clientTime: now }
			})) return;
			lastTypingSentAt = now;
		}
		/** 连接某个房间（主频道或讨论组；各自一个 DO 实例 = 一条 WS） */
		function connectChannel(roomId) {
			closeRealtime();
			const settings = state.settings;
			socket = new TalkSocket(wsUrl(roomId), {
				onFrame: (frame) => handleServerFrame(frame),
				onClose: (code) => {
					socket = null;
					if (!state.open || roomIdOf() !== roomId) return;
					patchView({ live: false });
					if (code === 1008) {
						reloadCommunityDetail();
						return;
					}
					if (settings?.autoReconnect && reconnectTimer === null) reconnectTimer = window.setTimeout(() => {
						reconnectTimer = null;
						if (state.open && roomIdOf() === roomId) connectChannel(roomId);
					}, 3e3);
				},
				onError: () => {}
			});
			socket.connect();
		}
		/** 服务端帧分发：hello（心跳开启）/ 权限变更 / 消息事件（仅当属于当前房间） */
		function handleServerFrame(frame) {
			const roomId = roomIdOf();
			if (frame.type === "evt.hello") {
				patchView({ live: true });
				socket?.startHeartbeat(frame.payload.heartbeatIntervalSec);
				pushPresence();
				catchUpMessages();
				return;
			}
			if (frame.type === "evt.typing") {
				if (frame.payload.channelId === roomId && frame.payload.member.userId !== state.me?.id) applyTyping({
					...frame.payload.member,
					expiresAt: frame.payload.expiresAt
				});
				return;
			}
			if (frame.type === "evt.presence.update") {
				if (frame.payload.channelId === roomId) applyPresenceUpdate(frame.payload.member);
				return;
			}
			if (frame.type === "evt.community.access.changed") {
				if (frame.payload.communityId === state.view.communityId) {
					reloadCommunityDetail();
					refreshCommunities();
				}
				return;
			}
			if (roomId === null) return;
			switch (frame.type) {
				case "evt.message.new":
					if (frame.payload.channelId !== roomId) return;
					upsertMessage(frame.payload.message, true);
					if (frame.payload.mentionMe) notifyMention(frame.payload.message);
					return;
				case "evt.message.updated":
					if (frame.payload.channelId !== roomId) return;
					upsertMessage(frame.payload.message, true);
					return;
				case "evt.message.deleted":
					if (frame.payload.channelId !== roomId) return;
					removeMessage(frame.payload.messageId);
					return;
				case "evt.message.reactions":
					if (frame.payload.channelId !== roomId) return;
					patchReactions(frame.payload.messageId, frame.payload.reactions);
					return;
				default: return;
			}
		}
		function upsertMessage(item, appended) {
			const list = state.view.messages;
			const index = list.findIndex((m) => m.id === item.id);
			let next;
			if (index >= 0) {
				next = [...list];
				next[index] = item;
			} else if (appended) next = [...list, item];
			else next = [item, ...list];
			patchView({ messages: sortBy(next, ["createdAt"]) });
		}
		function removeMessage(messageId) {
			patchView({ messages: state.view.messages.filter((m) => m.id !== messageId) });
		}
		/**
		* 重连后补齐断线期间漏掉的消息：以本地最新一条为游标向后（asc）翻页，
		* 最多 5 页（500 条）；断线时间过长时剩下的靠手动翻页/重进频道。
		*/
		async function catchUpMessages() {
			const server = serverOf();
			const channelId = state.view.channelId;
			const newest = state.view.messages[state.view.messages.length - 1];
			if (!server || !channelId || !newest) return;
			const threadId = state.view.threadId;
			try {
				let cursor = String(newest.createdAt);
				for (let page = 0; page < 5; page += 1) {
					const res = await server.listMessages(channelId, {
						cursor,
						limit: 100,
						direction: "asc",
						...threadId === null ? {} : { threadId }
					});
					if (res.items.length === 0) return;
					for (const item of res.items) upsertMessage(item, true);
					if (res.nextCursor === null) return;
					cursor = res.nextCursor;
				}
			} catch {}
		}
		/** 整份替换某条消息的表情回应（服务端聚合结果，收敛幂等） */
		function patchReactions(messageId, reactions) {
			const list = state.view.messages;
			const index = list.findIndex((m) => m.id === messageId);
			const current = index >= 0 ? list[index] : void 0;
			if (!current) return;
			const next = [...list];
			next[index] = {
				...current,
				reactions
			};
			patchView({ messages: next });
		}
		/** 切换到某个频道：拉历史 → 上报已读 → 连实时 */
		async function selectChannel(channelId) {
			const server = serverOf();
			if (!server) return;
			closeRealtime();
			resetTyping();
			patchView({
				channelId,
				threadId: null,
				messages: [],
				nextCursor: null,
				messagesLoading: true,
				loadingOlder: false,
				live: false,
				replyingTo: null,
				focusMessageId: null
			});
			try {
				const page = await server.listMessages(channelId, {
					limit: 50,
					direction: "desc"
				});
				const items = [...page.items].reverse();
				patchView({
					messages: items,
					nextCursor: page.nextCursor,
					messagesLoading: false
				});
				const newest = items[items.length - 1];
				if (newest) try {
					await server.markRead(channelId, { lastReadMessageId: newest.id });
					refreshCommunities();
				} catch {}
				connectChannel(channelId);
			} catch (error) {
				patchView({
					messagesLoading: false,
					live: false
				});
				notify(errorText(error));
			}
		}
		/** 更新本地 community.threads 中的某条讨论组摘要（未读归零/计数推进等即时反馈） */
		function patchThreadSummary(threadId, patch) {
			const community = state.view.community;
			if (!community?.threads.some((t) => t.id === threadId)) return;
			patchView({ community: {
				...community,
				threads: community.threads.map((t) => t.id === threadId ? {
					...t,
					...patch
				} : t)
			} });
		}
		/** 打开讨论组：切到依附频道 → 拉该讨论组的消息 → 上报已读 → 连讨论组实时房间 */
		async function openThread(thread) {
			const server = serverOf();
			if (!server) return;
			if (state.view.channelId !== thread.channelId) await selectChannel(thread.channelId);
			const threadId = thread.id;
			closeRealtime();
			resetTyping();
			patchView({
				threadId,
				messages: [],
				nextCursor: null,
				messagesLoading: true,
				loadingOlder: false,
				live: false,
				replyingTo: null,
				focusMessageId: null
			});
			try {
				const page = await server.listMessages(thread.channelId, {
					limit: 50,
					direction: "desc",
					threadId
				});
				const items = [...page.items].reverse();
				patchView({
					messages: items,
					nextCursor: page.nextCursor,
					messagesLoading: false
				});
				const newest = items[items.length - 1];
				if (newest) try {
					await server.markThreadRead(threadId, { lastReadMessageId: newest.id });
					patchThreadSummary(threadId, {
						unreadCount: 0,
						unreadMentions: 0
					});
				} catch {}
				connectChannel(threadId);
			} catch (error) {
				patchView({
					messagesLoading: false,
					live: false
				});
				notify(errorText(error));
			}
		}
		/** 从讨论组退回它依附的主频道 */
		async function closeThread() {
			const channelId = state.view.channelId;
			if (channelId) await selectChannel(channelId);
		}
		/**
		* 拉取社区在线快照：写入 view（右侧成员面板用这一份数据），并返回给调用方。
		* 失败静默（保持上一次的名单），不影响聊天。
		*/
		async function loadCommunityOnline() {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return [];
			const startedAt = Date.now();
			try {
				const members = mergePresenceSnapshot((await server.communityOnline(communityId)).members, startedAt);
				patchView({
					communityOnlineCount: members.length,
					communityOnlineMembers: members
				});
				return members;
			} catch {
				return [];
			}
		}
		/** 向上翻更早消息（主频道或当前讨论组各自翻页） */
		async function loadOlderMessages() {
			const server = serverOf();
			const { channelId, threadId, nextCursor, loadingOlder, messages } = state.view;
			if (!server || !channelId || !nextCursor || loadingOlder) return;
			patchView({ loadingOlder: true });
			try {
				const common = {
					cursor: nextCursor,
					limit: 50,
					direction: "desc"
				};
				const page = threadId !== null ? await server.listMessages(channelId, {
					...common,
					threadId
				}) : await server.listMessages(channelId, common);
				patchView({
					messages: [...[...page.items].reverse(), ...messages],
					nextCursor: page.nextCursor,
					loadingOlder: false
				});
			} catch (error) {
				patchView({ loadingOlder: false });
				notify(errorText(error));
			}
		}
		/** 正文里的 @handle 列表（@everyone 是保留目标、不对应具体用户，不作为 handle 上送） */
		function mentionHandlesOf(text) {
			return (text.match(/(?<![\p{L}\p{N}_])@([\p{L}\p{N}_]+)/gu) ?? []).map((token) => token.replace(/^@/, "")).filter((handle) => `@${handle}` !== EVERYONE_TARGET_ID);
		}
		/** 组 createMessage 请求体：附件与 @mention 只在有值时带上（exactOptionalPropertyTypes） */
		function buildMessageBody(content, attachments) {
			const body = { content };
			if (attachments.length > 0) body.attachments = attachments;
			const handles = uniq(mentionHandlesOf(content));
			if (handles.length > 0) body.mentionHandles = handles;
			if (/(?<![\p{L}\p{N}_])@everyone(?![\p{L}\p{N}_])/u.test(content)) body.mentionEveryone = true;
			return body;
		}
		/**
		* 发消息：先逐个 PUT 附件拿 r2Key，再走 REST 创建；WS live 时事件回填，否则本地补一条。
		* shareId 非空时会附带一张分享卡片（服务端展开成消息内嵌的 shareCard 快照）。
		* @returns 是否成功入队（成功时调用方应清空输入与附件）
		*/
		async function sendMessage(content, files = [], shareId = null) {
			const server = serverOf();
			const channelId = state.view.channelId;
			if (!server || !channelId || state.view.sending) return false;
			const text = content.trim();
			if (text.length === 0 && files.length === 0 && shareId === null) return false;
			patchView({ sending: true });
			try {
				const attachments = [];
				for (const file of files) {
					const up = await server.uploadObject(file);
					attachments.push({
						r2Key: up.r2Key,
						name: up.name,
						size: up.size,
						mimeType: up.mimeType ?? (file.type.length > 0 ? file.type : null)
					});
				}
				const request = { ...buildMessageBody(text, attachments) };
				if (shareId !== null) request.shareId = shareId;
				if (state.view.replyingTo) request.replyToId = state.view.replyingTo.id;
				const sentThreadId = state.view.threadId;
				if (sentThreadId !== null) request.threadId = sentThreadId;
				const created = await server.createMessage(channelId, request);
				if (!state.view.live) upsertMessage(created, true);
				if (sentThreadId !== null) {
					const current = state.view.community?.threads.find((t) => t.id === sentThreadId);
					if (current) patchThreadSummary(sentThreadId, {
						messageCount: current.messageCount + 1,
						lastMessageId: created.id,
						lastActivityAt: created.createdAt,
						status: "active",
						archivedAt: null,
						updatedAt: created.createdAt
					});
				}
				patchView({
					sending: false,
					replyingTo: null
				});
				return true;
			} catch (error) {
				patchView({ sending: false });
				notify(errorText(error));
				return false;
			}
		}
		async function updateMessage(messageId, content) {
			const server = serverOf();
			if (!server) return;
			try {
				const updated = await server.updateMessage(messageId, { content: content.trim() });
				if (!state.view.live) upsertMessage(updated, true);
			} catch (error) {
				notify(errorText(error));
				throw error;
			}
		}
		async function deleteMessage(messageId) {
			const server = serverOf();
			if (!server) return;
			try {
				await server.deleteMessage(messageId);
				if (!state.view.live) removeMessage(messageId);
				const threadId = state.view.threadId;
				if (threadId !== null) {
					const current = state.view.community?.threads.find((t) => t.id === threadId);
					if (current && current.messageCount > 0) patchThreadSummary(threadId, { messageCount: current.messageCount - 1 });
				}
			} catch (error) {
				notify(errorText(error));
				throw error;
			}
		}
		/**
		* 切换某条消息上的表情回应（点过一次再点 = 取消）。
		* 成功后立刻用返回值替换本地聚合，不等 WS（WS 也会推同一份，幂等）。
		*/
		async function toggleReaction(item, emoji) {
			const server = serverOf();
			if (!server) return;
			try {
				const result = await server.toggleMessageReaction(item.id, emoji);
				patchReactions(result.messageId, result.reactions);
			} catch (error) {
				notify(errorText(error));
			}
		}
		/** 我能否置顶/取消置顶（与改删他人消息同一权限位：社区 MANAGE_MESSAGES） */
		function canPinMessages() {
			return canManageMessages();
		}
		/**
		* 置顶 / 取消置顶某条消息。服务端会广播 evt.message.updated（同一份数据），
		* 这里先用响应整条替换本地消息，实时模式下也不会闪。
		*/
		async function setMessagePinned(item, pinned) {
			const server = serverOf();
			if (!server) return;
			try {
				upsertMessage(pinned ? await server.pinMessage(item.id) : await server.unpinMessage(item.id), true);
				notify(pinned ? "已置顶" : "已取消置顶");
			} catch (error) {
				notify(errorText(error));
			}
		}
		/** 拉当前房间的置顶消息（打开置顶面板时调用；按置顶时间倒序） */
		async function loadPinnedMessages() {
			const server = serverOf();
			const channelId = state.view.channelId;
			if (!server || !channelId) return [];
			try {
				return (await server.listPinned(channelId, state.view.threadId)).items;
			} catch (error) {
				notify(errorText(error));
				return [];
			}
		}
		/** 取分享详情（含作者/大小/时间与下载地址）；失败返回 null */
		async function getShareInfo(shareId) {
			const server = serverOf();
			if (!server) return null;
			try {
				return await server.getShare(shareId);
			} catch (error) {
				notify(errorText(error));
				return null;
			}
		}
		/** 取分享的下载地址（服务端会顺带自增下载计数） */
		async function shareDownloadUrl(shareId) {
			const server = serverOf();
			if (!server) return null;
			try {
				return (await server.getShare(shareId)).downloadUrl;
			} catch (error) {
				notify(errorText(error));
				return null;
			}
		}
		/** 当前 DSH 会话 id：由「社区」页签（会话级 slot）挂载时写入 */
		let currentDshSessionId = null;
		function setCurrentDshSession(id) {
			currentDshSessionId = id;
		}
		function getCurrentDshSession() {
			return currentDshSessionId;
		}
		let openSessionFn = null;
		/** 由 client 入口 apply 注入「打开会话」实现（refresh + open） */
		function bindSessionOpener(fn) {
			openSessionFn = fn;
		}
		let sessionTreeFn = null;
		/** 由 client 入口 apply 注入「读取宿主会话树」实现（与左侧会话栏同源） */
		function bindSessionTree(fn) {
			sessionTreeFn = fn;
		}
		/** 路径最后一段（未分组回退用的工作区展示名，对齐宿主 workspaceLabel） */
		function pathBasename(path) {
			const trimmed = path.replace(/[/\\]+$/, "");
			const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
			return trimmed.slice(separator + 1) || path;
		}
		/**
		* 本机可分享的会话树：优先用宿主会话栏同源的派生结果（工作区标题 / 运行状态 /
		* 更新时间），宿主不可用时回退到 host 持久化列表（只有 id / cwd）。
		*/
		async function listShareableSessions() {
			const tree = sessionTreeFn?.() ?? null;
			if (tree && tree.groups.length > 0) return tree;
			try {
				const res = await hostSessions();
				const groups = /* @__PURE__ */ new Map();
				for (const session of res.sessions) {
					const key = session.cwd ?? "";
					let group = groups.get(key);
					if (!group) {
						group = {
							key,
							label: key.length > 0 ? pathBasename(key) : "未分组",
							...key.length > 0 ? { cwd: key } : {},
							sessions: []
						};
						groups.set(key, group);
					}
					group.sessions.push({
						id: session.id,
						title: session.id,
						running: false,
						completed: false,
						runningSubagentCount: 0
					});
				}
				return {
					groups: [...groups.values()],
					current: getCurrentDshSession()
				};
			} catch (error) {
				notify(errorText(error));
				return {
					groups: [],
					current: null
				};
			}
		}
		/**
		* 把本机某个 DSH 会话分享到社区：
		* host 打包 → 上传 R2 → 在 Server 登记一条 agent-session 分享。
		* 成功返回分享 id（可随消息发卡片），失败返回 null。
		*/
		async function shareLocalSession(input) {
			const server = serverOf();
			if (!server) return null;
			try {
				const raw = await hostSessionPackage(input.sessionId);
				const pack = JSON.parse(raw);
				const title = input.title?.trim() || `会话分享：${pack.manifest.sessionId.slice(0, 8)}`;
				const file = new File([raw], `agent-session-${pack.manifest.sessionId}.json`, { type: "application/json" });
				const uploaded = await server.uploadObject(file);
				const res = await server.createAgentSessionShare({
					r2Key: uploaded.r2Key,
					title,
					...input.summary?.trim() ? { summary: input.summary.trim() } : {},
					sizeBytes: uploaded.size,
					manifest: pack.manifest,
					...input.communityId ? { communityId: input.communityId } : {}
				});
				notify(`已分享会话「${res.share.title}」`);
				return res.share.id;
			} catch (error) {
				notify(errorText(error));
				return null;
			}
		}
		/** 让 host 把一条分享还原成本地 DSH 会话，并切到该会话 */
		async function cloneShareToSession(shareId) {
			const url = await shareDownloadUrl(shareId);
			if (!url) return false;
			try {
				const res = await hostClone(url);
				if (!res.sessionId) {
					notify("该分享不是 DSH 会话包");
					return false;
				}
				notify((openSessionFn ? await openSessionFn(res.sessionId) : false) ? "已还原会话并切换过去" : `已还原会话 ${res.sessionId}，请在会话列表里打开`);
				return true;
			} catch (error) {
				notify(errorText(error));
				return false;
			}
		}
		/** 我在当前社区的基础权限位（非成员 = 0） */
		function myPermissions() {
			return state.view.community?.myPermissions ?? 0;
		}
		/** 我是否是当前社区成员（服务端字段，与权限位无关：@everyone 全 0 时仍为 true） */
		function isMember() {
			return state.view.community?.isMember ?? false;
		}
		/** 我是否持有某社区级权限位（owner 的 myPermissions 恒为全量，无需特判） */
		function canCommunity(bit) {
			return (myPermissions() & bit) !== 0;
		}
		/** 我是否持有社区级 MANAGE_CHANNEL 权限（频道、社区信息、频道覆盖） */
		function isModerator() {
			return canCommunity(Permission.MANAGE_CHANNEL);
		}
		/** 我是否能管理角色与成员角色 */
		function canManageRoles() {
			return canCommunity(Permission.MANAGE_ROLES);
		}
		/** 我持有的最高角色层级（@everyone 不计；无自定义角色 = 0） */
		function myHighestRolePosition() {
			const held = new Set(state.view.community?.myRoleIds ?? []);
			let max = 0;
			for (const role of state.view.community?.roles ?? []) {
				if (role.isEveryone || !held.has(role.id)) continue;
				if (role.position > max) max = role.position;
			}
			return max;
		}
		/** 一组角色 id 的最高层级（用于判断某成员是否层级低于我） */
		function highestPositionOf(roleIds) {
			const held = new Set(roleIds);
			let max = 0;
			for (const role of state.view.community?.roles ?? []) {
				if (role.isEveryone || !held.has(role.id)) continue;
				if (role.position > max) max = role.position;
			}
			return max;
		}
		/** 我能否操作该层级的角色/成员（owner 恒可；否则要求层级严格高于对方） */
		function canManageRolePosition(position) {
			return isOwner() || position < myHighestRolePosition();
		}
		/** 我是否能管理讨论组（改名/归档/删除/加人） */
		function canManageThreads() {
			return canCommunity(Permission.MANAGE_THREADS);
		}
		/** 我是否能改社区资料/隐私/短标识 */
		function canManageCommunity() {
			return canCommunity(Permission.MANAGE_COMMUNITY);
		}
		/** 我是否能管理他人消息 */
		function canManageMessages() {
			return canCommunity(Permission.MANAGE_MESSAGES);
		}
		/** 我是否能邀请成员 */
		function canInviteMembers() {
			return canCommunity(Permission.INVITE_MEMBERS);
		}
		/** 我是否能移除成员 */
		function canKickMembers() {
			return canCommunity(Permission.KICK_MEMBERS);
		}
		/** 我是否能封禁成员 */
		function canBanMembers() {
			return canCommunity(Permission.BAN_MEMBERS);
		}
		/** 我是否是当前社区的所有者（owner 绕过所有权限判定） */
		function isOwner() {
			const community = state.view.community;
			if (community === null || state.me === null) return false;
			return community.ownerId === state.me.id;
		}
		/** 我在某频道下的解析后权限位（含 overwrite 叠加；非成员 = 0） */
		function channelPermissions(channelId) {
			return state.view.community?.channels.find((c) => c.id === channelId)?.permissions ?? 0;
		}
		/** 能否编辑：作者本人（随时）或持有社区 MANAGE_MESSAGES */
		function canEditMessage(item) {
			if (state.me === null) return false;
			if (item.authorId === state.me.id) return true;
			return canManageMessages();
		}
		/** 能否撤回/删除：作者仅在发送 2 分钟内；持有 MANAGE_MESSAGES 随时可删 */
		function canRetractMessage(item) {
			if (state.me === null) return false;
			if (item.authorId === state.me.id) return Date.now() - item.createdAt <= MESSAGE_RETRACT_MS;
			return canManageMessages();
		}
		/** 选中某条消息作为回复目标（composer 上方会出现提示条） */
		function replyToMessage(item) {
			patchView({ replyingTo: item });
		}
		/** 取消回复 */
		function cancelReply() {
			patchView({ replyingTo: null });
		}
		/** 清除跳转高亮标记（高亮动画结束后调用） */
		function clearMessageFocus() {
			if (state.view.focusMessageId !== null) patchView({ focusMessageId: null });
		}
		/**
		* 打开某条消息所在房间（主频道或讨论组）并定位：目标不在首屏则向上翻页
		* （最多 10 页）寻找，找到后短暂高亮。
		* @returns 是否成功定位
		*/
		async function revealMessage(channelId, messageId, threadId = null) {
			try {
				const targetThread = threadId ?? null;
				if (state.view.channelId !== channelId || state.view.threadId !== targetThread) {
					if (targetThread) await openThread({
						id: targetThread,
						channelId
					});
					else await selectChannel(channelId);
				}
				let guard = 0;
				while (guard < 10 && state.view.nextCursor !== null && !state.view.messages.some((m) => m.id === messageId)) {
					await loadOlderMessages();
					guard += 1;
				}
				if (!state.view.messages.some((m) => m.id === messageId)) return false;
				patchView({ focusMessageId: messageId });
				return true;
			} catch {
				return false;
			}
		}
		function toMemberLite(item) {
			return {
				userId: item.userId,
				handle: item.user.handle,
				displayName: item.user.displayName,
				avatarUrl: item.user.avatarUrl,
				roleIds: item.roleIds
			};
		}
		/** 拉取当前社区成员到 view.members（缓存，供 @ 自动补全） */
		async function refreshCommunityMembers(communityId) {
			const server = serverOf();
			if (!server) return;
			if (state.view.communityId !== communityId) return;
			patchView({ membersLoading: true });
			try {
				const res = await server.listMembers(communityId, { limit: 200 });
				if (state.view.communityId !== communityId) return;
				patchView({
					members: res.items.map(toMemberLite),
					membersLoading: false
				});
			} catch {
				if (state.view.communityId === communityId) patchView({ membersLoading: false });
			}
		}
		/** 在当前社区搜索消息（关键词可留空，此时需带筛选；返回 null 表示失败，错误已 toast） */
		async function searchCommunityMessages(q, cursor, filters = {}) {
			const server = serverOf();
			const communityId = state.view.communityId;
			if (!server || !communityId) return null;
			try {
				const res = await server.searchMessages(communityId, q, {
					...filters,
					limit: 30,
					...cursor === void 0 ? {} : { cursor }
				});
				return {
					items: res.items,
					nextCursor: res.nextCursor
				};
			} catch (error) {
				notify(errorText(error));
				return null;
			}
		}
		//#endregion
		//#region packages/client/src/components/styles.tsx
		/** 语义色 token（明暗随宿主翻转）。组件只引用这里的键，不得写字面色值 */
		const palette = {
			page: "var(--dsw-alias-bg-base)",
			panel: "var(--dsw-alias-bg-layer-1)",
			layer2: "var(--dsw-alias-bg-layer-2)",
			rail: "var(--dsw-specific-sidebar-fill)",
			elevated: "var(--dsw-alias-bg-overlay)",
			border: "var(--dsw-alias-border-l1)",
			text: "var(--dsw-alias-label-primary)",
			muted: "var(--dsht-label-tertiary, var(--dsw-alias-label-tertiary))",
			accent: "var(--dsw-alias-state-business-primary)",
			danger: "var(--dsw-alias-state-error-primary)",
			dangerSoft: "var(--dsw-alias-state-error-secondary)",
			success: "var(--dsw-alias-state-success-primary)",
			warn: "var(--dsw-alias-state-warn-primary)",
			inputBg: "var(--dsw-alias-interactive-bg-hover-solid)",
			hover: "var(--dsw-alias-interactive-bg-hover)",
			badge: "var(--dsw-alias-state-error-primary)",
			hoverAccent: "var(--dsw-alias-interactive-bg-hover-accent)",
			onColor: "#ffffff",
			/** 品牌色淡底：@提及高亮、被提及消息的底色 */
			mentionBg: "var(--dsw-alias-state-business-tertiary)",
			/** 搜索命中关键词的底色（比 mentionBg 更实一档的半透明品牌色） */
			highlightBg: "var(--dsw-alias-interactive-bg-hover-accent)",
			/** 头像无图时的默认底色渐变 */
			avatarFallback: "linear-gradient(135deg, var(--dsw-static-deepseek-500), var(--dsw-static-deepseek-400))",
			/** 社区头像的圆形底色（白色圆底 + 内缩 logo，亮暗主题都用白） */
			communityAvatarBg: "#ffffff"
		};
		/** 阴影：集中定义，避免 rgba 黑散落在各组件里 */
		const shadow = {
			/** 小元素 / 列表卡片 */
			soft: "0 1px 2px rgba(0,0,0,0.06)",
			/** 消息 hover 操作条 */
			chip: "0 2px 6px rgba(0,0,0,0.1)",
			/** @ 补全下拉 */
			menu: "0 4px 16px rgba(0,0,0,0.14)",
			/** 表情面板等浮层 */
			popup: "0 6px 20px rgba(0,0,0,0.18)"
		};
		/** 页签内容页根容器：占满宿主中栏（高度由外层 flex 约束） */
		const pageRoot = {
			width: "100%",
			height: "100%",
			minHeight: 0,
			display: "flex",
			flexDirection: "column",
			background: palette.page,
			color: palette.text
		};
		/** 水平滚动条细样式（可选加到滚动容器） */
		const slimScrollbar = {
			scrollbarWidth: "thin",
			scrollbarColor: "var(--dsh-scrollbar-thumb, var(--dsw-alias-scrollbar-bg-l2)) transparent"
		};
		const smallText = {
			fontSize: 14,
			color: palette.muted
		};
		/** 分段选择组容器（对齐 AuthScreen 的 Segmented 控件）：圆角外壳 + 内部激活键 */
		const pillGroup = {
			display: "flex",
			gap: 2,
			padding: 3,
			borderRadius: 10,
			background: palette.inputBg,
			border: `1px solid ${palette.border}`
		};
		/** 分段选择组内的单个键（非激活态） */
		const pillKey = {
			flex: 1,
			border: "none",
			borderRadius: 8,
			padding: "7px 12px",
			fontSize: 14,
			fontWeight: 450,
			color: palette.muted,
			background: "transparent",
			cursor: "pointer",
			transition: "background 120ms ease, color 120ms ease"
		};
		/** 分段选择键样式：active 时叠加激活态 */
		function pillStyle(active) {
			if (!active) return pillKey;
			return {
				...pillKey,
				fontWeight: 600,
				color: palette.text,
				background: palette.elevated,
				boxShadow: shadow.soft
			};
		}
		/** 表单字段纵向容器 */
		const fieldBlock = {
			display: "flex",
			flexDirection: "column",
			gap: 6
		};
		/** 字段小标签 */
		const fieldLabel = {
			fontSize: 14,
			color: palette.muted,
			fontWeight: 500
		};
		/** 成员 / 封禁 / 在线成员等列表卡片行 */
		const listCard = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			padding: "7px 10px",
			borderRadius: 10,
			background: palette.inputBg,
			border: `1px solid ${palette.border}`
		};
		/** 列表卡片的主标题行（单行省略） */
		const listCardName = {
			fontSize: 14,
			fontWeight: 600,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		/**
		* 项目 logo（构建期由 tsdown 读 packages/client/public/logo.svg 注入）转 data URL。
		* 源文件是纯黑单色图形，这里统一用 CSS mask 渲染、以宿主语义文字色填充，
		* 因此亮/暗主题下都可见（详见 BrandLogo）。
		*/
		const talkLogoUrl = `data:image/svg+xml;utf8,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" role=\"img\" aria-labelledby=\"title desc\">\r\n  <title id=\"title\">DSH-Talk</title>\r\n  <desc id=\"desc\">A compact conversation bubble with three message beats.</desc>\r\n  <!-- Designed as a monochrome CSS mask: calm rounded silhouette, active conversation. -->\r\n  <path\r\n    fill=\"#000\"\r\n    fill-rule=\"evenodd\"\r\n    d=\"M96 108c-26.51 0-48 21.49-48 48v164c0 26.51 21.49 48 48 48h116.12l78.25 65.21c13.42 11.18 33.63 1.64 33.63-15.83V368H416c26.51 0 48-21.49 48-48V156c0-26.51-21.49-48-48-48H96Zm0 48h320v164H96V156Zm85 59a25 25 0 1 1 0 50 25 25 0 0 1 0-50Zm75 0a25 25 0 1 1 0 50 25 25 0 0 1 0-50Zm75 0a25 25 0 1 1 0 50 25 25 0 0 1 0-50Z\"\r\n  />\r\n</svg>\r\n")}`;
		/** Spinner 旋转动画（@keyframes 不能用内联样式，挂载时注入一次） */
		const SPINNER_CSS = `
@keyframes dsht-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .dsht-spinner { animation-duration: 1.6s !important; }
}
`;
		let spinnerCssInjected = false;
		function ensureSpinnerCss() {
			if (spinnerCssInjected) return;
			const style = document.createElement("style");
			style.setAttribute("data-dsht-spinner-css", "");
			style.textContent = SPINNER_CSS;
			document.head.appendChild(style);
			spinnerCssInjected = true;
		}
		/**
		* 行内加载指示器（转圈）：服务器在境外、请求偏慢时用于按钮/列表的行内反馈。
		* 颜色跟随当前文字色，可放在 Button 的 icon 插槽或文字前。
		*/
		function Spinner({ size = 14 }) {
			ensureSpinnerCss();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dsht-spinner",
				role: "status",
				"aria-label": "加载中",
				style: {
					width: size,
					height: size,
					flex: "0 0 auto",
					display: "inline-block",
					borderRadius: "50%",
					border: `2px solid currentColor`,
					borderTopColor: "transparent",
					animation: "dsht-spin 0.7s linear infinite"
				}
			});
		}
		/** 居中的加载提示（整块区域拉取数据时用） */
		function LoadingHint({ text = "加载中…", padding = "16px 4px" }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					...smallText,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 8,
					padding
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: text })]
			});
		}
		/** 品牌 logo 标记：单色 mask 跟随宿主文字色，尺寸自定 */
		function BrandLogo({ size = 34, title }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				role: "img",
				"aria-label": title ?? "DSH-Talk",
				title,
				style: {
					width: size,
					height: size,
					flex: "0 0 auto",
					display: "inline-block",
					backgroundColor: palette.text,
					maskImage: `url("${talkLogoUrl}")`,
					WebkitMaskImage: `url("${talkLogoUrl}")`,
					maskRepeat: "no-repeat",
					WebkitMaskRepeat: "no-repeat",
					maskPosition: "center",
					WebkitMaskPosition: "center",
					maskSize: "contain",
					WebkitMaskSize: "contain"
				}
			});
		}
		const DICEBEAR_API = "https://api.dicebear.com/10.x";
		const USER_PLACEHOLDER_BG = "b6e3f4";
		const COMMUNITY_PLACEHOLDER_BG = "7c3aed";
		/** 拼装 DiceBear 占位图 URL；seed 相同则每次生成同一张图，可稳定替代自定义头像 */
		function dicebearAvatarUrl(kind, seed) {
			const search = new URLSearchParams({
				seed,
				size: "96"
			});
			if (kind === "community") {
				search.set("backgroundColor", COMMUNITY_PLACEHOLDER_BG);
				for (const key of [
					"shape1Color",
					"shape2Color",
					"shape3Color"
				]) search.set(key, "ffffff");
				return `${DICEBEAR_API}/planets/svg?${search}`;
			}
			search.set("backgroundColor", USER_PLACEHOLDER_BG);
			search.set("paperColor", "00000000");
			return `${DICEBEAR_API}/voxel-bot/svg?${search}`;
		}
		/** 头像内文字随尺寸缩放，但只落在 14 / 16 两档（项目字号标准：最小 14，大号 16） */
		function avatarLabelSize(size) {
			return size * .42 < 15 ? 14 : 16;
		}
		/** 头像圆块：有 url 时显示图片；无 url / 加载失败时回退到 DiceBear 默认占位图 */
		function Avatar({ label, color, size = 28, src, inset, kind = "user" }) {
			const [failed, setFailed] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (src) setFailed(false);
			}, [src]);
			const placeholder = dicebearAvatarUrl(kind, label);
			const showImage = Boolean(src) && !failed;
			const showPlaceholder = !showImage && placeholder;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					width: size,
					height: size,
					flex: "0 0 auto",
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					borderRadius: "50%",
					overflow: "hidden",
					background: color ?? palette.avatarFallback,
					color: palette.onColor,
					fontSize: avatarLabelSize(size),
					fontWeight: 600,
					userSelect: "none"
				},
				children: showImage ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src: src ?? "",
					alt: label,
					onError: () => setFailed(true),
					style: {
						width: "100%",
						height: "100%",
						display: "block",
						objectFit: inset ? "contain" : "cover",
						...inset ? {
							boxSizing: "border-box",
							padding: inset
						} : {}
					}
				}) : showPlaceholder ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src: placeholder,
					alt: label,
					onError: () => setFailed(true),
					style: {
						width: "100%",
						height: "100%",
						display: "block",
						objectFit: "cover"
					}
				}) : label.slice(0, 1).toUpperCase()
			});
		}
		/** 头像/图标选择器：预览圆块 + 「修改/移除」按钮，选取后回调 onPick(File) */
		function AvatarPicker({ src, label, size = 60, onPick, onRemove, uploadLabel = "修改头像", removeLabel = "移除头像", busy, kind = "user" }) {
			const inputRef = (0, react.useRef)(null);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
						label,
						src: src ?? null,
						size,
						kind
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								disabled: busy,
								onClick: () => inputRef.current?.click(),
								children: uploadLabel
							}), onRemove ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								disabled: busy,
								onClick: onRemove,
								children: removeLabel
							}) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								...smallText,
								fontSize: 14
							},
							children: "支持 JPG / PNG / WebP，建议方形图片"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: inputRef,
						type: "file",
						accept: "image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml",
						style: { display: "none" },
						onChange: (e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (file && onPick) onPick(file);
						},
						"aria-hidden": true,
						tabIndex: -1
					})
				]
			});
		}
		function timeLabel(ts) {
			const d = new Date(ts);
			const pad = (n) => String(n).padStart(2, "0");
			return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
		}
		//#endregion
		//#region packages/client/src/components/AuthScreen.tsx
		const card = {
			width: 420,
			maxWidth: "calc(100vw - 48px)",
			background: palette.panel,
			border: `1px solid ${palette.border}`,
			borderRadius: 16,
			padding: "26px 28px",
			color: palette.text,
			display: "flex",
			flexDirection: "column",
			gap: 16
		};
		const fieldHint = {
			fontSize: 14,
			color: palette.muted
		};
		const errorBanner = {
			display: "flex",
			alignItems: "flex-start",
			gap: 6,
			padding: "8px 10px",
			borderRadius: 8,
			background: palette.layer2,
			border: `1px solid ${palette.border}`,
			borderLeft: `3px solid ${palette.danger}`,
			color: palette.danger,
			fontSize: 14,
			lineHeight: 1.4
		};
		const linkButton = {
			border: "none",
			background: "transparent",
			padding: 0,
			color: palette.accent,
			fontSize: 14,
			cursor: "pointer"
		};
		const linkButtonDisabled = {
			...linkButton,
			color: palette.muted,
			cursor: "default"
		};
		/** 把异常转成可展示的文案 */
		function errorMessage(err) {
			return err instanceof Error ? err.message : String(err);
		}
		/** 卡片顶部品牌标识 + 标题 / 副标题 */
		function BrandHeader({ title, subtitle }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 12
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandLogo, {
					size: 42,
					title: "DSH-Talk 社区"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 2
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 16,
							fontWeight: 650,
							lineHeight: 1.2
						},
						children: title
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...fieldHint,
							fontSize: 14
						},
						children: subtitle
					})]
				})]
			});
		}
		/** 错误提示条（左侧警告图标 + 文案） */
		function ErrorBanner({ message }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: errorBanner,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						display: "inline-flex",
						flex: "0 0 auto",
						marginTop: 1
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, { size: 14 })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: message
				})]
			});
		}
		/** 显示 / 隐藏密码切换按钮 */
		function PasswordToggle({ shown, onToggle }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: onToggle,
				style: {
					border: "none",
					background: "transparent",
					padding: 0,
					color: palette.accent,
					fontSize: 14,
					cursor: "pointer",
					display: "inline-flex",
					alignItems: "center",
					gap: 4
				},
				children: shown ? "隐藏" : "显示"
			});
		}
		/** 分段控制：登录 / 注册，以及登录态下的 邮箱 / 用户名 */
		function Segmented({ value, options, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: pillGroup,
				children: options.map((option) => {
					const active = value === option.key;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => onChange(option.key),
						style: {
							flex: 1,
							border: "none",
							borderRadius: 8,
							padding: "7px 12px",
							fontSize: 14,
							fontWeight: active ? 600 : 450,
							color: active ? palette.text : palette.muted,
							background: active ? palette.elevated : "transparent",
							cursor: "pointer",
							transition: "background 120ms ease, color 120ms ease"
						},
						children: option.label
					}, option.key);
				})
			});
		}
		/** 带标签行的表单字段：左侧 label，右侧可选插槽（如显示/隐藏密码） */
		function Field({ label, htmlFor, right, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 6
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						htmlFor,
						style: fieldLabel,
						children: label
					}), right]
				}), children]
			});
		}
		/** 忘记密码：邮箱 → 收验证码 → 设置新密码（全程在面板内完成，无需打开邮件链接） */
		function ForgotPasswordCard({ initialEmail, onDone }) {
			const [email, setEmail] = (0, react.useState)(initialEmail);
			const [otp, setOtp] = (0, react.useState)("");
			const [newPassword, setNewPassword] = (0, react.useState)("");
			const [showPassword, setShowPassword] = (0, react.useState)(false);
			const [stage, setStage] = (0, react.useState)("request");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			async function request(event) {
				event.preventDefault();
				setBusy(true);
				setError("");
				try {
					await requestPasswordResetOtp(email);
					setStage("reset");
					setOtp("");
					setNewPassword("");
				} catch (err) {
					setError(errorMessage(err));
				} finally {
					setBusy(false);
				}
			}
			async function submitReset(event) {
				event.preventDefault();
				setBusy(true);
				setError("");
				try {
					await resetPasswordWithOtp({
						email,
						otp,
						password: newPassword
					});
					setStage("done");
				} catch (err) {
					setError(errorMessage(err));
				} finally {
					setBusy(false);
				}
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandHeader, {
					title: "重置密码",
					subtitle: stage === "done" ? "密码已更新" : "通过邮箱验证码找回账号"
				}), stage === "done" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: 14,
						color: palette.muted,
						lineHeight: 1.6
					},
					children: "密码已重置成功，请使用新密码重新登录。"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					size: "md",
					style: { width: "100%" },
					onClick: onDone,
					children: "返回登录"
				})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					onSubmit: stage === "request" ? (e) => void request(e) : (e) => void submitReset(e),
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 12
					},
					children: [
						stage === "request" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 14,
								color: palette.muted,
								lineHeight: 1.6
							},
							children: "输入注册邮箱，我们会向它发送一封 6 位验证码邮件。"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: "邮箱",
							htmlFor: "talk-reset-email",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-reset-email",
								value: email,
								onChange: (e) => setEmail(e.target.value),
								placeholder: "you@example.com",
								type: "email",
								autoComplete: "email",
								autoFocus: true,
								required: true
							})
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									fontSize: 14,
									color: palette.muted,
									lineHeight: 1.6
								},
								children: [
									"验证码已发送至 ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										style: { color: palette.text },
										children: email
									}),
									"，5 分钟内有效；若未收到，请检查垃圾邮件；若该邮箱未注册则不会收到邮件。"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "验证码",
								htmlFor: "talk-reset-otp",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									id: "talk-reset-otp",
									value: otp,
									onChange: (e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)),
									placeholder: "6 位数字",
									inputMode: "numeric",
									autoComplete: "one-time-code",
									autoFocus: true,
									required: true
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
								label: "新密码",
								htmlFor: "talk-reset-password",
								right: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PasswordToggle, {
									shown: showPassword,
									onToggle: () => setShowPassword((prev) => !prev)
								}),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									id: "talk-reset-password",
									value: newPassword,
									onChange: (e) => setNewPassword(e.target.value),
									type: showPassword ? "text" : "password",
									autoComplete: "new-password",
									required: true
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: fieldHint,
									children: "至少 8 位"
								})]
							})
						] }),
						error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ErrorBanner, { message: error }) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							type: "submit",
							variant: "primary",
							size: "md",
							disabled: busy || (stage === "request" ? email.trim().length === 0 : otp.trim().length !== 6 || newPassword.length < 8),
							style: { width: "100%" },
							children: busy ? "请稍候…" : stage === "request" ? "发送验证码" : "重置密码"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center"
							},
							children: [stage === "reset" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: busy ? linkButtonDisabled : linkButton,
								disabled: busy,
								onClick: () => {
									setStage("request");
									setError("");
								},
								children: "换个邮箱"
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: busy ? linkButtonDisabled : linkButton,
								disabled: busy,
								onClick: onDone,
								children: "返回登录"
							})]
						})
					]
				})]
			});
		}
		function AuthScreen() {
			const talk = useTalkState();
			const [mode, setMode] = (0, react.useState)("login");
			const [name, setName] = (0, react.useState)("");
			const [account, setAccount] = (0, react.useState)("");
			const [password, setPassword] = (0, react.useState)("");
			const [showPassword, setShowPassword] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [otp, setOtp] = (0, react.useState)("");
			const [otpBusy, setOtpBusy] = (0, react.useState)(false);
			const [otpError, setOtpError] = (0, react.useState)("");
			const [forgot, setForgot] = (0, react.useState)(false);
			const pendingEmail = talk.pendingEmail;
			const verifyFromLogin = talk.pendingEmailReason === "login";
			(0, react.useEffect)(() => {
				if (pendingEmail) {
					setOtp("");
					setOtpError("");
				}
			}, [pendingEmail]);
			async function submit(event) {
				event.preventDefault();
				setBusy(true);
				setError("");
				try {
					if (mode === "login") await login("email", account.trim(), password);
					else {
						const extra = {};
						if (name.trim().length > 0) extra.name = name.trim();
						await register({
							...extra,
							email: account.trim(),
							password
						});
					}
				} catch (err) {
					setError(errorMessage(err));
				} finally {
					setBusy(false);
				}
			}
			async function verify(event) {
				event.preventDefault();
				setOtpBusy(true);
				setOtpError("");
				try {
					await verifyOtp(otp);
				} catch (err) {
					setOtpError(errorMessage(err));
				} finally {
					setOtpBusy(false);
				}
			}
			async function resend() {
				setOtpError("");
				setOtpBusy(true);
				try {
					await resendVerificationOtp();
				} catch (err) {
					setOtpError(errorMessage(err));
				} finally {
					setOtpBusy(false);
				}
			}
			const allowSubmit = account.trim().length > 0 && password.length >= 8;
			if (pendingEmail) {
				const otpReady = otp.trim().length === 6;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: card,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandHeader, {
							title: "验证邮箱",
							subtitle: verifyFromLogin ? "该账号尚未验证，验证后即可登录" : "输入验证码完成注册"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 14,
								color: palette.muted,
								lineHeight: 1.5
							},
							children: verifyFromLogin ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								"该邮箱尚未验证，暂时无法登录。验证码已重新发送至",
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									style: { color: palette.text },
									children: pendingEmail
								}),
								"，完成验证后将自动登录。5 分钟内有效；若未收到，请检查垃圾邮件。"
							] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								"验证码已发送至 ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									style: { color: palette.text },
									children: pendingEmail
								}),
								"， 请查收邮件。5 分钟内有效；若未收到，请检查垃圾邮件。"
							] })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
							onSubmit: (e) => void verify(e),
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 12
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "验证码",
									htmlFor: "talk-otp",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										id: "talk-otp",
										value: otp,
										onChange: (e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)),
										placeholder: "6 位数字",
										inputMode: "numeric",
										autoComplete: "one-time-code",
										autoFocus: true,
										required: true
									})
								}),
								otpError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ErrorBanner, { message: otpError }) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "submit",
									variant: "primary",
									size: "md",
									disabled: otpBusy || !otpReady,
									style: { width: "100%" },
									children: otpBusy ? "验证中…" : "验证邮箱"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: otpBusy ? linkButtonDisabled : linkButton,
										disabled: otpBusy,
										onClick: () => void resend(),
										children: "重新发送"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: otpBusy ? linkButtonDisabled : linkButton,
										disabled: otpBusy,
										onClick: () => cancelVerification(),
										children: "返回登录"
									})]
								})
							]
						})
					]
				});
			}
			if (forgot) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ForgotPasswordCard, {
				initialEmail: account.trim(),
				onDone: () => setForgot(false)
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandHeader, {
						title: "DSH-Talk 社区",
						subtitle: "登录后参与社区讨论"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Segmented, {
						value: mode,
						onChange: setMode,
						options: [{
							key: "login",
							label: "登录"
						}, {
							key: "register",
							label: "注册"
						}]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						onSubmit: (e) => void submit(e),
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 12
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "邮箱",
								htmlFor: "talk-account",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									id: "talk-account",
									value: account,
									onChange: (e) => setAccount(e.target.value),
									placeholder: "you@example.com",
									type: "email",
									autoComplete: "email",
									required: true
								})
							}),
							mode === "register" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "昵称（可选）",
								htmlFor: "talk-name",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									id: "talk-name",
									value: name,
									onChange: (e) => setName(e.target.value),
									placeholder: "显示名，留空用邮箱前缀"
								})
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
								label: "密码",
								htmlFor: "talk-password",
								right: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PasswordToggle, {
									shown: showPassword,
									onToggle: () => setShowPassword((prev) => !prev)
								}),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									id: "talk-password",
									value: password,
									onChange: (e) => setPassword(e.target.value),
									type: showPassword ? "text" : "password",
									autoComplete: mode === "login" ? "current-password" : "new-password",
									required: true
								}), mode === "register" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: fieldHint,
									children: "至少 8 位"
								}) : null]
							}),
							mode === "login" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									justifyContent: "flex-end"
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: linkButton,
									onClick: () => {
										setForgot(true);
										setError("");
									},
									children: "忘记密码？"
								})
							}) : null,
							error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ErrorBanner, { message: error }) : null,
							talk.busy && !busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									...fieldHint,
									color: palette.muted
								},
								children: "正在连接 Server…"
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "submit",
								variant: "primary",
								size: "md",
								disabled: busy || !allowSubmit,
								style: { width: "100%" },
								children: busy ? "请稍候…" : mode === "login" ? "登录" : "创建账号"
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region packages/client/src/components/TalkModal.tsx
		/** 追加到 dialog 的标记类：供 :has() 定位对应的 portal root */
		const DIALOG_MARKER = "dsht-modal-dialog";
		/** 页签内容区根节点的查询属性（见 components.tsx 的 TalkPage） */
		const PAGE_ROOT_SELECTOR = "[data-dsht-page-root]";
		const talkModalCss = `
body > div[role="presentation"]:has(> .${DIALOG_MARKER}) {
  left: var(--dsht-modal-left, 0px);
  top: var(--dsht-modal-top, 0px);
  right: var(--dsht-modal-right, 0px);
  bottom: var(--dsht-modal-bottom, 0px);
}

/* 宿主 dialog 默认宽 min(380px, 100%)，对表单 / 列表类内容偏窄，统一放宽 */
body > div[role="presentation"] > .${DIALOG_MARKER} {
  width: min(560px, 100%);
}

/* HoverCard 卡片同样经 body portal 渲染、固定 z-index 100，会被上面的遮罩
   （z-index 1000）盖住；把带说明卡的 portal root 提到遮罩之上（只读卡片，
   无需交互）。标记属性见 Manage.tsx 的 ActionTip，宿主类名是构建期哈希，
   故只能用结构选择器。 */
body > div:has(> [data-dsht-hover-tip]) {
  z-index: 1100;
}
`;
		let styleInjected = false;
		/** 注入一次覆盖样式（幂等） */
		function ensureStyle() {
			if (styleInjected) return;
			const style = document.createElement("style");
			style.setAttribute("data-dsht-modal-css", "");
			style.textContent = talkModalCss;
			document.head.appendChild(style);
			styleInjected = true;
		}
		/** 把页签内容区相对视口的偏移写入 CSS 变量，供上面的覆盖样式读取 */
		function syncBounds() {
			const root = document.querySelector(PAGE_ROOT_SELECTOR);
			if (!root) return;
			const rect = root.getBoundingClientRect();
			const right = Math.max(0, window.innerWidth - rect.right);
			const bottom = Math.max(0, window.innerHeight - rect.bottom);
			const style = document.documentElement.style;
			style.setProperty("--dsht-modal-left", `${Math.round(rect.left)}px`);
			style.setProperty("--dsht-modal-top", `${Math.round(rect.top)}px`);
			style.setProperty("--dsht-modal-right", `${Math.round(right)}px`);
			style.setProperty("--dsht-modal-bottom", `${Math.round(bottom)}px`);
		}
		/** 替代 primitives Modal：外观一致，仅在社区页签内容区内居中 */
		function TalkModal({ open, className, ...rest }) {
			(0, react.useLayoutEffect)(() => {
				if (!open) return;
				ensureStyle();
				syncBounds();
				const root = document.querySelector(PAGE_ROOT_SELECTOR);
				const observer = root ? new ResizeObserver(syncBounds) : null;
				if (root && observer) observer.observe(root);
				window.addEventListener("resize", syncBounds);
				window.addEventListener("scroll", syncBounds, true);
				return () => {
					observer?.disconnect();
					window.removeEventListener("resize", syncBounds);
					window.removeEventListener("scroll", syncBounds, true);
				};
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				className: className ? `${className} ${DIALOG_MARKER}` : DIALOG_MARKER,
				...rest
			});
		}
		//#endregion
		//#region packages/client/src/components/ConfirmDialog.tsx
		/** 危险操作的确认按钮：沿用主按钮形态，改用错误色 */
		const dangerButton = {
			background: palette.danger,
			color: palette.onColor
		};
		function ConfirmDialog() {
			const { confirm } = useTalkState();
			if (!confirm) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open: true,
				onClose: () => settleConfirm(false),
				title: confirm.title,
				closeLabel: "关闭",
				description: confirm.message,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: () => settleConfirm(false),
					children: confirm.cancelLabel
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					style: confirm.danger ? dangerButton : void 0,
					onClick: () => settleConfirm(true),
					children: confirm.confirmLabel
				})] })
			});
		}
		//#endregion
		//#region packages/client/src/components/homeStyles.ts
		const rail = {
			width: 72,
			flex: "0 0 auto",
			background: palette.rail,
			borderRight: `1px solid ${palette.border}`,
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			minHeight: 0,
			paddingTop: 8
		};
		const railScroll = {
			overflowY: "auto",
			flex: 1,
			width: "100%",
			padding: "6px 0"
		};
		const railAction = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: 40,
			height: 40,
			borderRadius: 12,
			border: "none",
			background: "transparent",
			color: palette.muted,
			cursor: "pointer",
			flex: "0 0 auto"
		};
		const railItem = {
			width: "100%",
			height: 56,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			border: "none",
			background: "transparent",
			cursor: "pointer",
			position: "relative",
			color: palette.text
		};
		const railAvatar = {
			position: "relative",
			display: "inline-flex"
		};
		const railPill = {
			position: "absolute",
			left: 0,
			top: "50%",
			transform: "translateY(-50%)",
			width: 4,
			height: 18,
			borderRadius: "0 4px 4px 0",
			background: palette.text
		};
		const railBubble = {
			position: "absolute",
			top: -2,
			right: -2,
			minWidth: 18,
			height: 18,
			padding: "0 3px",
			borderRadius: 999,
			background: palette.badge,
			color: palette.onColor,
			fontSize: 14,
			fontWeight: 700,
			lineHeight: "18px",
			textAlign: "center"
		};
		const railDivider = {
			width: 32,
			height: 1,
			margin: "6px 0",
			background: palette.border
		};
		const midCol = {
			width: 300,
			flex: "0 0 auto",
			background: palette.page,
			borderRight: `1px solid ${palette.border}`,
			display: "flex",
			flexDirection: "column",
			minHeight: 0
		};
		const chatCol = {
			flex: 1,
			display: "flex",
			flexDirection: "column",
			minWidth: 0,
			minHeight: 0
		};
		/** 聊天区右侧成员面板：固定宽度、位于文档流内（挤占聊天区，不浮在上面） */
		const memberPanel = {
			width: 256,
			flex: "0 0 auto",
			display: "flex",
			flexDirection: "column",
			minHeight: 0,
			background: palette.page,
			borderLeft: `1px solid ${palette.border}`
		};
		/** 成员面板的入场动画与成员行 hover（收起时整块从文档流移除） */
		const memberPanelCss = `
  .dsht-member-panel { animation: dsht-member-slide 160ms ease-out; }
  @keyframes dsht-member-slide {
    from { transform: translateX(16px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .dsht-member-row:hover { background: ${palette.hover}; }
`;
		const messagesWrap = {
			flex: 1,
			overflowY: "auto",
			padding: "12px 16px",
			display: "flex",
			flexDirection: "column"
		};
		/** 消息内容包裹层：供 ResizeObserver 观测内容高度变化（贴底跟随） */
		const messagesContent = {
			display: "flex",
			flexDirection: "column",
			width: "100%",
			minHeight: 0
		};
		const msgRow = {
			display: "flex",
			gap: 10,
			padding: "5px 12px",
			borderRadius: 8,
			position: "relative"
		};
		/** hover 时浮在消息右上角的操作条（Discord 风格，平时不占位） */
		const msgChip = {
			position: "absolute",
			top: 4,
			right: 8,
			display: "inline-flex",
			alignItems: "center",
			gap: 2,
			padding: 2,
			borderRadius: 8,
			background: palette.elevated,
			border: `1px solid ${palette.border}`,
			boxShadow: shadow.chip
		};
		/**
		* 消息行的 hover 表现走 CSS（避免在无交互语义的 div 上绑鼠标事件）：
		* 平时整行无底色，hover 淡显；操作条默认隐藏，hover / 键盘聚焦到行内时显示。
		*/
		const messageRowCss = `
  .dsht-msg-row:hover { background: ${palette.hover}; }
  .dsht-msg-row.is-mentioned { background: ${palette.mentionBg}; }
  .dsht-msg-row.is-focus { animation: dsht-focus-fade 1.8s ease-out forwards; }
  @keyframes dsht-focus-fade {
    from { background-color: ${palette.mentionBg}; }
    to { background-color: transparent; }
  }
  .dsht-msg-row .dsht-msg-actions { opacity: 0; pointer-events: none; }
  .dsht-msg-row:hover .dsht-msg-actions,
  .dsht-msg-row:focus-within .dsht-msg-actions,
  .dsht-msg-actions.is-open { opacity: 1; pointer-events: auto; }
  .dsht-quick-react:hover { background: ${palette.hover}; }
  .dsht-quote-btn { cursor: pointer; }
`;
		const creatorRow = {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			gap: 8,
			padding: "6px 0"
		};
		const emptyMsg = {
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			gap: 6,
			padding: "38px 16px",
			color: palette.muted,
			textAlign: "center"
		};
		const composerWrap = {
			borderTop: `1px solid ${palette.border}`,
			background: palette.page,
			padding: "10px 14px",
			display: "flex",
			flexDirection: "column"
		};
		/** 输入整体外框：输入框在上，操作条（分享 / 表情 / 附件 + 发送）在下 */
		const composerBox = {
			minWidth: 0,
			display: "flex",
			flexDirection: "column",
			gap: 2,
			padding: "6px 6px 6px 8px",
			borderRadius: 16,
			border: `1px solid ${palette.border}`,
			background: palette.inputBg
		};
		/** 输入框底部操作条：左侧三个操作按钮，右侧发送 */
		const composerToolbar = {
			display: "flex",
			alignItems: "center",
			gap: 2
		};
		const composerToolbarGap = {
			flex: 1,
			minWidth: 0
		};
		/** 已并入 composerBox 外框，故自身不再描边、不再铺底色 */
		const textArea = {
			width: "100%",
			minHeight: 34,
			maxHeight: 160,
			resize: "none",
			border: "none",
			background: "transparent",
			color: palette.text,
			padding: "6px 4px 6px 2px",
			font: "inherit",
			fontSize: 14,
			outline: "none"
		};
		const textAreaEdit = {
			width: "100%",
			minHeight: 54,
			resize: "vertical",
			borderRadius: 8,
			border: `1px solid ${palette.border}`,
			background: palette.inputBg,
			color: palette.text,
			padding: "6px 8px",
			font: "inherit",
			fontSize: 14
		};
		const pendingChip = {
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			padding: "3px 4px 3px 9px",
			borderRadius: 8,
			border: `1px solid ${palette.border}`,
			background: palette.inputBg,
			fontSize: 14,
			color: palette.text,
			maxWidth: 260
		};
		const emptyCard = {
			width: 380,
			maxWidth: "calc(100vw - 56px)",
			background: palette.panel,
			border: `1px solid ${palette.border}`,
			borderRadius: 16,
			padding: "34px 30px",
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			gap: 12,
			color: palette.text,
			textAlign: "center"
		};
		const sectionTitle = {
			fontSize: 14,
			fontWeight: 650,
			color: palette.muted,
			letterSpacing: "0.06em",
			textTransform: "uppercase",
			padding: "4px 8px 2px"
		};
		/** 私密讨论组角标（图标库无锁图标，用 emoji + 文字标注） */
		const privacyBadge = {
			flex: "0 0 auto",
			fontSize: 14,
			fontWeight: 600,
			color: palette.muted,
			border: `1px solid ${palette.border}`,
			borderRadius: 999,
			padding: "0 6px",
			lineHeight: "18px",
			whiteSpace: "nowrap"
		};
		const activeTile = {
			background: palette.elevated,
			boxShadow: shadow.soft,
			border: `1px solid ${palette.border}`
		};
		const liveDot = {
			width: 8,
			height: 8,
			borderRadius: "50%",
			flex: "0 0 auto"
		};
		const PRIVACY_LABELS = {
			public: "公开",
			private: "私密"
		};
		/** 回复目标 / 引用块的正文摘要上限 */
		const QUOTE_SNIPPET_MAX = 72;
		/** 被引用消息的展示辅助：拆出作者名与正文摘要 */
		function replyParts(item) {
			const target = item.replyTo;
			if (!target) return {
				author: "",
				content: ""
			};
			const author = target.author.displayName ?? target.author.handle;
			const raw = target.content.replace(/\s+/g, " ").trim();
			return {
				author,
				content: raw.length === 0 ? (target.attachments?.length ?? 0) > 0 ? "[附件]" : "" : raw.length > QUOTE_SNIPPET_MAX ? `${raw.slice(0, QUOTE_SNIPPET_MAX)}…` : raw
			};
		}
		/** 附件大小人类可读化 */
		function formatBytes(n) {
			if (n < 1024) return `${n} B`;
			const units = [
				"KB",
				"MB",
				"GB"
			];
			let v = n / 1024;
			let i = 0;
			while (v >= 1024 && i < units.length - 1) {
				v /= 1024;
				i += 1;
			}
			return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
		}
		//#endregion
		//#region packages/client/src/components/Manage.tsx
		/** 角色编辑器的权限位（全部位；中文名/说明/作用域来自 types 的 PERMISSION_INFO） */
		const PERMISSION_FIELDS = PERMISSION_INFO;
		/** 频道覆盖只接受频道级位（社区级位与 ADMINISTRATOR 由 scope 排除） */
		const OVERWRITE_FIELDS = CHANNEL_OVERWRITE_PERMISSIONS;
		/** 角色展示色（color 为 0xRRGGBB；null = 默认灰） */
		const roleColorOf = (role) => role.color === null || role.color === 0 ? palette.muted : `#${role.color.toString(16).padStart(6, "0")}`;
		/** 角色可选展示色（0xRRGGBB；null = 默认灰） */
		const ROLE_COLOR_CHOICES = [
			{
				value: null,
				label: "默认"
			},
			{
				value: 5793266,
				label: "蓝"
			},
			{
				value: 5763719,
				label: "绿"
			},
			{
				value: 16705372,
				label: "黄"
			},
			{
				value: 15105570,
				label: "橙"
			},
			{
				value: 15548997,
				label: "红"
			},
			{
				value: 15418782,
				label: "粉"
			},
			{
				value: 10181046,
				label: "紫"
			}
		];
		/** 把权限位渲染成简短文本 */
		const permissionSummary = (bits) => {
			const names = PERMISSION_FIELDS.filter((f) => (bits & f.bit) !== 0).map((f) => f.label);
			return names.length > 0 ? names.join(" · ") : "无权限";
		};
		/** 弹窗说明文字 */
		const dialogHint = {
			fontSize: 14,
			color: palette.muted,
			lineHeight: 1.6
		};
		/** hover 说明卡的容器（标记属性供 TalkModal 提升层级，避免被弹窗遮罩盖住） */
		const tipWrap$1 = {
			display: "flex",
			flexDirection: "column",
			gap: 4,
			minWidth: 176,
			maxWidth: 260
		};
		const tipTitle$1 = {
			fontSize: 16,
			fontWeight: 600,
			color: palette.text
		};
		const tipHint$1 = {
			fontSize: 14,
			lineHeight: 1.5,
			color: palette.muted
		};
		/** 成员操作按钮的 hover 说明卡：标题 + 行为说明 */
		function ActionTip({ title, hint }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-dsht-hover-tip": true,
				style: tipWrap$1,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: tipTitle$1,
					children: title
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: tipHint$1,
					children: hint
				})]
			});
		}
		/** 频道列表顶部的社区管理菜单（角色 / 新建频道 / 邀请 / 设置 / 退出；成员操作在聊天区右侧成员面板） */
		function CommunityTools() {
			const talk = useTalkState();
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const [dialog, setDialog] = (0, react.useState)(null);
			const [leaving, setLeaving] = (0, react.useState)(false);
			const communityId = talk.view.communityId;
			const canRoles = canManageRoles();
			const canChannel = isModerator();
			const canInvite = canInviteMembers();
			const canCommunity = canManageCommunity();
			const member = isMember();
			if (!communityId) return null;
			const menuItems = [];
			if (canRoles) menuItems.push({
				id: "roles",
				label: "角色管理",
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutline16, {})
			});
			if (canChannel) menuItems.push({
				id: "create-channel",
				label: "新建频道",
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {})
			});
			if (canInvite) menuItems.push({
				id: "invite-user",
				label: "邀请用户",
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {})
			});
			if (member) menuItems.push({
				id: "invite",
				label: "邀请码",
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {})
			});
			if (canCommunity) menuItems.push({
				id: "settings",
				label: "社区设置",
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
			});
			if (menuItems.length > 0) menuItems.push({
				type: "separator",
				id: "sep"
			});
			menuItems.push({
				id: "leave",
				label: "退出社区",
				danger: true,
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline16, {})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open: menuOpen,
					onClose: () => setMenuOpen(false),
					onSelect: (id) => {
						setMenuOpen(false);
						if (id === "roles" || id === "create-channel" || id === "invite-user" || id === "invite" || id === "settings") setDialog(id);
						if (id === "leave") (async () => {
							if (!await askConfirm({
								title: "退出社区",
								message: "退出后你将不再是该社区成员，需要重新加入才能查看社区内容（社区所有者需先转让所有权）。",
								confirmLabel: "退出社区",
								danger: true
							})) return;
							setLeaving(true);
							await leaveCommunity(communityId);
							setLeaving(false);
						})();
					},
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "ghost",
						icon: leaving ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutline16, {}),
						disabled: leaving,
						onClick: () => setMenuOpen((v) => !v),
						"aria-label": leaving ? "正在退出社区" : "社区管理"
					}),
					items: menuItems,
					portal: true
				}),
				dialog === "roles" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RolesDialog, {
					open: true,
					onClose: () => setDialog(null)
				}) : null,
				dialog === "create-channel" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelDialog, {
					open: true,
					onClose: () => setDialog(null)
				}) : null,
				dialog === "invite-user" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InviteUserDialog, {
					open: true,
					onClose: () => setDialog(null)
				}) : null,
				dialog === "invite" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InviteDialog, {
					open: true,
					onClose: () => setDialog(null)
				}) : null,
				dialog === "settings" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsDialog, {
					open: true,
					onClose: () => setDialog(null)
				}) : null
			] });
		}
		/** 邀请码展示 / 复制（创建社区时生成、固定不变；码对所有成员可见） */
		function InviteDialog({ open, onClose }) {
			const code = useTalkState().view.community?.inviteCode ?? "";
			async function copy() {
				await (0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(code);
				notify("邀请码已复制");
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: "邀请码",
				closeLabel: "关闭",
				description: "把邀请码发给对方：对方在「＋ 加入」里输入即可进社区。",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: fieldBlock,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							htmlFor: "talk-invite-code",
							style: fieldLabel,
							children: "邀请码"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-invite-code",
								readOnly: true,
								value: code,
								"aria-label": "邀请码",
								style: { flex: 1 }
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {}),
								onClick: () => void copy(),
								children: "复制"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: dialogHint,
							children: "邀请码在创建社区时生成、固定不变，不会过期；"
						})
					]
				})
			});
		}
		/** 邀请已注册用户入社区（owner/admin）：输入 @用户名 或邮箱，对方会收到站内信 + 邮件 */
		function InviteUserDialog({ open, onClose }) {
			const [value, setValue] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (open) setValue("");
			}, [open]);
			async function submit() {
				if (busy || value.trim().length === 0) return;
				setBusy(true);
				const ok = await inviteMember(value);
				setBusy(false);
				if (ok) onClose();
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: "邀请用户加入",
				closeLabel: "关闭",
				description: "输入对方的 @用户名 或注册邮箱，对方会收到站内信和邮件邀请。",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || value.trim().length === 0,
					onClick: () => void submit(),
					children: busy ? "邀请中…" : "发送邀请"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: fieldBlock,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							htmlFor: "talk-invite-user",
							style: fieldLabel,
							children: "@用户名 或邮箱"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							id: "talk-invite-user",
							value,
							onChange: (e) => setValue(e.target.value),
							placeholder: "如 @alice 或 alice@example.com"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: dialogHint,
							children: "仅可邀请已注册的用户；对方接受后即可加入社区。"
						})
					]
				})
			});
		}
		/** 社区设置（owner/admin） */
		function SettingsDialog({ open, onClose }) {
			const community = useTalkState().view.community;
			const owner = isOwner();
			const [name, setName] = (0, react.useState)(community?.name ?? "");
			const [description, setDescription] = (0, react.useState)(community?.description ?? "");
			const [privacy, setPrivacy] = (0, react.useState)(community?.privacy ?? "public");
			const [iconUrl, setIconUrl] = (0, react.useState)(community?.iconUrl ?? null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [iconBusy, setIconBusy] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!open) return;
				setName(community?.name ?? "");
				setDescription(community?.description ?? "");
				setPrivacy(community?.privacy ?? "public");
				setIconUrl(community?.iconUrl ?? null);
			}, [
				open,
				community?.name,
				community?.description,
				community?.privacy,
				community?.iconUrl
			]);
			async function pickIcon(file) {
				setIconBusy(true);
				const url = await uploadImage(file);
				setIconBusy(false);
				if (url) setIconUrl(url);
			}
			async function save() {
				if (name.trim().length === 0) return;
				setBusy(true);
				const ok = await updateCommunity({
					name: name.trim(),
					description: description.length > 0 ? description : null,
					privacy,
					iconUrl
				});
				setBusy(false);
				if (ok) onClose();
			}
			/** 删除社区（仅 owner 可见按钮）；删除后整个社区及其内容不复存在 */
			async function removeCommunity() {
				if (!community) return;
				if (!await askConfirm({
					title: `删除社区「${community.name}」`,
					message: "社区下所有频道与消息将被永久删除，且无法恢复。",
					confirmLabel: "永久删除",
					danger: true
				})) return;
				setBusy(true);
				const ok = await deleteCommunity(community.id);
				setBusy(false);
				if (ok) onClose();
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: "社区设置",
				closeLabel: "关闭",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || name.trim().length === 0,
					onClick: () => void save(),
					children: busy ? "保存中…" : "保存"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 12
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: fieldLabel,
								children: "社区头像"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AvatarPicker, {
								src: iconUrl,
								label: name.trim() || "社区",
								size: 60,
								onPick: (file) => void pickIcon(file),
								onRemove: () => setIconUrl(null),
								uploadLabel: "设置头像",
								removeLabel: "移除头像",
								busy: busy || iconBusy,
								kind: "community"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "talk-community-name",
								style: fieldLabel,
								children: "社区名称"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-community-name",
								value: name,
								onChange: (e) => setName(e.target.value),
								placeholder: "社区名称"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "talk-community-desc",
								style: fieldLabel,
								children: "简介"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-community-desc",
								value: description,
								onChange: (e) => setDescription(e.target.value),
								placeholder: "一句话介绍这个社区"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: fieldLabel,
								children: "可见性"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: pillGroup,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: pillStyle(privacy === "public"),
									onClick: () => setPrivacy("public"),
									children: "公开"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: pillStyle(privacy === "private"),
									onClick: () => setPrivacy("private"),
									children: "私有"
								})]
							})]
						}),
						owner ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								borderTop: `1px solid ${palette.border}`,
								paddingTop: 12,
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: dialogHint,
								children: [
									"危险操作：删除社区「",
									community?.name,
									"」后，其全部频道与消息将被永久清除。"
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "ghost",
								icon: busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),
								disabled: busy,
								onClick: () => void removeCommunity(),
								style: {
									color: palette.danger,
									border: `1px solid ${palette.dangerSoft}`,
									alignSelf: "flex-start"
								},
								children: "删除社区"
							})]
						}) : null
					]
				})
			});
		}
		/** 给成员分配角色（多选；@everyone 隐式作用于全体，不出现在这里）。由右侧成员面板承载。 */
		function MemberRolesDialog({ member, roles, onClose, onSaved }) {
			const [selected, setSelected] = (0, react.useState)(member.roleIds);
			const [busy, setBusy] = (0, react.useState)(false);
			const assignable = roles.filter((r) => !r.isEveryone && canManageRolePosition(r.position)).sort((a, b) => b.position - a.position);
			function toggle(roleId) {
				setSelected((prev) => prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]);
			}
			async function save() {
				setBusy(true);
				const ok = await setMemberRoles(member.userId, selected);
				setBusy(false);
				if (ok) onSaved(selected);
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(TalkModal, {
				open: true,
				onClose,
				title: `@${member.handle} 的角色`,
				closeLabel: "关闭",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy,
					onClick: () => void save(),
					children: busy ? "保存中…" : "保存"
				})] }),
				children: [assignable.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						...smallText,
						padding: "8px 2px"
					},
					children: "还没有自定义角色，请先在「角色管理」里创建。"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 6
					},
					children: assignable.map((r) => {
						const on = selected.includes(r.id);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => toggle(r.id),
							style: {
								...listCard,
								cursor: "pointer",
								textAlign: "left",
								border: `1px solid ${on ? palette.accent : palette.border}`,
								background: on ? palette.hoverAccent : palette.inputBg
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
									width: 10,
									height: 10,
									flexShrink: 0,
									borderRadius: "50%",
									background: roleColorOf(r)
								} }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: listCardName,
										children: r.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											...smallText,
											fontSize: 14
										},
										children: permissionSummary(r.permissions)
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										...smallText,
										fontSize: 14
									},
									children: on ? "已分配" : "未分配"
								})
							]
						}, r.id);
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						...dialogHint,
						display: "block",
						marginTop: 8
					},
					children: "@everyone 角色自动作用于全体成员，无需单独分配。"
				})]
			});
		}
		function ChannelDialog({ open, onClose, channel }) {
			const isEdit = channel !== void 0;
			const [name, setName] = (0, react.useState)(channel?.name ?? "");
			const [topic, setTopic] = (0, react.useState)(channel?.topic ?? "");
			const [kind, setKind] = (0, react.useState)(channel?.kind ?? "text");
			const [busy, setBusy] = (0, react.useState)(false);
			async function save() {
				if (name.trim().length === 0) return;
				setBusy(true);
				let ok = false;
				if (isEdit) ok = await updateChannelById(channel.id, {
					name: name.trim(),
					topic: topic.length > 0 ? topic : null,
					kind
				});
				else {
					const body = {
						name: name.trim(),
						kind
					};
					if (topic.length > 0) body.topic = topic;
					ok = await createChannel(body);
				}
				setBusy(false);
				if (ok) onClose();
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: isEdit ? "编辑频道" : "新建频道",
				closeLabel: "关闭",
				description: isEdit ? "可改名、改主题与类型。删除频道请用频道旁的「…」。" : "频道用于承载某一主题的实时消息。",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || name.trim().length === 0,
					onClick: () => void save(),
					children: busy ? isEdit ? "保存中…" : "创建中…" : isEdit ? "保存" : "创建"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 12
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "talk-channel-name",
								style: fieldLabel,
								children: "频道名"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-channel-name",
								value: name,
								onChange: (e) => setName(e.target.value),
								placeholder: "频道名，如 general / 公告 / 话题"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "talk-channel-topic",
								style: fieldLabel,
								children: "主题（可选）"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-channel-topic",
								value: topic,
								onChange: (e) => setTopic(e.target.value),
								placeholder: "主题（显示在消息区顶部，可选）"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: fieldLabel,
									children: "类型"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: pillGroup,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: pillStyle(kind === "text"),
											onClick: () => setKind("text"),
											children: "文字"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: pillStyle(kind === "announcement"),
											onClick: () => setKind("announcement"),
											children: "公告"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: pillStyle(kind === "forum"),
											onClick: () => setKind("forum"),
											children: "话题"
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: dialogHint,
									children: kind === "text" ? "全员自由发言。" : kind === "announcement" ? "默认用 everyone 覆盖禁言（禁发送消息与开讨论组），可在「权限覆盖」里给特定角色放行。" : "频道里只列话题，点进话题才聊天（24h 无人回复自动归档）。"
								})
							]
						})
					]
				})
			});
		}
		/** 频道上移 / 下移图标（复用左箭头旋转，避免额外图标依赖） */
		const moveUpIcon = {
			display: "inline-flex",
			transform: "rotate(90deg)"
		};
		const moveDownIcon = {
			display: "inline-flex",
			transform: "rotate(-90deg)"
		};
		/**
		* 每行的频道呼出菜单：创建讨论组（该频道 CREATE_THREAD 位）+
		* 排序 / 改名 / 删除（该频道 MANAGE_CHANNEL 位）/ 权限覆盖（社区级 MANAGE_CHANNEL）。
		* 无可用项时不渲染。
		*/
		function ChannelRowMenu({ channel, onCreateThread }) {
			const talk = useTalkState();
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const [editing, setEditing] = (0, react.useState)(false);
			const [overwriting, setOverwriting] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const canOverwrite = isModerator();
			const canManageChannel = (channelPermissions(channel.id) & Permission.MANAGE_CHANNEL) !== 0;
			const channels = talk.view.community?.channels ?? [];
			const index = channels.findIndex((c) => c.id === channel.id);
			const canMoveUp = canManageChannel && index > 0;
			const canMoveDown = canManageChannel && index >= 0 && index < channels.length - 1;
			const canCreateThread = (channelPermissions(channel.id) & Permission.CREATE_THREAD) !== 0;
			const isForum = channel.kind === "forum";
			async function remove() {
				if (!await askConfirm({
					title: `删除频道 #${channel.name}`,
					message: "频道内的消息会一并永久删除，且无法恢复。",
					confirmLabel: "删除频道",
					danger: true
				})) return;
				setBusy(true);
				const ok = await deleteChannelById(channel.id);
				setBusy(false);
				if (ok) setMenuOpen(false);
			}
			/** 频道上移 / 下移：服务端按整表重排 */
			async function move(dir) {
				if (busy) return;
				setBusy(true);
				await moveChannel(channel.id, dir);
				setBusy(false);
			}
			const items = [
				...canCreateThread ? [{
					id: "create-thread",
					label: isForum ? "新建话题" : "创建讨论组",
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {})
				}] : [],
				...canMoveUp ? [{
					id: "up",
					label: "上移",
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: moveUpIcon,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {})
					})
				}] : [],
				...canMoveDown ? [{
					id: "down",
					label: "下移",
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: moveDownIcon,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {})
					})
				}] : [],
				...canOverwrite ? [{
					id: "overwrites",
					label: "权限覆盖",
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutline16, {})
				}] : [],
				...canManageChannel ? [{
					id: "edit",
					label: "编辑频道",
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
				}, {
					id: "delete",
					label: "删除频道",
					danger: true,
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
				}] : []
			];
			if (items.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open: menuOpen,
					onClose: () => setMenuOpen(false),
					onSelect: (id) => {
						setMenuOpen(false);
						if (id === "create-thread") onCreateThread(channel.id);
						if (id === "overwrites") setOverwriting(true);
						if (id === "edit") setEditing(true);
						if (id === "delete") remove();
						if (id === "up") move("up");
						if (id === "down") move("down");
					},
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "ghost",
						icon: busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutline16, {}),
						disabled: busy,
						onClick: (e) => {
							e.stopPropagation();
							setMenuOpen((v) => !v);
						},
						"aria-label": busy ? `正在处理 #${channel.name}` : `管理 #${channel.name}`
					}),
					items,
					portal: true
				}),
				editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelDialog, {
					open: true,
					channel,
					onClose: () => setEditing(false)
				}) : null,
				overwriting ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelOverwriteDialog, {
					open: true,
					channel,
					onClose: () => setOverwriting(false)
				}) : null
			] });
		}
		/** 角色管理（MANAGE_ROLES；只能操作层级低于自己的角色）：列表 + 新建/编辑/删除 + 层级调整 */
		function RolesDialog({ open, onClose }) {
			const roles = useTalkState().view.community?.roles ?? [];
			const [editing, setEditing] = (0, react.useState)(null);
			const [busyRoleId, setBusyRoleId] = (0, react.useState)(null);
			const custom = roles.filter((r) => !r.isEveryone).sort((a, b) => b.position - a.position);
			const everyone = roles.find((r) => r.isEveryone) ?? null;
			async function remove(role) {
				if (!await askConfirm({
					title: `删除角色「${role.name}」`,
					message: "持有该角色的成员将立即失去其权限，且无法恢复。",
					confirmLabel: "删除角色",
					danger: true
				})) return;
				setBusyRoleId(role.id);
				await deleteRole(role.id);
				setBusyRoleId(null);
			}
			/** 与相邻自定义角色交换层级（服务端按整表重排，含层级校验） */
			async function move(role, dir) {
				if (busyRoleId !== null) return;
				const index = custom.findIndex((r) => r.id === role.id);
				const other = custom[dir === "up" ? index - 1 : index + 1];
				if (index < 0 || other === void 0) return;
				const next = [...custom];
				next[index] = other;
				next[dir === "up" ? index - 1 : index + 1] = role;
				setBusyRoleId(role.id);
				await reorderRoles(next.map((r) => r.id));
				setBusyRoleId(null);
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(TalkModal, {
				open,
				onClose,
				title: "角色管理",
				closeLabel: "关闭",
				description: "角色自带一组基础权限；在频道里可用「权限覆盖」针对单个角色放行或拒绝。",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "关闭"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}),
					disabled: !isOwner() && myHighestRolePosition() === 0,
					title: !isOwner() && myHighestRolePosition() === 0 ? "需要先拥有一个角色" : void 0,
					onClick: () => setEditing("new"),
					children: "新建角色"
				})] }),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: custom.map((role, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: listCard,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
									width: 10,
									height: 10,
									flexShrink: 0,
									borderRadius: "50%",
									background: roleColorOf(role)
								} }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: listCardName,
										children: role.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											...smallText,
											fontSize: 14
										},
										children: permissionSummary(role.permissions)
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
									openDelayMs: 300,
									content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionTip, {
										title: "上移层级",
										hint: "把该角色的层级提高一位。层级越高，在权限覆盖与成员身份判定中越优先。"
									}),
									anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										disabled: busyRoleId !== null || i === 0 || !canManageRolePosition(role.position),
										onClick: () => void move(role, "up"),
										"aria-label": `${role.name} 上移`,
										children: "上移"
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
									openDelayMs: 300,
									content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionTip, {
										title: "下移层级",
										hint: "把该角色的层级降低一位。层级越低，越容易被更高层级的角色覆盖。"
									}),
									anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										disabled: busyRoleId !== null || i === custom.length - 1 || !canManageRolePosition(role.position),
										onClick: () => void move(role, "down"),
										"aria-label": `${role.name} 下移`,
										children: "下移"
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "ghost",
									disabled: busyRoleId !== null || !canManageRolePosition(role.position),
									onClick: () => setEditing(role),
									children: "编辑"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
									openDelayMs: 300,
									content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionTip, {
										title: "删除角色",
										hint: `删除「${role.name}」，持有该角色的成员会立即失去它带来的权限，且无法恢复。`
									}),
									anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										disabled: busyRoleId !== null || !canManageRolePosition(role.position),
										icon: busyRoleId === role.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),
										onClick: () => void remove(role),
										"aria-label": `删除角色 ${role.name}`
									})
								})
							]
						}, role.id))
					}),
					everyone ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { marginTop: 10 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: listCard,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
									width: 10,
									height: 10,
									flexShrink: 0,
									borderRadius: "50%",
									background: roleColorOf(everyone)
								} }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: listCardName,
										children: "@everyone"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											...smallText,
											fontSize: 14
										},
										children: permissionSummary(everyone.permissions)
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "ghost",
									disabled: !canManageRolePosition(everyone.position),
									onClick: () => setEditing(everyone),
									children: "编辑"
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								...dialogHint,
								display: "block",
								marginTop: 6
							},
							children: "@everyone 是全体成员的隐式角色，不能改名或删除，层级恒在最下。"
						})]
					}) : null,
					editing !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoleEditorDialog, {
						role: editing === "new" ? null : editing,
						onClose: () => setEditing(null)
					}) : null
				]
			});
		}
		/** 新建 / 编辑角色（@everyone 只能改权限与颜色） */
		function RoleEditorDialog({ role, onClose }) {
			const isEdit = role !== null;
			const everyone = role?.isEveryone ?? false;
			const [name, setName] = (0, react.useState)(role?.name ?? "");
			const [color, setColor] = (0, react.useState)(role?.color ?? null);
			const [permissions, setPermissions] = (0, react.useState)(role?.permissions ?? 0);
			const [busy, setBusy] = (0, react.useState)(false);
			function toggle(bit) {
				setPermissions((prev) => (prev & bit) !== 0 ? prev & ~bit : prev | bit);
			}
			async function save() {
				if (!everyone && name.trim().length === 0) return;
				setBusy(true);
				let ok;
				if (role !== null) {
					const patch = {
						color,
						permissions
					};
					if (!role.isEveryone) patch.name = name.trim();
					ok = await updateRole(role.id, patch);
				} else ok = await createRole({
					name: name.trim(),
					color,
					permissions
				});
				setBusy(false);
				if (ok) onClose();
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open: true,
				onClose,
				title: isEdit ? "编辑角色" : "新建角色",
				closeLabel: "关闭",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || !everyone && name.trim().length === 0,
					onClick: () => void save(),
					children: busy ? isEdit ? "保存中…" : "创建中…" : isEdit ? "保存" : "创建"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 12
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "talk-role-name",
								style: fieldLabel,
								children: "角色名"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-role-name",
								value: everyone ? "@everyone" : name,
								disabled: everyone,
								onChange: (e) => setName(e.target.value),
								placeholder: "如 版主 / 新人"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: fieldLabel,
								children: "颜色"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									gap: 6,
									flexWrap: "wrap"
								},
								children: ROLE_COLOR_CHOICES.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									title: choice.label,
									"aria-label": `颜色 ${choice.label}`,
									onClick: () => setColor(choice.value),
									style: {
										width: 24,
										height: 24,
										padding: 0,
										cursor: "pointer",
										borderRadius: "50%",
										background: choice.value === null ? palette.inputBg : `#${choice.value.toString(16).padStart(6, "0")}`,
										border: color === choice.value ? `2px solid ${palette.accent}` : `1px solid ${palette.border}`
									}
								}, choice.label))
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: fieldLabel,
									children: "权限"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										display: "flex",
										flexDirection: "column",
										gap: 6
									},
									children: PERMISSION_FIELDS.map((field) => {
										const on = (permissions & field.bit) !== 0;
										const grantable = isOwner() || (field.bit & myPermissions()) === field.bit;
										const blocked = !on && !grantable;
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											disabled: blocked,
											onClick: () => toggle(field.bit),
											style: {
												...listCard,
												cursor: blocked ? "not-allowed" : "pointer",
												opacity: blocked ? .55 : 1,
												textAlign: "left",
												border: `1px solid ${on ? palette.accent : palette.border}`,
												background: on ? palette.hoverAccent : palette.inputBg
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													flex: 1,
													minWidth: 0
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													style: listCardName,
													children: field.label
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													style: {
														...smallText,
														fontSize: 14
													},
													children: field.hint
												})]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: {
													...smallText,
													fontSize: 14
												},
												children: blocked ? "无权授予" : on ? "允许" : "未授予"
											})]
										}, field.label);
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: dialogHint,
									children: "除角色自带权限外，还可对具体频道单独放行/拒绝（「权限覆盖」）。"
								})
							]
						})
					]
				})
			});
		}
		const OVERWRITE_CHOICES = [
			{
				value: "inherit",
				label: "继承"
			},
			{
				value: "allow",
				label: "允许"
			},
			{
				value: "deny",
				label: "拒绝"
			}
		];
		function choiceOf(allow, deny, bit) {
			if ((allow & bit) !== 0) return "allow";
			if ((deny & bit) !== 0) return "deny";
			return "inherit";
		}
		/**
		* 频道权限覆盖（MANAGE_CHANNEL）：对 @everyone / 角色 / 成员 逐位设置
		* 继承（不写入）/ 允许 / 拒绝。解析优先级由服务端权限解析器决定。
		*/
		function ChannelOverwriteDialog({ open, channel, onClose }) {
			const roles = useTalkState().view.community?.roles ?? [];
			const [overwrites, setOverwrites] = (0, react.useState)([]);
			const [members, setMembers] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(true);
			const [selectedKey, setSelectedKey] = (0, react.useState)(`everyone:${EVERYONE_TARGET_ID}`);
			const [allow, setAllow] = (0, react.useState)(0);
			const [deny, setDeny] = (0, react.useState)(0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [action, setAction] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!open) return;
				let cancelled = false;
				setLoading(true);
				Promise.all([listChannelOverwrites(channel.id), listMembers()]).then(([os, ms]) => {
					if (cancelled) return;
					setOverwrites(os);
					setMembers(ms.map((m) => m.user));
					setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [open, channel.id]);
			const targets = [
				{
					type: "everyone",
					id: EVERYONE_TARGET_ID,
					label: "@everyone"
				},
				...roles.filter((r) => !r.isEveryone).sort((a, b) => b.position - a.position).map((r) => ({
					type: "role",
					id: r.id,
					label: r.name
				})),
				...members.map((u) => ({
					type: "member",
					id: u.id,
					label: `@${u.handle}`
				}))
			];
			const selected = targets.find((t) => `${t.type}:${t.id}` === selectedKey) ?? {
				type: "everyone",
				id: "@everyone",
				label: "@everyone"
			};
			const current = overwrites.find((o) => o.targetType === selected.type && o.targetId === selected.id);
			(0, react.useEffect)(() => {
				setAllow(current?.allow ?? 0);
				setDeny(current?.deny ?? 0);
			}, [current?.allow, current?.deny]);
			function setChoice(bit, choice) {
				setAllow((prev) => choice === "allow" ? prev | bit : prev & ~bit);
				setDeny((prev) => choice === "deny" ? prev | bit : prev & ~bit);
			}
			async function refresh() {
				setOverwrites(await listChannelOverwrites(channel.id));
			}
			async function save() {
				setBusy(true);
				setAction("save");
				const ok = await setChannelOverwrite(channel.id, selected.type, selected.id, {
					allow,
					deny
				});
				setBusy(false);
				setAction(null);
				if (ok) {
					notify("权限覆盖已保存");
					await refresh();
				}
			}
			async function clear() {
				if (!current) return;
				setBusy(true);
				setAction("clear");
				const ok = await deleteChannelOverwrite(channel.id, selected.type, selected.id);
				setBusy(false);
				setAction(null);
				if (ok) {
					notify("已清除该目标的覆盖");
					await refresh();
				}
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: `#${channel.name} · 权限覆盖`,
				closeLabel: "关闭",
				description: "在角色自带权限之上，对该频道逐个目标放行或拒绝；「继承」表示不写入该位。",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					disabled: busy || !current,
					onClick: () => void clear(),
					children: action === "clear" ? "清除中…" : "清除覆盖"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy,
					onClick: () => void save(),
					children: action === "save" ? "保存中…" : "保存"
				})] }),
				children: loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingHint, {
					text: "加载权限覆盖…",
					padding: "12px 4px"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 14
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: fieldBlock,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: fieldLabel,
								children: "目标"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexWrap: "wrap",
									gap: 4
								},
								children: targets.map((target) => {
									const key = `${target.type}:${target.id}`;
									const active = key === selectedKey;
									const hasOverwrite = overwrites.some((o) => o.targetType === target.type && o.targetId === target.id);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setSelectedKey(key),
										style: {
											...pillStyle(active),
											flex: "0 0 auto",
											padding: "5px 10px",
											fontSize: 14,
											border: hasOverwrite ? `1px solid ${palette.accent}` : `1px solid transparent`
										},
										children: target.label
									}, key);
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: dialogHint,
								children: "带蓝色边框的目标已存在覆盖；成员列表仅含当前社区成员。"
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: OVERWRITE_FIELDS.map((field) => {
							const choice = choiceOf(allow, deny, field.bit);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: listCard,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: listCardName,
										children: field.label
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											...smallText,
											fontSize: 14
										},
										children: field.hint
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										display: "flex",
										gap: 2,
										padding: 2,
										borderRadius: 8,
										background: palette.inputBg,
										border: `1px solid ${palette.border}`
									},
									children: OVERWRITE_CHOICES.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setChoice(field.bit, item.value),
										style: {
											...pillStyle(choice === item.value),
											flex: "0 0 auto",
											padding: "4px 10px",
											fontSize: 14
										},
										children: item.label
									}, item.value))
								})]
							}, field.label);
						})
					})]
				})
			});
		}
		//#endregion
		//#region packages/client/src/components/ThreadModals.tsx
		/** 创建讨论组 / 话题：按来源预填标题，可设为公开或私密（可带进入密码） */
		function ThreadCreateModal({ open, onClose, channelId, seed }) {
			const [name, setName] = (0, react.useState)("");
			const [visibility, setVisibility] = (0, react.useState)("public");
			const [passcode, setPasscode] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const talk = useTalkState();
			(0, react.useEffect)(() => {
				if (open) {
					setName(seed?.name ?? "");
					setVisibility("public");
					setPasscode("");
				}
			}, [open, seed]);
			async function submit() {
				const trimmed = name.trim();
				if (!channelId || trimmed.length === 0 || busy) return;
				setBusy(true);
				const input = {
					name: trimmed,
					visibility
				};
				if (seed?.starterMessageId) input.starterMessageId = seed.starterMessageId;
				if (visibility === "private") input.passcode = passcode.trim().length > 0 ? passcode.trim() : null;
				const ok = await createThreadInChannel(channelId, input);
				setBusy(false);
				if (ok) onClose();
			}
			const starterNote = seed?.starterMessageId ? "以这条消息为起点：讨论组会单独成串，原消息保留在主频道。" : null;
			const threadable = channelId ? talk.view.community?.channels.find((c) => c.id === channelId)?.kind ?? "text" : "text";
			const forumMode = threadable === "forum";
			if (!open || !channelId || threadable === "announcement") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: forumMode ? "创建话题" : "创建讨论组",
				closeLabel: "关闭",
				description: forumMode ? "发一条新话题，它会列在本频道的话题列表里；大家点进去围绕它交流，24 小时无人回复会自动归档。" : "为某个话题开一个独立、集中的小空间，发言后它列在频道下的「讨论」里。",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || name.trim().length === 0,
					onClick: () => void submit(),
					children: busy ? "创建中…" : forumMode ? "创建话题" : "创建讨论组"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 10
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "talk-thread-name",
								style: fieldLabel,
								children: forumMode ? "话题标题" : "讨论组名称"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-thread-name",
								value: name,
								onChange: (e) => setName(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										submit();
									}
								},
								placeholder: forumMode ? "例如：如何快速导出聊天记录？" : "例如：周末活动安排"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: fieldLabel,
									children: "可见性"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: pillGroup,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: pillStyle(visibility === "public"),
										onClick: () => setVisibility("public"),
										children: "公开"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: pillStyle(visibility === "private"),
										onClick: () => setVisibility("private"),
										children: "私密"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										...smallText,
										fontSize: 14,
										lineHeight: 1.6
									},
									children: visibility === "public" ? "社区成员自由进出。" : passcode.trim().length > 0 ? "非成员可见但需凭密码进入；社区所有者/管理员可直接查看。" : "仅邀请可加入：非成员看到锁标识，需由组内成员把你拉入。"
								})
							]
						}),
						visibility === "private" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: "talk-thread-passcode",
									style: fieldLabel,
									children: "进入密码（可选）"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									id: "talk-thread-passcode",
									value: passcode,
									onChange: (e) => setPasscode(e.target.value),
									placeholder: "留空表示仅邀请加入"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										...smallText,
										fontSize: 14
									},
									children: "留空 = 只能由组内成员拉入；填写后，社区成员可凭该密码自行进入。"
								})
							]
						}) : null,
						starterNote ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...smallText,
								fontSize: 14,
								lineHeight: 1.6
							},
							children: starterNote
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...smallText,
								fontSize: 14,
								lineHeight: 1.6
							},
							children: "24 小时内没人发言会自动归档（从频道列表收起，可在「已归档」里恢复）；再有人发言会自动回到活跃区。"
						})
					]
				})
			});
		}
		/** 锁态私密讨论组：有密码 → 输入进入；无密码 → 仅提示需被邀请 */
		function ThreadJoinModal({ open, onClose, thread }) {
			const [passcode, setPasscode] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (open) setPasscode("");
			}, [open]);
			async function submit() {
				if (busy || passcode.trim().length === 0) return;
				setBusy(true);
				const ok = await joinThreadWithPasscode(thread.id, passcode);
				setBusy(false);
				if (ok) onClose();
			}
			const needsPasscode = thread.hasPasscode;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: needsPasscode ? "输入密码进入" : "私密讨论组",
				closeLabel: "关闭",
				description: needsPasscode ? `「${thread.name}」是私密讨论组，请输入进入密码。` : `「${thread.name}」是仅邀请可加入的私密讨论组，请联系组内成员把你拉入。`,
				footer: needsPasscode ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || passcode.trim().length === 0,
					onClick: () => void submit(),
					children: busy ? "进入中…" : "进入"
				})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "知道了"
				}),
				children: needsPasscode ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: fieldBlock,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						htmlFor: "talk-thread-join-passcode",
						style: fieldLabel,
						children: "进入密码"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
						id: "talk-thread-join-passcode",
						type: "password",
						value: passcode,
						onChange: (e) => setPasscode(e.target.value),
						onKeyDown: (e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								submit();
							}
						},
						placeholder: "请输入密码"
					})]
				}) : null
			});
		}
		/** 讨论组设置：改名、公开↔私密、设置/清除进入密码（发起人或 owner/admin） */
		function ThreadSettingsModal({ open, onClose, thread }) {
			const [name, setName] = (0, react.useState)("");
			const [visibility, setVisibility] = (0, react.useState)("public");
			const [passcode, setPasscode] = (0, react.useState)("");
			const [clearPasscode, setClearPasscode] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!open) return;
				setName(thread.name);
				setVisibility(thread.visibility);
				setPasscode("");
				setClearPasscode(false);
			}, [
				open,
				thread.name,
				thread.visibility
			]);
			async function submit() {
				const trimmed = name.trim();
				if (busy || trimmed.length === 0) return;
				setBusy(true);
				const patch = {
					name: trimmed,
					visibility
				};
				if (visibility === "private") {
					if (clearPasscode) patch.passcode = null;
					else if (passcode.trim().length > 0) patch.passcode = passcode.trim();
				}
				const ok = await updateThread(thread.id, patch);
				setBusy(false);
				if (ok) onClose();
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: "讨论组设置",
				closeLabel: "关闭",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || name.trim().length === 0,
					onClick: () => void submit(),
					children: busy ? "保存中…" : "保存"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 10
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "talk-thread-settings-name",
								style: fieldLabel,
								children: "名称"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-thread-settings-name",
								value: name,
								onChange: (e) => setName(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: fieldLabel,
								children: "可见性"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: pillGroup,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: pillStyle(visibility === "public"),
									onClick: () => setVisibility("public"),
									children: "公开"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: pillStyle(visibility === "private"),
									onClick: () => setVisibility("private"),
									children: "私密"
								})]
							})]
						}),
						visibility === "private" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: "talk-thread-settings-passcode",
									style: fieldLabel,
									children: "进入密码（可选）"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									id: "talk-thread-settings-passcode",
									type: "password",
									value: passcode,
									onChange: (e) => setPasscode(e.target.value),
									placeholder: thread.hasPasscode ? "留空保持原密码" : "留空 = 仅邀请可加入",
									disabled: clearPasscode
								}),
								thread.hasPasscode ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									style: {
										...smallText,
										display: "flex",
										alignItems: "center",
										gap: 6
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: clearPasscode,
										onChange: (e) => setClearPasscode(e.target.checked)
									}), "清除现有密码（改为仅邀请可加入）"]
								}) : null
							]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...smallText,
								fontSize: 14
							},
							children: "公开讨论组：社区成员可自由进出；转为公开会一并清除进入密码。"
						})
					]
				})
			});
		}
		/** 私密讨论组成员：查看成员、移出/退出、从社区成员中搜索并拉入 */
		function ThreadMembersModal({ open, onClose, thread }) {
			const me = useTalkState().me;
			const [members, setMembers] = (0, react.useState)([]);
			const [candidates, setCandidates] = (0, react.useState)([]);
			const [query, setQuery] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(true);
			const [candidatesLoading, setCandidatesLoading] = (0, react.useState)(false);
			const [busyId, setBusyId] = (0, react.useState)(null);
			const canManage = thread.createdBy === me?.id || canManageThreads();
			(0, react.useEffect)(() => {
				if (!open) return;
				let cancelled = false;
				setLoading(true);
				setQuery("");
				listThreadMembers(thread.id).then((list) => {
					if (cancelled) return;
					setMembers(list);
					setLoading(false);
				});
				setCandidatesLoading(true);
				listThreadCandidates(thread.id, "").then((list) => {
					if (cancelled) return;
					setCandidates(list);
					setCandidatesLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [open, thread.id]);
			async function searchCandidates(value) {
				setQuery(value);
				setCandidatesLoading(true);
				const list = await listThreadCandidates(thread.id, value);
				setCandidates(list);
				setCandidatesLoading(false);
			}
			async function invite(userId) {
				if (busyId !== null) return;
				setBusyId(userId);
				const ok = await addThreadMember(thread.id, userId);
				setBusyId(null);
				if (!ok) return;
				const [nextMembers, nextCandidates] = await Promise.all([listThreadMembers(thread.id), listThreadCandidates(thread.id, query)]);
				setMembers(nextMembers);
				setCandidates(nextCandidates);
			}
			async function remove(userId, isSelf) {
				if (busyId !== null) return;
				if (!await askConfirm(isSelf ? {
					title: "退出讨论组",
					message: "退出后将不再收到该讨论组的消息，需要重新加入才能进入。",
					confirmLabel: "退出讨论组",
					danger: true
				} : {
					title: "移出讨论组",
					message: "把该成员移出后，TA 需要重新加入才能再看到讨论组消息。",
					confirmLabel: "移出",
					danger: true
				})) return;
				setBusyId(userId);
				const ok = await removeThreadMember(thread.id, userId);
				setBusyId(null);
				if (!ok) return;
				if (isSelf) {
					onClose();
					closeThread();
					return;
				}
				setMembers((prev) => prev.filter((m) => m.userId !== userId));
				listThreadCandidates(thread.id, query).then(setCandidates);
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: "讨论组成员",
				closeLabel: "关闭",
				description: "私密讨论组：仅成员可进入；可将社区成员直接拉入。",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 14
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: fieldLabel,
							children: [
								"成员（",
								members.length,
								"）"
							]
						}), loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingHint, {
							text: "加载成员…",
							padding: "8px 2px"
						}) : members.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...smallText,
								padding: "8px 2px"
							},
							children: "还没有成员。"
						}) : members.map((m) => {
							const isSelf = me !== null && m.userId === me.id;
							const isCreator = m.userId === thread.createdBy;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: listCard,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
										label: m.user.handle,
										src: m.user.avatarUrl
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											flex: 1,
											minWidth: 0
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: listCardName,
											children: [m.user.displayName ?? m.user.handle, isSelf ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: {
													color: palette.muted,
													fontSize: 14
												},
												children: "（我）"
											}) : null]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												...smallText,
												fontSize: 14
											},
											children: [
												"@",
												m.user.handle,
												" · ",
												isCreator ? "发起人" : "成员"
											]
										})]
									}),
									isSelf && !isCreator ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										icon: busyId === m.userId ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : void 0,
										disabled: busyId !== null,
										onClick: () => void remove(m.userId, true),
										children: busyId === m.userId ? "退出中…" : "退出"
									}) : canManage && !isCreator ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										icon: busyId === m.userId ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : void 0,
										disabled: busyId !== null,
										onClick: () => void remove(m.userId, false),
										children: busyId === m.userId ? "移出中…" : "移出"
									}) : null
								]
							}, m.userId);
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: fieldLabel,
								children: "拉入社区成员"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								value: query,
								onChange: (e) => void searchCandidates(e.target.value),
								placeholder: "搜索 @用户名 / 昵称",
								"aria-label": "搜索可拉入的成员"
							}),
							candidatesLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingHint, {
								text: "加载可拉入成员…",
								padding: "4px 2px"
							}) : candidates.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									...smallText,
									padding: "4px 2px"
								},
								children: "没有可拉入的成员。"
							}) : candidates.map((u) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8,
									padding: "6px 10px",
									borderRadius: 10,
									border: `1px solid ${palette.border}`
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
										label: u.handle,
										src: u.avatarUrl
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											flex: 1,
											minWidth: 0
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: listCardName,
											children: u.displayName ?? u.handle
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												...smallText,
												fontSize: 14
											},
											children: ["@", u.handle]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										icon: busyId === u.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}),
										disabled: busyId !== null,
										onClick: () => void invite(u.id),
										children: busyId === u.id ? "拉入中…" : "拉入"
									})
								]
							}, u.id))
						]
					})]
				})
			});
		}
		//#endregion
		//#region packages/client/src/components/ChannelList.tsx
		function ChannelList({ onCreateThread }) {
			const talk = useTalkState();
			const community = talk.view.community;
			const activeChannel = talk.view.channelId;
			if (!community) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: midCol,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						padding: "10px 12px 6px",
						display: "flex",
						alignItems: "center",
						gap: 4
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 16,
							fontWeight: 650,
							color: palette.muted,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							flex: 1
						},
						children: community.name
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CommunityTools, {})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						...railScroll,
						flex: 1,
						padding: "0 8px 8px"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: sectionTitle,
						children: "频道"
					}), community.channels.map((ch) => {
						const active = ch.id === activeChannel;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 2,
								padding: "0 4px 0 8px",
								borderRadius: 8,
								border: "1px solid transparent",
								...active ? activeTile : {},
								marginBottom: 2
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => void selectChannel(ch.id),
								style: {
									flex: 1,
									minWidth: 0,
									display: "flex",
									alignItems: "center",
									gap: 6,
									padding: "7px 2px",
									border: "none",
									background: "transparent",
									color: palette.text,
									fontWeight: active ? 600 : 450,
									cursor: "pointer",
									textAlign: "left"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											display: "inline-flex",
											flex: "0 0 auto",
											color: palette.muted
										},
										children: "#"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											flex: 1,
											minWidth: 0,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap"
										},
										children: ch.name
									}),
									active && talk.view.messagesLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											display: "inline-flex",
											flex: "0 0 auto",
											color: palette.muted
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 12 })
									}) : null
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelRowMenu, {
								channel: ch,
								onCreateThread
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelThreadsOf, { channelId: ch.id })] }, ch.id);
					})]
				})]
			});
		}
		/** 单个讨论组的列表行（含未读角标与私密标识），点击进入该讨论 */
		function ThreadListRow({ thread, channelId }) {
			const talk = useTalkState();
			const [joinOpen, setJoinOpen] = (0, react.useState)(false);
			const opened = talk.view.threadId === thread.id;
			const unread = thread.unreadCount;
			const mention = thread.unreadMentions;
			const isPrivate = thread.visibility === "private";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => {
					if (thread.locked) setJoinOpen(true);
					else openThread({
						id: thread.id,
						channelId
					});
				},
				title: thread.starterSnippet ? `起点：${thread.starterSnippet}` : thread.name,
				style: {
					display: "flex",
					alignItems: "center",
					gap: 5,
					width: "100%",
					border: "none",
					background: opened ? palette.hover : "transparent",
					borderRadius: 6,
					padding: "4px 6px 4px 8px",
					color: palette.text,
					cursor: "pointer",
					textAlign: "left"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: opened ? palette.accent : palette.muted,
							display: "inline-flex",
							flex: "0 0 auto"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							flex: 1,
							minWidth: 0,
							fontSize: 14,
							color: thread.status === "archived" ? palette.muted : palette.muted,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: thread.name
					}),
					isPrivate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: privacyBadge,
						children: thread.locked ? "🔒 私密" : "私密"
					}) : null,
					unread > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							flex: "0 0 auto",
							minWidth: 18,
							height: 18,
							padding: "0 4px",
							borderRadius: 999,
							fontSize: 14,
							fontWeight: 700,
							lineHeight: "18px",
							textAlign: "center",
							color: palette.onColor,
							background: mention > 0 ? palette.accent : palette.badge
						},
						children: unread > 99 ? "99+" : unread
					}) : null
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThreadJoinModal, {
				open: joinOpen,
				onClose: () => setJoinOpen(false),
				thread
			})] });
		}
		/** 频道下方的「讨论」分组：活跃在列，已归档折叠可展开。话题频道不在此嵌套（右侧话题板承担列表）。 */
		function ChannelThreadsOf({ channelId }) {
			const talk = useTalkState();
			const [archivedOpen, setArchivedOpen] = (0, react.useState)(false);
			if (talk.view.community?.channels.find((c) => c.id === channelId)?.kind === "forum") return null;
			const all = talk.view.community?.threads.filter((t) => t.channelId === channelId) ?? [];
			const active = all.filter((t) => t.status === "active");
			const archived = all.filter((t) => t.status === "archived");
			if (active.length === 0 && archived.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					margin: "1px 0 6px",
					paddingLeft: 12
				},
				children: [
					active.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 1
						},
						children: active.map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThreadListRow, {
							thread: t,
							channelId
						}, t.id))
					}) : null,
					archived.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setArchivedOpen((v) => !v),
						style: {
							display: "flex",
							alignItems: "center",
							gap: 4,
							width: "100%",
							border: "none",
							background: "transparent",
							padding: "3px 8px",
							fontSize: 14,
							color: palette.muted,
							cursor: "pointer",
							textAlign: "left"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									display: "inline-flex",
									color: palette.muted,
									transition: "transform 120ms ease",
									transform: archivedOpen ? "rotate(90deg)" : void 0
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, {})
							}),
							"已归档讨论（",
							archived.length,
							"）"
						]
					}) : null,
					archivedOpen && archived.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 1
						},
						children: archived.map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThreadListRow, {
							thread: t,
							channelId
						}, t.id))
					}) : null
				]
			});
		}
		//#endregion
		//#region packages/client/src/components/EmojiPicker.tsx
		/** 手绘笑脸 glyph：表情按钮用（图标库没有对应图标） */
		function SmileGlyph({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.3",
				strokeLinecap: "round",
				"aria-hidden": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "8",
						cy: "8",
						r: "6.4"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5.6 9.5a3 3 0 0 0 4.8 0" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M6.1 6.3h.01M9.9 6.3h.01",
						strokeWidth: "1.9"
					})
				]
			});
		}
		/** 表情分类（够用即可，不追求全集；常用放最前，同时作为兜底分组） */
		const FREQUENT_GROUP = {
			id: "frequent",
			label: "常用",
			emojis: [
				"😀",
				"😃",
				"😄",
				"😁",
				"😆",
				"😅",
				"😂",
				"🤣",
				"😊",
				"😇",
				"🙂",
				"🙃",
				"😉",
				"😌",
				"😍",
				"🥰",
				"😘",
				"😋",
				"😜",
				"🤪",
				"🤨",
				"🧐",
				"🤓",
				"😎",
				"🥳",
				"😏",
				"😒",
				"😞",
				"😔",
				"😢",
				"😭",
				"😤"
			]
		};
		const EMOJI_GROUPS = [
			FREQUENT_GROUP,
			{
				id: "gesture",
				label: "手势",
				emojis: [
					"👍",
					"👎",
					"👌",
					"✌️",
					"🤞",
					"🤟",
					"🤘",
					"🤙",
					"👈",
					"👉",
					"👆",
					"👇",
					"☝️",
					"✋",
					"🤚",
					"🖐️",
					"🖖",
					"👋",
					"🤝",
					"🙏",
					"💪",
					"👏",
					"🙌",
					"👐",
					"🤲",
					"💯"
				]
			},
			{
				id: "mood",
				label: "心情",
				emojis: [
					"😶",
					"😐",
					"😑",
					"😬",
					"🙄",
					"😯",
					"😲",
					"😳",
					"🥺",
					"😦",
					"😧",
					"😨",
					"😰",
					"😥",
					"😓",
					"🤗",
					"🤔",
					"🤭",
					"🤫",
					"🤥",
					"😴",
					"😪",
					"😵",
					"🤐",
					"🤒",
					"🤕",
					"🥱",
					"😈",
					"👻",
					"💀",
					"🤖",
					"🎃"
				]
			},
			{
				id: "animal",
				label: "动物",
				emojis: [
					"🐶",
					"🐱",
					"🐭",
					"🐹",
					"🐰",
					"🦊",
					"🐻",
					"🐼",
					"🐨",
					"🐯",
					"🦁",
					"🐮",
					"🐷",
					"🐸",
					"🐵",
					"🐔",
					"🐧",
					"🐦",
					"🐤",
					"🦆",
					"🦉",
					"🐴",
					"🦄",
					"🐝",
					"🦋",
					"🐌",
					"🐞",
					"🐢",
					"🐍",
					"🐙",
					"🐳",
					"🌵"
				]
			},
			{
				id: "food",
				label: "美食",
				emojis: [
					"🍎",
					"🍐",
					"🍊",
					"🍋",
					"🍌",
					"🍉",
					"🍇",
					"🍓",
					"🍒",
					"🍑",
					"🥭",
					"🍍",
					"🥝",
					"🍅",
					"🥑",
					"🥦",
					"🥕",
					"🌽",
					"🥒",
					"🍄",
					"🍞",
					"🥐",
					"🍕",
					"🍔",
					"🍟",
					"🍣",
					"🍜",
					"🍰",
					"🍺",
					"☕",
					"🍵",
					"🎂"
				]
			},
			{
				id: "activity",
				label: "活动",
				emojis: [
					"⚽",
					"🏀",
					"🏈",
					"⚾",
					"🎾",
					"🏐",
					"🎱",
					"🏓",
					"🏸",
					"🎯",
					"🎮",
					"🎲",
					"🎸",
					"🎹",
					"🎧",
					"🎤",
					"🎬",
					"📷",
					"💻",
					"📱",
					"⌨️",
					"🖥️",
					"🚀",
					"🎁",
					"🎉",
					"🎊",
					"🏆",
					"🥇",
					"💡",
					"🔧",
					"📌",
					"📎"
				]
			},
			{
				id: "symbol",
				label: "符号",
				emojis: [
					"❤️",
					"🧡",
					"💛",
					"💚",
					"💙",
					"💜",
					"🖤",
					"🤍",
					"💔",
					"✨",
					"⭐",
					"🌟",
					"🔥",
					"💧",
					"🌈",
					"☀️",
					"🌙",
					"⚡",
					"🎵",
					"✅",
					"❌",
					"⚠️",
					"❓",
					"❗",
					"➕",
					"➖",
					"⏰",
					"🔔",
					"🔒",
					"🔑",
					"📢",
					"🏷️"
				]
			}
		];
		const pickerWrap = {
			position: "relative",
			flex: "0 0 auto",
			alignSelf: "flex-end"
		};
		/** 面板宽度：定位计算需要，故提为常量 */
		const PANEL_WIDTH = 320;
		/** 面板与视口边缘的最小留白 */
		const PANEL_MARGIN = 8;
		/**
		* 面板经 portal 挂到 body、以 fixed 定位浮在触发按钮上方。
		* 原因：面板原先用 absolute 相对按钮定位，而消息操作条在 messagesWrap
		* （overflowY: auto）滚动容器内，消息靠上时整个面板会被容器裁剪 / 被聊天区
		* 上层元素盖住。改为 fixed 视口定位后不再受任何祖先 overflow 影响。
		*/
		const panel = {
			position: "fixed",
			zIndex: 900,
			width: PANEL_WIDTH,
			background: palette.elevated,
			border: `1px solid ${palette.border}`,
			borderRadius: 10,
			boxShadow: shadow.popup,
			display: "flex",
			flexDirection: "column",
			overflow: "hidden"
		};
		const tabRow = {
			display: "flex",
			gap: 2,
			padding: "6px 6px 4px",
			overflowX: "auto"
		};
		const tab = {
			flex: "0 0 auto",
			border: "none",
			background: "transparent",
			color: palette.muted,
			fontSize: 14,
			fontWeight: 600,
			padding: "4px 8px",
			borderRadius: 999,
			cursor: "pointer"
		};
		const tabActive = {
			background: palette.hover,
			color: palette.text
		};
		const grid = {
			display: "grid",
			gridTemplateColumns: "repeat(8, 1fr)",
			gap: 2,
			padding: "0 6px 6px",
			maxHeight: 200,
			overflowY: "auto"
		};
		const emojiButton = {
			border: "none",
			background: "transparent",
			borderRadius: 8,
			cursor: "pointer",
			padding: 0,
			height: 30,
			fontSize: 16,
			lineHeight: "30px",
			color: palette.text
		};
		/**
		* 表情选择器：自带触发按钮，面板经 body portal 以 fixed 定位浮在按钮上方
		* （输入框贴底，向下会出屏；也避免被聊天区滚动容器裁剪）。
		* open 由外部持有，便于切房间 / 发送后统一收起。
		* align="right" 时面板向右对齐按钮（消息行操作条在右侧，避免面板溢出屏幕）。
		*/
		function EmojiPopover({ open, onOpenChange, onPick, disabled = false, size = "md", align = "left", icon = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SmileGlyph, {}), label = "表情", title = "插入表情" }) {
			const [groupIndex, setGroupIndex] = (0, react.useState)(0);
			const wrapRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			/** 触发按钮的视口矩形；未测到时不渲染面板 */
			const [anchorRect, setAnchorRect] = (0, react.useState)(null);
			/** 面板实测高度：用于判断向上还是向下弹出 */
			const [panelHeight, setPanelHeight] = (0, react.useState)(0);
			(0, react.useLayoutEffect)(() => {
				if (!open) {
					setAnchorRect(null);
					return;
				}
				function update() {
					const rect = wrapRef.current?.getBoundingClientRect();
					if (!rect) return;
					setAnchorRect({
						top: rect.top,
						bottom: rect.bottom,
						left: rect.left,
						right: rect.right
					});
				}
				update();
				window.addEventListener("scroll", update, true);
				window.addEventListener("resize", update);
				return () => {
					window.removeEventListener("scroll", update, true);
					window.removeEventListener("resize", update);
				};
			}, [open]);
			(0, react.useLayoutEffect)(() => {
				if (!open) {
					setPanelHeight(0);
					return;
				}
				const height = panelRef.current?.offsetHeight ?? 0;
				if (height !== panelHeight) setPanelHeight(height);
			}, [open, panelHeight]);
			(0, react.useEffect)(() => {
				if (!open) return;
				function onMouseDown(event) {
					const target = event.target;
					if (wrapRef.current?.contains(target)) return;
					if (panelRef.current?.contains(target)) return;
					onOpenChange(false);
				}
				function onKeyDown(event) {
					if (event.key === "Escape") onOpenChange(false);
				}
				document.addEventListener("mousedown", onMouseDown);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("mousedown", onMouseDown);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open, onOpenChange]);
			const group = EMOJI_GROUPS[groupIndex] ?? FREQUENT_GROUP;
			/** 面板定位：默认向上弹（输入框贴底），上方放不下则翻到按钮下方 */
			function panelStyle() {
				if (!anchorRect) return panel;
				const rawLeft = align === "right" ? anchorRect.right - PANEL_WIDTH : anchorRect.left;
				const maxLeft = window.innerWidth - PANEL_WIDTH - PANEL_MARGIN;
				const left = Math.max(PANEL_MARGIN, Math.min(rawLeft, Math.max(PANEL_MARGIN, maxLeft)));
				const fitsAbove = anchorRect.top - PANEL_MARGIN >= panelHeight;
				return {
					...panel,
					left,
					...fitsAbove ? { bottom: window.innerHeight - anchorRect.top + PANEL_MARGIN } : { top: anchorRect.bottom + PANEL_MARGIN }
				};
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: wrapRef,
				style: pickerWrap,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					size,
					variant: "ghost",
					icon,
					onClick: () => onOpenChange(!open),
					disabled,
					"aria-label": label,
					"aria-expanded": open,
					title
				}), open && anchorRect ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: panelRef,
					style: panelStyle(),
					role: "dialog",
					"aria-label": "表情面板",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: tabRow,
						children: EMOJI_GROUPS.map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setGroupIndex(index),
							style: index === groupIndex ? {
								...tab,
								...tabActive
							} : tab,
							children: item.label
						}, item.id))
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...grid,
							...slimScrollbar
						},
						children: group.emojis.map((emoji) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							title: emoji,
							"aria-label": emoji,
							onMouseDown: (e) => e.preventDefault(),
							onClick: () => onPick(emoji),
							style: emojiButton,
							onMouseEnter: (e) => {
								e.currentTarget.style.background = palette.hover;
							},
							onMouseLeave: (e) => {
								e.currentTarget.style.background = "transparent";
							},
							children: emoji
						}, emoji))
					})]
				}), document.body) : null]
			});
		}
		//#endregion
		//#region packages/client/src/components/ForumTopicBoard.tsx
		/** 单个话题行（帖子式：标题 + 发起人/活跃时间/回复数），点击进入话题内聊天 */
		function ForumTopicRow({ thread, channelId, archivedView }) {
			const [joinOpen, setJoinOpen] = (0, react.useState)(false);
			const unread = thread.unreadCount;
			const mention = thread.unreadMentions;
			const author = thread.creatorDisplayName ?? thread.creatorHandle;
			const replies = thread.messageCount;
			const isPrivate = thread.visibility === "private";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => {
					if (thread.locked) setJoinOpen(true);
					else openThread({
						id: thread.id,
						channelId
					});
				},
				title: thread.name,
				style: {
					display: "flex",
					alignItems: "center",
					gap: 10,
					width: "100%",
					border: "none",
					borderBottom: `1px solid ${palette.border}`,
					background: "transparent",
					padding: "9px 4px",
					color: palette.text,
					cursor: "pointer",
					textAlign: "left",
					transition: "background 120ms ease"
				},
				onMouseEnter: (e) => {
					e.currentTarget.style.background = palette.hover;
				},
				onMouseLeave: (e) => {
					e.currentTarget.style.background = "transparent";
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							width: 34,
							height: 34,
							borderRadius: 10,
							background: palette.inputBg,
							border: `1px solid ${palette.border}`,
							color: archivedView ? palette.muted : palette.accent,
							flex: "0 0 auto"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							flex: 1,
							minWidth: 0,
							display: "flex",
							flexDirection: "column",
							gap: 3
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6,
								minWidth: 0,
								fontSize: 14,
								fontWeight: 650,
								color: archivedView ? palette.muted : palette.text
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: thread.name
								}),
								isPrivate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: privacyBadge,
									children: thread.locked ? "🔒 私密" : "私密"
								}) : null,
								archivedView ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										flex: "0 0 auto",
										fontSize: 14,
										fontWeight: 600,
										color: palette.muted,
										border: `1px solid ${palette.border}`,
										borderRadius: 999,
										padding: "0 6px",
										lineHeight: "18px"
									},
									children: "已归档"
								}) : null
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								...smallText,
								fontSize: 14
							},
							children: [
								author,
								" 发起",
								thread.starterSnippet ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [" · ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { color: palette.muted },
									children: thread.starterSnippet
								})] }) : null,
								" · ",
								replies,
								" 条回复 · ",
								timeLabel(thread.lastActivityAt)
							]
						})]
					}),
					unread > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							flex: "0 0 auto",
							minWidth: 18,
							height: 18,
							padding: "0 5px",
							borderRadius: 999,
							fontSize: 14,
							fontWeight: 700,
							lineHeight: "18px",
							textAlign: "center",
							color: palette.onColor,
							background: mention > 0 ? palette.accent : palette.badge
						},
						children: unread > 99 ? "99+" : unread
					}) : null
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThreadJoinModal, {
				open: joinOpen,
				onClose: () => setJoinOpen(false),
				thread
			})] });
		}
		/** 话题频道主面板：活跃话题列表 + 已归档折叠 + 空状态引导；点行进入话题详情交流 */
		function ForumTopicBoard({ channelId, onNewTopic }) {
			const talk = useTalkState();
			const [archivedOpen, setArchivedOpen] = (0, react.useState)(false);
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const channel = talk.view.community?.channels.find((c) => c.id === channelId) ?? null;
			/** 重新拉取社区详情（含最新话题回复与未读） */
			async function refreshTopics() {
				if (refreshing) return;
				setRefreshing(true);
				await reloadCommunityDetail();
				setRefreshing(false);
			}
			if (channel?.kind !== "forum") return null;
			const canPost = (channelPermissions(channelId) & Permission.CREATE_THREAD) !== 0;
			const [activeRaw, archivedRaw] = partition((talk.view.community?.threads ?? []).filter((t) => t.channelId === channelId), (t) => t.status === "active");
			const active = orderBy(activeRaw, [(t) => t.lastActivityAt], ["desc"]);
			const archived = orderBy(archivedRaw, [(t) => t.lastActivityAt], ["desc"]);
			if (active.length === 0 && archived.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					flex: 1,
					overflowY: "auto",
					display: "flex",
					alignItems: "center",
					justifyContent: "center"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: emptyMsg,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								width: 44,
								height: 44,
								borderRadius: 14,
								color: palette.accent,
								background: palette.inputBg,
								border: `1px solid ${palette.border}`,
								fontSize: 16,
								fontWeight: 700
							},
							children: "#"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 14,
								fontWeight: 600,
								color: palette.text
							},
							children: "这里还没有话题"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								fontSize: 14,
								lineHeight: 1.6
							},
							children: [
								"话题频道的聊天都放进一条条话题里：发一个新话题，",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								"大家点进去围绕它交流；24 小时无人回复会自动归档。"
							]
						}),
						canPost ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {}),
							onClick: onNewTopic,
							style: { marginTop: 4 },
							children: "创建第一个话题"
						}) : null,
						!canPost ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { fontSize: 14 },
							children: "你没有在此频道发布话题的权限。"
						}) : null
					]
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					flex: 1,
					overflowY: "auto",
					padding: "10px 16px 14px"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 8,
							padding: "4px 4px 8px"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								...smallText,
								fontSize: 14
							},
							children: [active.length + archived.length, " 条话题 · 点进话题查看与回复"]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "inline-flex",
								alignItems: "center",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: refreshing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, {}),
								disabled: refreshing,
								onClick: () => void refreshTopics(),
								"aria-label": refreshing ? "刷新中" : "刷新话题",
								title: "刷新话题列表（含最新回复与未读）"
							}), canPost ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}),
								onClick: onNewTopic,
								children: "新建话题"
							}) : null]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: active.map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ForumTopicRow, {
						thread: t,
						channelId,
						archivedView: false
					}, t.id)) }),
					archived.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setArchivedOpen((v) => !v),
						style: {
							display: "flex",
							alignItems: "center",
							gap: 4,
							marginTop: 8,
							border: "none",
							background: "transparent",
							padding: "4px 2px",
							fontSize: 14,
							fontWeight: 600,
							color: palette.muted,
							cursor: "pointer"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									display: "inline-flex",
									color: palette.muted,
									transition: "transform 120ms ease",
									transform: archivedOpen ? "rotate(90deg)" : void 0
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, {})
							}),
							"已归档话题（",
							archived.length,
							"）"
						]
					}), archivedOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: archived.map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ForumTopicRow, {
						thread: t,
						channelId,
						archivedView: true
					}, t.id)) }) : null] }) : null
				]
			});
		}
		//#endregion
		//#region packages/client/src/components/MemberPanel.tsx
		/** 在线态文案与颜色（在线 / 离开均计入「在线」分组） */
		const PRESENCE_LABEL = {
			online: "在线",
			away: "离开",
			offline: "离线"
		};
		const PRESENCE_COLOR = {
			online: palette.success,
			away: palette.warn,
			offline: palette.muted
		};
		const panelHeader = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			padding: "10px 10px 10px 14px",
			borderBottom: `1px solid ${palette.border}`,
			flex: "0 0 auto"
		};
		const panelBody = {
			flex: 1,
			minHeight: 0,
			overflowY: "auto",
			padding: "2px 6px 12px"
		};
		/** 分组标题：在线 — 1 / 离线 — 0 / 已封禁用户 — 2 */
		const groupTitle = {
			fontSize: 14,
			fontWeight: 650,
			color: palette.muted,
			letterSpacing: "0.06em",
			padding: "10px 8px 4px"
		};
		const memberRow = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			padding: "5px 6px 5px 8px",
			borderRadius: 8
		};
		const nameRow = {
			fontSize: 14,
			fontWeight: 600,
			color: palette.text,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		/** @everyone 条目的圆形标记（图标库无 @ 字形，用文本代替） */
		const everyoneBadge = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: 24,
			height: 24,
			flex: "0 0 auto",
			borderRadius: "50%",
			background: palette.inputBg,
			border: `1px solid ${palette.border}`,
			color: palette.muted,
			fontSize: 14,
			fontWeight: 700
		};
		const atGlyph = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: {
				fontSize: 14,
				fontWeight: 700
			},
			children: "@"
		});
		function PanelRow({ member, status, items, busy, onSelect }) {
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsht-member-row",
				style: memberRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
						label: member.handle,
						src: member.avatarUrl,
						size: 24
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: nameRow,
							children: [member.displayName ?? member.handle, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									fontSize: 14,
									color: PRESENCE_COLOR[status]
								},
								children: [
									"（",
									PRESENCE_LABEL[status],
									"）"
								]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								...smallText,
								fontSize: 14
							},
							children: ["@", member.handle]
						})]
					}),
					busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							display: "inline-flex",
							padding: "0 8px",
							color: palette.muted
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 })
					}) : items.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
						open: menuOpen,
						onClose: () => setMenuOpen(false),
						onSelect: (id) => {
							setMenuOpen(false);
							onSelect(id);
						},
						anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "ghost",
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutline16, {}),
							onClick: () => setMenuOpen((v) => !v),
							"aria-label": `${member.handle} 的操作`
						}),
						items,
						align: "end",
						portal: true
					}) : null
				]
			});
		}
		function MemberPanel({ onMention, onClose }) {
			const talk = useTalkState();
			const me = talk.me;
			const community = talk.view.community;
			const communityId = talk.view.communityId;
			const roles = community?.roles ?? [];
			const owner = isOwner();
			const canRoles = canManageRoles();
			const canKick = canKickMembers();
			const canBan = canBanMembers();
			const [bans, setBans] = (0, react.useState)([]);
			const [bansLoading, setBansLoading] = (0, react.useState)(false);
			const [assigning, setAssigning] = (0, react.useState)(null);
			const [busyUserId, setBusyUserId] = (0, react.useState)(null);
			const [everyoneMenuOpen, setEveryoneMenuOpen] = (0, react.useState)(false);
			const adminRoleIds = new Set(adminRoles().map((r) => r.id));
			const quickTarget = adminRole();
			const canQuickAdmin = canRoles && (quickTarget === null || canManageRolePosition(quickTarget.position));
			(0, react.useEffect)(() => {
				if (!canBan) return;
				let cancelled = false;
				setBansLoading(true);
				listBannedUsers().then((list) => {
					if (cancelled) return;
					setBans(list);
					setBansLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [canBan]);
			const presenceOf = new Map(talk.view.communityOnlineMembers.map((m) => [m.userId, m.presence]));
			/** 在线 = 快照里 presence 非 offline（离开也算在线，只是状态不同） */
			const isActive = (userId) => {
				const presence = presenceOf.get(userId);
				return presence === "online" || presence === "away";
			};
			const presenceStatus = (userId) => presenceOf.get(userId) ?? "offline";
			const byHandle = (a, b) => a.handle.localeCompare(b.handle);
			const online = talk.view.members.filter((m) => isActive(m.userId)).sort(byHandle);
			const offline = talk.view.members.filter((m) => !isActive(m.userId)).sort(byHandle);
			/** 写操作后重拉成员缓存（面板与 @ 补全共用 view.members） */
			async function reload() {
				if (communityId) await refreshCommunityMembers(communityId);
			}
			/** 一键把成员设为管理员：分配带 ADMINISTRATOR 位的角色（没有则先建「管理员」） */
			async function makeAdmin(m) {
				if (busyUserId !== null) return;
				setBusyUserId(m.userId);
				const roleId = await ensureAdminRole();
				if (roleId !== null) {
					const next = m.roleIds.includes(roleId) ? m.roleIds : [...m.roleIds, roleId];
					if (await setMemberRoles(m.userId, next)) await reload();
				}
				setBusyUserId(null);
			}
			async function kick(m) {
				if (!await askConfirm({
					title: `移除 @${m.handle}`,
					message: "把 TA 移出社区。之后 TA 仍可通过邀请码或邀请重新加入。",
					confirmLabel: "移除成员",
					danger: true
				}) || busyUserId !== null) return;
				setBusyUserId(m.userId);
				if (await kickMember(m.userId)) await reload();
				setBusyUserId(null);
			}
			async function ban(m) {
				if (!await askConfirm({
					title: `封禁 @${m.handle}`,
					message: "封禁会同时将其移出社区，且之后无法通过邀请码/邀请再加入（可在下方解封）。",
					confirmLabel: "封禁成员",
					danger: true
				}) || busyUserId !== null) return;
				setBusyUserId(m.userId);
				if (await banUser(m.userId)) {
					await reload();
					setBans(await listBannedUsers());
				}
				setBusyUserId(null);
			}
			async function transfer(m) {
				if (!await askConfirm({
					title: `转让社区所有权给 @${m.handle}`,
					message: "转让后你将失去所有者权限，且只有新所有者能再转让回来。",
					confirmLabel: "确认转让",
					danger: true
				}) || busyUserId !== null) return;
				setBusyUserId(m.userId);
				await transferOwner(m.userId);
				setBusyUserId(null);
			}
			async function unban(item) {
				if (!await askConfirm({
					title: `解封 @${item.user.handle}`,
					message: "解封后 TA 可以重新加入社区，原有的成员身份不会自动恢复。",
					confirmLabel: "解除封禁"
				}) || busyUserId !== null) return;
				setBusyUserId(item.userId);
				if (await unbanUser(item.userId)) setBans((prev) => prev.filter((b) => b.userId !== item.userId));
				setBusyUserId(null);
			}
			/** 成员的三点菜单：按「提及 + 可管理层级 + 各自权限位」逐项判定 */
			function rowItems(m) {
				const self = me !== null && m.userId === me.id;
				const targetIsOwner = m.userId === community?.ownerId;
				const manageable = !self && !targetIsOwner && canManageRolePosition(highestPositionOf(m.roleIds));
				const items = [];
				if (!self) items.push({
					id: "mention",
					label: "提及",
					icon: atGlyph
				});
				if (manageable) {
					if (canQuickAdmin && !m.roleIds.some((id) => adminRoleIds.has(id))) items.push({
						id: "admin",
						label: "设为管理员"
					});
					if (canRoles) items.push({
						id: "roles",
						label: "分配角色"
					});
					if (canKick) items.push({
						id: "kick",
						label: "移除成员",
						danger: true,
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
					});
					if (canBan) items.push({
						id: "ban",
						label: "封禁成员",
						danger: true
					});
				}
				if (owner && !self && !targetIsOwner) items.push({
					id: "transfer",
					label: "转让所有权"
				});
				return items;
			}
			function onRowAction(id, m) {
				if (id === "mention") {
					onMention(m.handle);
					return;
				}
				if (id === "admin") makeAdmin(m);
				if (id === "roles") setAssigning(m);
				if (id === "kick") kick(m);
				if (id === "ban") ban(m);
				if (id === "transfer") transfer(m);
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				className: "dsht-member-panel",
				style: memberPanel,
				"aria-label": "社区成员",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: memberPanelCss }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: panelHeader,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 16,
									fontWeight: 700,
									flex: 1
								},
								children: "成员"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									...smallText,
									fontSize: 14
								},
								children: [
									"共 ",
									community?.memberCount ?? 0,
									" 名"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {}),
								onClick: onClose,
								"aria-label": "收起成员列表"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: panelBody,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsht-member-row",
								style: {
									...memberRow,
									marginTop: 6
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: everyoneBadge,
										children: "@"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											flex: 1,
											minWidth: 0
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: nameRow,
											children: "@everyone"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												...smallText,
												fontSize: 14
											},
											children: "社区全体成员"
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
										open: everyoneMenuOpen,
										onClose: () => setEveryoneMenuOpen(false),
										onSelect: (id) => {
											setEveryoneMenuOpen(false);
											if (id === "mention") onMention("everyone");
										},
										anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "ghost",
											icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutline16, {}),
											onClick: () => setEveryoneMenuOpen((v) => !v),
											"aria-label": "@everyone 的操作"
										}),
										items: [{
											id: "mention",
											label: "提及 @everyone",
											icon: atGlyph
										}],
										align: "end",
										portal: true
									})
								]
							}),
							talk.view.membersLoading && talk.view.members.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingHint, { text: "加载成员…" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: groupTitle,
									children: ["在线 — ", online.length]
								}),
								online.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										...smallText,
										fontSize: 14,
										padding: "4px 10px"
									},
									children: "暂无成员在线"
								}) : online.map((m) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelRow, {
									member: m,
									status: presenceStatus(m.userId),
									items: rowItems(m),
									busy: busyUserId === m.userId,
									onSelect: (id) => onRowAction(id, m)
								}, m.userId)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: groupTitle,
									children: ["离线 — ", offline.length]
								}),
								offline.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										...smallText,
										fontSize: 14,
										padding: "4px 10px"
									},
									children: "没有离线成员"
								}) : offline.map((m) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelRow, {
									member: m,
									status: presenceStatus(m.userId),
									items: rowItems(m),
									busy: busyUserId === m.userId,
									onSelect: (id) => onRowAction(id, m)
								}, m.userId))
							] }),
							canBan && (bansLoading || bans.length > 0) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: groupTitle,
								children: ["已封禁用户 — ", bans.length]
							}), bansLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingHint, { text: "加载封禁用户…" }) : bans.map((b) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsht-member-row",
								style: memberRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
										label: b.user.handle,
										src: b.user.avatarUrl,
										size: 24
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											flex: 1,
											minWidth: 0
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: nameRow,
											children: ["@", b.user.handle]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												...smallText,
												fontSize: 14
											},
											children: [
												"封禁于 ",
												timeLabel(b.createdAt),
												b.reason ? ` · ${b.reason}` : ""
											]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										icon: busyUserId === b.userId ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : void 0,
										disabled: busyUserId !== null,
										onClick: () => void unban(b),
										"aria-label": `解封 ${b.user.handle}`,
										children: busyUserId === b.userId ? "解封中…" : "解封"
									})
								]
							}, b.userId))] }) : null
						]
					}),
					assigning ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemberRolesDialog, {
						member: assigning,
						roles,
						onClose: () => setAssigning(null),
						onSaved: () => {
							setAssigning(null);
							reload();
						}
					}) : null
				]
			});
		}
		//#endregion
		//#region packages/client/src/components/Markdown.tsx
		/** 等宽字体栈（宿主没有对应 token，按系统字体回退） */
		const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace";
		const rootStyle = {
			whiteSpace: "pre-wrap",
			wordBreak: "break-word",
			fontSize: 14,
			lineHeight: 1.55
		};
		const inlineCodeStyle = {
			fontFamily: MONO_FONT,
			fontSize: 14,
			padding: "1px 5px",
			borderRadius: 4,
			background: palette.inputBg,
			border: `1px solid ${palette.border}`
		};
		const codeBlockStyle = {
			margin: "4px 0",
			padding: "8px 10px",
			borderRadius: 8,
			background: palette.inputBg,
			border: `1px solid ${palette.border}`,
			fontFamily: MONO_FONT,
			fontSize: 14,
			lineHeight: 1.5,
			whiteSpace: "pre",
			overflowX: "auto"
		};
		const linkStyle = {
			color: palette.accent,
			textDecoration: "underline",
			textUnderlineOffset: 2,
			wordBreak: "break-all"
		};
		const quoteStyle = {
			margin: "4px 0",
			padding: "2px 0 2px 10px",
			borderLeft: `3px solid ${palette.border}`,
			color: palette.muted
		};
		const hrStyle = {
			border: "none",
			borderTop: `1px solid ${palette.border}`,
			margin: "8px 0"
		};
		const paragraphStyle = { margin: "2px 0" };
		const listStyle = {
			margin: "4px 0",
			paddingLeft: 22
		};
		function headingStyle(level) {
			return {
				margin: "6px 0 2px",
				fontSize: level <= 3 ? 16 : 14,
				fontWeight: 700,
				lineHeight: 1.4
			};
		}
		/**
		* 行内语法：code / 自动链接 / 粗斜体 / 删除线 / 链接 / @提及 / 转义。
		* 必须带 u 标志（@提及用到 \p{L} 之类的 Unicode 属性转义）；
		* 自动链接排在强调语法之前，避免 URL 里的下划线被当成斜体。
		*/
		const INLINE_RE = /^(?:`([^`\n]+)`|(https?:\/\/[^\s<>()]+)|\*\*\*([\s\S]+?)\*\*\*|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]]*)\]\(([^)\s]+)\)|(@[\p{L}\p{N}_]+)|(\\.))/u;
		const FENCE_RE = /^\s*(```|~~~)/;
		const HEADING_RE = /^(#{1,6})\s+(.*)$/;
		const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
		const QUOTE_RE = /^\s*>\s?/;
		const LIST_ITEM_RE = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;
		/** 段落终止判定：遇到下一个块级语法就收尾 */
		function startsBlock(line) {
			return FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line) || LIST_ITEM_RE.test(line);
		}
		/** 链接白名单：只放行 http/https/mailto，其余（如 javascript:）按普通文本显示 */
		function safeHref(raw) {
			try {
				const url = new URL(raw, "https://dsh-talk.invalid");
				if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return raw;
			} catch {}
			return null;
		}
		/** @提及高亮：自己用品牌底色反白 */
		function mentionNode(key, raw, selfHandle) {
			const isSelf = raw.slice(1) === selfHandle;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					color: isSelf ? palette.onColor : palette.accent,
					background: isSelf ? palette.accent : palette.mentionBg,
					borderRadius: 4,
					padding: isSelf ? "0 3px" : "0 2px",
					fontWeight: 500
				},
				children: raw
			}, key);
		}
		/** 逐段扫描行内语法，产出 React 节点（纯文本原样保留） */
		function renderInline(text, selfHandle, keyPrefix) {
			const nodes = [];
			let plain = "";
			let i = 0;
			let seq = 0;
			const flushPlain = () => {
				if (plain !== "") {
					nodes.push(plain);
					plain = "";
				}
			};
			while (i < text.length) {
				const match = INLINE_RE.exec(text.slice(i));
				if (!match) {
					plain += text[i];
					i += 1;
					continue;
				}
				flushPlain();
				const key = `${keyPrefix}-${seq}`;
				seq += 1;
				if (match[1] !== void 0) nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
					style: inlineCodeStyle,
					children: match[1]
				}, key));
				else if (match[2] !== void 0) {
					const trimmed = match[2].replace(/[.,!?;:]+$/, "");
					nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href: trimmed,
						target: "_blank",
						rel: "noreferrer",
						style: linkStyle,
						children: trimmed
					}, key));
					plain = match[2].slice(trimmed.length);
				} else if (match[3] !== void 0) nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: renderInline(match[3], selfHandle, key) }) }, key));
				else if (match[4] !== void 0 || match[5] !== void 0) {
					const inner = match[4] ?? match[5] ?? "";
					nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: renderInline(inner, selfHandle, key) }, key));
				} else if (match[6] !== void 0) nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("del", { children: renderInline(match[6], selfHandle, key) }, key));
				else if (match[7] !== void 0 || match[8] !== void 0) {
					const inner = match[7] ?? match[8] ?? "";
					nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: renderInline(inner, selfHandle, key) }, key));
				} else if (match[9] !== void 0) {
					const href = safeHref(match[10] ?? "");
					if (href === null) plain = match[0];
					else nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href,
						target: "_blank",
						rel: "noreferrer",
						style: linkStyle,
						children: match[9] || href
					}, key));
				} else if (match[11] !== void 0) nodes.push(mentionNode(key, match[11], selfHandle));
				else if (match[12] !== void 0) plain += match[12].slice(1);
				i += match[0].length;
			}
			flushPlain();
			return nodes;
		}
		/** 按块解析：围栏代码块 / 标题 / 引用 / 列表 / 分割线 / 段落 */
		function renderBlocks(text, selfHandle) {
			const lines = text.replace(/\r\n?/g, "\n").split("\n");
			const blocks = [];
			let blockIndex = 0;
			let i = 0;
			const nextKey = () => `b-${blockIndex++}`;
			const at = (n) => lines[n] ?? "";
			while (i < lines.length) {
				const line = at(i);
				const fence = FENCE_RE.exec(line);
				if (fence) {
					const closer = new RegExp(`^\\s*${fence[1]}\\s*$`);
					const body = [];
					i += 1;
					while (i < lines.length && !closer.test(at(i))) {
						body.push(at(i));
						i += 1;
					}
					i += 1;
					blocks.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						style: codeBlockStyle,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: body.join("\n") })
					}, nextKey()));
					continue;
				}
				if (/^\s*$/.test(line)) {
					i += 1;
					continue;
				}
				const heading = HEADING_RE.exec(line);
				if (heading) {
					const key = nextKey();
					blocks.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: headingStyle((heading[1] ?? "").length),
						children: renderInline(heading[2] ?? "", selfHandle, key)
					}, key));
					i += 1;
					continue;
				}
				if (HR_RE.test(line)) {
					blocks.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("hr", { style: hrStyle }, nextKey()));
					i += 1;
					continue;
				}
				if (QUOTE_RE.test(line)) {
					const body = [];
					while (i < lines.length && QUOTE_RE.test(at(i))) {
						body.push(at(i).replace(QUOTE_RE, ""));
						i += 1;
					}
					const key = nextKey();
					blocks.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("blockquote", {
						style: quoteStyle,
						children: renderInline(body.join("\n"), selfHandle, key)
					}, key));
					continue;
				}
				const item = LIST_ITEM_RE.exec(line);
				if (item) {
					const ordered = item[2] !== void 0;
					const items = [];
					while (i < lines.length) {
						const next = LIST_ITEM_RE.exec(at(i));
						if (!next || next[2] !== void 0 !== ordered) break;
						items.push({
							line: i,
							text: next[3] ?? ""
						});
						i += 1;
					}
					const key = nextKey();
					const children = items.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: renderInline(entry.text, selfHandle, `${key}-${entry.line}`) }, entry.line));
					blocks.push(ordered ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", {
						style: listStyle,
						children
					}, key) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						style: listStyle,
						children
					}, key));
					continue;
				}
				const paragraph = [];
				while (i < lines.length && !/^\s*$/.test(at(i)) && !startsBlock(at(i))) {
					paragraph.push(at(i));
					i += 1;
				}
				const key = nextKey();
				blocks.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: paragraphStyle,
					children: renderInline(paragraph.join("\n"), selfHandle, key)
				}, key));
			}
			return blocks;
		}
		/** 消息正文：text 为 Markdown 原文，selfHandle 用于 @提及高亮 */
		function Markdown({ text, selfHandle }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: rootStyle,
				children: renderBlocks(text, selfHandle)
			});
		}
		//#endregion
		//#region packages/client/src/components/ShareModals.tsx
		/** 会话行尾状态提示：交互阻断 > 运行中 > 已完成（对齐宿主左侧会话栏口径） */
		function sessionHint(row) {
			if (row.pendingInteraction) return "待处理";
			if (row.running) return row.runningSubagentCount > 0 ? `${row.runningSubagentCount} 个子代理` : "运行中";
			return row.completed ? "已完成" : "";
		}
		/** 会话树里按 id 取展示名：选中会话时用它默认填充分享标题 */
		function sessionTitleOf(tree, sessionId) {
			for (const group of tree.groups) for (const row of group.sessions) if (row.id === sessionId) return row.title;
			return "";
		}
		/** 分享 DSH 会话弹窗：选一个本机会话，打包上传并发送卡片到当前频道 */
		function ShareSnapshotModal({ open, onClose, channelId, communityId }) {
			const [title, setTitle] = (0, react.useState)("");
			const [summary, setSummary] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [tree, setTree] = (0, react.useState)({
				groups: [],
				current: null
			});
			const [sessionId, setSessionId] = (0, react.useState)("");
			const [loadingTree, setLoadingTree] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!open) return;
				setLoadingTree(true);
				listShareableSessions().then((res) => {
					setTree(res);
					const initial = getCurrentDshSession() ?? res.current ?? res.groups[0]?.sessions[0]?.id ?? "";
					setSessionId(initial);
					setTitle(sessionTitleOf(res, initial));
					setLoadingTree(false);
				});
			}, [open]);
			/** 选会话：标题同步换成该会话的名字（之后用户自己写的以用户为准） */
			function selectSession(row) {
				setSessionId(row.id);
				setTitle(row.title);
			}
			/** DSH 会话：host 打包上传后登记分享，并把卡片发到当前频道 */
			async function submitSession() {
				if (busy || sessionId.length === 0) return;
				setBusy(true);
				const shareId = await shareLocalSession({
					sessionId,
					title,
					summary,
					communityId
				});
				if (shareId && channelId.length > 0) {
					if (!await sendMessage("", [], shareId)) notify("分享已创建，但发送卡片失败");
				}
				setBusy(false);
				if (!shareId) return;
				setTitle("");
				setSummary("");
				onClose();
			}
			const sessionGroups = tree.groups;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: "分享 DSH 会话",
				description: "把本机一个 DSH 会话打包上传，社区成员可「克隆到会话」还原出同样的会话。",
				closeLabel: "关闭",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || sessionId.length === 0,
					onClick: () => void submitSession(),
					children: busy ? "处理中…" : "分享到本频道"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 10
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 10,
									maxHeight: 240,
									overflowY: "auto"
								},
								children: loadingTree ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingHint, { text: "正在读取本机会话…" }) : sessionGroups.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										...smallText,
										fontSize: 14
									},
									children: "没有可分享的本机会话。"
								}) : sessionGroups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										flexDirection: "column",
										gap: 4
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										title: group.cwd,
										style: {
											fontSize: 14,
											fontWeight: 650,
											color: palette.muted,
											letterSpacing: "0.04em"
										},
										children: group.label
									}), group.sessions.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										onClick: () => selectSession(row),
										title: row.id,
										style: {
											...pillStyle(row.id === sessionId),
											display: "flex",
											alignItems: "center",
											gap: 6,
											textAlign: "left",
											overflow: "hidden"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												flex: 1,
												minWidth: 0,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap"
											},
											children: row.title
										}), sessionHint(row).length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												...smallText,
												flex: "0 0 auto",
												fontSize: 12
											},
											children: sessionHint(row)
										}) : null]
									}, row.id))]
								}, group.key))
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							value: title,
							onChange: (e) => setTitle(e.target.value),
							placeholder: "分享标题（默认用会话名，可修改）"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							value: summary,
							onChange: (e) => setSummary(e.target.value),
							placeholder: "一句话摘要（可选）"
						})
					]
				})
			});
		}
		const shareCardStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			marginTop: 6,
			padding: "8px 10px",
			maxWidth: 380,
			borderRadius: 10,
			background: palette.inputBg,
			border: `1px solid ${palette.border}`,
			cursor: "pointer",
			textAlign: "left"
		};
		const shareCardBadge = {
			flex: "0 0 auto",
			fontSize: 14,
			fontWeight: 650,
			color: palette.accent,
			background: palette.elevated,
			border: `1px solid ${palette.border}`,
			borderRadius: 6,
			padding: "2px 6px",
			letterSpacing: "0.02em"
		};
		/** 消息内嵌分享卡片：点击打开详情弹窗（可在弹窗里克隆到本地会话） */
		function ShareCardView({ card }) {
			const [open, setOpen] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => setOpen(true),
				title: "查看分享详情",
				style: shareCardStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: shareCardBadge,
						children: "DSH 会话"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							minWidth: 0,
							display: "flex",
							flexDirection: "column",
							gap: 2
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 14,
								fontWeight: 600,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: card.title
						}), card.summary ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								...smallText,
								fontSize: 14,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: card.summary
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							...smallText,
							fontSize: 14,
							flex: "0 0 auto"
						},
						children: "查看"
					})
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShareCardModal, {
				open,
				onClose: () => setOpen(false),
				card
			})] });
		}
		/** 分享详情弹窗：展示分享信息；可一键克隆到本地会话 */
		function ShareCardModal({ open, onClose, card }) {
			const [detail, setDetail] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [action, setAction] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!open) return;
				let cancelled = false;
				setLoading(true);
				setDetail(null);
				getShareInfo(card.shareId).then((res) => {
					if (cancelled) return;
					setDetail(res);
					setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [open, card.shareId]);
			async function download() {
				if (busy) return;
				setBusy(true);
				setAction("download");
				const url = await shareDownloadUrl(card.shareId);
				setBusy(false);
				setAction(null);
				if (url) window.open(url, "_blank", "noopener");
			}
			async function clone() {
				if (busy) return;
				setBusy(true);
				setAction("clone");
				const ok = await cloneShareToSession(card.shareId);
				setBusy(false);
				setAction(null);
				if (ok) onClose();
			}
			const eventCount = typeof detail?.manifest.eventCount === "number" ? detail.manifest.eventCount : null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: "DSH 会话分享",
				closeLabel: "关闭",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					disabled: busy,
					onClick: () => void download(),
					children: action === "download" ? "获取中…" : "下载包体"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || loading,
					onClick: () => void clone(),
					children: action === "clone" ? "处理中…" : "克隆到本地的会话"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 10
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: shareCardBadge,
								children: "DSH 会话"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 14,
									fontWeight: 650
								},
								children: card.title
							})]
						}),
						card.summary ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...smallText,
								fontSize: 14
							},
							children: card.summary
						}) : null,
						loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingHint, {
							text: "加载分享信息…",
							padding: "10px 2px"
						}) : detail ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								...smallText,
								fontSize: 14,
								lineHeight: 1.9
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: ["分享者：@", detail.author.handle] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: ["时间：", timeLabel(detail.createdAt)] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: ["大小：", formatBytes(detail.sizeBytes)] }),
								eventCount !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: ["会话事件数：", eventCount] }) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: ["下载次数：", detail.downloadCount] })
							]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...smallText,
								fontSize: 14
							},
							children: "克隆会在你的 DSH 里新建一个会话并切过去，不影响原会话。"
						})
					]
				})
			});
		}
		//#endregion
		//#region packages/client/src/components/MessageRow.tsx
		/** 回复（引用）小图标：拐角返回箭头，随按钮颜色 */
		function ReplyGlyph() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2.2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9 14L4 9l5-5" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5V19" })]
			});
		}
		/** 置顶小图标（宿主 primitives 没有 pin 图标，与 ReplyGlyph 一样画一个） */
		function PinGlyph({ size = 14 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 17v5" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9 3h6l-1 6 3.5 3.5H6.5L10 9 9 3z" })]
			});
		}
		const fileChip = {
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			padding: "5px 9px",
			borderRadius: 8,
			border: `1px solid ${palette.border}`,
			background: palette.inputBg,
			color: palette.text,
			fontSize: 14,
			textDecoration: "none",
			maxWidth: 260
		};
		function AttachmentList({ attachments }) {
			const list = attachments ?? [];
			if (list.length === 0) return null;
			const images = list.filter((a) => a.kind === "image");
			const files = list.filter((a) => a.kind !== "image");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 8,
					marginTop: 6
				},
				children: [images.map((a) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
					href: a.url,
					target: "_blank",
					rel: "noreferrer",
					title: a.name,
					style: {
						display: "block",
						borderRadius: 10,
						overflow: "hidden"
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						src: a.url,
						alt: a.name,
						loading: "lazy",
						style: {
							display: "block",
							maxHeight: 240,
							maxWidth: 320,
							borderRadius: 10,
							border: `1px solid ${palette.border}`,
							background: palette.inputBg
						}
					})
				}, a.url)), files.map((a) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
					href: `${a.url}?download=1`,
					title: "点击下载",
					style: fileChip,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								color: palette.muted,
								display: "inline-flex"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, {})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: a.name
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								...smallText,
								fontSize: 14,
								flex: "0 0 auto"
							},
							children: formatBytes(a.size)
						})
					]
				}, a.url))]
			});
		}
		/** hover 操作条里的快捷回应：不展开表情面板，单击即切换 */
		const QUICK_REACTIONS = [
			"👍",
			"❤️",
			"😂",
			"🎉"
		];
		/** 快捷回应按钮：我投过的用品牌色淡底高亮 */
		function quickReactionStyle(mine) {
			return {
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				height: 24,
				minWidth: 24,
				padding: "0 3px",
				fontSize: 15,
				lineHeight: 1,
				cursor: "pointer",
				borderRadius: 6,
				border: "none",
				background: mine ? palette.hoverAccent : "transparent"
			};
		}
		/** 回应小胶囊：我投过的用品牌色描边高亮 */
		function reactionChipStyle(mine) {
			return {
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				padding: "1px 7px",
				borderRadius: 999,
				fontSize: 14,
				fontWeight: 600,
				cursor: "pointer",
				border: `1px solid ${mine ? palette.accent : palette.border}`,
				background: mine ? palette.hoverAccent : palette.inputBg,
				color: mine ? palette.accent : palette.muted
			};
		}
		/** 消息底部的一排回应：表情 + 计数，点击切换自己的回应 */
		function ReactionRow({ item }) {
			const reactions = item.reactions ?? [];
			const [busyEmoji, setBusyEmoji] = (0, react.useState)(null);
			if (reactions.length === 0) return null;
			async function react$1(emoji) {
				if (busyEmoji !== null) return;
				setBusyEmoji(emoji);
				await toggleReaction(item, emoji);
				setBusyEmoji(null);
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 4,
					marginTop: 6
				},
				children: reactions.map((reaction) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					disabled: busyEmoji !== null,
					onClick: () => void react$1(reaction.emoji),
					title: reaction.me ? `取消回应 ${reaction.emoji}` : `回应 ${reaction.emoji}`,
					style: reactionChipStyle(reaction.me),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 14,
							lineHeight: 1.2
						},
						children: busyEmoji === reaction.emoji ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 12 }) : reaction.emoji
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: reaction.count })]
				}, reaction.emoji))
			});
		}
		function MessageRow({ item, onCreateThread }) {
			const talk = useTalkState();
			const [editing, setEditing] = (0, react.useState)(false);
			const [reactionOpen, setReactionOpen] = (0, react.useState)(false);
			const [draftText, setDraftText] = (0, react.useState)(item.content);
			const [savingEdit, setSavingEdit] = (0, react.useState)(false);
			const [removing, setRemoving] = (0, react.useState)(false);
			const [pinning, setPinning] = (0, react.useState)(false);
			const [reacting, setReacting] = (0, react.useState)(null);
			const mine = talk.me !== null && item.authorId === talk.me.id;
			const mentionedMe = (item.mentions ?? []).includes(talk.me?.id ?? "");
			const focused = talk.view.focusMessageId === item.id;
			const allowEdit = canEditMessage(item);
			const allowRetract = canRetractMessage(item);
			const quote = item.replyTo ? replyParts(item) : null;
			const channelOf = talk.view.community?.channels.find((c) => c.id === item.channelId);
			const channelPerms = channelOf ? channelPermissions(channelOf.id) : 0;
			const canReplyHere = (channelPerms & Permission.SEND_MESSAGES) !== 0;
			const canThreadHere = item.threadId === null && channelOf?.kind === "text" && (channelPerms & Permission.CREATE_THREAD) !== 0;
			async function saveEdit() {
				if (savingEdit) return;
				setSavingEdit(true);
				try {
					await updateMessage(item.id, draftText);
					setEditing(false);
				} catch {} finally {
					setSavingEdit(false);
				}
			}
			/** 撤回（自己的消息，2 分钟内）或删除（owner/admin） */
			async function remove() {
				if (removing) return;
				if (!await askConfirm(mine ? {
					title: "撤回这条消息",
					message: "撤回后消息将从频道移除，2 分钟内可撤回，超过 2 分钟只能编辑。",
					confirmLabel: "撤回",
					danger: true
				} : {
					title: "删除这条消息",
					message: "删除后消息将从频道永久移除，且无法恢复。",
					confirmLabel: "删除",
					danger: true
				})) return;
				setRemoving(true);
				try {
					await deleteMessage(item.id);
				} catch {} finally {
					setRemoving(false);
				}
			}
			/** 置顶 / 取消置顶 */
			async function togglePin() {
				if (pinning) return;
				setPinning(true);
				await setMessagePinned(item, item.pinnedAt === null);
				setPinning(false);
			}
			/** 快捷回应 / 表情面板回应 */
			async function react$2(emoji) {
				if (reacting !== null) return;
				setReacting(emoji);
				await toggleReaction(item, emoji);
				setReacting(null);
			}
			async function jumpQuote() {
				const target = item.replyTo;
				if (!target) return;
				if (!await revealMessage(item.channelId, target.id, target.threadId ?? null)) notify("被引用的消息较旧，未能定位");
			}
			function onEditKeyDown(e) {
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					saveEdit();
				} else if (e.key === "Escape") {
					setDraftText(item.content);
					setEditing(false);
				}
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `dsht-msg-row${mentionedMe ? " is-mentioned" : ""}${focused ? " is-focus" : ""}`,
				"data-msg-id": item.id,
				style: msgRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
						size: 38,
						label: item.author.handle,
						src: item.author.avatarUrl
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							flex: 1,
							minWidth: 0
						},
						children: [
							quote ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => void jumpQuote(),
								title: `跳转到 ${quote.author} 的消息`,
								style: {
									display: "flex",
									alignItems: "center",
									gap: 6,
									maxWidth: "100%",
									border: "none",
									background: "transparent",
									padding: "1px 0",
									margin: "0 0 2px",
									cursor: "pointer",
									color: palette.muted,
									fontSize: 14,
									textAlign: "left",
									overflow: "hidden"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											color: palette.accent,
											display: "inline-flex",
											flex: "0 0 auto"
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReplyGlyph, {})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											flex: "0 0 auto",
											fontWeight: 600,
											color: palette.accent,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											maxWidth: 150
										},
										children: quote.author
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											flex: 1,
											minWidth: 0,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap"
										},
										children: quote.content
									})
								]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "baseline",
									gap: 8
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 14,
											fontWeight: 600
										},
										children: item.author.displayName ?? item.author.handle
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { fontSize: 14 },
										children: mine ? "" : `@${item.author.handle}`
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											...smallText,
											fontSize: 14
										},
										children: timeLabel(item.createdAt)
									}),
									item.pinnedAt !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											fontSize: 14,
											color: palette.accent,
											display: "inline-flex",
											alignItems: "center",
											gap: 3
										},
										title: "这条消息已被置顶",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PinGlyph, { size: 12 }), "已置顶"]
									}) : null,
									mentionedMe ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 14,
											color: palette.accent
										},
										children: "@了你"
									}) : null,
									item.updatedAt ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											...smallText,
											fontSize: 14
										},
										children: "(已编辑)"
									}) : null
								]
							}),
							editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								value: draftText,
								onChange: (e) => setDraftText(e.target.value),
								onKeyDown: onEditKeyDown,
								style: textAreaEdit
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Markdown, {
								text: item.content,
								selfHandle: talk.me?.handle ?? ""
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AttachmentList, { attachments: item.attachments ?? [] }),
							item.shareCard ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShareCardView, { card: item.shareCard }) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReactionRow, { item })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `dsht-msg-actions${editing || reactionOpen ? " is-open" : ""}`,
						style: msgChip,
						children: editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "ghost",
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {}),
							disabled: savingEdit,
							onClick: () => setEditing(false),
							"aria-label": "取消编辑"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "ghost",
							icon: savingEdit ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {}),
							disabled: savingEdit,
							onClick: () => void saveEdit(),
							"aria-label": savingEdit ? "保存中" : "保存"
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmojiPopover, {
								open: reactionOpen,
								onOpenChange: setReactionOpen,
								onPick: (emoji) => void react$2(emoji),
								size: "sm",
								align: "right",
								label: "添加表情回应",
								title: "添加表情回应",
								disabled: reacting !== null
							}),
							QUICK_REACTIONS.map((emoji) => {
								const reacted = (item.reactions ?? []).some((r) => r.emoji === emoji && r.me);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsht-quick-react",
									disabled: reacting !== null,
									onClick: () => void react$2(emoji),
									title: reacted ? `取消回应 ${emoji}` : `回应 ${emoji}`,
									"aria-label": reacted ? `取消回应 ${emoji}` : `回应 ${emoji}`,
									style: quickReactionStyle(reacted),
									children: reacting === emoji ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 12 }) : emoji
								}, emoji);
							}),
							canReplyHere ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReplyGlyph, {}),
								onClick: () => replyToMessage(item),
								"aria-label": "回复",
								title: "回复这条消息"
							}) : null,
							canThreadHere && onCreateThread ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {}),
								onClick: () => onCreateThread(item),
								"aria-label": "创建讨论组",
								title: "以此为话题创建讨论组"
							}) : null,
							canPinMessages() ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: pinning ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PinGlyph, {}),
								disabled: pinning,
								onClick: () => void togglePin(),
								"aria-label": item.pinnedAt === null ? "置顶" : "取消置顶",
								title: item.pinnedAt === null ? "置顶这条消息" : "取消置顶"
							}) : null,
							allowEdit ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {}),
								onClick: () => setEditing(true),
								"aria-label": "编辑",
								title: "编辑消息"
							}) : null,
							allowRetract ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: removing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),
								disabled: removing,
								onClick: () => void remove(),
								"aria-label": removing ? "处理中" : mine ? "撤回" : "删除",
								title: mine ? "撤回消息（2 分钟内）" : "删除消息"
							}) : null
						] })
					})
				]
			});
		}
		//#endregion
		//#region packages/client/src/components/SearchModals.tsx
		const TIME_RANGE_OPTIONS = [
			{
				value: "all",
				label: "不限时间"
			},
			{
				value: "24h",
				label: "最近 24 小时"
			},
			{
				value: "7d",
				label: "最近 7 天"
			},
			{
				value: "30d",
				label: "最近 30 天"
			}
		];
		const TIME_RANGE_MS = {
			"24h": 864e5,
			"7d": 6048e5,
			"30d": 2592e6
		};
		const filterSelect = {
			flex: "1 1 0",
			minWidth: 0,
			padding: "5px 6px",
			borderRadius: 8,
			border: `1px solid ${palette.border}`,
			background: palette.inputBg,
			color: palette.text,
			fontSize: 14
		};
		/** 高亮命中关键词（不区分大小写） */
		function highlightMatch(text, keyword) {
			const kw = keyword.trim().toLowerCase();
			if (kw.length === 0) return text;
			const lower = text.toLowerCase();
			const nodes = [];
			let cursor = 0;
			while (cursor < text.length) {
				const at = lower.indexOf(kw, cursor);
				if (at < 0) {
					nodes.push(text.slice(cursor));
					break;
				}
				if (at > cursor) nodes.push(text.slice(cursor, at));
				nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						background: palette.highlightBg,
						borderRadius: 3,
						padding: "0 1px"
					},
					children: text.slice(at, at + kw.length)
				}, `${at}-${kw}`));
				cursor = at + kw.length;
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: nodes });
		}
		/** 消息搜索弹窗：社区内按正文关键词搜索，命中可一键跳到对应频道定位 */
		function SearchMessagesModal({ open, onClose }) {
			const talk = useTalkState();
			const [q, setQ] = (0, react.useState)("");
			const [channelId, setChannelId] = (0, react.useState)("");
			const [authorId, setAuthorId] = (0, react.useState)("");
			const [range, setRange] = (0, react.useState)("all");
			const [mentionsMe, setMentionsMe] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [ran, setRan] = (0, react.useState)(false);
			const [items, setItems] = (0, react.useState)([]);
			const [nextCursor, setNextCursor] = (0, react.useState)(null);
			const [loadingMore, setLoadingMore] = (0, react.useState)(false);
			const [openingId, setOpeningId] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (open) {
					setQ("");
					setChannelId("");
					setAuthorId("");
					setRange("all");
					setMentionsMe(false);
					setItems([]);
					setNextCursor(null);
					setRan(false);
					setBusy(false);
					setLoadingMore(false);
				}
			}, [open]);
			/** 收集当前筛选条件（空条件不发，交由 server 只按关键词或直接拒绝全空查询） */
			function buildFilters() {
				const filters = {};
				if (channelId) filters.channelId = channelId;
				if (authorId) filters.authorId = authorId;
				if (range !== "all") filters.from = Date.now() - TIME_RANGE_MS[range];
				if (mentionsMe) filters.mentionsMe = true;
				return filters;
			}
			async function run(append) {
				const keyword = q.trim();
				const filters = buildFilters();
				if (keyword.length === 0 && Object.keys(filters).length === 0) return;
				if (append) {
					if (loadingMore || nextCursor === null) return;
					setLoadingMore(true);
				} else {
					if (busy) return;
					setBusy(true);
					setRan(true);
				}
				const page = await searchCommunityMessages(keyword, append && nextCursor ? nextCursor : void 0, filters);
				if (page) {
					setItems((prev) => append ? [...prev, ...page.items] : page.items);
					setNextCursor(page.nextCursor);
				}
				setBusy(false);
				setLoadingMore(false);
			}
			async function openHit(hit) {
				if (openingId !== null) return;
				setOpeningId(hit.id);
				const ok = await revealMessage(hit.channelId, hit.id, hit.thread?.id ?? null);
				setOpeningId(null);
				if (ok) onClose();
				else notify("该消息较旧，未能定位（可去对应频道向上加载更早消息）");
			}
			const keyword = q.trim();
			const channels = talk.view.community?.channels ?? [];
			const members = talk.view.members;
			const hasFilter = channelId !== "" || authorId !== "" || range !== "all" || mentionsMe;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: "搜索消息",
				closeLabel: "关闭",
				description: "按正文关键词搜索本社区消息，可用频道 / 作者 / 时间 / 仅 @我 收窄范围；命中结果可一键跳转定位。",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 8,
						minWidth: 340,
						minHeight: 160
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								value: q,
								onChange: (e) => setQ(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										run(false);
									}
								},
								placeholder: "搜索关键词（可留空，仅用筛选）"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								disabled: busy || keyword.length === 0 && !hasFilter,
								onClick: () => void run(false),
								children: busy ? "搜索中…" : "搜索"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 6,
								alignItems: "center"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": "按频道筛选",
									style: filterSelect,
									value: channelId,
									onChange: (e) => setChannelId(e.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "全部频道"
									}), channels.map((ch) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: ch.id,
										children: ["#", ch.name]
									}, ch.id))]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": "按作者筛选",
									style: filterSelect,
									value: authorId,
									onChange: (e) => setAuthorId(e.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "所有人"
									}), members.map((m) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: m.userId,
										children: m.displayName ?? m.handle
									}, m.userId))]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									"aria-label": "按时间范围筛选",
									style: filterSelect,
									value: range,
									onChange: (e) => setRange(e.target.value),
									children: TIME_RANGE_OPTIONS.map((opt) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: opt.value,
										children: opt.label
									}, opt.value))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: mentionsMe ? "primary" : "ghost",
									"aria-pressed": mentionsMe,
									onClick: () => setMentionsMe((prev) => !prev),
									children: "仅 @我"
								})
							]
						}),
						ran && !busy && items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...emptyMsg,
								padding: "26px 8px"
							},
							children: keyword.length > 0 ? `没有匹配「${keyword}」的消息` : "没有符合条件的消息"
						}) : !ran && items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...emptyMsg,
								padding: "26px 8px"
							},
							children: "输入关键词或选择筛选条件搜索整个社区，点击结果可跳到对应频道定位。"
						}) : null,
						items.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 4,
								maxHeight: 330,
								overflowY: "auto"
							},
							children: [items.map((hit) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								disabled: openingId !== null,
								onClick: () => void openHit(hit),
								style: {
									display: "block",
									width: "100%",
									border: "none",
									background: "transparent",
									borderRadius: 10,
									padding: "7px 10px",
									cursor: "pointer",
									textAlign: "left"
								},
								onMouseEnter: (e) => {
									e.currentTarget.style.background = palette.hover;
								},
								onMouseLeave: (e) => {
									e.currentTarget.style.background = "transparent";
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 6
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { color: palette.muted },
											children: "#"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												fontSize: 14,
												fontWeight: 600,
												color: palette.text
											},
											children: hit.channel.name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												...smallText,
												fontSize: 14
											},
											children: timeLabel(hit.createdAt)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												marginLeft: "auto",
												fontSize: 14,
												color: palette.muted,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap"
											},
											children: hit.author.displayName ?? hit.author.handle
										}),
										openingId === hit.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												display: "inline-flex",
												flex: "0 0 auto",
												color: palette.muted
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 })
										}) : null
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										marginTop: 3,
										fontSize: 14,
										lineHeight: 1.5,
										color: palette.muted,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: highlightMatch(hit.content.length > 180 ? `${hit.content.slice(0, 180)}…` : hit.content, keyword)
								})]
							}, hit.id)), nextCursor ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								onClick: () => void run(true),
								disabled: loadingMore,
								children: loadingMore ? "加载中…" : "加载更多"
							}) : null]
						}) : null
					]
				})
			});
		}
		//#endregion
		//#region packages/client/src/components/ChatPane.tsx
		/** 「张三 正在输入…」/「张三、李四 正在输入…」/「张三 等 3 人正在输入…」 */
		function typingLabel(members) {
			const names = members.map((m) => m.displayName ?? m.handle);
			if (names.length === 1) return `${names[0]} 正在输入…`;
			if (names.length === 2) return `${names[0]}、${names[1]} 正在输入…`;
			return `${names[0]} 等 ${names.length} 人正在输入…`;
		}
		/**
		* 置顶消息面板：列出当前房间（主频道或讨论组）的置顶消息，点击定位到原消息；
		* 持有 MANAGE_MESSAGES 时可就地取消置顶。
		*/
		function PinnedMessagesModal({ open, onClose }) {
			const talk = useTalkState();
			const [items, setItems] = (0, react.useState)(null);
			const [unpinningId, setUnpinningId] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!open) return;
				setItems(null);
				let alive = true;
				loadPinnedMessages().then((list) => {
					if (alive) setItems(list);
				});
				return () => {
					alive = false;
				};
			}, [open]);
			async function unpin(item) {
				if (unpinningId !== null) return;
				setUnpinningId(item.id);
				await setMessagePinned(item, false);
				setUnpinningId(null);
				setItems((prev) => (prev ?? []).filter((x) => x.id !== item.id));
			}
			async function jump(item) {
				onClose();
				if (!await revealMessage(item.channelId, item.id, item.threadId)) notify("该置顶消息较旧，未能定位");
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: "置顶消息",
				closeLabel: "关闭",
				description: talk.view.threadId ? "本讨论组的置顶消息" : "本频道的置顶消息",
				children: items === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						...smallText,
						fontSize: 14,
						padding: "10px 2px"
					},
					children: "加载中…"
				}) : items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						...smallText,
						fontSize: 14,
						padding: "10px 2px"
					},
					children: "还没有置顶消息。把鼠标移到消息上，点置顶图标即可固定在这里。"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 6
					},
					children: items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "flex-start",
							gap: 8,
							border: `1px solid ${palette.border}`,
							background: palette.inputBg,
							borderRadius: 10,
							padding: "8px 10px"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => void jump(item),
							title: "跳转到这条消息",
							style: {
								flex: 1,
								minWidth: 0,
								border: "none",
								background: "transparent",
								padding: 0,
								textAlign: "left",
								cursor: "pointer",
								color: palette.text
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "baseline",
									gap: 8
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 14,
										fontWeight: 600
									},
									children: item.author.displayName ?? item.author.handle
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										...smallText,
										fontSize: 14
									},
									children: timeLabel(item.pinnedAt ?? item.createdAt)
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: 14,
									color: palette.muted,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: item.content.trim().length > 0 ? item.content : "（无正文）"
							})]
						}), canPinMessages() ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "ghost",
							icon: unpinningId === item.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PinGlyph, {}),
							disabled: unpinningId !== null,
							onClick: () => void unpin(item),
							"aria-label": "取消置顶",
							title: "取消置顶"
						}) : null]
					}, item.id))
				})
			});
		}
		function ChatPane({ onCreateThread }) {
			const talk = useTalkState();
			const channelId = talk.view.channelId;
			const community = talk.view.community;
			const channel = channelId ? community?.channels.find((c) => c.id === channelId) ?? null : null;
			const messageCount = talk.view.messages.length;
			const scrollRef = (0, react.useRef)(null);
			const contentRef = (0, react.useRef)(null);
			const channelRef = (0, react.useRef)(null);
			const pinnedRef = (0, react.useRef)(true);
			const lastCountRef = (0, react.useRef)(0);
			const [pendingFiles, setPendingFiles] = (0, react.useState)([]);
			const fileInputRef = (0, react.useRef)(null);
			const MAX_ATTACH = 4;
			const [shareOpen, setShareOpen] = (0, react.useState)(false);
			const [membersOpen, setMembersOpen] = (0, react.useState)(true);
			const composerRef = (0, react.useRef)(null);
			const [composerText, setComposerText] = (0, react.useState)("");
			const [emojiOpen, setEmojiOpen] = (0, react.useState)(false);
			const [searchOpen, setSearchOpen] = (0, react.useState)(false);
			const [mentionActive, setMentionActive] = (0, react.useState)(false);
			const [mentionQuery, setMentionQuery] = (0, react.useState)("");
			const [mentionIndex, setMentionIndex] = (0, react.useState)(0);
			const mentionStartRef = (0, react.useRef)(-1);
			const [threadMembersOpen, setThreadMembersOpen] = (0, react.useState)(false);
			const [threadSettingsOpen, setThreadSettingsOpen] = (0, react.useState)(false);
			const [pinnedOpen, setPinnedOpen] = (0, react.useState)(false);
			const [dragging, setDragging] = (0, react.useState)(false);
			const [threadBusy, setThreadBusy] = (0, react.useState)(false);
			const threadId = talk.view.threadId;
			const roomKey = threadId ?? channelId;
			const currentThread = channelId && threadId ? talk.view.community?.threads.find((t) => t.id === threadId) ?? null : null;
			const isThread = currentThread !== null;
			const isForumChannel = (channel?.kind ?? "text") === "forum";
			/** 话题频道的主面板 = 话题板（列表）；打开某条话题后才是聊天视图 */
			const isForumBoard = isForumChannel && !isThread;
			/** 与 @mentionQuery 匹配的候选成员（不含自己，最多 8 个） */
			const mentionCandidates = mentionActive ? talk.view.members.filter((m) => m.userId !== talk.me?.id).filter((m) => m.handle.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8) : [];
			/** 回复目标（composer 提示条）展示信息 */
			const replyingPreview = talk.view.replyingTo ? replyParts({ replyTo: talk.view.replyingTo }) : null;
			const channelPerms = channel ? channelPermissions(channel.id) : 0;
			const canPost = (channelPerms & Permission.SEND_MESSAGES) !== 0;
			const canCreateThread = (channelPerms & Permission.CREATE_THREAD) !== 0;
			/** 能否管理当前讨论组（发起人或持有社区 MANAGE_THREADS） */
			const canManageThread = currentThread !== null && (currentThread.createdBy === talk.me?.id || canManageThreads());
			/** 在主频道头部开一个空白讨论组（弹窗由 HomeScreen 承载） */
			function openBlankThread() {
				if (channelId) onCreateThread(channelId, null);
			}
			/** 从某条消息发起讨论组（自动用消息摘要取名） */
			function openThreadFromMessage(item) {
				const raw = item.content.replace(/\s+/g, " ").trim();
				const name = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw || "话题讨论";
				if (channelId) onCreateThread(channelId, {
					name,
					starterMessageId: item.id
				});
			}
			/** 归档 / 恢复当前讨论组 */
			async function toggleThreadArchive() {
				if (!currentThread || threadBusy) return;
				setThreadBusy(true);
				await setThreadArchived(currentThread.id, currentThread.status === "active");
				setThreadBusy(false);
			}
			function onScroll(event) {
				const el = event.currentTarget;
				pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
			}
			(0, react.useLayoutEffect)(() => {
				const el = scrollRef.current;
				if (!el) return;
				const switched = channelRef.current !== roomKey;
				channelRef.current = roomKey;
				if (switched) {
					lastCountRef.current = messageCount;
					el.scrollTop = el.scrollHeight;
					pinnedRef.current = true;
					return;
				}
				const grew = messageCount > lastCountRef.current;
				lastCountRef.current = messageCount;
				if (grew && pinnedRef.current) el.scrollTop = el.scrollHeight;
			}, [roomKey, messageCount]);
			(0, react.useEffect)(() => {
				const el = scrollRef.current;
				const content = contentRef.current;
				if (!el || !content || typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(() => {
					if (pinnedRef.current) el.scrollTop = el.scrollHeight;
				});
				observer.observe(content);
				return () => observer.disconnect();
			}, [roomKey]);
			(0, react.useEffect)(() => {
				setComposerText("");
				setEmojiOpen(false);
				setMentionActive(false);
				setMentionQuery("");
				setMentionIndex(0);
				mentionStartRef.current = -1;
			}, [roomKey]);
			(0, react.useEffect)(() => {
				if (talk.view.replyingTo) composerRef.current?.focus();
			}, [talk.view.replyingTo]);
			(0, react.useEffect)(() => {
				const targetId = talk.view.focusMessageId;
				if (!targetId) return;
				const el = scrollRef.current?.querySelector(`[data-msg-id="${targetId}"]`);
				if (el) {
					pinnedRef.current = false;
					el.scrollIntoView({
						block: "center",
						behavior: "smooth"
					});
				}
				const timer = window.setTimeout(() => clearMessageFocus(), 1800);
				return () => window.clearTimeout(timer);
			}, [talk.view.focusMessageId]);
			if (!channelId) return null;
			/** 追加待发送附件（选择器 / 粘贴 / 拖拽共用；超出上限时保留靠前的） */
			function addFiles(picked) {
				if (picked.length === 0) return;
				setPendingFiles((prev) => {
					const room = MAX_ATTACH - prev.length;
					if (room <= 0) {
						notify(`一条消息最多 ${MAX_ATTACH} 个附件`);
						return prev;
					}
					if (picked.length > room) notify(`一条消息最多 ${MAX_ATTACH} 个附件，已保留前 ${room} 个`);
					return [...prev, ...picked].slice(0, MAX_ATTACH);
				});
			}
			function pickFiles(event) {
				const picked = event.target.files ? Array.from(event.target.files) : [];
				event.target.value = "";
				addFiles(picked);
			}
			/** 粘贴：剪贴板里带文件（截图等）时直接作为待发送附件 */
			function onComposerPaste(event) {
				const files = Array.from(event.clipboardData?.files ?? []);
				if (files.length === 0) return;
				event.preventDefault();
				addFiles(files);
			}
			/** 拖拽文件到输入区：仅接管文件类型，文本拖拽保持浏览器默认行为 */
			function onComposerDragOver(event) {
				if (!canPost || !Array.from(event.dataTransfer.types).includes("Files")) return;
				event.preventDefault();
				setDragging(true);
			}
			function onComposerDrop(event) {
				if (!canPost) return;
				event.preventDefault();
				setDragging(false);
				addFiles(Array.from(event.dataTransfer.files ?? []));
			}
			function removePending(index) {
				setPendingFiles((prev) => prev.filter((_, i) => i !== index));
			}
			/** 光标前是否存在正在输入的 `@handle`，返回 token 起点与已输入部分 */
			function mentionAtCaret(text, caret) {
				if (caret < 1) return null;
				let i = caret - 1;
				while (i >= 0 && /[\p{L}\p{N}_]/u.test(text.charAt(i))) i -= 1;
				if (i < 0 || text.charAt(i) !== "@") return null;
				if (i > 0 && /[\p{L}\p{N}_]/u.test(text.charAt(i - 1))) return null;
				return {
					start: i,
					query: text.slice(i + 1, caret)
				};
			}
			/** 把选中的成员插入正文，替换掉当前 @token */
			function acceptMention(member) {
				const text = composerText;
				const caret = composerRef.current?.selectionStart ?? text.length;
				const start = mentionStartRef.current >= 0 ? mentionStartRef.current : Math.max(0, caret - mentionQuery.length - 1);
				const next = `${text.slice(0, start)}@${member.handle} ${text.slice(caret)}`;
				setComposerText(next);
				setMentionActive(false);
				setMentionQuery("");
				mentionStartRef.current = -1;
				const caretAfter = start + member.handle.length + 2;
				const el = composerRef.current;
				if (el) window.requestAnimationFrame(() => {
					el.focus();
					el.setSelectionRange(caretAfter, caretAfter);
				});
			}
			function handleComposerChange(value) {
				setComposerText(value);
				if (value.trim().length > 0) notifyTyping();
				const hit = mentionAtCaret(value, composerRef.current?.selectionStart ?? value.length);
				if (hit) {
					mentionStartRef.current = hit.start;
					setMentionQuery(hit.query);
					setMentionIndex(0);
					setMentionActive(true);
				} else {
					mentionStartRef.current = -1;
					setMentionActive(false);
				}
			}
			/** 把表情插入输入框光标处（有选区时替换选区），并把光标移到表情之后 */
			function insertEmoji(emoji) {
				const el = composerRef.current;
				const start = el?.selectionStart ?? composerText.length;
				const end = el?.selectionEnd ?? start;
				setComposerText(`${composerText.slice(0, start)}${emoji}${composerText.slice(end)}`);
				if (el) {
					const caret = start + emoji.length;
					window.requestAnimationFrame(() => {
						el.focus();
						el.setSelectionRange(caret, caret);
					});
				}
			}
			function handleComposerKeyDown(e) {
				const choosing = mentionActive && mentionCandidates.length > 0;
				if (choosing && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
					e.preventDefault();
					const delta = e.key === "ArrowDown" ? 1 : -1;
					setMentionIndex((i) => (i + delta + mentionCandidates.length) % mentionCandidates.length);
					return;
				}
				if (choosing && (e.key === "Enter" || e.key === "Tab")) {
					e.preventDefault();
					const pick = mentionCandidates[mentionIndex];
					if (pick) acceptMention(pick);
					return;
				}
				if (mentionActive && e.key === "Escape") {
					e.preventDefault();
					setMentionActive(false);
					return;
				}
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					submit();
				}
			}
			async function submit() {
				const text = composerText;
				if (text.trim().length === 0 && pendingFiles.length === 0) return;
				if (await sendMessage(text, pendingFiles)) {
					setComposerText("");
					setPendingFiles([]);
					setEmojiOpen(false);
					setMentionActive(false);
					mentionStartRef.current = -1;
					composerRef.current?.focus();
				}
			}
			/** 从右侧成员面板把 @handle 插入输入框（光标处已有 @token 时替换之） */
			function insertMentionHandle(handle) {
				const el = composerRef.current;
				const caret = el?.selectionStart ?? composerText.length;
				const hit = mentionAtCaret(composerText, caret);
				const start = hit ? hit.start : caret;
				const next = `${composerText.slice(0, start)}@${handle} ${composerText.slice(caret)}`;
				setComposerText(next);
				setMentionActive(false);
				setMentionQuery("");
				mentionStartRef.current = -1;
				const caretAfter = start + handle.length + 2;
				if (el) window.requestAnimationFrame(() => {
					el.focus();
					el.setSelectionRange(caretAfter, caretAfter);
				});
			}
			const hasOlder = talk.view.nextCursor !== null;
			const canLoadMore = !talk.view.loadingOlder && hasOlder;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: chatCol,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "10px 16px",
							borderBottom: `1px solid ${palette.border}`
						},
						children: [
							isThread && currentThread ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {}),
								onClick: () => void closeThread(),
								"aria-label": isForumChannel ? "返回话题列表" : "返回主频道",
								title: isForumChannel ? "返回话题列表" : `返回 #${channel?.name ?? ""}`
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									width: 24,
									height: 22,
									borderRadius: 6,
									background: palette.inputBg,
									border: `1px solid ${palette.border}`,
									flex: "0 0 auto"
								},
								children: isThread ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { color: palette.muted },
									children: "#"
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									minWidth: 0,
									flex: 1
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										fontSize: 16,
										fontWeight: 700,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: isThread ? currentThread?.name ?? (isForumChannel ? "话题" : "讨论组") : channel?.name ?? ""
								}), isThread ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										...smallText,
										fontSize: 14
									},
									children: [
										isForumChannel ? "话题" : "讨论组",
										currentThread?.status === "archived" ? "（已归档）" : "",
										" · 位于 #",
										channel?.name ?? ""
									]
								}) : channel?.topic ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										...smallText,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: channel.topic
								}) : null]
							}),
							isThread && currentThread?.visibility === "private" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutline16, {}),
								onClick: () => setThreadMembersOpen(true),
								"aria-label": "讨论组成员",
								title: "管理私密讨论组成员",
								children: "成员"
							}) : null,
							canManageThread ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {}),
								onClick: () => setThreadSettingsOpen(true),
								"aria-label": "讨论组设置",
								title: "改动讨论组：名称 / 可见性 / 进入密码"
							}) : null,
							isThread ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: threadBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : void 0,
								disabled: threadBusy,
								onClick: () => void toggleThreadArchive(),
								"aria-label": currentThread?.status === "active" ? "归档" : "恢复",
								title: isForumChannel ? currentThread?.status === "active" ? "归档话题（24h 无人回复也会自动归档）" : "把话题恢复为活跃" : currentThread?.status === "active" ? "手动归档（24h 无人发言也会自动归档）" : "把讨论组恢复为活跃",
								children: threadBusy ? "处理中…" : currentThread?.status === "active" ? "归档" : "恢复"
							}) : null,
							!isThread && canCreateThread ? isForumChannel ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {}),
								onClick: openBlankThread,
								children: "新建话题"
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {}),
								onClick: openBlankThread,
								"aria-label": "创建讨论组",
								title: "为当前频道开一个讨论组"
							}) : null,
							!isThread ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, {}),
								onClick: () => setSearchOpen(true),
								"aria-label": "搜索消息",
								title: "搜索社区内的消息"
							}) : null,
							!isForumBoard ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PinGlyph, {}),
								onClick: () => setPinnedOpen(true),
								"aria-label": "置顶消息",
								title: "查看置顶消息"
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									marginLeft: "auto",
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									flex: "0 0 auto"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "ghost",
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutline16, {}),
									onClick: () => setMembersOpen((v) => !v),
									"aria-label": "社区成员",
									title: "社区成员"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
										padding: "3px 8px",
										borderRadius: 999,
										background: talk.view.live ? palette.hover : palette.inputBg,
										border: `1px solid ${palette.border}`
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
										...liveDot,
										background: talk.view.live ? palette.success : palette.muted,
										boxShadow: talk.view.live ? `0 0 5px ${palette.success}` : void 0
									} }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 14,
											color: palette.muted
										},
										children: talk.view.live ? "实时" : "重连中…"
									})]
								})]
							})
						]
					}), isForumBoard ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ForumTopicBoard, {
						channelId,
						onNewTopic: openBlankThread
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: scrollRef,
						onScroll,
						style: messagesWrap,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							ref: contentRef,
							style: messagesContent,
							children: talk.view.messagesLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: { ...emptyMsg },
								children: "加载消息…"
							}) : talk.view.messages.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: { ...emptyMsg },
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center",
											width: 44,
											height: 44,
											borderRadius: 14,
											fontSize: 16,
											fontWeight: 700,
											color: palette.accent,
											background: palette.inputBg,
											border: `1px solid ${palette.border}`
										},
										children: "#"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 14,
											fontWeight: 600,
											color: palette.text
										},
										children: channel?.kind === "announcement" ? "暂无公告" : "还没有消息"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { fontSize: 14 },
										children: channel?.kind === "announcement" ? canPost ? "在这里发布面向全员的公告。" : "你没有在此频道发言的权限。" : canPost ? "来说第一句吧。" : "你没有在此频道发言的权限。"
									})
								]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [canLoadMore ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: creatorRow,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "ghost",
									onClick: () => void loadOlderMessages(),
									disabled: talk.view.loadingOlder,
									children: talk.view.loadingOlder ? "加载中…" : "加载更早消息"
								})
							}) : null, talk.view.messages.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageRow, {
								item,
								onCreateThread: openThreadFromMessage
							}, item.id))] })
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: dragging ? {
							...composerWrap,
							outline: `2px dashed ${palette.accent}`,
							borderRadius: 10
						} : composerWrap,
						onDragOver: onComposerDragOver,
						onDragLeave: () => setDragging(false),
						onDrop: onComposerDrop,
						children: canPost ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [talk.view.typing.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...smallText,
								fontSize: 14,
								padding: "0 4px 2px"
							},
							children: typingLabel(talk.view.typing)
						}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: composerBox,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										minWidth: 0,
										display: "flex",
										flexDirection: "column",
										gap: 6
									},
									children: [
										replyingPreview ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												alignItems: "center",
												gap: 8,
												background: palette.inputBg,
												border: `1px solid ${palette.border}`,
												borderRadius: 8,
												padding: "2px 4px 2px 8px"
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: {
														color: palette.accent,
														display: "inline-flex"
													},
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReplyGlyph, {})
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													style: {
														flex: 1,
														minWidth: 0,
														fontSize: 14,
														color: palette.muted,
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap"
													},
													children: [
														"正在回复",
														" ",
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															style: {
																fontWeight: 600,
																color: palette.text
															},
															children: ["@", replyingPreview.author]
														}),
														replyingPreview.content ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["：", replyingPreview.content] }) : null
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "ghost",
													icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {}),
													onClick: () => {
														cancelReply();
														composerRef.current?.focus();
													},
													"aria-label": "取消回复"
												})
											]
										}) : null,
										pendingFiles.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												display: "flex",
												flexWrap: "wrap",
												gap: 6
											},
											children: pendingFiles.map((f, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: pendingChip,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: {
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap"
														},
														children: f.name
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: {
															...smallText,
															fontSize: 14,
															flex: "0 0 auto"
														},
														children: formatBytes(f.size)
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														size: "sm",
														variant: "ghost",
														icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {}),
														onClick: () => removePending(i),
														"aria-label": `移除 ${f.name}`
													})
												]
											}, `${f.name}-${f.size}-${f.lastModified}-${f.type}`))
										}) : null,
										mentionActive ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												background: palette.elevated,
												border: `1px solid ${palette.border}`,
												borderRadius: 10,
												padding: 4,
												maxHeight: 220,
												overflowY: "auto",
												boxShadow: shadow.menu
											},
											children: talk.view.membersLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: {
													fontSize: 14,
													color: palette.muted,
													padding: "8px 10px",
													textAlign: "center"
												},
												children: "加载成员…"
											}) : mentionCandidates.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: {
													fontSize: 14,
													color: palette.muted,
													padding: "8px 10px",
													textAlign: "center"
												},
												children: mentionQuery.length > 0 ? `没有匹配「${mentionQuery}」的成员` : "还没有成员"
											}) : mentionCandidates.map((member, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												onMouseDown: (e) => e.preventDefault(),
												onClick: () => acceptMention(member),
												style: {
													display: "flex",
													alignItems: "center",
													gap: 8,
													width: "100%",
													border: "none",
													background: i === mentionIndex ? palette.hover : "transparent",
													borderRadius: 8,
													padding: "5px 8px",
													cursor: "pointer",
													textAlign: "left"
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
														label: member.handle,
														src: member.avatarUrl,
														size: 18
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: {
															fontSize: 14,
															fontWeight: 600,
															color: palette.text,
															flex: "0 0 auto"
														},
														children: member.displayName ?? member.handle
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														style: {
															fontSize: 14,
															color: palette.muted
														},
														children: ["@", member.handle]
													})
												]
											}, member.userId))
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											ref: composerRef,
											value: composerText,
											onChange: (e) => handleComposerChange(e.target.value),
											onKeyDown: handleComposerKeyDown,
											onPaste: onComposerPaste,
											placeholder: isThread && currentThread ? `在「${currentThread.name}」里发消息…` : `在 #${channel?.name ?? ""} 发消息…`,
											style: textArea
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: composerToolbar,
									children: [
										!isThread ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "ghost",
											icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconShareOutline16, {}),
											onClick: () => setShareOpen(true),
											disabled: talk.view.sending,
											"aria-label": "分享",
											title: "把本机 DSH 会话分享到社区"
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmojiPopover, {
											open: emojiOpen,
											size: "sm",
											onOpenChange: (next) => {
												setEmojiOpen(next);
												if (next) setMentionActive(false);
											},
											onPick: insertEmoji,
											disabled: talk.view.sending
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "ghost",
											icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPaperclipOutline16, {}),
											onClick: () => fileInputRef.current?.click(),
											disabled: talk.view.sending,
											"aria-label": "添加附件",
											title: "添加附件"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: composerToolbarGap }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "primary",
											size: "sm",
											icon: talk.view.sending ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSendOutline16, {}),
											disabled: talk.view.sending || composerText.trim().length === 0 && pendingFiles.length === 0,
											onClick: () => void submit(),
											"aria-label": talk.view.sending ? "发送中" : "发送",
											title: talk.view.sending ? "发送中…" : "发送"
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									ref: fileInputRef,
									type: "file",
									multiple: true,
									onChange: (e) => pickFiles(e),
									style: { display: "none" },
									"aria-hidden": true,
									tabIndex: -1
								})
							]
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								...smallText,
								fontSize: 14,
								width: "100%",
								textAlign: "center",
								padding: "10px 0"
							},
							children: "公告频道仅所有者/管理员可发布，普通成员只读。"
						})
					})] })]
				}),
				membersOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemberPanel, {
					onMention: insertMentionHandle,
					onClose: () => setMembersOpen(false)
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShareSnapshotModal, {
					open: shareOpen,
					onClose: () => setShareOpen(false),
					channelId: channelId ?? "",
					communityId: community?.id ?? null
				}),
				isThread && currentThread ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThreadMembersModal, {
					open: threadMembersOpen,
					onClose: () => setThreadMembersOpen(false),
					thread: currentThread
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThreadSettingsModal, {
					open: threadSettingsOpen,
					onClose: () => setThreadSettingsOpen(false),
					thread: currentThread
				})] }) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchMessagesModal, {
					open: searchOpen,
					onClose: () => setSearchOpen(false)
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PinnedMessagesModal, {
					open: pinnedOpen,
					onClose: () => setPinnedOpen(false)
				})
			] });
		}
		//#endregion
		//#region packages/client/src/components/Inbox.tsx
		function BellGlyph({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.4",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 2.4a3.7 3.7 0 0 0-3.7 3.7c0 2 .6 2.9 1 3.5h5.4c.4-.6 1-1.5 1-3.5A3.7 3.7 0 0 0 8 2.4Z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6.4 12.2a1.7 1.7 0 0 0 3.2 0" })]
			});
		}
		const rowWrap = {
			display: "flex",
			gap: 10,
			alignItems: "flex-start",
			padding: "10px 12px",
			borderRadius: 12,
			background: palette.inputBg,
			border: `1px solid ${palette.border}`
		};
		const STATUS_LABEL = {
			accepted: "已接受",
			declined: "已拒绝"
		};
		function InboxRow({ item }) {
			const talk = useTalkState();
			const invite = item.invite;
			const busy = talk.inboxBusyId !== null && invite?.id === talk.inboxBusyId;
			const [pending, setPending] = (0, react.useState)(null);
			const communityName = item.data?.communityName ?? "";
			const icon = item.data?.communityIconUrl ?? null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rowWrap,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
						label: communityName || "邀",
						src: icon,
						size: 34,
						kind: "community"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							flex: 1,
							minWidth: 0,
							display: "flex",
							flexDirection: "column",
							gap: 3
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: 14,
									fontWeight: 650,
									color: palette.text,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: item.title
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: 14,
									color: palette.muted,
									lineHeight: 1.5,
									whiteSpace: "pre-wrap",
									wordBreak: "break-word"
								},
								children: item.body
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										...smallText,
										fontSize: 14
									},
									children: timeLabel(item.createdAt)
								}), !item.isRead ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
									width: 7,
									height: 7,
									borderRadius: "50%",
									background: palette.accent,
									flex: "0 0 auto"
								} }) : null]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6,
							flex: "0 0 auto",
							paddingTop: 2
						},
						children: item.kind === "invite" ? invite === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								...smallText,
								fontSize: 14
							},
							children: "邀请已失效"
						}) : invite.status === "pending" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "primary",
							disabled: busy || pending !== null,
							icon: pending === "accept" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : void 0,
							onClick: () => {
								setPending("accept");
								acceptInvite(invite.id).finally(() => setPending(null));
							},
							children: pending === "accept" ? "加入中…" : "加入"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "ghost",
							disabled: busy || pending !== null,
							icon: pending === "decline" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : void 0,
							onClick: async () => {
								if (!await askConfirm({
									title: "拒绝社区邀请",
									message: "拒绝后这条邀请失效，需要对方重新邀请才能加入。",
									confirmLabel: "拒绝邀请"
								})) return;
								setPending("decline");
								await declineInvite(invite.id);
								setPending(null);
							},
							children: pending === "decline" ? "拒绝中…" : "拒绝"
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 14,
								color: palette.muted
							},
							children: STATUS_LABEL[invite.status] ?? invite.status
						}) : null
					})
				]
			});
		}
		function InboxDialog() {
			const talk = useTalkState();
			const unread = talk.inboxUnread;
			const hasInvites = talk.notifications.length > 0;
			const [markingAll, setMarkingAll] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open: talk.inboxOpen,
				onClose: () => closeInbox(),
				title: "站内信",
				closeLabel: "关闭",
				description: "社区邀请与重要事件会出现在这里。",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					size: "sm",
					icon: markingAll ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : void 0,
					disabled: unread === 0 || markingAll,
					onClick: () => {
						setMarkingAll(true);
						markAllNotificationsRead().finally(() => setMarkingAll(false));
					},
					children: markingAll ? "处理中…" : "全部已读"
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 8,
						maxWidth: 560
					},
					children: talk.inboxLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...smallText,
							padding: "14px 4px"
						},
						children: "加载中…"
					}) : !hasInvites ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...smallText,
							padding: "20px 4px",
							textAlign: "center"
						},
						children: [
							"暂时没有站内信。",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
							"当有人邀请你加入社区时，会第一时间出现在这里。"
						]
					}) : talk.notifications.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InboxRow, { item }, item.id))
				})
			});
		}
		//#endregion
		//#region packages/client/src/components/CommunitiesRail.tsx
		const tipWrap = {
			display: "flex",
			flexDirection: "column",
			gap: 2,
			minWidth: 176,
			maxWidth: 260
		};
		const tipTitle = {
			fontSize: 16,
			fontWeight: 600,
			color: palette.text
		};
		const tipHint = {
			fontSize: 14,
			lineHeight: 1.5,
			color: palette.muted
		};
		/** 窄列图标的 hover 说明卡：标题 + 可选副标题 */
		function RailTip({ title, hint }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: tipWrap,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: tipTitle,
					children: title
				}), hint ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: tipHint,
					children: hint
				}) : null]
			});
		}
		/** 项目仓库地址（logo hover 卡里的唯一外链） */
		const PROJECT_REPO$1 = "https://github.com/seolhw/dsh-talk";
		/** 左上角 logo hover 小窗：项目介绍 + 仓库地址（可点开新标签） */
		function ProjectCard() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					...tipWrap,
					maxWidth: 280,
					gap: 4
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: tipTitle,
						children: "DSH-Talk"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							...tipHint,
							textAlign: "justify"
						},
						children: "把「社区」装进 DSH：在 DeepSeek Harness 里和同好聊天、提问求助、发通知。"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href: PROJECT_REPO$1,
						target: "_blank",
						rel: "noreferrer",
						style: {
							fontSize: 14,
							color: palette.accent,
							textDecoration: "none",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: "开源地址"
					})
				]
			});
		}
		/** 社区栏 hover 小窗：名称、可见性、描述、成员总数（只读，点击仍选社区） */
		function CommunityMetaCard({ community }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: tipWrap,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
							color: palette.communityAvatarBg,
							label: community.name,
							src: community.iconUrl,
							size: 32,
							inset: 3,
							kind: "community"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: { minWidth: 0 },
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										...tipTitle,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis"
									},
									children: community.name
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: tipHint,
									children: PRIVACY_LABELS[community.privacy]
								}),
								community.slug ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										...tipHint,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis"
									},
									children: ["@", community.slug]
								}) : null
							]
						})]
					}),
					community.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							marginTop: 6,
							fontSize: 14,
							lineHeight: 1.6,
							color: palette.muted,
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							display: "-webkit-box",
							WebkitLineClamp: 3,
							WebkitBoxOrient: "vertical",
							overflow: "hidden"
						},
						children: community.description
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...tipHint,
							marginTop: 6
						},
						children: [community.memberCount, " 名成员"]
					})
				]
			});
		}
		/** 底部个人中心 hover 小窗：头像 + 昵称/@用户名 + 进入提示 */
		function UserMetaCard({ label, handle, avatarUrl }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: tipWrap,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
						label: handle,
						src: avatarUrl,
						size: 32
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { minWidth: 0 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...tipTitle,
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis"
							},
							children: label
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: tipHint,
							children: ["@", handle]
						})]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						...tipHint,
						marginTop: 6
					},
					children: "点击进入个人中心"
				})]
			});
		}
		function CommunitiesRail({ onAdd, onInbox, onOpenProfile }) {
			const talk = useTalkState();
			const current = talk.view.communityId;
			const me = talk.me;
			const unreadLabel = talk.inboxUnread > 99 ? "99+" : String(talk.inboxUnread);
			/** 统一给窄列图标包一层 hover 卡（去除原生 title，避免重复提示） */
			function withTip(anchor, content, delay = 300) {
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
					openDelayMs: delay,
					content,
					anchor
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rail,
				children: [
					withTip(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: railAction,
						onClick: backToCommunities,
						"aria-label": "回到首页",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandLogo, { size: 34 })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectCard, {})),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 2,
							marginTop: 6
						},
						children: [withTip(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: railAction,
							onClick: onInbox,
							"aria-label": "站内信",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: railAvatar,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BellGlyph, { size: 24 }), talk.inboxUnread > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										...railBubble,
										top: -4,
										right: -6
									},
									children: unreadLabel
								}) : null]
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RailTip, {
							title: "站内信",
							hint: talk.inboxUnread > 0 ? `${unreadLabel} 条未读，含社区邀请` : "社区邀请与重要事件"
						})), withTip(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: railAction,
							onClick: onAdd,
							"aria-label": "加入、发现或创建社区",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 24 })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RailTip, { title: "加入、发现或创建社区" }))]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: railDivider }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: railScroll,
						children: talk.communities.map((c) => {
							const active = c.id === current;
							const unread = c.unreadChannels;
							const mention = c.unreadMentions;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								style: railItem,
								onClick: () => {
									if (!active) openCommunity(c.id);
								},
								children: [active ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: railPill }) : null, withTip(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: railAvatar,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
										color: palette.communityAvatarBg,
										label: c.name,
										src: c.iconUrl,
										size: 44,
										inset: 4,
										kind: "community"
									}), active && talk.view.communityLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											...railBubble,
											background: palette.elevated,
											border: `1px solid ${palette.border}`,
											color: palette.text,
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center"
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 12 })
									}) : mention > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											...railBubble,
											background: palette.accent
										},
										children: mention
									}) : unread > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: railBubble,
										children: unread
									}) : null]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CommunityMetaCard, { community: c }))]
							}, c.id);
						})
					}),
					me ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							padding: "8px 0 12px",
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 4,
							width: "100%"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: railDivider }), withTip(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: railAction,
							onClick: onOpenProfile,
							"aria-label": "个人中心",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
								label: me.handle,
								src: me.avatarUrl,
								size: 34
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UserMetaCard, {
							label: me.displayName ?? me.handle,
							handle: me.handle,
							avatarUrl: me.avatarUrl
						}), 150)]
					}) : null
				]
			});
		}
		//#endregion
		//#region packages/client/src/components/CommunityAddModal.tsx
		const discoverRow = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			padding: "7px 10px",
			borderRadius: 10,
			background: palette.inputBg,
			border: `1px solid ${palette.border}`
		};
		const discoverName = {
			fontSize: 14,
			fontWeight: 600,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		const discoverDesc = {
			fontSize: 14,
			color: palette.muted,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		/** 「发现 / 加入 / 创建」合并为一个弹窗：顶部 tab 切换，默认「发现」 */
		function CommunityAddModal({ open, onClose }) {
			const talk = useTalkState();
			const [tab, setTab] = (0, react.useState)("discover");
			const [code, setCode] = (0, react.useState)("");
			const [discoverItems, setDiscoverItems] = (0, react.useState)([]);
			const [discoverLoading, setDiscoverLoading] = (0, react.useState)(false);
			const [keyword, setKeyword] = (0, react.useState)("");
			const [joiningId, setJoiningId] = (0, react.useState)(null);
			const [name, setName] = (0, react.useState)("");
			const [description, setDescription] = (0, react.useState)("");
			const [privacy, setPrivacy] = (0, react.useState)("public");
			const [iconUrl, setIconUrl] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [iconBusy, setIconBusy] = (0, react.useState)(false);
			const joinedIds = new Set(talk.communities.map((c) => c.id));
			(0, react.useEffect)(() => {
				if (open) {
					setTab("discover");
					setCode("");
					setKeyword("");
					setDiscoverItems([]);
					setJoiningId(null);
					setName("");
					setDescription("");
					setPrivacy("public");
					setIconUrl(null);
					loadDiscover("");
				}
			}, [open]);
			async function pickIcon(file) {
				setIconBusy(true);
				const url = await uploadImage(file);
				setIconBusy(false);
				if (url) setIconUrl(url);
			}
			/** 拉公开社区目录（关键词为空 = 热门） */
			async function loadDiscover(q) {
				setDiscoverLoading(true);
				const items = await discoverCommunities({ q });
				setDiscoverItems(items);
				setDiscoverLoading(false);
			}
			/** 加入公开社区并进入 */
			async function enter(communityId) {
				if (joiningId !== null) return;
				setJoiningId(communityId);
				const ok = await joinPublicCommunity(communityId);
				setJoiningId(null);
				if (ok) onClose();
			}
			async function submit() {
				if (busy) return;
				if (tab !== "create") {
					if (code.trim().length === 0) return;
					setBusy(true);
					const ok = await joinCommunityByCode(code);
					setBusy(false);
					if (ok) {
						setCode("");
						onClose();
					}
					return;
				}
				if (name.trim().length === 0) return;
				setBusy(true);
				const body = {
					name: name.trim(),
					privacy,
					iconUrl
				};
				if (description.trim().length > 0) body.description = description.trim();
				const ok = await createCommunity(body);
				setBusy(false);
				if (ok) {
					setName("");
					setDescription("");
					onClose();
				}
			}
			const creating = tab === "create";
			const discovering = tab === "discover";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: creating ? "创建社区" : discovering ? "发现社区" : "加入社区",
				closeLabel: "关闭",
				footer: discovering ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "关闭"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: busy || (creating ? name.trim().length === 0 : code.trim().length === 0),
					onClick: () => void submit(),
					children: busy ? creating ? "创建中…" : "加入中…" : creating ? "创建" : "加入"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 12
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: pillGroup,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: pillStyle(discovering),
								onClick: () => {
									setTab("discover");
									loadDiscover(keyword);
								},
								children: "发现"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: pillStyle(tab === "join"),
								onClick: () => setTab("join"),
								children: "加入"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: pillStyle(creating),
								onClick: () => setTab("create"),
								children: "创建"
							})
						]
					}), creating ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: fieldLabel,
								children: "社区头像"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AvatarPicker, {
								src: iconUrl,
								label: name.trim() || "社区",
								size: 60,
								onPick: (file) => void pickIcon(file),
								onRemove: () => setIconUrl(null),
								uploadLabel: "设置头像",
								removeLabel: "移除头像",
								busy: busy || iconBusy,
								kind: "community"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "talk-create-name",
								style: fieldLabel,
								children: "社区名称"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-create-name",
								value: name,
								onChange: (e) => setName(e.target.value),
								placeholder: "社区名称"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "talk-create-desc",
								style: fieldLabel,
								children: "简介"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								id: "talk-create-desc",
								value: description,
								onChange: (e) => setDescription(e.target.value),
								placeholder: "简介（可选）"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: fieldBlock,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: fieldLabel,
								children: "可见性"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: pillGroup,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: pillStyle(privacy === "public"),
									onClick: () => setPrivacy("public"),
									children: "公开"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: pillStyle(privacy === "private"),
									onClick: () => setPrivacy("private"),
									children: "私有"
								})]
							})]
						})
					] }) : discovering ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 10
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								value: keyword,
								onChange: (e) => setKeyword(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										loadDiscover(keyword);
									}
								},
								placeholder: "搜索公开社区（名称 / 简介）",
								"aria-label": "搜索公开社区"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								icon: discoverLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : void 0,
								disabled: discoverLoading,
								onClick: () => void loadDiscover(keyword),
								children: discoverLoading ? "搜索中…" : "搜索"
							})]
						}), discoverLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingHint, {
							text: "加载社区…",
							padding: "8px 2px"
						}) : discoverItems.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...smallText,
								padding: "8px 2px"
							},
							children: "没有找到公开社区。"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6,
								maxHeight: 320,
								overflowY: "auto"
							},
							children: discoverItems.map((item) => {
								const joined = joinedIds.has(item.id);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: discoverRow,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
											label: item.name,
											src: item.iconUrl,
											kind: "community"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												flex: 1,
												minWidth: 0
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: discoverName,
												children: [item.name, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													style: {
														color: palette.muted,
														fontSize: 14
													},
													children: [
														" ",
														"· ",
														item.memberCount,
														" 成员"
													]
												})]
											}), item.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: discoverDesc,
												children: item.description
											}) : null]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: joined ? "ghost" : "primary",
											icon: joiningId === item.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : void 0,
											disabled: joiningId !== null,
											onClick: () => joined ? void openCommunity(item.id) : void enter(item.id),
											children: joined ? "进入" : joiningId === item.id ? "加入中…" : "加入"
										})
									]
								}, item.id);
							})
						})]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: fieldBlock,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							htmlFor: "talk-join-code",
							style: fieldLabel,
							children: "邀请码"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							id: "talk-join-code",
							value: code,
							onChange: (e) => setCode(e.target.value),
							onKeyDown: (e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									submit();
								}
							},
							placeholder: "邀请码，如 ABCD1234"
						})]
					})]
				})
			});
		}
		//#endregion
		//#region packages/client/src/components/ProfileModal.tsx
		/** 只读信息行：左侧标签，右侧值（单行省略） */
		const infoRow = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 12,
			padding: "8px 10px",
			borderRadius: 10,
			background: palette.inputBg,
			border: `1px solid ${palette.border}`
		};
		const infoValue = {
			fontSize: 14,
			fontWeight: 600,
			color: palette.text,
			minWidth: 0,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		/** 开关行：无现成 Switch 组件，按站内样式手写一个（role=switch，可键盘操作） */
		function ToggleRow({ label, hint, checked, onToggle }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: infoRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 2,
						minWidth: 0
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 14,
							fontWeight: 600,
							color: palette.text
						},
						children: label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							...smallText,
							fontSize: 14
						},
						children: hint
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					role: "switch",
					"aria-checked": checked,
					"aria-label": label,
					onClick: onToggle,
					style: {
						flex: "0 0 auto",
						width: 40,
						height: 22,
						padding: 0,
						borderRadius: 999,
						border: "none",
						cursor: "pointer",
						background: checked ? palette.accent : palette.border,
						position: "relative",
						transition: "background 0.15s"
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
						position: "absolute",
						top: 2,
						left: checked ? 20 : 2,
						width: 18,
						height: 18,
						borderRadius: "50%",
						background: "#fff",
						transition: "left 0.15s"
					} })
				})]
			});
		}
		function ProfileModal({ open, onClose }) {
			const talk = useTalkState();
			const me = talk.me;
			const [nickname, setNickname] = (0, react.useState)("");
			const [nicknameBusy, setNicknameBusy] = (0, react.useState)(false);
			const [username, setUsername] = (0, react.useState)("");
			const [usernameBusy, setUsernameBusy] = (0, react.useState)(false);
			const [avatarBusy, setAvatarBusy] = (0, react.useState)(false);
			const [currentPwd, setCurrentPwd] = (0, react.useState)("");
			const [newPwd, setNewPwd] = (0, react.useState)("");
			const [confirmPwd, setConfirmPwd] = (0, react.useState)("");
			const [pwdBusy, setPwdBusy] = (0, react.useState)(false);
			const [logoutBusy, setLogoutBusy] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (open) setNickname(me?.displayName ?? "");
			}, [open, me?.displayName]);
			(0, react.useEffect)(() => {
				if (open) setUsername(me?.handle ?? "");
			}, [open, me?.handle]);
			(0, react.useEffect)(() => {
				if (open) {
					setCurrentPwd("");
					setNewPwd("");
					setConfirmPwd("");
				}
			}, [open]);
			if (!me) return null;
			/** 退出登录：先用站内确认弹窗二次确认，再真正退出 */
			async function confirmLogout() {
				if (!await askConfirm({
					title: "退出登录",
					message: "退出后需要重新登录才能继续参与社区讨论。",
					confirmLabel: "确认退出",
					danger: true
				})) return;
				setLogoutBusy(true);
				await logout();
				setLogoutBusy(false);
			}
			async function pickAvatar(file) {
				setAvatarBusy(true);
				await updateUserAvatar(file);
				setAvatarBusy(false);
			}
			async function removeAvatar() {
				setAvatarBusy(true);
				await removeUserAvatar();
				setAvatarBusy(false);
			}
			async function saveNickname() {
				if (nicknameBusy) return;
				setNicknameBusy(true);
				await updateUserNickname(nickname);
				setNicknameBusy(false);
			}
			async function saveUsername() {
				if (usernameBusy) return;
				setUsernameBusy(true);
				await updateUserUsername(username);
				setUsernameBusy(false);
			}
			async function submitPassword() {
				if (pwdBusy) return;
				if (currentPwd.length === 0) {
					notify("请输入当前密码");
					return;
				}
				if (newPwd.length < 8) {
					notify("新密码至少 8 位");
					return;
				}
				if (newPwd !== confirmPwd) {
					notify("两次输入的新密码不一致");
					return;
				}
				setPwdBusy(true);
				const ok = await changePassword({
					currentPassword: currentPwd,
					newPassword: newPwd
				});
				setPwdBusy(false);
				if (ok) {
					setCurrentPwd("");
					setNewPwd("");
					setConfirmPwd("");
				}
			}
			const canSubmitPwd = !pwdBusy && currentPwd.length > 0 && newPwd.length >= 8 && newPwd === confirmPwd;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TalkModal, {
				open,
				onClose,
				title: "个人中心",
				closeLabel: "关闭",
				description: "管理你的头像、昵称、用户名与登录密码。",
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					onClick: onClose,
					children: "关闭"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					icon: logoutBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { size: 14 }) : void 0,
					disabled: logoutBusy,
					style: {
						color: palette.danger,
						borderColor: palette.danger
					},
					onClick: () => void confirmLogout(),
					children: logoutBusy ? "退出中…" : "退出登录"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 16
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 10
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 14,
										fontWeight: 650,
										color: palette.text
									},
									children: "个人资料"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										flexDirection: "column",
										gap: 6
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: fieldLabel,
										children: "头像"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AvatarPicker, {
										src: me.avatarUrl,
										label: me.handle,
										size: 60,
										onPick: (file) => void pickAvatar(file),
										onRemove: () => void removeAvatar(),
										busy: avatarBusy
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										flexDirection: "column",
										gap: 6
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											htmlFor: "talk-profile-nickname",
											style: fieldLabel,
											children: "昵称"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												gap: 8
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												id: "talk-profile-nickname",
												value: nickname,
												onChange: (e) => setNickname(e.target.value),
												onKeyDown: (e) => {
													if (e.key === "Enter") {
														e.preventDefault();
														saveNickname();
													}
												},
												placeholder: me.handle
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "primary",
												disabled: nicknameBusy || nickname.trim().length === 0,
												onClick: () => void saveNickname(),
												children: nicknameBusy ? "保存中…" : "保存"
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												...smallText,
												fontSize: 14
											},
											children: "昵称会显示在消息与成员列表里。"
										})
									]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 6
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										htmlFor: "talk-profile-username",
										style: fieldLabel,
										children: "用户名"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											gap: 8
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											id: "talk-profile-username",
											value: username,
											onChange: (e) => setUsername(e.target.value),
											maxLength: 16,
											onKeyDown: (e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													saveUsername();
												}
											},
											placeholder: me.handle
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "primary",
											disabled: usernameBusy || username.trim().length === 0,
											onClick: () => void saveUsername(),
											children: usernameBusy ? "保存中…" : "保存"
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											...smallText,
											fontSize: 14
										},
										children: "仅限大小写字母和数字，4-16 个字符，每周只能修改一次。"
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: infoRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										...smallText,
										fontSize: 14,
										flex: "0 0 auto"
									},
									children: "邮箱"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 6,
										minWidth: 0
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: infoValue,
										children: talk.meEmail ?? "—"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											flex: "0 0 auto",
											fontSize: 14,
											fontWeight: 600,
											color: palette.success
										},
										children: "已验证"
									})]
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 14,
										fontWeight: 650,
										color: palette.text
									},
									children: "修改密码"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									type: "password",
									autoComplete: "current-password",
									value: currentPwd,
									onChange: (e) => setCurrentPwd(e.target.value),
									placeholder: "当前密码",
									"aria-label": "当前密码"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									type: "password",
									autoComplete: "new-password",
									value: newPwd,
									onChange: (e) => setNewPwd(e.target.value),
									placeholder: "新密码（至少 8 位）",
									"aria-label": "新密码"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									type: "password",
									autoComplete: "new-password",
									value: confirmPwd,
									onChange: (e) => setConfirmPwd(e.target.value),
									onKeyDown: (e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											submitPassword();
										}
									},
									placeholder: "确认新密码",
									"aria-label": "确认新密码"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									disabled: !canSubmitPwd,
									onClick: () => void submitPassword(),
									children: pwdBusy ? "更新中…" : "更新密码"
								}) })
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 14,
										fontWeight: 650,
										color: palette.text
									},
									children: "提醒"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
									label: "桌面通知",
									hint: "页面在后台时，当前房间有人 @ 我会弹系统通知（需浏览器授权）",
									checked: talk.reminderSettings.desktop,
									onToggle: () => void updateReminderSettings({ desktop: !talk.reminderSettings.desktop })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
									label: "免打扰",
									hint: "开启后只保留未读角标，不再弹桌面通知",
									checked: talk.reminderSettings.dnd,
									onToggle: () => void updateReminderSettings({ dnd: !talk.reminderSettings.dnd })
								})
							]
						})
					]
				})
			});
		}
		//#endregion
		//#region packages/client/src/components/HomeScreen.tsx
		/** 项目仓库地址（logo hover 卡里的唯一外链） */
		const PROJECT_REPO = "https://github.com/seolhw/dsh-talk";
		function HomeScreen() {
			const talk = useTalkState();
			const [showAdd, setShowAdd] = (0, react.useState)(false);
			const [showProfile, setShowProfile] = (0, react.useState)(false);
			/** 创建讨论组弹窗：由 HomeScreen 承载，频道列表菜单与会话头部共用 */
			const [threadCreate, setThreadCreate] = (0, react.useState)(null);
			const inCommunity = talk.view.communityId !== null;
			const communityBooting = inCommunity && talk.view.communityLoading && !talk.view.community;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flex: 1,
					minHeight: 0
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: messageRowCss }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CommunitiesRail, {
						onAdd: () => setShowAdd(true),
						onInbox: () => void openInbox(),
						onOpenProfile: () => setShowProfile(true)
					}),
					communityBooting ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...chatCol,
							alignItems: "center",
							justifyContent: "center"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingHint, { text: "正在进入社区…" })
					}) : inCommunity ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelList, { onCreateThread: (channelId) => setThreadCreate({
						channelId,
						seed: null
					}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChatPane, { onCreateThread: (channelId, seed) => setThreadCreate({
						channelId,
						seed
					}) })] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...chatCol,
							alignItems: "center",
							justifyContent: "center"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: emptyCard,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandLogo, { size: 52 }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										fontSize: 16,
										fontWeight: 700,
										lineHeight: 1.3,
										marginTop: 2
									},
									children: "欢迎使用 DSH-Talk 开源社区"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										...smallText,
										fontSize: 14,
										lineHeight: 1.7
									},
									children: [
										"从左侧选择一个社区开始聊天，",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
										"点左栏「＋」发现公开社区、用邀请码加入，或创建新社区。",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
										"请不要输入如 密码、银行卡、APIKEY 等敏感信息。"
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: PROJECT_REPO,
									target: "_blank",
									rel: "noreferrer",
									style: {
										fontSize: 14,
										color: palette.accent,
										textDecoration: "none",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: "开源地址"
								})
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThreadCreateModal, {
						open: threadCreate !== null,
						onClose: () => setThreadCreate(null),
						channelId: threadCreate?.channelId ?? null,
						seed: threadCreate?.seed ?? null
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CommunityAddModal, {
						open: showAdd,
						onClose: () => setShowAdd(false)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProfileModal, {
						open: showProfile,
						onClose: () => setShowProfile(false)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InboxDialog, {})
				]
			});
		}
		//#endregion
		//#region packages/client/src/components.tsx
		/** 居中提示视图 */
		function Centered({ children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					flex: 1,
					minHeight: 0,
					display: "grid",
					placeItems: "center",
					padding: 24
				},
				children
			});
		}
		function LoadingView() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					color: palette.muted,
					fontSize: 14
				},
				children: "正在连接 DSH-Talk Server…"
			});
		}
		function ErrorView() {
			const { error } = useTalkState();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 12
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						color: palette.danger,
						fontSize: 14
					},
					children: ["连接失败：", error]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					size: "sm",
					onClick: () => void refresh(),
					children: "重试"
				})]
			});
		}
		const PAGE_HOST_CSS = `
[data-conversation-scroll]:has([data-dsht-page-root]) > [data-composer-seat] {
  display: none;
}
`;
		/**
		* 暗色主题下的灰度文字提亮（宿主 token 在深色底上偏暗，小字难以辨认）：
		* 宿主主题由 `body[data-ds-dark-theme]` 切换，这里只覆盖本插件自己的
		* --dsht-label-* 变量层（palette.muted 引用它），不动宿主 token，
		* 因此不会影响 DSH 其他界面。插件只保留一档辅助灰，暗色下提亮到 bluish-300。
		*/
		const DARK_TEXT_CSS = `
body[data-ds-dark-theme] {
  --dsht-label-tertiary: var(--dsw-static-neutral-bluish-300);
}
`;
		let hostCssInjected = false;
		/** 注入一次宿主覆盖样式（幂等） */
		function ensureHostCss() {
			if (hostCssInjected) return;
			const style = document.createElement("style");
			style.setAttribute("data-dsht-page-css", "");
			style.textContent = `${PAGE_HOST_CSS}${DARK_TEXT_CSS}`;
			document.head.appendChild(style);
			hostCssInjected = true;
		}
		/** 「社区」页签页：随会话 view 挂载/卸载而激活/释放实时连接 */
		function TalkPage(props) {
			const talk = useTalkState();
			const ready = talk.phase === "ready";
			const sessionId = props.sessionId ?? null;
			const [pageEl, setPageEl] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				setCurrentDshSession(sessionId);
			}, [sessionId]);
			(0, react.useEffect)(() => {
				activateTalk();
				return () => deactivateTalk();
			}, []);
			(0, react.useEffect)(() => {
				ensureHostCss();
			}, []);
			(0, react.useEffect)(() => {
				if (!ready) return;
				refreshInboxUnread();
				const timer = window.setInterval(() => void refreshInboxUnread(), 3e4);
				return () => window.clearInterval(timer);
			}, [ready]);
			const communityId = talk.view.communityId;
			(0, react.useEffect)(() => {
				if (!ready || communityId === null) return;
				loadCommunityOnline();
				const timer = window.setInterval(() => void loadCommunityOnline(), 3e4);
				return () => window.clearInterval(timer);
			}, [ready, communityId]);
			let body;
			if (talk.phase === "error") body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Centered, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ErrorView, {}) });
			else if (talk.phase === "anon") body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Centered, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AuthScreen, {}) });
			else if (talk.busy || talk.phase === "booting") body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Centered, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingView, {}) });
			else body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HomeScreen, {});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: setPageEl,
				style: pageRoot,
				"data-dsht-page-root": true,
				"data-conversation-composer-overlay": "",
				children: [
					body,
					talk.toast.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, {
						text: talk.toast,
						anchor: pageEl,
						onDone: () => dismissToast()
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmDialog, {})
				]
			});
		}
		//#endregion
		//#region packages/client/src/index.ts
		const inject = ["slots", "sessions"];
		/** 会话栏展示的用户交互状态（对齐宿主 visiblePendingKind） */
		const VISIBLE_PENDING_KINDS = /* @__PURE__ */ new Set([
			"approval",
			"plan-review",
			"question"
		]);
		/**
		* 每个 session 的「运行中子代理」计数：遍历子代理后代并逐级累加到其祖先
		* （对齐宿主 indexSubagentDescendants，只保留本插件展示需要的 runningCount）。
		*/
		function indexRunningSubagents(byId) {
			const running = /* @__PURE__ */ new Map();
			for (const descendant of Object.values(byId)) {
				if (descendant.origin !== "subagent") continue;
				const seen = /* @__PURE__ */ new Set();
				let current = descendant;
				while (current?.origin === "subagent" && current.parentId !== void 0 && !seen.has(current.id)) {
					seen.add(current.id);
					const parentId = current.parentId;
					running.set(parentId, (running.get(parentId) ?? 0) + (descendant.running ? 1 : 0));
					current = byId[parentId];
				}
			}
			return running;
		}
		/**
		* 会话是否进入会话栏：排除子代理会话、已归档会话，以及尚未产生事件的空白会话
		* （空白会话在宿主里是「新建会话」占位行，没有可分享的内容）。
		*/
		function sessionVisible(session, archived) {
			return session.origin !== "subagent" && !archived.has(session.id) && session.blank !== true;
		}
		/** 会话摘要 → 会话树节点 */
		function toShareNode(session, runningSubagents) {
			const pending = session.pendingInteraction !== void 0 && VISIBLE_PENDING_KINDS.has(session.pendingInteraction) ? session.pendingInteraction : void 0;
			return {
				id: session.id,
				title: session.displayTitle ?? session.id,
				running: session.running === true,
				completed: session.completed === true,
				runningSubagentCount: runningSubagents.get(session.id) ?? 0,
				...session.updatedAt !== void 0 ? { updatedAt: session.updatedAt } : {},
				...pending !== void 0 ? { pendingInteraction: pending } : {}
			};
		}
		/**
		* 派生分享选择器的会话树，规则对齐宿主左侧会话栏（deriveGroups）：
		* 按宿主工作区顺序逐组展开，组内保持宿主存储的会话顺序；不属于任何工作区的
		* 会话按最近更新排序，归入末尾的「未分组」。
		*/
		function deriveShareTree(list, workspaces, archivedSessionIds) {
			const archived = new Set(archivedSessionIds);
			const runningSubagents = indexRunningSubagents(list.byId);
			const accounted = /* @__PURE__ */ new Set();
			const groups = [];
			for (const workspace of workspaces) {
				const sessions = [];
				for (const id of workspace.sessionIds) {
					const summary = list.byId[id];
					if (summary === void 0) continue;
					accounted.add(id);
					if (!sessionVisible(summary, archived)) continue;
					sessions.push(toShareNode(summary, runningSubagents));
				}
				groups.push({
					key: workspace.workspaceId,
					label: workspace.title,
					cwd: workspace.path,
					sessions
				});
			}
			const stray = list.ids.map((id) => list.byId[id]).filter((session) => session !== void 0 && !accounted.has(session.id) && sessionVisible(session, archived)).sort((a, b) => {
				const left = a.updatedAt ?? 0;
				const right = b.updatedAt ?? 0;
				return right !== left ? right - left : a.id < b.id ? -1 : 1;
			});
			if (stray.length > 0) groups.push({
				key: "",
				label: "未分组",
				sessions: stray.map((session) => toShareNode(session, runningSubagents))
			});
			return {
				groups,
				current: list.current ?? null
			};
		}
		function apply(ctx) {
			const sessions = ctx.get("sessions");
			bindSessionOpener(async (sessionId) => {
				if (!sessions) return false;
				try {
					await sessions.refresh();
				} catch {}
				try {
					sessions.open(sessionId);
					return true;
				} catch {
					return false;
				}
			});
			bindSessionTree(() => {
				if (!sessions) return {
					groups: [],
					current: null
				};
				const workspaceSnapshot = ctx.get("workspaces")?.list.getSnapshot();
				return deriveShareTree(sessions.list.getSnapshot(), workspaceSnapshot?.items ?? [], workspaceSnapshot?.archivedSessionIds ?? []);
			});
			try {
				ctx.slots.inject("conversation.view", () => ctx.slots.register({
					name: "conversation.view",
					id: "dsh-talk",
					order: 20,
					label: "社区",
					registrant: "dsh-talk"
				}, TalkPage));
			} catch (error) {
				console.error("[dsh-talk] slot register failed:", error);
			}
			refresh();
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map