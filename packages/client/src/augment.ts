// ================================================================
// 类型化 slot 接入层：仅为了把 DSH 官方表面的 `declare module` 合并
// 拉进本插件的编译，从而拿到对应槽位键的强类型。
// 运行期没有任何代码从这里加载。
// ================================================================

import type { ILayout } from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {
  SidebarFooterActionOwnerProps,
  SidebarSettingsOwnerProps,
} from "@deepseek-ai/dsh-client-ui-sidebar/client";

/**
 * DSH-Guild 注册进官方会话页签环（`conversation.view`）时的槽位声明。
 * 官方 0.1.5 契约（@deepseek-ai/dsh-client-ui-conversation/client）：
 *   kind: 'list'; scope: 'session'；owner 为 ConvViewOwnerProps
 *   （viewRequest / openView / completeViewRequest，本插件不使用）；
 *   页签文字取自注册 options.label，正文整页由注册组件自绘。
 * ui-conversation 包未装进本插件类型图，这里补一条等价的 SlotMap 合并。
 */
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "conversation.view": {
      kind: "list";
      scope: "session";
      owner: DshGuildViewOwnerProps;
    };
  }
}

/** conversation.view 的 owner 币种：宿主不传任何业务 props（会话标准 props 由框架注入） */
export interface DshGuildViewOwnerProps {
  children?: never;
}

/**
 * 构建期注入的 logo 源文本：tsdown.config.ts 读取 packages/client/public/logo.svg
 * 后经 `define` 替换成字符串字面量，消费方见 components/styles.tsx 的 guildLogoUrl。
 */
declare global {
  const __DSH_GUILD_LOGO_SVG__: string;
}

export type { ILayout, SidebarFooterActionOwnerProps, SidebarSettingsOwnerProps };
