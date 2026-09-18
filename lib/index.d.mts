import { Context } from "@deepseek-ai/cordis";
//#region packages/host/src/index.d.ts
export declare const name = "dsh-guild";
/** 需要 DSH 内置 service 就绪后才启动（会话分享依赖 sessions / sessionPersistence）。 */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
//#endregion