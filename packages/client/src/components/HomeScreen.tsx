// ================================================================
// 主工作区：社区栏 | 频道列表 | 聊天面板（含实时状态与输入框）
// 具体区块与弹窗见同目录下的 CommunitiesRail / ChannelList / ChatPane
// / ThreadModals / SearchModals / CommunityAddModal / ShareModals / ProfileModal。
// ================================================================

import type { ReactElement } from "react";
import { useState } from "react";
import { openInbox, useTalkState } from "../store";
import { ChannelList } from "./ChannelList";
import { ChatPane } from "./ChatPane";
import { CommunitiesRail } from "./CommunitiesRail";
import { CommunityAddModal } from "./CommunityAddModal";
import { chatCol, emptyCard, messageRowCss } from "./homeStyles";
import { InboxDialog } from "./Inbox";
import { ProfileModal } from "./ProfileModal";
import { BrandLogo, LoadingHint, palette, smallText } from "./styles";
import { ThreadCreateModal } from "./ThreadModals";

/** 项目仓库地址（logo hover 卡里的唯一外链） */
const PROJECT_REPO = "https://github.com/seolhw/dsh-talk";

// ---------------- 主出口（整页三栏，无独立浮层外壳） ----------------

export function HomeScreen(): ReactElement {
  const talk = useTalkState();
  const [showAdd, setShowAdd] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  /** 创建讨论组弹窗：由 HomeScreen 承载，频道列表菜单与会话头部共用 */
  const [threadCreate, setThreadCreate] = useState<{
    channelId: string;
    seed: { name: string; starterMessageId?: string } | null;
  } | null>(null);
  const inCommunity = talk.view.communityId !== null;
  // 打开社区时 server 在境外、拉取详情偏慢：先给出整体加载态，避免中栏空窗
  const communityBooting = inCommunity && talk.view.communityLoading && !talk.view.community;

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <style>{messageRowCss}</style>
      <CommunitiesRail
        onAdd={() => setShowAdd(true)}
        onInbox={() => void openInbox()}
        onOpenProfile={() => setShowProfile(true)}
      />
      {communityBooting ? (
        <div style={{ ...chatCol, alignItems: "center", justifyContent: "center" }}>
          <LoadingHint text="正在进入社区…" />
        </div>
      ) : inCommunity ? (
        <>
          <ChannelList onCreateThread={(channelId) => setThreadCreate({ channelId, seed: null })} />
          <ChatPane onCreateThread={(channelId, seed) => setThreadCreate({ channelId, seed })} />
        </>
      ) : (
        <div style={{ ...chatCol, alignItems: "center", justifyContent: "center" }}>
          <div style={emptyCard}>
            <BrandLogo size={52} />
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1.3,
                marginTop: 2,
              }}
            >
              欢迎使用 DSH-Talk 开源社区
            </div>
            <span style={{ ...smallText, fontSize: 14, lineHeight: 1.7 }}>
              从左侧选择一个社区开始聊天，
              <br />
              点左栏「＋」发现公开社区、用邀请码加入，或创建新社区。
              <br />
              请不要输入如 密码、银行卡、APIKEY 等敏感信息。
            </span>
            <a
              href={PROJECT_REPO}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 14,
                color: palette.accent,
                textDecoration: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              开源地址
            </a>
          </div>
        </div>
      )}
      <ThreadCreateModal
        open={threadCreate !== null}
        onClose={() => setThreadCreate(null)}
        channelId={threadCreate?.channelId ?? null}
        seed={threadCreate?.seed ?? null}
      />
      <CommunityAddModal open={showAdd} onClose={() => setShowAdd(false)} />
      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
      <InboxDialog />
    </div>
  );
}
