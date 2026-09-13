// ================================================================
// 「发现 / 加入 / 创建」社区合并弹窗：顶部 tab 切换，默认「发现」。
// ================================================================

import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Community } from "@dsh-talk/types/entities";
import { type CSSProperties, type ReactElement, useEffect, useState } from "react";
import {
  createCommunity,
  discoverCommunities,
  joinCommunityByCode,
  joinPublicCommunity,
  openCommunity,
  uploadImage,
  useTalkState,
} from "../store";
import {
  Avatar,
  AvatarPicker,
  fieldBlock,
  fieldLabel,
  LoadingHint,
  palette,
  pillGroup,
  pillStyle,
  smallText,
  Spinner,
} from "./styles";
import { TalkModal as Modal } from "./TalkModal";

// 发现页的社区行（头像 + 名称/成员数 + 简介 + 加入按钮）
const discoverRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 10px",
  borderRadius: 10,
  background: palette.inputBg,
  border: `1px solid ${palette.border}`,
};

const discoverName: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const discoverDesc: CSSProperties = {
  fontSize: 14,
  color: palette.muted,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** 「发现 / 加入 / 创建」合并为一个弹窗：顶部 tab 切换，默认「发现」 */
export function CommunityAddModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement {
  const talk = useTalkState();
  const [tab, setTab] = useState<"join" | "discover" | "create">("discover");
  // 加入：邀请码
  const [code, setCode] = useState("");
  // 发现：公开社区目录
  const [discoverItems, setDiscoverItems] = useState<Community[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [joiningId, setJoiningId] = useState<string | null>(null);
  // 创建：名称 / 简介 / 可见性 / 头像
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "private">("public");
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 社区头像上传中
  const [iconBusy, setIconBusy] = useState(false);

  // 我已在的社区（发现页据此把「加入」换成「进入」）
  const joinedIds = new Set(talk.communities.map((c) => c.id));

  // 每次打开：重置表单，默认落在「发现」
  // biome-ignore lint/correctness/useExhaustiveDependencies: 仅在弹窗打开时拉取一次热门列表
  useEffect(() => {
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
      void loadDiscover("");
    }
  }, [open]);

  async function pickIcon(file: File): Promise<void> {
    setIconBusy(true);
    const url = await uploadImage(file);
    setIconBusy(false);
    if (url) setIconUrl(url);
  }

  /** 拉公开社区目录（关键词为空 = 热门） */
  async function loadDiscover(q: string): Promise<void> {
    setDiscoverLoading(true);
    const items = await discoverCommunities({ q });
    setDiscoverItems(items);
    setDiscoverLoading(false);
  }

  /** 加入公开社区并进入 */
  async function enter(communityId: string): Promise<void> {
    if (joiningId !== null) return;
    setJoiningId(communityId);
    const ok = await joinPublicCommunity(communityId);
    setJoiningId(null);
    if (ok) onClose();
  }

  async function submit(): Promise<void> {
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
    const body: {
      name: string;
      description?: string;
      privacy?: "public" | "private";
      iconUrl?: string | null;
    } = {
      name: name.trim(),
      privacy,
      iconUrl,
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={creating ? "创建社区" : discovering ? "发现社区" : "加入社区"}
      closeLabel="关闭"
      footer={
        discovering ? (
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={busy || (creating ? name.trim().length === 0 : code.trim().length === 0)}
              onClick={() => void submit()}
            >
              {busy ? (creating ? "创建中…" : "加入中…") : creating ? "创建" : "加入"}
            </Button>
          </>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* tab 顶栏：发现（默认）/ 加入 / 创建 */}
        <div style={pillGroup}>
          <button
            type="button"
            style={pillStyle(discovering)}
            onClick={() => {
              setTab("discover");
              void loadDiscover(keyword);
            }}
          >
            发现
          </button>
          <button type="button" style={pillStyle(tab === "join")} onClick={() => setTab("join")}>
            加入
          </button>
          <button type="button" style={pillStyle(creating)} onClick={() => setTab("create")}>
            创建
          </button>
        </div>
        {creating ? (
          <>
            <div style={fieldBlock}>
              <span style={fieldLabel}>社区头像</span>
              <AvatarPicker
                src={iconUrl}
                label={name.trim() || "社区"}
                size={60}
                onPick={(file) => void pickIcon(file)}
                onRemove={() => setIconUrl(null)}
                uploadLabel="设置头像"
                removeLabel="移除头像"
                busy={busy || iconBusy}
                kind="community"
              />
            </div>
            <div style={fieldBlock}>
              <label htmlFor="talk-create-name" style={fieldLabel}>
                社区名称
              </label>
              <Input
                id="talk-create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="社区名称"
              />
            </div>
            <div style={fieldBlock}>
              <label htmlFor="talk-create-desc" style={fieldLabel}>
                简介
              </label>
              <Input
                id="talk-create-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简介（可选）"
              />
            </div>
            <div style={fieldBlock}>
              <span style={fieldLabel}>可见性</span>
              <div style={pillGroup}>
                <button
                  type="button"
                  style={pillStyle(privacy === "public")}
                  onClick={() => setPrivacy("public")}
                >
                  公开
                </button>
                <button
                  type="button"
                  style={pillStyle(privacy === "private")}
                  onClick={() => setPrivacy("private")}
                >
                  私有
                </button>
              </div>
            </div>
          </>
        ) : discovering ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void loadDiscover(keyword);
                  }
                }}
                placeholder="搜索公开社区（名称 / 简介）"
                aria-label="搜索公开社区"
              />
              <Button
                variant="outline"
                icon={discoverLoading ? <Spinner size={14} /> : undefined}
                disabled={discoverLoading}
                onClick={() => void loadDiscover(keyword)}
              >
                {discoverLoading ? "搜索中…" : "搜索"}
              </Button>
            </div>
            {discoverLoading ? (
              <LoadingHint text="加载社区…" padding="8px 2px" />
            ) : discoverItems.length === 0 ? (
              <div style={{ ...smallText, padding: "8px 2px" }}>没有找到公开社区。</div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                {discoverItems.map((item) => {
                  const joined = joinedIds.has(item.id);
                  return (
                    <div key={item.id} style={discoverRow}>
                      <Avatar label={item.name} src={item.iconUrl} kind="community" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={discoverName}>
                          {item.name}
                          <span style={{ color: palette.muted, fontSize: 14 }}>
                            {" "}
                            · {item.memberCount} 成员
                          </span>
                        </div>
                        {item.description ? (
                          <div style={discoverDesc}>{item.description}</div>
                        ) : null}
                      </div>
                      <Button
                        size="sm"
                        variant={joined ? "ghost" : "primary"}
                        icon={joiningId === item.id ? <Spinner size={14} /> : undefined}
                        disabled={joiningId !== null}
                        onClick={() => (joined ? void openCommunity(item.id) : void enter(item.id))}
                      >
                        {joined ? "进入" : joiningId === item.id ? "加入中…" : "加入"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={fieldBlock}>
            <label htmlFor="talk-join-code" style={fieldLabel}>
              邀请码
            </label>
            <Input
              id="talk-join-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="邀请码，如 ABCD1234"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
