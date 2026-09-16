// ================================================================
// DSH-Talk 浏览器侧（client）入口
//  注册为 `conversation.view` 页签（与官方「对话 / 轨迹」等页签平行）：
//  - 宿主会话顶栏会出现「社区」页签，点击后主内容区整页展示社区 UI，
//    不再是浮层/弹窗。
//  - 页签位置跟随官方 tab 列表（会话头部），不占用侧栏底部设置区。
// 数据流：host 配置（/api/talk/config）→ Server REST（身份/社区列表）
// 槽位类型合并由 ./augment 拉入，见该文件注释。
//
// 注册写法对齐官方 ui-conversation 对 conversation.view 的注册：
//   inject: ["slots"]；list slot 一律用 ctx.slots.inject(slotName, factory)
//   延迟到宿主声明后注册。
// 另 inject "sessions"：克隆还原出的 DSH 会话要能在 UI 里打开。
// ================================================================

import type { Context as ClientContext } from "@deepseek-ai/cordis";
import "./augment";
import { TalkPage } from "./components";
import {
  bindSessionOpener,
  bindSessionTree,
  refresh,
  type ShareSessionNode,
  type ShareSessionTree,
  type ShareWorkspaceGroup,
} from "./store";

export const inject: string[] = ["slots", "sessions"];

/** 宿主会话摘要里本插件用到的字段（SessionSummary 的子集） */
interface SessionSummaryLike {
  id: string;
  displayTitle?: string;
  cwd?: string;
  running?: boolean;
  completed?: boolean;
  blank?: boolean;
  origin?: string;
  parentId?: string;
  updatedAt?: number;
  pendingInteraction?: string;
}

/** 宿主会话列表快照里本插件用到的字段（SessionListState 的子集） */
interface SessionsListSnapshot {
  ids: string[];
  byId: Record<string, SessionSummaryLike>;
  current?: string;
}

/** 客户端 sessions 服务里本插件用到的最小面（open/refresh/list 不在公开 ISessions 上） */
interface SessionsFace {
  open(id: string): void;
  refresh(): Promise<void>;
  list: { getSnapshot(): SessionsListSnapshot };
}

/** 宿主工作区实体里本插件用到的字段（WorkspaceView 的子集） */
interface WorkspaceLike {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds: readonly string[];
}

/** 宿主工作区列表快照里本插件用到的字段（WorkspaceListState 的子集） */
interface WorkspacesListSnapshot {
  items: readonly WorkspaceLike[];
  archivedSessionIds: readonly string[];
}

/** 客户端 workspaces 服务里本插件用到的最小面 */
interface WorkspacesFace {
  list: { getSnapshot(): WorkspacesListSnapshot };
}

/** 会话栏展示的用户交互状态（对齐宿主 visiblePendingKind） */
const VISIBLE_PENDING_KINDS: ReadonlySet<string> = new Set(["approval", "plan-review", "question"]);

/**
 * 每个 session 的「运行中子代理」计数：遍历子代理后代并逐级累加到其祖先
 * （对齐宿主 indexSubagentDescendants，只保留本插件展示需要的 runningCount）。
 */
function indexRunningSubagents(byId: Record<string, SessionSummaryLike>): Map<string, number> {
  const running = new Map<string, number>();
  for (const descendant of Object.values(byId)) {
    if (descendant.origin !== "subagent") continue;
    const seen = new Set<string>();
    let current: SessionSummaryLike | undefined = descendant;
    while (
      current?.origin === "subagent" &&
      current.parentId !== undefined &&
      !seen.has(current.id)
    ) {
      seen.add(current.id);
      const parentId = current.parentId as string;
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
function sessionVisible(session: SessionSummaryLike, archived: ReadonlySet<string>): boolean {
  return session.origin !== "subagent" && !archived.has(session.id) && session.blank !== true;
}

/** 会话摘要 → 会话树节点 */
function toShareNode(
  session: SessionSummaryLike,
  runningSubagents: Map<string, number>,
): ShareSessionNode {
  const pending =
    session.pendingInteraction !== undefined &&
    VISIBLE_PENDING_KINDS.has(session.pendingInteraction)
      ? session.pendingInteraction
      : undefined;
  return {
    id: session.id,
    title: session.displayTitle ?? session.id,
    running: session.running === true,
    completed: session.completed === true,
    runningSubagentCount: runningSubagents.get(session.id) ?? 0,
    ...(session.updatedAt !== undefined ? { updatedAt: session.updatedAt } : {}),
    ...(pending !== undefined ? { pendingInteraction: pending } : {}),
  };
}

/**
 * 派生分享选择器的会话树，规则对齐宿主左侧会话栏（deriveGroups）：
 * 按宿主工作区顺序逐组展开，组内保持宿主存储的会话顺序；不属于任何工作区的
 * 会话按最近更新排序，归入末尾的「未分组」。
 */
function deriveShareTree(
  list: SessionsListSnapshot,
  workspaces: readonly WorkspaceLike[],
  archivedSessionIds: readonly string[],
): ShareSessionTree {
  const archived = new Set(archivedSessionIds);
  const runningSubagents = indexRunningSubagents(list.byId);
  const accounted = new Set<string>();
  const groups: ShareWorkspaceGroup[] = [];

  for (const workspace of workspaces) {
    const sessions: ShareSessionNode[] = [];
    for (const id of workspace.sessionIds) {
      const summary = list.byId[id];
      if (summary === undefined) continue;
      accounted.add(id);
      if (!sessionVisible(summary, archived)) continue;
      sessions.push(toShareNode(summary, runningSubagents));
    }
    groups.push({
      key: workspace.workspaceId,
      label: workspace.title,
      cwd: workspace.path,
      sessions,
    });
  }

  const stray = list.ids
    .map((id) => list.byId[id])
    .filter(
      (session): session is SessionSummaryLike =>
        session !== undefined && !accounted.has(session.id) && sessionVisible(session, archived),
    )
    .sort((a, b) => {
      const left = a.updatedAt ?? 0;
      const right = b.updatedAt ?? 0;
      return right !== left ? right - left : a.id < b.id ? -1 : 1;
    });
  if (stray.length > 0) {
    groups.push({
      key: "",
      label: "未分组",
      sessions: stray.map((session) => toShareNode(session, runningSubagents)),
    });
  }

  return { groups, current: list.current ?? null };
}

export function apply(ctx: ClientContext): void {
  // 克隆还原出的会话要能在 UI 里切过去：先 refresh 列表再 open
  const sessions = ctx.get("sessions") as SessionsFace | undefined;
  bindSessionOpener(async (sessionId) => {
    if (!sessions) return false;
    try {
      await sessions.refresh();
    } catch {
      // 列表刷新失败也继续尝试打开（目标可能已在列表中）
    }
    try {
      sessions.open(sessionId);
      return true;
    } catch {
      return false;
    }
  });

  // 分享会话选择器：与左侧会话栏同一份派生结果（工作区 → 会话，含状态与更新时间）
  bindSessionTree(() => {
    if (!sessions) return { groups: [], current: null };
    const workspaces = ctx.get("workspaces") as WorkspacesFace | undefined;
    const workspaceSnapshot = workspaces?.list.getSnapshot();
    return deriveShareTree(
      sessions.list.getSnapshot(),
      workspaceSnapshot?.items ?? [],
      workspaceSnapshot?.archivedSessionIds ?? [],
    );
  });

  try {
    // 会话页签「社区」：注册进 conversation.view（list / scope=session）。
    // label 作为页签文字；order 越大越靠右（官方 chat = 0，trajectory≈10）。
    ctx.slots.inject("conversation.view", () =>
      ctx.slots.register(
        {
          name: "conversation.view",
          id: "dsh-talk",
          order: 20,
          label: "社区",
          registrant: "dsh-talk",
        },
        TalkPage,
      ),
    );
  } catch (error) {
    // 注册失败只降级为诊断输出，绝不让插件 fiber 崩掉整个 GUI。
    console.error("[dsh-talk] slot register failed:", error);
  }

  // 预取一次配置，让社区页打开时身份状态是温的
  void refresh();
}
