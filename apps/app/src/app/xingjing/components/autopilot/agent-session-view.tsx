/**
 * Agent Session View
 *
 * 包裹 OpenWork MessageList，接入权限/提问 UI，
 * 直接复用 OpenWork 的原生消息渲染能力。
 */

import { Show, createSignal } from 'solid-js';
import type { AgentSessionSlot } from '../../services/team-session-orchestrator';
import type { MessageWithParts } from '../../../types';
import type { Session } from '@opencode-ai/sdk/v2/client';
import MessageList from '../../../components/session/message-list';
import PermissionDialog from './permission-dialog';
import QuestionDialog from './question-dialog';
import { themeColors } from '../../utils/colors';

export interface AgentSessionViewProps {
  slot: AgentSessionSlot;
  /** 跨 Session 的会话查询（支持嵌套 task 线程） */
  getSessionById: (id: string | null) => Session | null;
  getMessagesBySessionId: (id: string | null) => MessageWithParts[];
  ensureSessionLoaded: (id: string) => Promise<void>;
  sessionLoadingById: (id: string | null) => boolean;
  /** 权限 / 提问回调（转发到 TeamSessionOrchestrator） */
  onPermissionReply: (permissionId: string, action: 'once' | 'always' | 'reject') => void;
  onQuestionReply: (requestId: string, answers: string[][]) => void;
  /** 追加消息（多轮） */
  onSendMessage: (text: string) => void;
  developerMode: boolean;
  showThinking: boolean;
  /** 产出物打开回调 */
  onOpenArtifact?: (artifactId: string) => void;
}

export default function AgentSessionView(props: AgentSessionViewProps) {
  const [expandedStepIds, setExpandedStepIds] = createSignal<Set<string>>(new Set());
  let scrollContainerRef: HTMLDivElement | undefined;

  const handlePermissionReply = (action: 'once' | 'always' | 'reject') => {
    const perm = props.slot.pendingPermission();
    if (perm) {
      // 使用 any 类型来避免类型检查问题
      const permId = (perm as any).requestID || (perm as any).permissionID || '';
      props.onPermissionReply(permId, action);
    }
  };

  const handleQuestionReply = (requestId: string, answers: string[][]) => {
    props.onQuestionReply(requestId, answers);
  };

  const handleQuestionReject = (requestId: string) => {
    props.onQuestionReply(requestId, []);
  };

  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        height: '100%',
        'background-color': themeColors.surface,
      }}
    >
      {/* Message List Container */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
        }}
      >
        <MessageList
          messages={props.slot.messages()}
          isStreaming={props.slot.isStreaming()}
          developerMode={props.developerMode}
          showThinking={props.showThinking}
          getSessionById={props.getSessionById}
          getMessagesBySessionId={props.getMessagesBySessionId}
          ensureSessionLoaded={props.ensureSessionLoaded}
          sessionLoadingById={props.sessionLoadingById}
          expandedStepIds={expandedStepIds()}
          setExpandedStepIds={setExpandedStepIds}
          scrollElement={() => scrollContainerRef}
          variant="default"
          onOpenArtifact={props.onOpenArtifact}
        />

        {/* Empty State */}
        <Show when={props.slot.messages().length === 0 && !props.slot.isStreaming()}>
          <div
            style={{
              display: 'flex',
              'flex-direction': 'column',
              'align-items': 'center',
              'justify-content': 'center',
              height: '100%',
              color: themeColors.textMuted,
              'text-align': 'center',
              padding: '40px',
            }}
          >
            <div style={{ 'font-size': '48px', 'margin-bottom': '16px' }}>💬</div>
            <div style={{ 'font-size': '16px', 'font-weight': 500 }}>等待 Agent 响应...</div>
          </div>
        </Show>
      </div>

      {/* Permission Dialog */}
      <Show when={props.slot.pendingPermission()}>
        {(perm) => {
          const p = perm() as any;
          return (
            <PermissionDialog
              request={{
                permissionId: p.requestID || p.permissionID || '',
                sessionId: p.sessionID || '',
                tool: p.tool || '',
                description: p.prompt || p.description || '',
                input: p.args ? JSON.stringify(p.args, null, 2) : (p.input ? JSON.stringify(p.input, null, 2) : undefined),
                resolve: handlePermissionReply,
              }}
              onResolve={handlePermissionReply}
            />
          );
        }}
      </Show>

      {/* Question Dialog */}
      <Show when={props.slot.pendingQuestion()}>
        {(question) => (
          <QuestionDialog
            question={question()}
            onReply={handleQuestionReply}
            onReject={handleQuestionReject}
          />
        )}
      </Show>
    </div>
  );
}
