// ================================================================
// 邀请链接（方案 A）：一条可分享的链接搞定「一键加入 / 一键邀请」
//   GET /invite/:code  → HTML 落地页（无需登录）
//
// 公开的 JSON 预览接口在 routes/invites.ts 的 GET /preview/:code（同一
// /api/invites 前缀，且必须先于那里的 use("*") required 鉴权注册）。
//
// 链接形状 = `${publicOrigin(c)}/invite/${inviteCode}`，其中 inviteCode 是
// 社区创建时生成、固定不过期的 communities.inviteCode（见 lib/ids.newInviteCode）。
// 因此本文件不新增数据表，只负责把码渲染成一张「说明页」：
//   社区信息 + 安装指引 + 显眼的邀请码，引导访客自己去 DSH 里加入。
//
// 注意：这里不做「一键加入」的深链接。DSH-Guild 是装进用户本地 DSH 的插件，
// 浏览器无法跨进程唤起它；能做的只是把「怎么装、装完怎么加入」讲清楚。
// ================================================================

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { communities, type CommunityRow } from "../db/schema";
import { db as dbOf } from "../lib/db";
import type { Env, HonoAppVariables } from "../types";

/** DSH 官方社区 / 仓库地址（落地页里作为安装指引的可点链接） */
const DSH_NPM = "https://www.npmjs.com/package/dsh-guild";
const DSH_REPO = "https://github.com/seolhw/dsh-guild";

/** 邀请落地页路由（公开；/api 之外，返回 HTML） */
export const inviteLandingRoutes = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();

// ---------------- HTML 工具 ----------------

/** HTML 文本转义（社区名/简介都是用户输入，必须转义后再拼进页面） */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 拼一张落地页。
 * 样式全部内联在 <style> 里：一次请求即可渲染完，不依赖任何外部资源，
 * 也不引前端框架（Worker 直接吐 HTML）。
 */
function renderLanding(input: { code: string; community: CommunityRow | null }): string {
  const { code, community } = input;
  const title = community ? `${community.name} · 邀请你加入 DSH 社区` : "邀请链接无效";
  const description = community?.description ?? "";

  const icon = community?.iconUrl ?? "";
  const avatar = icon
    ? `<img class="avatar" src="${escapeHtml(icon)}" alt="" />`
    : `<div class="avatar avatar-fallback">${escapeHtml(
        (community?.name ?? "?").slice(0, 1).toUpperCase(),
      )}</div>`;

  // 安装步骤来自仓库 README 的「安装插件」一节，命令保持一字不差
  const installBlock = `
    <section class="steps">
      <h2>怎么加入</h2>
      <p class="lead">DSH-Guild 要装在本地 DSH 里，网页没法替你打开。</p>

      <div class="step">
        <div class="step-head"><span class="num">1</span><span class="step-title">安装 DSH</span></div>
        <pre><code>npx @deepseek-ai/dsh</code></pre>
      </div>

      <div class="step">
        <div class="step-head"><span class="num">2</span><span class="step-title">安装 DSH-Guild 插件</span></div>
        <pre><code>npx @deepseek-ai/dsh plugin --profile web add dsh-guild
npx @deepseek-ai/dsh web</code></pre>
      </div>

      <div class="step">
        <div class="step-head"><span class="num">3</span><span class="step-title">用邀请码加入</span></div>
        <p class="step-body">
          从会话页签进入 <strong>社区</strong>，注册登录后点 <strong>＋</strong> 选「加入」，粘贴上面的邀请码。
        </p>
      </div>
    </section>

    <p class="links">
      <a href="${DSH_REPO}" target="_blank" rel="noreferrer">开源地址</a>
      ·
      <a href="${DSH_NPM}" target="_blank" rel="noreferrer">npm</a>
    </p>`;

  const body = community
    ? `
    <header class="hero">
      ${avatar}
      <div class="hero-text">
        <div class="eyebrow">你被邀请加入</div>
        <h1>${escapeHtml(community.name)}</h1>
        <div class="meta">${community.memberCount} 位成员 · ${
          community.privacy === "public" ? "公开社区" : "私有社区"
        }</div>
      </div>
    </header>

    ${description ? `<p class="desc">${escapeHtml(description)}</p>` : ""}

    <section class="invite">
      <div class="invite-label">邀请码</div>
      <div class="invite-row">
        <code id="invite-code">${escapeHtml(code)}</code>
        <button id="copy-btn" type="button">复制</button>
      </div>
      <p class="invite-hint">在 DSH 里粘贴此码即可加入。</p>
    </section>

    ${installBlock}

    <script>
      (function () {
        var btn = document.getElementById("copy-btn");
        var codeEl = document.getElementById("invite-code");
        if (!btn || !codeEl) return;
        var text = codeEl.textContent || "";
        function done() {
          btn.textContent = "已复制";
          setTimeout(function () { btn.textContent = "复制"; }, 1600);
        }
        btn.addEventListener("click", function () {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fallback);
          } else {
            fallback();
          }
        });
        function fallback() {
          var range = document.createRange();
          range.selectNodeContents(codeEl);
          var sel = window.getSelection();
          if (!sel) return;
          sel.removeAllRanges();
          sel.addRange(range);
          btn.textContent = "已选中，请手动复制";
        }
      })();
    </script>`
    : `
    <header class="hero">
      <div class="avatar avatar-fallback">!</div>
      <div class="hero-text">
        <div class="eyebrow">邀请链接无效</div>
        <h1>找不到这个社区</h1>
      </div>
    </header>
    <p class="desc">该邀请链接对应的社区不存在，或邀请码已被更换。请向邀请你的人索取新的链接。</p>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 20px 56px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background: #f5f6f8; color: #1a1a1a; line-height: 1.6;
  }
  .wrap { width: 100%; max-width: 560px; margin: 0 auto; }
  .panel {
    background: #ffffff; border: 1px solid rgba(0,0,0,0.08); border-radius: 16px;
    padding: 28px; box-shadow: 0 2px 16px rgba(0,0,0,0.06);
  }
  .hero { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
  .hero-text { min-width: 0; }
  .avatar {
    width: 64px; height: 64px; border-radius: 50%; flex: 0 0 auto;
    display: block; object-fit: cover;
  }
  .avatar-fallback {
    display: grid; place-items: center; background: #eceef2;
    font-size: 26px; font-weight: 700; color: #6b7280;
  }
  .eyebrow { font-size: 12px; color: #6b7280; margin-bottom: 2px; }
  h1 { font-size: 21px; margin: 0 0 4px; line-height: 1.35; word-break: break-word; }
  .meta { font-size: 13px; color: #6b7280; }
  .desc {
    font-size: 14px; color: #4b5563; margin: 0 0 20px;
    white-space: pre-wrap; word-break: break-word;
  }

  .invite {
    border: 1px solid rgba(77,107,254,0.28); background: rgba(77,107,254,0.05);
    border-radius: 12px; padding: 16px;
  }
  .invite-label { font-size: 12px; color: #4d6bfe; font-weight: 600; margin-bottom: 8px; }
  .invite-row { display: flex; gap: 10px; align-items: stretch; }
  #invite-code {
    flex: 1 1 auto; min-width: 0; padding: 12px 14px; border-radius: 10px;
    background: #ffffff; border: 1px solid rgba(0,0,0,0.1);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 18px; font-weight: 700; letter-spacing: 2px; color: #111827;
    word-break: break-all; display: flex; align-items: center;
  }
  #copy-btn {
    flex: 0 0 auto; padding: 12px 20px; border: none; border-radius: 10px;
    background: #4d6bfe; color: #ffffff; font-size: 15px; font-weight: 600;
    cursor: pointer; font-family: inherit;
  }
  #copy-btn:active { transform: translateY(1px); }
  .invite-hint { font-size: 12px; color: #6b7280; margin: 10px 0 0; }

  .steps { margin-top: 28px; }
  .steps h2 { font-size: 15px; margin: 0 0 8px; }
  .lead { font-size: 13px; color: #6b7280; margin: 0 0 18px; }
  .step { margin-bottom: 20px; }
  .step:last-child { margin-bottom: 0; }
  .step-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .num {
    width: 20px; height: 20px; border-radius: 50%; flex: 0 0 auto;
    background: #eceef2; color: #374151; font-size: 12px; font-weight: 700;
    display: grid; place-items: center;
  }
  .step-title { font-size: 14px; font-weight: 600; }
  .step-body { font-size: 13px; color: #6b7280; margin: 6px 0 0; }
  pre {
    margin: 0; padding: 12px 14px; border-radius: 10px; overflow-x: auto;
    background: #f3f4f6; border: 1px solid rgba(0,0,0,0.06);
  }
  pre code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12.5px; color: #111827; white-space: pre;
  }
  code.inline {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; background: #f3f4f6; padding: 2px 5px; border-radius: 4px;
    color: #111827; word-break: break-all;
  }
  .links { font-size: 13px; color: #6b7280; margin: 24px 0 0; text-align: center; }
  .links a { color: #4d6bfe; }

  @media (prefers-color-scheme: dark) {
    body { background: #17181a; color: #f3f4f6; }
    .panel { background: #232427; border-color: rgba(255,255,255,0.08); }
    .avatar-fallback { background: #2f3134; color: #9ca3af; }
    .eyebrow, .meta, .lead, .step-body, .invite-hint, .links { color: #9ca3af; }
    .desc { color: #c7cad1; }
    .invite { background: rgba(77,107,254,0.12); border-color: rgba(77,107,254,0.4); }
    #invite-code { background: #2f3134; border-color: rgba(255,255,255,0.1); color: #f3f4f6; }
    .num { background: #2f3134; color: #c7cad1; }
    pre, code.inline { background: #2f3134; border-color: rgba(255,255,255,0.08); }
    pre code, code.inline { color: #f3f4f6; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="panel">
${body}
  </div>
</div>
</body>
</html>`;
}

// ---------------- 路由 ----------------

/** 按邀请码取社区行（无则 null，交给调用方决定 404 形态） */
async function communityByInviteCode(
  db: ReturnType<typeof dbOf>,
  code: string,
): Promise<CommunityRow | null> {
  const row = (
    await db.select().from(communities).where(eq(communities.inviteCode, code)).limit(1)
  )[0];
  return row ?? null;
}

// --- GET /invite/:code —— 分享落地页 ---
// 无效码也返回 200 + 友好页面（而不是 JSON 404）：链接是在聊天工具里被点开的，
// 打开者需要看到「去找邀请人要新链接」，而不是一段报错 JSON。
inviteLandingRoutes.get("/:code", async (c) => {
  const code = c.req.param("code").trim();
  // 落地页由未登录的外部访客触发（链接可能被贴进任何聊天工具），
  // 因此查询失败不能把 JSON 500 抛给访客：降级成社区不存在，
  // 让他看到「去找邀请人要新链接」的页面，而不是一段报错。
  const community =
    code.length > 0 ? await communityByInviteCode(dbOf(c), code).catch(() => null) : null;
  return c.html(renderLanding({ code, community }));
});
