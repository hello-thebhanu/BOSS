import { BossCore } from '../../components/core/BossCore';
import { OfflineState, PageHeading, StatusBadge } from '../../components/common/PageHeading';
import type { Tool } from '../../services/tools/tool';
import { localData } from '../../services/storage/localData';
import { useStoredResource } from '../../services/storage/useStoredResource';
import { registerProject } from '../../services/projects/projectRegistration';
import { useState, useRef, useCallback, useEffect } from 'react';

import { routes } from '../../app/router/routes';
import { useAppStore } from '../../app/store/appStore';
import { projectFilesystem, type FileEntry } from '../../services/filesystem/projectFilesystem';
import { terminalService, type TerminalSession, type TerminalOutput } from '../../services/terminal/terminalService';
import { gitService, type GitStatus, type GitCommit } from '../../services/git/gitService';
import { aiProviderService } from '../../services/ai/aiProviderService';
import type { AIProviderId, AIProviderStatusResult } from '../../services/ai/aiProviderTypes';
import type { Message, Conversation } from '../../core/types/conversation';
import type { Session, AgentAction, ToolExecution } from '../../services/storage/types/entities';
import { agentOrchestrator, type AgentRun } from '../../services/agent/agent';
import { toolRuntime } from '../../services/tools/toolRuntime';
import { formatShortcut } from '../../services/platform/platformService';
import { LiquidGlassGroup, LiquidGlassButton } from '../../components/liquid-glass';

export function HomePage() {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const projectsResource = useStoredResource(() => localData.projects.listProjects());
  const projects = projectsResource.data;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const [prompt, setPrompt] = useState('');
  const [providerStatus, setProviderStatus] = useState<AIProviderStatusResult | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<AIProviderId>('ollama');
  const [activeModel, setActiveModel] = useState<string>('');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const id = await aiProviderService.getActiveProviderId();
        const st = await aiProviderService.getActiveStatus();
        const mdl = await aiProviderService.getProviderModel(id);
        if (active) {
          setActiveProviderId(id);
          setProviderStatus(st);
          setActiveModel(mdl);
        }
      } catch {
        if (active) {
          setProviderStatus({
            providerId: 'ollama',
            status: 'unavailable',
            reason: 'Provider offline or unavailable',
            models: [],
            activeModel: '',
          });
        }
      }
    };

    refresh();
    const unsub = aiProviderService.subscribe(refresh);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const isAvailable = providerStatus?.status === 'connected' || providerStatus?.status === 'configured';

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handlePromptSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAvailable) {
      navigate(routes.models);
      return;
    }
    navigate(routes.chat);
  };

  const quickActions = [
    {
      title: 'Start New Chat',
      desc: 'Engage neural interface for architectural planning & code synthesis',
      path: routes.chat,
    },
    {
      title: 'Open Coding Studio',
      desc: 'Browse project files, inspect AST, and edit in integrated studio',
      path: routes.coding,
    },
    {
      title: 'Launch Terminal',
      desc: 'Isolated shell session with project sandbox & command logging',
      path: routes.terminal,
    },
  ];

  return (
    <main className="page">
      <PageHeading
        eyebrow="LOCATION: HOME // WORKSPACE_CORE"
        title={<>Good afternoon, <span className="home-username">Bhanu</span></>}
      >
        <StatusBadge tone="cyan">BOSS READY</StatusBadge>
      </PageHeading>

      <section className="home-hero">
        <div style={{ maxWidth: 720, margin: '0 auto 12px' }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px 0', textTransform: 'uppercase' }}>
            What Are We Building Today?
          </h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Local-first AI developer workstation. Air-gapped, zero data leaves this device.
          </p>
        </div>

        <div className="hero-composition">
          <BossCore size="hero" />
          <div className="hero-stacked-words" aria-label="Core Philosophy">
            <span className="stacked-word">THINK</span>
            <span className="stacked-word">BUILD</span>
            <span className="stacked-word">EXPLORE</span>
            <span className="stacked-word locally">LOCALLY</span>
          </div>
        </div>
        <p className="core-caption">Ready When You Are.</p>
      </section>

      <section className="panel panel-pad boss-prompt-container" style={{ marginTop: 8 }}>
        <form onSubmit={handlePromptSubmit} className="prompt boss-glass-input" style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center' }}>
          <span className="core-orb" />
          <input
            aria-label="Ask BOSS"
            placeholder={
              isAvailable
                ? 'Ask BOSS To Build, Debug, Explain, Or Create…'
                : activeProviderId === 'ollama'
                ? 'Local AI Offline — Configure Local Model To Enable Prompt'
                : `${activeProviderId.toUpperCase()} Disconnected — Configure API Key In Settings`
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="button primary"
          >
            {isAvailable ? 'Ask BOSS' : activeProviderId === 'ollama' ? 'Configure Local AI →' : 'Configure Cloud AI →'}
          </button>
        </form>
      </section>

      <div className="grid grid-3" style={{ marginTop: 18 }}>
        {quickActions.map((act) => (
          <button
            type="button"
            className="quick-action-card"
            key={act.title}
            onClick={() => navigate(act.path)}
          >
            <div className="card-header">
              <span className="card-title">{act.title}</span>
              <span className="card-chevron">›</span>
            </div>
            <p className="card-desc">{act.desc}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        {projects.length > 0 ? (
          <article className="panel panel-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p className="eyebrow" style={{ margin: 0 }}>WORKSPACE CONTEXT</p>
              <StatusBadge tone="cyan">{projects.length} {projects.length === 1 ? 'PROJECT' : 'PROJECTS'}</StatusBadge>
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0' }}>
              {activeProject ? activeProject.name : 'No Active Project Selected'}
            </h2>
            <p className="muted mono" style={{ fontSize: 11.5, margin: '0 0 16px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeProject ? activeProject.path : 'Select A Project To Activate Coding Studio, Terminal, And Git'}
            </p>
            <LiquidGlassGroup orientation="horizontal" className="hero-context-actions">
              <LiquidGlassButton
                variant="primary"
                onClick={() => navigate(routes.coding)}
                disabled={!activeProject}
              >
                Open Studio
              </LiquidGlassButton>
              <LiquidGlassButton
                variant="secondary"
                onClick={() => navigate(routes.projects)}
              >
                Manage Projects
              </LiquidGlassButton>
            </LiquidGlassGroup>
          </article>
        ) : (
          <OfflineState title="No Registered Projects">
            Register a local project to enable Coding Studio, Terminal, Git, and Agent capabilities.
          </OfflineState>
        )}

        {isAvailable ? (
          <article className="panel panel-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p className="eyebrow" style={{ margin: 0 }}>
                {activeProviderId === 'ollama' ? 'LOCAL AI ENGINE' : `${activeProviderId.toUpperCase()} CLOUD ENGINE (BYOK)`}
              </p>
              <StatusBadge tone="green">{providerStatus?.status?.toUpperCase() ?? 'ONLINE'}</StatusBadge>
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0' }}>
              {activeModel || 'Model Connected'}
            </h2>
            <p className="muted mono" style={{ fontSize: 11.5, margin: '0 0 16px 0' }}>
              {activeProviderId === 'ollama'
                ? 'Provider: Ollama // Endpoint: http://localhost:11434'
                : `Provider: ${activeProviderId.toUpperCase()} // BYOK // Native Encrypted Vault`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="button primary"
                onClick={() => navigate(routes.chat)}
              >
                Start Chat
              </button>
              <button
                type="button"
                className="button"
                onClick={() => navigate(routes.models)}
              >
                AI Settings
              </button>
            </div>
          </article>
        ) : (
          <OfflineState
            title={activeProviderId === 'ollama' ? 'No Local Model Connected' : `${activeProviderId.toUpperCase()} Disconnected`}
          >
            {activeProviderId === 'ollama'
              ? 'Start your local Ollama instance, then configure it under Settings > Models & AI Engine. BOSS never falls back to cloud providers.'
              : `Configure your ${activeProviderId.toUpperCase()} API key in Settings > Models & AI Engine. Your key is stored in the native encrypted vault.`}
          </OfflineState>
        )}
      </div>
    </main>
  );
}

export function ChatPage() {
  const [conversations, setConversations] = useState<readonly Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [providerStatus, setProviderStatus] = useState<AIProviderStatusResult | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<AIProviderId>('ollama');
  const [activeModel, setActiveModel] = useState<string>('');
  const [checkingRuntime, setCheckingRuntime] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);
  const dispatchCore = useAppStore((state) => state.dispatchCore);
  const dispatchAgent = useAppStore((state) => state.dispatchAgent);
  const agentStatus = useAppStore((state) => state.agentStatus);
  const core = useAppStore((state) => state.core);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [isAgentMode, setIsAgentMode] = useState(false);
  const [activeAgentRun, setActiveAgentRun] = useState<AgentRun | null>(null);
  const [isAgentExecuting, setIsAgentExecuting] = useState(false);

  const projectsResource = useStoredResource(() => localData.projects.listProjects());
  const projects = projectsResource.data;

  const refreshRuntime = useCallback(async () => {
    setCheckingRuntime(true);
    try {
      const id = await aiProviderService.getActiveProviderId();
      const st = await aiProviderService.getActiveStatus();
      const mdl = await aiProviderService.getProviderModel(id);
      setActiveProviderId(id);
      setProviderStatus(st);
      setActiveModel(mdl);
    } catch (err: unknown) {
      setProviderStatus({
        providerId: 'ollama',
        status: 'unavailable',
        reason: err instanceof Error ? err.message : String(err),
        models: [],
        activeModel: '',
      });
    } finally {
      setCheckingRuntime(false);
    }
  }, []);

  useEffect(() => {
    refreshRuntime();
    const unsub = aiProviderService.subscribe(refreshRuntime);
    return () => {
      unsub();
    };
  }, [refreshRuntime]);

  const isAvailable = providerStatus?.status === 'connected' || providerStatus?.status === 'configured';

  const loadConversations = useCallback(async () => {
    try {
      const list = await localData.conversations.listConversations();
      setConversations(list);
      if (list.length > 0) {
        setActiveConversationId((prev) => prev ?? list[0].id);
      }
    } catch {
      // Local database may be uninitialized
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        const msgs = await localData.messages.listMessages(activeConversationId);
        if (active) setMessages(msgs);
      } catch {
        if (active) setMessages([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleNewConversation = async () => {
    const newConv: Conversation = {
      id: crypto.randomUUID(),
      title: 'New Conversation',
      projectId: activeProjectId ?? undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    try {
      await localData.conversations.createConversation(newConv);
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessages([]);
      setErrorMessage(null);
    } catch (err: unknown) {
      setErrorMessage(`Failed to create conversation: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const navigateToModels = () => {
    window.history.pushState({}, '', routes.models);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = inputPrompt.trim();
    if (!prompt || isStreaming) return;

    if (!isAvailable) {
      setErrorMessage(
        `AI PROVIDER OFFLINE: ${providerStatus?.reason ?? 'Cannot connect to active provider.'} Please configure in Settings > Models & AI Engine.`
      );
      return;
    }

    setErrorMessage(null);

    let convId = activeConversationId;
    let currentConv: Conversation;
    if (!convId) {
      const newConv: Conversation = {
        id: crypto.randomUUID(),
        title: prompt.slice(0, 32) || 'Conversation',
        projectId: activeProjectId ?? undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      await localData.conversations.createConversation(newConv);
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      convId = newConv.id;
      currentConv = newConv;
    } else {
      const existing = conversations.find((c) => c.id === convId);
      currentConv = existing ?? {
        id: convId,
        title: 'Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
      status: 'complete',
      attachments: [],
      toolCalls: [],
      metadata: {},
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputPrompt('');

    try {
      await localData.messages.createMessage({ ...userMessage, conversationId: convId });
    } catch {
      // Ignored
    }

    try {
      dispatchCore({ type: 'PROMPT_SUBMITTED' });
    } catch {}

    setIsStreaming(true);
    setStreamingText('');

    try {
      const provider = await aiProviderService.getActiveModelProvider();
      const conversationForGen: Conversation = {
        ...currentConv,
        messages: updatedMessages,
      };

      let completeMsg: Message | null = null;
      for await (const event of provider.stream({ conversation: conversationForGen })) {
        if (event.type === 'token') {
          setStreamingText((prev) => prev + event.value);
        } else if (event.type === 'complete') {
          completeMsg = event.message;
        }
      }

      if (completeMsg) {
        setMessages((prev) => [...prev, completeMsg!]);
        try {
          await localData.messages.createMessage({ ...completeMsg, conversationId: convId });
        } catch {}
      }

      try {
        dispatchCore({ type: 'RESPONSE_READY' });
        setTimeout(() => {
          try {
            dispatchCore({ type: 'RESET' });
          } catch {}
        }, 1200);
      } catch {}
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`AI inference failed: ${msg}`);
      try {
        dispatchCore({ type: 'RESET' });
      } catch {}
    } finally {
      setIsStreaming(false);
      setStreamingText('');
    }
  };

  const handleAgentRun = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = inputPrompt.trim();
    if (!prompt || isAgentExecuting) return;

    if (!activeProjectId) {
      setErrorMessage(
        'Agent execution requires an active registered project. Please select a project from the selector or register one in Projects.'
      );
      return;
    }

    if (!isAvailable) {
      setErrorMessage(
        `AI PROVIDER OFFLINE: ${providerStatus?.reason ?? 'Cannot connect to active provider.'} Please configure in Settings > Models & AI Engine.`
      );
      return;
    }

    setErrorMessage(null);
    setIsAgentExecuting(true);
    setInputPrompt('');

    // Ensure conversation exists
    let convId = activeConversationId;
    if (!convId) {
      const newConv: Conversation = {
        id: crypto.randomUUID(),
        title: `Task: ${prompt.slice(0, 24)}`,
        projectId: activeProjectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      try {
        await localData.conversations.createConversation(newConv);
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        convId = newConv.id;
      } catch {}
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `[AGENT TASK] ${prompt}`,
      timestamp: new Date().toISOString(),
      status: 'complete',
      attachments: [],
      toolCalls: [],
      metadata: { isAgentTask: true, projectId: activeProjectId },
    };

    setMessages((prev) => [...prev, userMessage]);
    if (convId) {
      try {
        await localData.messages.createMessage({ ...userMessage, conversationId: convId });
      } catch {}
    }

    try {
      dispatchAgent('START');
    } catch {}

    try {
      const runResult = await agentOrchestrator.executeRun(
        prompt,
        activeProjectId,
        convId ?? undefined,
        {
          listener: (updatedRun) => {
            setActiveAgentRun({ ...updatedRun });
            if (updatedRun.status === 'awaiting_permission') {
              try { dispatchAgent('PLAN_READY'); } catch {}
            } else if (updatedRun.status === 'executing') {
              try { dispatchAgent('PERMISSION_GRANTED'); } catch {}
            } else if (updatedRun.status === 'observing') {
              try { dispatchAgent('ACTION_FINISHED'); } catch {}
            }
          },
        }
      );

      setActiveAgentRun({ ...runResult });

      if (runResult.status === 'complete') {
        try {
          dispatchAgent('FINISH');
          setTimeout(() => {
            try { dispatchAgent('RESET'); } catch {}
          }, 1500);
        } catch {}
      } else if (runResult.status === 'cancelled') {
        try { dispatchAgent('CANCEL'); } catch {}
        try { dispatchCore({ type: 'RESET' }); } catch {}
      } else {
        try { dispatchAgent('FAIL'); } catch {}
        try { dispatchCore({ type: 'RESET' }); } catch {}
      }

      // Generate task summary message for conversation history
      const stepSummaryLines = runResult.plan.steps.map((step, idx) => {
        const action = runResult.actions[idx];
        const mark = action?.status === 'complete' ? '✓' : action?.status === 'failed' ? '✗' : '•';
        return `${idx + 1}. [${mark}] ${step.description} (${step.toolName ?? 'reasoning'})`;
      }).join('\n');

      const isSuccess = runResult.status === 'complete';
      const summaryMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: isSuccess
          ? `### ⚡ BOSS Agent Task Complete\n\n**Goal:** ${runResult.goal}\n\n**Executed Plan:**\n${stepSummaryLines}\n\n**Summary:** ${runResult.summary ?? 'All steps completed successfully.'}`
          : `### ⚠️ BOSS Agent Task ${runResult.status.toUpperCase()}\n\n**Goal:** ${runResult.goal}\n\n**Executed Plan:**\n${stepSummaryLines || '(No steps executed)'}\n\n**Error:** ${runResult.error ?? 'Task halted.'}`,
        timestamp: new Date().toISOString(),
        status: 'complete',
        attachments: [],
        toolCalls: [],
        metadata: {
          agentRunId: runResult.id,
          status: runResult.status,
          model: activeModel,
        },
      };

      setMessages((prev) => [...prev, summaryMsg]);
      if (convId) {
        try {
          await localData.messages.createMessage({ ...summaryMsg, conversationId: convId });
        } catch {}
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Agent task failed: ${msg}`);
      try { dispatchAgent('FAIL'); } catch {}
      try { dispatchCore({ type: 'RESET' }); } catch {}
    } finally {
      setIsAgentExecuting(false);
    }
  };

  const activeConvTitle =
    conversations.find((c) => c.id === activeConversationId)?.title ?? 'Conversation';

  return (
    <main className="page">
      <PageHeading
        eyebrow={`Neural Chat // ${activeProviderId === 'ollama' ? 'Local Inference' : `${activeProviderId.toUpperCase()} Cloud (BYOK)`}`}
        title={activeConvTitle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isAgentExecuting ? (
            <StatusBadge tone="cyan">{`AGENT ${activeAgentRun?.status.toUpperCase() ?? 'RUNNING'}`}</StatusBadge>
          ) : isStreaming || core.status === 'THINKING' ? (
            <StatusBadge tone="cyan">THINKING…</StatusBadge>
          ) : isAvailable && activeModel ? (
            <StatusBadge tone="green">{`${activeModel} (${activeProviderId.toUpperCase()})`}</StatusBadge>
          ) : (
            <StatusBadge tone="muted">
              {activeProviderId === 'ollama' ? 'LOCAL AI OFFLINE' : `${activeProviderId.toUpperCase()} OFFLINE`}
            </StatusBadge>
          )}
          <button type="button" className="button" onClick={handleNewConversation}>
            New Chat
          </button>
          <BossCore />
        </div>
      </PageHeading>

      <div className="chat-layout">
        <section
          className="panel panel-pad"
          style={{ display: 'flex', flexDirection: 'column', minHeight: 480 }}
        >
          {errorMessage && (
            <div
              style={{
                padding: '10px 14px',
                marginBottom: 14,
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: 12,
                fontFamily: 'monospace',
                lineHeight: 1.5,
              }}
            >
              {errorMessage}
            </div>
          )}

          {messages.length === 0 && !isStreaming && !activeAgentRun ? (
            <div className="empty" style={{ flex: 1 }}>
              <div className="status">
                {isAvailable
                  ? activeProviderId === 'ollama'
                    ? 'LOCAL AI READY'
                    : `${activeProviderId.toUpperCase()} READY`
                  : activeProviderId === 'ollama'
                  ? 'LOCAL AI OFFLINE'
                  : `${activeProviderId.toUpperCase()} OFFLINE`}
              </div>
              <h2>
                {isAvailable
                  ? 'Ready for conversation.'
                  : activeProviderId === 'ollama'
                  ? 'No Local Model Connected'
                  : `${activeProviderId.toUpperCase()} Disconnected`}
              </h2>
              <p>
                {isAvailable
                  ? activeProviderId === 'ollama'
                    ? `Connected to Ollama using model '${activeModel}'. All tokens are computed entirely on this device.`
                    : `Connected to ${activeProviderId.toUpperCase()} using model '${activeModel}'. Credentials stored securely in native encrypted vault.`
                  : activeProviderId === 'ollama'
                  ? 'Start your local Ollama instance, then configure it under Settings > Models & AI Engine. BOSS never falls back to cloud providers.'
                  : `Configure your ${activeProviderId.toUpperCase()} API key in Settings > Models & AI Engine. Your key is stored in the native encrypted vault.`}
              </p>
              {!isAvailable && (
                <button
                  type="button"
                  className="button primary"
                  onClick={navigateToModels}
                  style={{ marginTop: 14 }}
                >
                  {activeProviderId === 'ollama' ? 'Configure Local AI' : 'Configure Cloud AI'}
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                maxHeight: 460,
                overflowY: 'auto',
                paddingRight: 6,
              }}
            >
              {messages.map((m) => (
                <div key={m.id} className={`message ${m.role === 'user' ? 'user' : 'assistant'}`}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 5,
                      fontSize: 11,
                      color: 'var(--muted)',
                      fontFamily: 'monospace',
                    }}
                  >
                    <b>{m.role === 'user' ? 'You' : (m.metadata?.model as string) || 'Assistant'}</b>
                    <span>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ''}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>
                </div>
              ))}
              {isStreaming && (
                <div className="message assistant">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 5,
                      fontSize: 11,
                      color: 'var(--muted)',
                      fontFamily: 'monospace',
                    }}
                  >
                    <b>{activeModel || (activeProviderId === 'ollama' ? 'Local Model' : activeProviderId.toUpperCase())}</b>
                    <span>streaming…</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {streamingText}
                    <span
                      className="core-orb"
                      style={{ display: 'inline-block', marginLeft: 6, verticalAlign: 'middle' }}
                    />
                  </div>
                </div>
              )}

              {activeAgentRun && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--cyan)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    fontSize: 12,
                    marginTop: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="core-orb" />
                      <b style={{ color: 'var(--cyan)' }}>BOSS AGENT EXECUTION</b>
                      <span className="mono muted">({activeAgentRun.status.toUpperCase()})</span>
                    </div>
                    {isAgentExecuting && (
                      <button
                        type="button"
                        className="button"
                        style={{ fontSize: 11, padding: '2px 8px', color: '#fca5a5', borderColor: '#ef4444' }}
                        onClick={() => agentOrchestrator.cancel()}
                      >
                        Cancel Task
                      </button>
                    )}
                  </div>
                  <div>
                    <b>Goal:</b> <span>{activeAgentRun.goal}</span>
                  </div>
                  {activeAgentRun.plan.steps.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                      <b className="muted">Plan Steps ({activeAgentRun.plan.steps.length}):</b>
                      {activeAgentRun.plan.steps.map((step, idx) => {
                        const action = activeAgentRun.actions[idx];
                        const isCurrent = activeAgentRun.currentStepIndex === idx && isAgentExecuting;
                        const isDone = action?.status === 'complete';
                        const isFailed = action?.status === 'failed' || action?.status === 'blocked';
                        return (
                          <div
                            key={step.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '4px 8px',
                              borderRadius: 4,
                              background: isCurrent ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                              borderLeft: isCurrent ? '3px solid var(--cyan)' : '3px solid transparent',
                            }}
                          >
                            <span style={{ fontFamily: 'monospace', width: 18 }}>
                              {isDone ? '✓' : isFailed ? '✗' : isCurrent ? '▶' : '○'}
                            </span>
                            <span style={{ flex: 1 }}>{step.description}</span>
                            {step.toolName && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontFamily: 'monospace',
                                  padding: '1px 6px',
                                  borderRadius: 3,
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid var(--border)',
                                }}
                              >
                                {step.toolName}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {activeAgentRun.error && (
                    <div style={{ color: '#fca5a5', marginTop: 4 }}>
                      <b>Error:</b> {activeAgentRun.error}
                    </div>
                  )}
                  {activeAgentRun.summary && (
                    <div style={{ color: 'var(--green)', marginTop: 4 }}>
                      <b>Summary:</b> {activeAgentRun.summary}
                    </div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          <div
            style={{
              marginTop: 'auto',
              paddingTop: 8,
              paddingBottom: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              fontSize: 12,
              borderTop: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className={`button ${isAgentMode ? 'primary' : ''}`}
                style={{ fontSize: 11, padding: '3px 10px', height: 26 }}
                onClick={() => setIsAgentMode(!isAgentMode)}
              >
                {isAgentMode ? '⚡ Agent Mode: ACTIVE' : '💬 Normal Chat'}
              </button>
              <span className="muted" style={{ fontSize: 11 }}>
                {isAgentMode
                  ? 'Autonomous developer execution bounded to project root'
                  : 'Conversational reasoning via local model'}
              </span>
            </div>

            {isAgentMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="muted" style={{ fontSize: 11 }}>Project:</span>
                {projects.length > 0 ? (
                  <select
                    value={activeProjectId ?? ''}
                    onChange={(e) => setActiveProjectId(e.target.value || null)}
                    style={{
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 11,
                    }}
                  >
                    <option value="">-- Select Project --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ color: '#fca5a5', fontSize: 11 }}>No registered projects</span>
                )}
              </div>
            )}
          </div>

          <div className="panel prompt boss-prompt-container" style={{ paddingTop: 8 }}>
            <span className="core-orb" />
            <input
              aria-label={isAgentMode ? 'Agent Task Goal' : 'Message BOSS'}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (isAgentMode) {
                    handleAgentRun();
                  } else {
                    handleSendMessage();
                  }
                }
              }}
              placeholder={
                !isAvailable
                  ? `${activeProviderId === 'ollama' ? 'Local AI' : activeProviderId.toUpperCase()} provider offline — configure in Settings`
                  : !activeModel
                  ? 'Select a model in Settings to proceed'
                  : isAgentMode
                  ? 'Describe an agent task (e.g., "Check git status and read README.md")…'
                  : `Message ${activeProviderId === 'ollama' ? 'your local model' : activeProviderId.toUpperCase()}… (Enter to send)`
              }
              disabled={isStreaming || isAgentExecuting}
            />
            <button
              type="button"
              className="button primary"
              onClick={() => (isAgentMode ? handleAgentRun() : handleSendMessage())}
              disabled={
                isStreaming ||
                isAgentExecuting ||
                !inputPrompt.trim() ||
                !isAvailable ||
                (isAgentMode && !activeProjectId)
              }
            >
              {isAgentExecuting
                ? 'Running Task…'
                : isStreaming
                ? 'Thinking…'
                : isAgentMode
                ? 'Execute Task'
                : 'Send'}
            </button>
          </div>
        </section>

        <aside className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Active Engine</p>
            <p className="status" style={{ marginTop: 6 }}>
              {isAvailable
                ? `ONLINE: ${activeProviderId.toUpperCase()}`
                : `${activeProviderId.toUpperCase()} OFFLINE`}
            </p>
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <b>Provider:</b> <span className="mono">{activeProviderId.toUpperCase()}</span>
            </div>
            <div>
              <b>Model:</b> <span className="mono">{activeModel || 'None'}</span>
            </div>
            <div>
              <b>Privacy:</b>{' '}
              <span style={{ color: activeProviderId === 'ollama' ? 'var(--cyan)' : 'var(--violet)' }}>
                {activeProviderId === 'ollama' ? 'Loopback Only (Private)' : 'Cloud AI (BYOK - Encrypted Key)'}
              </span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <p className="eyebrow" style={{ margin: 0 }}>Agent Capabilities</p>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div><b>Filesystem:</b> <span className="mono">6 tools (scoped)</span></div>
              <div><b>Terminal:</b> <span className="mono">1 tool (native)</span></div>
              <div><b>Git:</b> <span className="mono">7 tools (native repo)</span></div>
              <div><b>Boundary:</b> <span style={{ color: 'var(--green)' }}>Strict Project Root</span></div>
              <div><b>Max Steps:</b> <span className="mono">10 (bounded)</span></div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
            <button type="button" className="button" onClick={refreshRuntime} disabled={checkingRuntime}>
              {checkingRuntime ? 'Checking…' : 'Refresh Status'}
            </button>
            <button type="button" className="button" onClick={navigateToModels}>
              Settings → Models
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
export function ProjectsPage() {
  const projects = useStoredResource(() => localData.projects.listProjects());
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);
  const [registering, setRegistering] = useState(false);

  const addProject = async () => {
    setRegistering(true);
    try {
      await registerProject();
      window.location.reload();
    } finally {
      setRegistering(false);
    }
  };

  const openProject = (id: string, targetPath: string = routes.coding) => {
    setActiveProjectId(id);
    window.history.pushState({}, '', targetPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const deleteProject = async (id: string, name: string) => {
    const ok = window.confirm(`Remove registered project "${name}"? This only removes the registration from BOSS and does not delete your files on disk.`);
    if (!ok) return;
    try {
      await localData.projects.deleteProject(id);
      if (activeProjectId === id) {
        setActiveProjectId(null);
      }
      window.location.reload();
    } catch (err) {
      alert(`Failed to delete project: ${err}`);
    }
  };

  return (
    <main className="page">
      <PageHeading eyebrow="Projects" title="Your Workspace Projects">
        <LiquidGlassGroup orientation="horizontal">
          <LiquidGlassButton variant="primary" onClick={addProject} disabled={registering}>
            {registering ? 'Opening Picker…' : 'Register Project'}
          </LiquidGlassButton>
        </LiquidGlassGroup>
      </PageHeading>
      {projects.status === 'ready' && projects.data.length > 0 ? (
        <div className="grid grid-3">
          {projects.data.map((project) => {
            const isActive = project.id === activeProjectId;
            return (
              <article
                className="panel panel-pad"
                key={project.id}
                style={isActive ? { borderColor: 'var(--cyan)' } : undefined}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <p className="eyebrow" style={{ margin: 0 }}>{project.stack ?? 'LOCAL PROJECT'}</p>
                  {isActive && <StatusBadge tone="cyan">ACTIVE</StatusBadge>}
                </div>
                <h2 style={{ fontSize: 16, margin: '4px 0 8px 0' }}>{project.name}</h2>
                <p className="muted mono" style={{ fontSize: 11, marginBottom: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.path}</p>
                <LiquidGlassGroup orientation="horizontal" className="project-card-actions">
                  <LiquidGlassButton size="sm" variant="primary" onClick={() => openProject(project.id, routes.coding)}>
                    Open Studio
                  </LiquidGlassButton>
                  <LiquidGlassButton size="sm" variant="secondary" onClick={() => openProject(project.id, routes.terminal)}>
                    Terminal
                  </LiquidGlassButton>
                  <LiquidGlassButton size="sm" variant="secondary" onClick={() => openProject(project.id, routes.git)}>
                    Git
                  </LiquidGlassButton>
                  <LiquidGlassButton
                    size="sm"
                    variant="secondary"
                    style={{ color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                    onClick={() => deleteProject(project.id, project.name)}
                    title="Remove registration"
                  >
                    Remove
                  </LiquidGlassButton>
                </LiquidGlassGroup>
              </article>
            );
          })}
        </div>
      ) : (
        <OfflineState title={projects.status === 'ready' ? 'No Registered Projects' : 'Project Storage Unavailable'}>
          {projects.status === 'ready'
            ? 'Register a local project root. BOSS validates it natively and does not scan, index, or modify its files.'
            : 'The local database service is not available in this environment.'}
        </OfflineState>
      )}
    </main>
  );
}

export function CodingPage() {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);
  const projectsResource = useStoredResource(() => localData.projects.listProjects());
  const projects = projectsResource.data;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const [currentDir, setCurrentDir] = useState('');
  const [entries, setEntries] = useState<readonly FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);

  const prevProjectIdRef = useRef<string | null>(activeProjectId);
  useEffect(() => {
    if (prevProjectIdRef.current !== activeProjectId) {
      prevProjectIdRef.current = activeProjectId;
      setCurrentDir('');
      setSelectedFile(null);
      setFileContent('');
      setIsDirty(false);
      setCreatingType(null);
      setNewItemName('');
    }
  }, [activeProjectId]);

  const cancelCreation = () => {
    setCreatingType(null);
    setNewItemName('');
  };

  const refreshDir = useCallback(async (customStatus?: string) => {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const items = await projectFilesystem.list({ projectId: activeProjectId, relativePath: currentDir });
      setEntries(items);
      setStatusMessage(customStatus ?? `Listed ${items.length} items in /${currentDir}`);
    } catch (err) {
      setStatusMessage(`Failed to list directory: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, currentDir]);

  useEffect(() => {
    if (activeProjectId) {
      refreshDir();
    } else {
      setEntries([]);
      setSelectedFile(null);
      setFileContent('');
      setIsDirty(false);
    }
  }, [activeProjectId, currentDir, refreshDir]);

  const openFile = async (entry: FileEntry) => {
    if (!activeProjectId) return;
    try {
      setStatusMessage(`Loading ${entry.name}…`);
      const content = await projectFilesystem.read({ projectId: activeProjectId, relativePath: entry.relativePath });
      setSelectedFile(entry.relativePath);
      setFileContent(content);
      setIsDirty(false);
      setStatusMessage(`Opened ${entry.name}`);
    } catch (err) {
      setStatusMessage(`Error opening file: ${err}`);
    }
  };

  const saveFile = async () => {
    if (!activeProjectId || !selectedFile) return;
    setSaving(true);
    try {
      await projectFilesystem.write({ projectId: activeProjectId, relativePath: selectedFile }, fileContent);
      setIsDirty(false);
      setStatusMessage(`Saved ${selectedFile}`);
    } catch (err) {
      setStatusMessage(`Save failed: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateItem = async () => {
    if (!activeProjectId || !creatingType) return;
    const defaultName = creatingType === 'file' ? 'new-file.txt' : 'new-folder';
    const rawName = newItemName.trim() || defaultName;
    const cleanName = rawName.replace(/^[/\\]+/, '').trim();
    if (!cleanName) return;

    if (cleanName.includes('..')) {
      setStatusMessage('Path traversal (..) is not permitted');
      return;
    }

    if (entries.some((e) => e.name.toLowerCase() === cleanName.toLowerCase())) {
      setStatusMessage(`"${cleanName}" already exists in this directory`);
      return;
    }

    const relPath = currentDir ? `${currentDir}/${cleanName}` : cleanName;
    try {
      let createdMsg = '';
      if (creatingType === 'file') {
        await projectFilesystem.write({ projectId: activeProjectId, relativePath: relPath }, '');
        createdMsg = `Created file ${cleanName}`;
        setSelectedFile(relPath);
        setFileContent('');
        setIsDirty(false);
      } else {
        await projectFilesystem.createDirectory({ projectId: activeProjectId, relativePath: relPath });
        createdMsg = `Created folder ${cleanName}`;
      }
      setNewItemName('');
      setCreatingType(null);
      await refreshDir(createdMsg);
    } catch (err) {
      setStatusMessage(`Creation failed: ${err}`);
    }
  };

  const deleteItem = async (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeProjectId) return;
    const ok = window.confirm(`Delete ${entry.name}? This operation is permanent.`);
    if (!ok) return;
    try {
      await projectFilesystem.remove({ projectId: activeProjectId, relativePath: entry.relativePath });
      if (selectedFile === entry.relativePath) {
        setSelectedFile(null);
        setFileContent('');
        setIsDirty(false);
      }
      await refreshDir(`Deleted ${entry.name}`);
    } catch (err) {
      setStatusMessage(`Delete failed: ${err}`);
    }
  };

  const navigateUp = () => {
    if (!currentDir) return;
    const parts = currentDir.split('/');
    parts.pop();
    setCurrentDir(parts.join('/'));
  };

  return (
    <main className="page">
      <PageHeading eyebrow="Coding Studio" title="Studio">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {projects.length > 0 && (
            <select
              aria-label="Select active project"
              className="button mono"
              value={activeProjectId ?? ''}
              onChange={(e) => {
                setActiveProjectId(e.target.value || null);
                setCurrentDir('');
              }}
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              <option value="">Select Project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <BossCore />
        </div>
      </PageHeading>

      <section className="studio panel">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p className="eyebrow" style={{ margin: 0 }}>Explorer</p>
            {activeProject && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button
                  type="button"
                  className="button"
                  style={{ padding: '3px 8px', fontSize: 10 }}
                  title="New File"
                  onClick={() => {
                    setCreatingType('file');
                    setNewItemName('new-file.txt');
                  }}
                >+ File</button>
                <button
                  type="button"
                  className="button"
                  style={{ padding: '3px 8px', fontSize: 10 }}
                  title="New Folder"
                  onClick={() => {
                    setCreatingType('folder');
                    setNewItemName('new-folder');
                  }}
                >+ Folder</button>
              </div>
            )}
          </div>

          {!activeProject ? (
            <p className="muted mono">No Project Open</p>
          ) : (
            <>
              <div className="mono" style={{ fontSize: 11, color: 'var(--cyan)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeProject.name}
              </div>

              {currentDir && (
                <button
                  className="button mono"
                  style={{ textAlign: 'left', marginBottom: 6, padding: '4px 8px', fontSize: 11 }}
                  onClick={navigateUp}
                >
                  📁 .. (up)
                </button>
              )}

              {creatingType && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center', width: '100%' }}>
                  <input
                    aria-label={`New ${creatingType} name`}
                    className="mono"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '3px 6px',
                      fontSize: 11,
                      background: '#070c12',
                      color: 'var(--text)',
                      border: '1px solid var(--cyan)',
                      borderRadius: 4,
                    }}
                    placeholder={creatingType === 'file' ? 'new-file.txt' : 'new-folder'}
                    value={newItemName}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateItem();
                      if (e.key === 'Escape') cancelCreation();
                    }}
                  />
                  <button
                    className="button primary"
                    style={{ padding: '2px 6px', fontSize: 10, flexShrink: 0, minWidth: 22 }}
                    onClick={handleCreateItem}
                    title="Confirm"
                  >
                    ✓
                  </button>
                  <button
                    className="button"
                    style={{ padding: '2px 6px', fontSize: 10, flexShrink: 0, minWidth: 22 }}
                    onClick={cancelCreation}
                    title="Cancel"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {loading && <p className="muted mono" style={{ fontSize: 11 }}>Reading…</p>}
                {!loading && entries.length === 0 && (
                  <p className="muted mono" style={{ fontSize: 11 }}>Empty Directory</p>
                )}
                {entries.map((entry) => (
                  <div
                    key={entry.relativePath}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: selectedFile === entry.relativePath ? 'var(--cyan-dim)' : 'transparent',
                      borderLeft: selectedFile === entry.relativePath ? '2px solid var(--cyan)' : '2px solid transparent',
                    }}
                    onClick={() => {
                      if (entry.kind === 'directory') {
                        setCurrentDir(entry.relativePath);
                      } else {
                        openFile(entry);
                      }
                    }}
                  >
                    <span className="mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.kind === 'directory' ? '📁 ' : '📄 '}
                      {entry.name}
                    </span>
                    <button
                      className="button"
                      style={{ padding: '1px 5px', fontSize: 9, opacity: 0.6, border: 'none', background: 'transparent' }}
                      title={`Delete ${entry.name}`}
                      onClick={(e) => deleteItem(entry, e)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
              <p className="eyebrow" style={{ margin: 0 }}>Editor</p>
              {selectedFile && (
                <span className="mono muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  / {selectedFile}
                </span>
              )}
            </div>
            {selectedFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: isDirty ? 'var(--violet)' : 'var(--green)' }}>
                  {isDirty ? '● Unsaved' : '✓ Saved'}
                </span>
                <LiquidGlassGroup orientation="horizontal">
                  <LiquidGlassButton
                    variant="primary"
                    size="sm"
                    disabled={!isDirty || saving}
                    onClick={saveFile}
                    title={`Save file (${formatShortcut('Ctrl+S')})`}
                  >
                    {saving ? 'Saving…' : `Save (${formatShortcut('Ctrl+S')})`}
                  </LiquidGlassButton>
                </LiquidGlassGroup>
              </div>
            )}
          </div>

          {!activeProject ? (
            <div className="empty">
              <p>Open a registered project to enable the path-safe file explorer and editor integration.</p>
            </div>
          ) : !selectedFile ? (
            <div className="empty">
              <p>Select a file from the Explorer to inspect or edit its contents.</p>
            </div>
          ) : (
            <textarea
              aria-label="Code editor"
              className="mono boss-glass-input"
              style={{
                flex: 1,
                width: '100%',
                background: '#04080e',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: 12,
                fontSize: 12,
                lineHeight: 1.6,
                fontFamily: 'JetBrains Mono, monospace',
                resize: 'none',
                outline: 'none',
              }}
              value={fileContent}
              onChange={(e) => {
                setFileContent(e.target.value);
                setIsDirty(true);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                  e.preventDefault();
                  saveFile();
                }
              }}
            />
          )}
        </div>

        <div className="assistant">
          <p className="eyebrow">BOSS Assistant</p>
          <p className="status">PROVIDER OFFLINE</p>
        </div>

        <div className="output">
          <p className="eyebrow">Output</p>
          <p className="muted mono">{statusMessage ?? 'No output source connected.'}</p>
        </div>
      </section>
    </main>
  );
}
type TerminalOutputItem = {
  id: string;
  stream: 'stdout' | 'stderr' | 'command' | 'system';
  text: string;
};

export function TerminalPage() {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);
  const projectsResource = useStoredResource(() => localData.projects.listProjects());
  const projects = projectsResource.data;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const [session, setSession] = useState<TerminalSession | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'stopped' | 'error'>('idle');
  const [statusText, setStatusText] = useState<string>('EXECUTION NOT CONNECTED');
  const [outputItems, setOutputItems] = useState<TerminalOutputItem[]>([]);
  const [inputCommand, setInputCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const terminalRef = useRef<HTMLDivElement>(null);
  const currentSessionRef = useRef<TerminalSession | null>(null);
  currentSessionRef.current = session;
  const lastSeqRef = useRef<number>(0);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [outputItems]);

  const appendOutputs = useCallback((chunks: TerminalOutput[]) => {
    if (chunks.length === 0) return;
    const newItems: TerminalOutputItem[] = [];
    for (const chunk of chunks) {
      if (chunk.seq !== undefined) {
        if (chunk.seq <= lastSeqRef.current) {
          continue;
        }
        lastSeqRef.current = chunk.seq;
      }
      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        stream: chunk.stream,
        text: chunk.data,
      });
    }
    if (newItems.length > 0) {
      setOutputItems((prev) => [...prev, ...newItems]);
    }
  }, []);

  const drainOutput = useCallback(async (sessionId: string) => {
    try {
      const chunks = await terminalService.poll(sessionId, currentSessionRef.current?.projectId);
      if (chunks.length > 0) {
        appendOutputs(chunks);
      }
    } catch {
      // ignore error if session is closed
    }
  }, [appendOutputs]);

  useEffect(() => {
    const unsubscribe = terminalService.subscribe((output) => {
      const cur = currentSessionRef.current;
      if (cur && output.sessionId === cur.id) {
        appendOutputs([output]);
      }
    });
    return unsubscribe;
  }, [appendOutputs]);

  const startSession = useCallback(async (projId: string) => {
    setStatus('starting');
    setStatusText('STARTING NATIVE SESSION…');
    lastSeqRef.current = 0;
    try {
      const newSession = await terminalService.start(projId, 'ALLOWED_SESSION');
      setSession(newSession);
      currentSessionRef.current = newSession;
      setStatus('running');
      setStatusText('TERMINAL READY');
      setOutputItems([
        {
          id: 'sys-start',
          stream: 'system',
          text: `[BOSS Native Terminal Connected]\r\nProject root: ${newSession.cwd}\r\n`,
        },
      ]);
      setTimeout(() => {
        drainOutput(newSession.id);
      }, 50);
    } catch (err) {
      setStatus('error');
      setStatusText(`START FAILED: ${err}`);
      setOutputItems([
        {
          id: 'sys-err',
          stream: 'stderr',
          text: `Failed to start terminal session: ${err}\r\n`,
        },
      ]);
    }
  }, [drainOutput]);

  const stopCurrentSession = useCallback(async () => {
    if (currentSessionRef.current) {
      try {
        await terminalService.stop(currentSessionRef.current.id, undefined, currentSessionRef.current.projectId);
      } catch {
        // ignore cleanup error
      }
      setSession(null);
      setStatus('stopped');
      setStatusText('SESSION STOPPED');
    }
  }, []);

  useEffect(() => {
    if (activeProjectId) {
      startSession(activeProjectId);
    } else {
      setSession(null);
      setStatus('idle');
      setStatusText('NO ACTIVE PROJECT');
      setOutputItems([]);
    }

    return () => {
      if (currentSessionRef.current) {
        terminalService.stop(currentSessionRef.current.id, undefined, currentSessionRef.current.projectId).catch(() => {});
      }
    };
  }, [activeProjectId, startSession]);

  useEffect(() => {
    if (!session || status !== 'running') return;
    const interval = setInterval(() => {
      drainOutput(session.id);
    }, 150);
    return () => clearInterval(interval);
  }, [session, status, drainOutput]);

  const handleSendCommand = async () => {
    const trimmed = inputCommand.trim();
    if (!trimmed || !session || status !== 'running') return;

    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);

    setOutputItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}-cmd`,
        stream: 'command',
        text: `$ ${trimmed}\r\n`,
      },
    ]);

    setInputCommand('');

    try {
      await terminalService.send(session.id, trimmed, session.projectId);
      setTimeout(() => {
        if (currentSessionRef.current) {
          drainOutput(currentSessionRef.current.id);
        }
      }, 50);
    } catch (err) {
      setOutputItems((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          stream: 'stderr',
          text: `Command error: ${err}\r\n`,
        },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputCommand(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(-1);
        setInputCommand('');
      } else {
        setHistoryIndex(nextIndex);
        setInputCommand(history[nextIndex]);
      }
    }
  };

  const handleClear = () => {
    setOutputItems([]);
  };

  const handleRestart = async () => {
    await stopCurrentSession();
    if (activeProjectId) {
      await startSession(activeProjectId);
    }
  };

  return (
    <main className="page">
      <PageHeading eyebrow="Terminal Session" title="Terminal">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {projects.length > 0 && (
            <select
              aria-label="Select active project"
              className="button mono"
              value={activeProjectId ?? ''}
              onChange={(e) => {
                setActiveProjectId(e.target.value || null);
              }}
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              <option value="">Select Project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <LiquidGlassGroup orientation="horizontal" className="terminal-actions">
            <LiquidGlassButton
              variant="secondary"
              size="sm"
              onClick={handleRestart}
              disabled={!activeProjectId || status === 'starting'}
              title="Restart terminal session"
            >
              Restart Session
            </LiquidGlassButton>
            <LiquidGlassButton
              variant="secondary"
              size="sm"
              onClick={handleClear}
              disabled={outputItems.length === 0}
              title="Clear output"
            >
              Clear Output
            </LiquidGlassButton>
          </LiquidGlassGroup>
          <BossCore />
        </div>
      </PageHeading>

      <section className="panel">
        <div className="panel-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            className="status"
            style={{
              color:
                status === 'running'
                  ? 'var(--green)'
                  : status === 'error'
                  ? 'var(--red)'
                  : status === 'starting'
                  ? 'var(--cyan)'
                  : 'var(--muted)',
            }}
          >
            {statusText}
          </span>
          {session && (
            <span className="mono muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
              cwd: {session.cwd}
            </span>
          )}
        </div>

        {!activeProject ? (
          <div style={{ padding: 24 }}>
            <OfflineState title="No Active Project Selected">
              Select or register a local project to start a secure, project-scoped terminal session.
            </OfflineState>
          </div>
        ) : (
          <>
            <div
              ref={terminalRef}
              className="terminal"
              style={{
                height: '460px',
                maxHeight: '550px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {outputItems.length === 0 ? (
                <span style={{ color: 'var(--muted)' }}>
                  Awaiting terminal commands…
                </span>
              ) : (
                outputItems.map((item) => {
                  let color = '#adc5b4';
                  let fontWeight: React.CSSProperties['fontWeight'] = 'normal';
                  if (item.stream === 'command') {
                    color = 'var(--cyan)';
                    fontWeight = '600';
                  } else if (item.stream === 'stderr') {
                    color = '#ff6b6b';
                  } else if (item.stream === 'system') {
                    color = 'var(--muted)';
                  }
                  return (
                    <span key={item.id} style={{ color, fontWeight }}>
                      {item.text}
                    </span>
                  );
                })
              )}
            </div>

            <div className="prompt terminal-prompt-bar boss-prompt-container">
              <span className="terminal-prompt-symbol">❯</span>
              <input
                aria-label="Terminal command"
                placeholder={status === 'running' ? "Enter command (e.g. dir, git status, cargo test, npm run)..." : "Session offline"}
                disabled={status !== 'running'}
                value={inputCommand}
                onChange={(e) => setInputCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              <button
                type="button"
                className="button primary"
                disabled={status !== 'running' || !inputCommand.trim()}
                onClick={handleSendCommand}
              >
                Execute Command
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export function GitPage() {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);
  const projectsResource = useStoredResource(() => localData.projects.listProjects());
  const projects = projectsResource.data;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<readonly string[]>([]);
  const [history, setHistory] = useState<readonly GitCommit[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileStaged, setSelectedFileStaged] = useState<boolean>(false);
  const [diffContent, setDiffContent] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [operating, setOperating] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('REPOSITORY NOT CONNECTED');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshGitState = useCallback(async (customStatus?: string) => {
    if (!activeProjectId) {
      setStatus(null);
      setBranches([]);
      setHistory([]);
      setDiffContent('');
      setSelectedFile(null);
      setStatusText('NO ACTIVE PROJECT');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const stat = await gitService.status(activeProjectId);
      setStatus(stat);
      if (stat.isRepository) {
        setStatusText(customStatus ?? 'REPOSITORY CONNECTED');
        const [brList, logList] = await Promise.all([
          gitService.branches(activeProjectId).catch(() => []),
          gitService.log(activeProjectId, 30).catch(() => []),
        ]);
        setBranches(brList);
        setHistory(logList);
      } else {
        setStatusText('NOT A GIT REPOSITORY');
        setBranches([]);
        setHistory([]);
      }
    } catch (err) {
      setStatus(null);
      setStatusText('GIT ERROR');
      setErrorMessage(String(err));
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    setSelectedFile(null);
    setDiffContent('');
    setCommitMessage('');
    refreshGitState();
  }, [activeProjectId, refreshGitState]);

  const loadDiff = useCallback(async (path: string, staged: boolean) => {
    if (!activeProjectId) return;
    try {
      const diff = await gitService.diff(activeProjectId, { path, staged });
      setDiffContent(diff || (staged ? '[No staged changes for this file]' : '[No working tree changes for this file]'));
    } catch (err) {
      setDiffContent(`Failed to load diff: ${err}`);
    }
  }, [activeProjectId]);

  const selectFile = (path: string, staged: boolean) => {
    setSelectedFile(path);
    setSelectedFileStaged(staged);
    loadDiff(path, staged);
  };

  const handleStage = async (path: string) => {
    if (!activeProjectId || operating) return;
    setOperating(true);
    setErrorMessage(null);
    try {
      await gitService.stage(activeProjectId, [path]);
      await refreshGitState(`Staged ${path}`);
      selectFile(path, true);
    } catch (err) {
      setErrorMessage(`Failed to stage: ${err}`);
    } finally {
      setOperating(false);
    }
  };

  const handleUnstage = async (path: string) => {
    if (!activeProjectId || operating) return;
    setOperating(true);
    setErrorMessage(null);
    try {
      await gitService.unstage(activeProjectId, [path]);
      await refreshGitState(`Unstaged ${path}`);
      selectFile(path, false);
    } catch (err) {
      setErrorMessage(`Failed to unstage: ${err}`);
    } finally {
      setOperating(false);
    }
  };

  const handleStageAll = async () => {
    if (!activeProjectId || !status || operating) return;
    const unstagedPaths = status.entries.filter((e) => e.unstaged).map((e) => e.path);
    if (unstagedPaths.length === 0) return;
    setOperating(true);
    setErrorMessage(null);
    try {
      await gitService.stage(activeProjectId, unstagedPaths);
      await refreshGitState(`Staged ${unstagedPaths.length} files`);
      if (selectedFile) {
        loadDiff(selectedFile, true);
      }
    } catch (err) {
      setErrorMessage(`Failed to stage all: ${err}`);
    } finally {
      setOperating(false);
    }
  };

  const handleCommit = async () => {
    if (!activeProjectId || !commitMessage.trim() || operating) return;
    const stagedCount = status?.entries.filter((e) => e.staged).length ?? 0;
    if (stagedCount === 0) {
      setErrorMessage('No staged changes to commit. Stage your changes first.');
      return;
    }
    setOperating(true);
    setErrorMessage(null);
    try {
      const res = await gitService.commit(activeProjectId, commitMessage.trim());
      setCommitMessage('');
      await refreshGitState(`Committed: ${res.split('\n')[0]}`);
      setDiffContent('');
      setSelectedFile(null);
    } catch (err) {
      setErrorMessage(`Commit failed: ${err}`);
    } finally {
      setOperating(false);
    }
  };

  const handleCheckout = async (targetBranch: string) => {
    if (!activeProjectId || !targetBranch || targetBranch === status?.branch || operating) return;
    setOperating(true);
    setErrorMessage(null);
    try {
      await gitService.checkout(activeProjectId, targetBranch);
      await refreshGitState(`Switched to branch '${targetBranch}'`);
    } catch (err) {
      setErrorMessage(`Branch switch failed: ${err}`);
    } finally {
      setOperating(false);
    }
  };

  const stagedEntries = status?.entries.filter((e) => e.staged) ?? [];
  const unstagedEntries = status?.entries.filter((e) => e.unstaged) ?? [];

  return (
    <main className="page">
      <PageHeading eyebrow="Version Control" title="Git">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {projects.length > 0 && (
            <select
              aria-label="Select active project"
              className="button mono"
              value={activeProjectId ?? ''}
              onChange={(e) => {
                setActiveProjectId(e.target.value || null);
              }}
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              <option value="">Select Project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {status?.isRepository && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>⎇</span>
              <select
                aria-label="Current branch"
                className="button mono"
                value={status.branch ?? ''}
                disabled={operating || branches.length <= 1}
                onChange={(e) => handleCheckout(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 12, minWidth: 120 }}
              >
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                {status.branch && !branches.includes(status.branch) && (
                  <option value={status.branch}>{status.branch}</option>
                )}
              </select>
            </div>
          )}

          <LiquidGlassGroup orientation="horizontal" className="git-actions">
            <LiquidGlassButton
              variant="secondary"
              size="sm"
              onClick={() => refreshGitState()}
              disabled={!activeProjectId || loading || operating}
              title="Refresh Git status"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </LiquidGlassButton>
          </LiquidGlassGroup>
          <BossCore />
        </div>
      </PageHeading>

      <section className="panel">
        <div className="panel-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <span
            className="status"
            style={{
              color: status?.isRepository
                ? 'var(--green)'
                : statusText === 'NOT A GIT REPOSITORY'
                ? 'var(--orange)'
                : 'var(--muted)',
            }}
          >
            {statusText}
          </span>
          {activeProject && (
            <span className="mono muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
              root: {activeProject.path}
            </span>
          )}
        </div>

        {errorMessage && (
          <div style={{ padding: '8px 16px', background: 'rgba(255, 107, 107, 0.1)', borderBottom: '1px solid var(--red)', color: '#ff6b6b', fontSize: 12 }} className="mono">
            {errorMessage}
          </div>
        )}

        {!activeProject ? (
          <div style={{ padding: 24 }}>
            <OfflineState title="No Active Project Selected">
              Select or register a local project to view its Git version control status.
            </OfflineState>
          </div>
        ) : !status?.isRepository ? (
          <div style={{ padding: 24 }}>
            <OfflineState title="Not A Git Repository">
              The registered project root '{activeProject.path}' is not a Git repository. BOSS operates only on real Git repositories and does not fabricate version control state.
            </OfflineState>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 280px', height: '540px', overflow: 'hidden' }}>
            {/* Column 1: Changes & Staging & Commit */}
            <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: '#04080e', overflow: 'hidden' }}>
              {/* Staged Changes Section */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="eyebrow" style={{ margin: 0 }}>Staged Changes ({stagedEntries.length})</span>
                </div>
              </div>
              <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '6px 8px', minHeight: '80px' }}>
                {stagedEntries.length === 0 ? (
                  <p className="muted mono" style={{ fontSize: 11, margin: '8px 4px' }}>No Staged Changes</p>
                ) : (
                  stagedEntries.map((e) => (
                    <div
                      key={`staged-${e.path}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 6px',
                        borderRadius: 4,
                        marginBottom: 2,
                        cursor: 'pointer',
                        background: selectedFile === e.path && selectedFileStaged ? 'var(--cyan-dim)' : 'transparent',
                        borderLeft: selectedFile === e.path && selectedFileStaged ? '2px solid var(--cyan)' : '2px solid transparent',
                      }}
                      onClick={() => selectFile(e.path, true)}
                    >
                      <span className="mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '190px' }}>
                        <span style={{ color: '#4ade80', marginRight: 6 }}>[{e.state.substring(0, 1).toUpperCase()}]</span>
                        {e.path}
                      </span>
                      <button
                        className="button"
                        style={{ padding: '1px 5px', fontSize: 10, minWidth: 20 }}
                        title="Unstage file"
                        disabled={operating}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleUnstage(e.path);
                        }}
                      >
                        -
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Working Tree Changes Section */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="eyebrow" style={{ margin: 0 }}>Changes ({unstagedEntries.length})</span>
                  {unstagedEntries.length > 0 && (
                    <button
                      className="button"
                      style={{ padding: '2px 8px', fontSize: 10 }}
                      disabled={operating}
                      onClick={handleStageAll}
                      title="Stage all changes"
                    >
                      Stage All
                    </button>
                  )}
                </div>
              </div>
              <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '6px 8px', minHeight: '100px' }}>
                {unstagedEntries.length === 0 ? (
                  <p className="muted mono" style={{ fontSize: 11, margin: '8px 4px' }}>Working Tree Clean</p>
                ) : (
                  unstagedEntries.map((e) => {
                    const stateColor = e.state === 'untracked' ? 'var(--muted)' : e.state === 'deleted' ? '#ff6b6b' : 'var(--cyan)';
                    const badge = e.state === 'untracked' ? '?' : e.state === 'modified' ? 'M' : e.state === 'deleted' ? 'D' : e.state === 'conflicted' ? '!' : 'A';
                    return (
                      <div
                        key={`unstaged-${e.path}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 6px',
                          borderRadius: 4,
                          marginBottom: 2,
                          cursor: 'pointer',
                          background: selectedFile === e.path && !selectedFileStaged ? 'var(--cyan-dim)' : 'transparent',
                          borderLeft: selectedFile === e.path && !selectedFileStaged ? '2px solid var(--cyan)' : '2px solid transparent',
                        }}
                        onClick={() => selectFile(e.path, false)}
                      >
                        <span className="mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '190px' }}>
                          <span style={{ color: stateColor, marginRight: 6 }}>[{badge}]</span>
                          {e.path}
                        </span>
                        <button
                          className="button primary"
                          style={{ padding: '1px 5px', fontSize: 10, minWidth: 20 }}
                          title="Stage file"
                          disabled={operating}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleStage(e.path);
                          }}
                        >
                          +
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Commit Box Section */}
              <div style={{ padding: 12, borderTop: '1px solid var(--border)', background: '#020508', flexShrink: 0 }}>
                <p className="eyebrow" style={{ margin: '0 0 6px 0' }}>Commit</p>
                <textarea
                  aria-label="Commit message"
                  className="mono boss-glass-input"
                  placeholder="Commit Message…"
                  value={commitMessage}
                  disabled={operating}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  style={{
                    width: '100%',
                    height: '60px',
                    padding: '6px 8px',
                    fontSize: 11,
                    background: '#070c12',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    resize: 'none',
                    outline: 'none',
                    marginBottom: 8,
                  }}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleCommit();
                    }
                  }}
                />
                <button
                  className="button primary"
                  style={{ width: '100%', padding: '6px 12px', fontSize: 11 }}
                  disabled={!commitMessage.trim() || stagedEntries.length === 0 || operating}
                  onClick={handleCommit}
                >
                  {operating ? 'Processing…' : `Commit to ${status.branch ?? 'HEAD'} (${stagedEntries.length} Staged)`}
                </button>
              </div>
            </div>

            {/* Column 2: Diff Viewer */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#020508' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="eyebrow" style={{ margin: 0 }}>Diff</span>
                  {selectedFile && (
                    <span className="mono" style={{ fontSize: 12, color: 'var(--cyan)' }}>
                      {selectedFile} {selectedFileStaged ? '(staged)' : '(working tree)'}
                    </span>
                  )}
                </div>
                {selectedFile && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="button"
                      style={{ padding: '2px 8px', fontSize: 10, background: !selectedFileStaged ? 'var(--cyan-dim)' : 'transparent' }}
                      onClick={() => selectFile(selectedFile, false)}
                    >
                      Working Tree
                    </button>
                    <button
                      className="button"
                      style={{ padding: '2px 8px', fontSize: 10, background: selectedFileStaged ? 'var(--cyan-dim)' : 'transparent' }}
                      onClick={() => selectFile(selectedFile, true)}
                    >
                      Staged
                    </button>
                  </div>
                )}
              </div>

              <div className="terminal mono" style={{ flex: 1, padding: 12, overflowY: 'auto', fontSize: 11, lineHeight: 1.5 }}>
                {!selectedFile ? (
                  <span style={{ color: 'var(--muted)' }}>Select a changed or staged file to view its Git diff.</span>
                ) : !diffContent ? (
                  <span style={{ color: 'var(--muted)' }}>No differences detected for {selectedFile}.</span>
                ) : (
                  diffContent.split('\n').map((line, idx) => {
                    let color = 'var(--text)';
                    let bg = 'transparent';
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                      color = '#4ade80';
                      bg = 'rgba(74, 222, 128, 0.08)';
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                      color = '#f87171';
                      bg = 'rgba(248, 113, 113, 0.08)';
                    } else if (line.startsWith('@@')) {
                      color = 'var(--cyan)';
                      bg = 'rgba(0, 240, 255, 0.05)';
                    }
                    return (
                      <div key={idx} style={{ color, background: bg, padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {line || ' '}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Column 3: History & Commits */}
            <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', background: '#04080e', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <span className="eyebrow" style={{ margin: 0 }}>Recent Commits ({history.length})</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.length === 0 ? (
                  <p className="muted mono" style={{ fontSize: 11 }}>No commits yet</p>
                ) : (
                  history.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '8px 10px',
                        background: '#070c12',
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--cyan)', fontWeight: 600 }}>
                          {c.id.substring(0, 7)}
                        </span>
                        <span className="mono muted" style={{ fontSize: 10 }}>
                          {c.timestamp.substring(0, 10)}
                        </span>
                      </div>
                      <p className="mono" style={{ fontSize: 11, margin: '0 0 4px 0', color: 'var(--text)', wordBreak: 'break-word' }}>
                        {c.summary}
                      </p>
                      <span className="muted mono" style={{ fontSize: 10 }}>
                        {c.author}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export function ToolsPage() {
  const tools = toolRuntime.listTools();
  const fsTools = tools.filter((t) => t.name.startsWith('fs_'));
  const termTools = tools.filter((t) => t.name.startsWith('terminal_'));
  const gitTools = tools.filter((t) => t.name.startsWith('git_'));
  const otherTools = tools.filter((t) => !t.name.startsWith('fs_') && !t.name.startsWith('terminal_') && !t.name.startsWith('git_'));

  const renderToolCard = (tool: ReturnType<typeof toolRuntime.listTools>[number]) => {
    const isWrite = tool.permissions.some((p: string) => p.includes('write') || p.includes('commit') || p.includes('stage'));
    const isExec = tool.permissions.some((p: string) => p.includes('execute') || p.includes('run'));
    const permTone = isExec ? 'amber' : isWrite ? 'violet' : 'cyan';
    const permLabel = isExec ? 'EXECUTION' : isWrite ? 'WRITE-SAFE' : 'READ-ONLY';

    return (
      <article className="panel panel-pad" key={tool.name} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="eyebrow" style={{ margin: 0 }}>{tool.name}</p>
          <StatusBadge tone={permTone}>{permLabel}</StatusBadge>
        </div>
        <p className="muted" style={{ fontSize: 12, flex: 1, margin: 0, lineHeight: 1.5 }}>{tool.description}</p>
        <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Boundary: Project Root</span>
          <span style={{ color: 'var(--green)' }}>● Active</span>
        </div>
      </article>
    );
  };

  return (
    <main className="page">
      <PageHeading eyebrow="Tools & Capabilities" title="Runtime Capabilities">
        <StatusBadge tone="green">{`${tools.length} REGISTERED TOOLS`}</StatusBadge>
      </PageHeading>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 className="eyebrow" style={{ margin: 0 }}>FILESYSTEM CAPABILITIES ({fsTools.length})</h2>
            <span className="mono muted" style={{ fontSize: 11 }}>Path-traversal defended &amp; project-scoped</span>
          </div>
          <div className="grid grid-3">{fsTools.map(renderToolCard)}</div>
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 className="eyebrow" style={{ margin: 0 }}>TERMINAL CAPABILITIES ({termTools.length})</h2>
            <span className="mono muted" style={{ fontSize: 11 }}>Project working directory execution</span>
          </div>
          <div className="grid grid-3">{termTools.map(renderToolCard)}</div>
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 className="eyebrow" style={{ margin: 0 }}>VERSION CONTROL CAPABILITIES ({gitTools.length})</h2>
            <span className="mono muted" style={{ fontSize: 11 }}>Real repository git integration</span>
          </div>
          <div className="grid grid-3">{gitTools.map(renderToolCard)}</div>
        </section>

        {otherTools.length > 0 && (
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 className="eyebrow" style={{ margin: 0 }}>ADDITIONAL TOOLS ({otherTools.length})</h2>
            </div>
            <div className="grid grid-3">{otherTools.map(renderToolCard)}</div>
          </section>
        )}
      </div>
    </main>
  );
}
export function HistoryPage() {
  const [sessions, setSessions] = useState<readonly Session[]>([]);
  const [agentActions, setAgentActions] = useState<readonly AgentAction[]>([]);
  const [toolExecutions, setToolExecutions] = useState<readonly ToolExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sessions' | 'actions' | 'tools'>('sessions');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const [sessList, actList, toolList] = await Promise.all([
        localData.history.listSessions().catch(() => []),
        localData.history.listAgentActions().catch(() => []),
        localData.history.listToolExecutions().catch(() => []),
      ]);
      setSessions(sessList);
      setAgentActions(actList);
      setToolExecutions(toolList);
      if (sessList.length > 0 && !selectedSessionId) {
        setSelectedSessionId(sessList[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const sessionActions = agentActions.filter((a) => a.sessionId === selectedSessionId);
  const sessionTools = toolExecutions.filter((t) => t.sessionId === selectedSessionId);

  const hasAnyActivity = sessions.length > 0 || agentActions.length > 0 || toolExecutions.length > 0;

  return (
    <main className="page">
      <PageHeading eyebrow="LOCATION: HISTORY // DURABLE_AUDIT" title="Local Activity & History">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="button"
            onClick={loadHistory}
            disabled={loading}
            style={{ fontSize: 12, padding: '4px 10px' }}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <BossCore />
        </div>
      </PageHeading>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={`button ${activeTab === 'sessions' ? 'primary' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          {`Sessions (${sessions.length})`}
        </button>
        <button
          type="button"
          className={`button ${activeTab === 'actions' ? 'primary' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          {`Agent Actions (${agentActions.length})`}
        </button>
        <button
          type="button"
          className={`button ${activeTab === 'tools' ? 'primary' : ''}`}
          onClick={() => setActiveTab('tools')}
        >
          {`Tool Executions (${toolExecutions.length})`}
        </button>
      </div>

      {!hasAnyActivity && !loading ? (
        <OfflineState title="No Local Activity Yet">
          No sessions, agent actions, or tool executions have been persisted. Perform a Chat conversation, Agent task, or Tool Runtime action to record activity in SQLite.
        </OfflineState>
      ) : activeTab === 'sessions' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(400px, 2fr)', gap: 16 }}>
          <div className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 600, overflowY: 'auto' }}>
            <p className="eyebrow" style={{ margin: '0 0 4px 0' }}>SESSIONS LIST</p>
            {sessions.map((s) => {
              const isSelected = s.id === selectedSessionId;
              const hasEnded = Boolean(s.endedAt);
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSessionId(s.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 4,
                    border: `1px solid ${isSelected ? 'var(--cyan)' : 'var(--border)'}`,
                    background: isSelected ? 'rgba(6, 182, 212, 0.08)' : 'var(--surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 11, color: isSelected ? 'var(--cyan)' : 'var(--text)' }}>
                      {s.id.slice(0, 16)}…
                    </span>
                    <StatusBadge tone={hasEnded ? 'green' : 'cyan'}>
                      {hasEnded ? 'FINISHED' : 'ACTIVE'}
                    </StatusBadge>
                  </div>
                  <div className="muted mono" style={{ fontSize: 10, marginTop: 4 }}>
                    {new Date(s.startedAt).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {selectedSession ? (
              <>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p className="eyebrow" style={{ margin: 0 }}>SESSION AUDIT DETAILS</p>
                    <StatusBadge tone={selectedSession.endedAt ? 'green' : 'cyan'}>
                      {selectedSession.endedAt ? 'COMPLETED' : 'IN_PROGRESS'}
                    </StatusBadge>
                  </div>
                  <h3 className="mono" style={{ fontSize: 13, margin: '6px 0 2px 0', wordBreak: 'break-all' }}>
                    {selectedSession.id}
                  </h3>
                  <p className="muted mono" style={{ fontSize: 11, margin: 0 }}>
                    Started: {new Date(selectedSession.startedAt).toLocaleString()}
                    {selectedSession.endedAt ? ` // Finished: ${new Date(selectedSession.endedAt).toLocaleString()}` : ''}
                  </p>
                </div>

                <div>
                  <h4 style={{ fontSize: 12, margin: '0 0 8px 0', color: 'var(--cyan)' }}>
                    {`Agent Actions (${sessionActions.length})`}
                  </h4>
                  {sessionActions.length === 0 ? (
                    <p className="muted" style={{ fontSize: 12 }}>No agent actions recorded for this session.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sessionActions.map((act) => (
                        <div key={act.id} style={{ padding: '6px 8px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <b className="mono" style={{ fontSize: 11 }}>{act.action}</b>
                            <StatusBadge tone={act.status === 'complete' ? 'green' : act.status === 'failed' ? 'red' : 'cyan'}>
                              {act.status.toUpperCase()}
                            </StatusBadge>
                          </div>
                          {act.metadata && (
                            <pre className="mono" style={{ fontSize: 10, margin: '4px 0 0 0', color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
                              {JSON.stringify(act.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 style={{ fontSize: 12, margin: '0 0 8px 0', color: 'var(--cyan)' }}>
                    {`Tool Executions (${sessionTools.length})`}
                  </h4>
                  {sessionTools.length === 0 ? (
                    <p className="muted" style={{ fontSize: 12 }}>No tool executions recorded for this session.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sessionTools.map((t) => {
                        const durationMs = typeof t.metadata?.durationMs === 'number' ? t.metadata.durationMs : undefined;
                        const inputJson = typeof t.metadata?.inputJson === 'string' ? t.metadata.inputJson : undefined;
                        const errorMsg = typeof t.metadata?.errorMessage === 'string' ? t.metadata.errorMessage : undefined;
                        return (
                          <div key={t.id} style={{ padding: '6px 8px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <b className="mono" style={{ fontSize: 11 }}>{t.toolName}</b>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                {durationMs !== undefined && (
                                  <span className="mono muted" style={{ fontSize: 10 }}>{`${durationMs}ms`}</span>
                                )}
                                <StatusBadge tone={t.status === 'complete' ? 'green' : t.status === 'failed' || t.status === 'denied' ? 'red' : t.status === 'started' ? 'cyan' : 'muted'}>
                                  {t.status.toUpperCase()}
                                </StatusBadge>
                              </div>
                            </div>
                            {inputJson && (
                              <div className="mono muted" style={{ fontSize: 10, marginTop: 4 }}>
                                <b>Input:</b> {inputJson}
                              </div>
                            )}
                            {errorMsg && (
                              <div className="mono" style={{ fontSize: 10, marginTop: 2, color: '#fca5a5' }}>
                                <b>Error:</b> {errorMsg}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="muted">Select a session to view details.</p>
            )}
          </div>
        </div>
      ) : activeTab === 'actions' ? (
        <div className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="eyebrow" style={{ margin: '0 0 6px 0' }}>ALL PERSISTED AGENT ACTIONS</p>
          {agentActions.length === 0 ? (
            <p className="muted">No agent actions recorded.</p>
          ) : (
            agentActions.map((act) => (
              <div key={act.id} style={{ padding: '8px 12px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <b className="mono" style={{ fontSize: 12 }}>{act.action}</b>
                    <span className="muted mono" style={{ fontSize: 10, marginLeft: 10 }}>Session: {act.sessionId.slice(0, 12)}…</span>
                  </div>
                  <StatusBadge tone={act.status === 'complete' ? 'green' : act.status === 'failed' ? 'red' : 'cyan'}>
                    {act.status.toUpperCase()}
                  </StatusBadge>
                </div>
                <div className="muted mono" style={{ fontSize: 10, marginTop: 4 }}>
                  Recorded: {new Date(act.createdAt).toLocaleString()}
                </div>
                {act.metadata && (
                  <pre className="mono" style={{ fontSize: 10, margin: '6px 0 0 0', color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(act.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="eyebrow" style={{ margin: '0 0 6px 0' }}>ALL PERSISTED TOOL EXECUTIONS</p>
          {toolExecutions.length === 0 ? (
            <p className="muted">No tool executions recorded.</p>
          ) : (
            toolExecutions.map((t) => {
              const projectId = typeof t.metadata?.projectId === 'string' ? t.metadata.projectId : '';
              const durationMs = typeof t.metadata?.durationMs === 'number' ? t.metadata.durationMs : undefined;
              const inputJson = typeof t.metadata?.inputJson === 'string' ? t.metadata.inputJson : undefined;
              const outputJson = typeof t.metadata?.outputJson === 'string' ? t.metadata.outputJson : undefined;
              const errorMsg = typeof t.metadata?.errorMessage === 'string' ? t.metadata.errorMessage : undefined;
              return (
                <div key={t.id} style={{ padding: '8px 12px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b className="mono" style={{ fontSize: 12, color: 'var(--cyan)' }}>{t.toolName}</b>
                      {projectId && <span className="muted mono" style={{ fontSize: 10, marginLeft: 10 }}>Project: {projectId}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {durationMs !== undefined && (
                        <span className="mono muted" style={{ fontSize: 10 }}>{`${durationMs}ms`}</span>
                      )}
                      <StatusBadge tone={t.status === 'complete' ? 'green' : t.status === 'failed' || t.status === 'denied' ? 'red' : t.status === 'started' ? 'cyan' : 'muted'}>
                        {t.status.toUpperCase()}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className="muted mono" style={{ fontSize: 10, marginTop: 4 }}>
                    Time: {new Date(t.createdAt).toLocaleString()}
                  </div>
                  {inputJson && (
                    <div className="mono muted" style={{ fontSize: 11, marginTop: 6 }}>
                      <b>Input:</b> {inputJson}
                    </div>
                  )}
                  {outputJson && (
                    <pre className="mono" style={{ fontSize: 10, margin: '4px 0 0 0', color: 'var(--text)', whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
                      {outputJson}
                    </pre>
                  )}
                  {errorMsg && (
                    <div className="mono" style={{ fontSize: 11, marginTop: 4, color: '#fca5a5' }}>
                      <b>Error:</b> {errorMsg}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </main>
  );
}
