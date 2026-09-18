// ================================================================
// 站内确认弹窗：替代浏览器自带的 window.confirm，外观与其它弹窗一致。
// 由 GuildPage 常驻挂载，状态来自 store 的 confirm 字段；
// 调用点通过 askConfirm(...) 返回的 Promise 拿到用户选择。
// ================================================================

import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ReactElement } from "react";
import { settleConfirm, useGuildState } from "../store";
import { palette } from "./styles";
import { GuildModal as Modal } from "./GuildModal";

/** 危险操作的确认按钮：沿用主按钮形态，改用错误色 */
const dangerButton = { background: palette.danger, color: palette.onColor } as const;

export function ConfirmDialog(): ReactElement | null {
  const { confirm } = useGuildState();
  if (!confirm) return null;

  return (
    <Modal
      open
      onClose={() => settleConfirm(false)}
      title={confirm.title}
      closeLabel="关闭"
      description={confirm.message}
      footer={
        <>
          <Button variant="ghost" onClick={() => settleConfirm(false)}>
            {confirm.cancelLabel}
          </Button>
          <Button
            variant="primary"
            style={confirm.danger ? dangerButton : undefined}
            onClick={() => settleConfirm(true)}
          >
            {confirm.confirmLabel}
          </Button>
        </>
      }
    />
  );
}
