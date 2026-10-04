import React, { useState } from 'react';
import type { AIProviderId } from '../../services/ai/aiProviderTypes';

interface ProviderGuideModalProps {
  providerId: AIProviderId;
  onClose: () => void;
}

interface GuideStep {
  title: string;
  content: React.ReactNode;
}

export function ProviderGuideModal({ providerId, onClose }: ProviderGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'guide' | 'video'>('guide');
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const getGuideData = () => {
    switch (providerId) {
      case 'ollama':
        return {
          title: 'Ollama Setup & Local Model Guide',
          tagline: 'Local · Private · Air-Gapped',
          steps: [
            {
              title: '1. What Ollama Is',
              content: (
                <div>
                  <p>
                    <b>Ollama</b> is a lightweight, open-source tool that allows you to download, run, and manage large language models locally on your computer.
                  </p>
                  <p className="muted">
                    Unlike cloud services that send your text to remote data centers, Ollama executes model weights directly on your device using your computer's CPU, RAM, and GPU.
                  </p>
                </div>
              ),
            },
            {
              title: '2. Why BOSS Uses It',
              content: (
                <div>
                  <p>
                    BOSS is designed as a <b>local-first, privacy-respecting developer operating environment</b>.
                  </p>
                  <p className="muted">
                    Using Ollama guarantees that your source code, terminal commands, project structure, and chat prompts remain 100% on your device without leaving your local network.
                  </p>
                </div>
              ),
            },
            {
              title: '3. How to Install Ollama',
              content: (
                <div>
                  <p>Follow these official steps to install Ollama:</p>
                  <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <li>
                      Visit the official download page:{' '}
                      <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>
                        ollama.com/download
                      </a>
                    </li>
                    <li>Download the installer for your operating system (Windows, macOS, or Linux).</li>
                    <li>Run the installer and complete the setup wizard.</li>
                    <li>Verify Ollama is running in your system tray or background tasks.</li>
                  </ol>
                </div>
              ),
            },
            {
              title: '4. How BOSS Detects Ollama',
              content: (
                <div>
                  <p>
                    BOSS checks the local loopback port: <code>http://127.0.0.1:11434/api/tags</code>.
                  </p>
                  <p className="muted">
                    When Ollama is running, it responds with a list of installed models. BOSS never executes background installers or scans your system files.
                  </p>
                </div>
              ),
            },
            {
              title: '5. How to Select & Download a Model',
              content: (
                <div>
                  <p>Open your terminal (PowerShell, Command Prompt, or Terminal) and run:</p>
                  <pre className="mono" style={{ background: '#070c12', padding: 10, borderRadius: 4, color: 'var(--cyan)' }}>
                    ollama pull llama3.2
                  </pre>
                  <p className="muted" style={{ marginTop: 8 }}>
                    Other recommended models for coding:
                  </p>
                  <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li><code>ollama pull qwen2.5-coder</code> — Excellent code synthesis and reasoning</li>
                    <li><code>ollama pull deepseek-r1:7b</code> — Strong reasoning and chain-of-thought</li>
                    <li><code>ollama pull mistral</code> — Fast, balanced general-purpose model</li>
                  </ul>
                </div>
              ),
            },
            {
              title: '6. How to Test the Model',
              content: (
                <div>
                  <p>Once downloaded, return to BOSS:</p>
                  <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <li>Open <b>Settings &gt; Models &amp; AI Engine</b>.</li>
                    <li>Click <b>Test Connection &amp; Discover Models</b>.</li>
                    <li>Select your model from the dropdown.</li>
                    <li>Click <b>Save Configuration</b>.</li>
                  </ol>
                </div>
              ),
            },
            {
              title: '7. What "Local / Private" Means',
              content: (
                <div>
                  <p>
                    <b>Local</b> means the compute runs on your device's processors.
                  </p>
                  <p>
                    <b>Private</b> means zero network packets leave your computer. Even with your internet cable disconnected or Wi-Fi off, BOSS and Ollama remain 100% operational.
                  </p>
                </div>
              ),
            },
          ] as GuideStep[],
        };

      case 'openai':
        return {
          title: 'OpenAI Cloud Provider Setup Guide',
          tagline: 'Cloud AI · Bring Your Own Key',
          steps: [
            {
              title: '1. What an API Key Is',
              content: (
                <div>
                  <p>
                    An <b>API Key</b> is a private cryptographic token (starting with <code>sk-</code>) that authenticates requests made by BOSS to OpenAI's cloud servers.
                  </p>
                  <p className="muted">
                    It acts like a password for programmatic access, linking usage to your personal OpenAI developer account.
                  </p>
                </div>
              ),
            },
            {
              title: '2. Why BOSS Asks for It',
              content: (
                <div>
                  <p>
                    BOSS <b>does not provide or resell cloud AI</b>, and does not operate intermediary proxy servers.
                  </p>
                  <p className="muted">
                    To use OpenAI models like GPT-4o, BOSS connects directly from your workstation to OpenAI using your personal credentials.
                  </p>
                </div>
              ),
            },
            {
              title: '3. Where to Obtain Your Key',
              content: (
                <div>
                  <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <li>
                      Log in to your account at{' '}
                      <a href="https://platform.openai.com" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>
                        platform.openai.com
                      </a>.
                    </li>
                    <li>Navigate to <b>API Keys</b> in the dashboard sidebar.</li>
                    <li>Click <b>Create new secret key</b>, name it "BOSS Desktop", and copy the token.</li>
                  </ol>
                </div>
              ),
            },
            {
              title: '4. How to Enter It into BOSS',
              content: (
                <div>
                  <p>
                    In BOSS <b>Settings &gt; Models &amp; AI Engine</b>, select <b>OpenAI</b>.
                  </p>
                  <p>
                    Paste your key into the API Key field and click <b>Test &amp; Save Key</b>.
                  </p>
                  <p className="muted">
                    BOSS encrypts your key in a native desktop vault. The plaintext key is never stored in SQLite or browser storage.
                  </p>
                </div>
              ),
            },
            {
              title: '5. How to Select a Model',
              content: (
                <div>
                  <p>Supported models include:</p>
                  <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li><code>gpt-4o-mini</code> — Fast, cost-effective (Recommended default)</li>
                    <li><code>gpt-4o</code> — Most capable multimodal flagship</li>
                    <li><code>o1-mini / o3-mini</code> — Deep reasoning and math/code synthesis</li>
                  </ul>
                </div>
              ),
            },
            {
              title: '6. How to Test Connection',
              content: (
                <div>
                  <p>Click <b>Test Connection</b>.</p>
                  <p className="muted">
                    BOSS sends a minimal query to OpenAI to verify your key's validity and discover model access.
                  </p>
                </div>
              ),
            },
            {
              title: '7. How Cloud Usage & Pricing Work',
              content: (
                <div>
                  <p>
                    OpenAI charges per million input and output tokens. Check current pricing at{' '}
                    <a href="https://openai.com/api/pricing/" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>
                      openai.com/api/pricing
                    </a>.
                  </p>
                  <p className="muted">
                    BOSS does not take any fee. All costs are billed directly by OpenAI to your payment method on file.
                  </p>
                </div>
              ),
            },
            {
              title: '8. How to Remove the Credential',
              content: (
                <div>
                  <p>
                    Click <b>Remove Key</b> at any time. This immediately purges the credential from the native encrypted vault and memory.
                  </p>
                </div>
              ),
            },
          ] as GuideStep[],
        };

      case 'gemini':
        return {
          title: 'Google Gemini Cloud Provider Setup Guide',
          tagline: 'Cloud AI · Google AI Studio',
          steps: [
            {
              title: '1. What an API Key Is',
              content: (
                <div>
                  <p>
                    A <b>Gemini API Key</b> is a private key issued by Google AI Studio that allows BOSS to invoke Gemini models.
                  </p>
                  <p className="muted">
                    It authenticates requests securely via the <code>x-goog-api-key</code> HTTP header.
                  </p>
                </div>
              ),
            },
            {
              title: '2. Why BOSS Asks for It',
              content: (
                <div>
                  <p>
                    BOSS is a local desktop client. To use Gemini cloud intelligence, your device communicates directly with Google's servers using your own developer credentials.
                  </p>
                </div>
              ),
            },
            {
              title: '3. Where to Obtain Your Key',
              content: (
                <div>
                  <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <li>
                      Visit{' '}
                      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>
                        aistudio.google.com/app/apikey
                      </a>.
                    </li>
                    <li>Sign in with your Google account.</li>
                    <li>Click <b>Create API Key</b> and copy the token.</li>
                  </ol>
                </div>
              ),
            },
            {
              title: '4. How to Enter It into BOSS',
              content: (
                <div>
                  <p>
                    In <b>Settings &gt; Models &amp; AI Engine</b>, select <b>Google Gemini</b>.
                  </p>
                  <p>
                    Paste your key into the API Key input and click <b>Test &amp; Save Key</b>.
                  </p>
                </div>
              ),
            },
            {
              title: '5. How to Select a Model',
              content: (
                <div>
                  <p>Recommended Gemini models:</p>
                  <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li><code>gemini-2.0-flash</code> — Next-gen multimodal speed and capability (Default)</li>
                    <li><code>gemini-2.0-flash-lite</code> — Ultra fast, lightweight</li>
                    <li><code>gemini-1.5-pro</code> — 2M context window for complex codebases</li>
                  </ul>
                </div>
              ),
            },
            {
              title: '6. How to Test Connection',
              content: (
                <div>
                  <p>Click <b>Test Connection</b>.</p>
                  <p className="muted">
                    BOSS verifies your key against Google's API and queries available model endpoints.
                  </p>
                </div>
              ),
            },
            {
              title: '7. How Cloud Usage & Pricing Work',
              content: (
                <div>
                  <p>
                    Google offers both free tier quotas and pay-as-you-go pricing for Gemini API. Check current details at{' '}
                    <a href="https://ai.google.dev/pricing" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>
                      ai.google.dev/pricing
                    </a>.
                  </p>
                  <p className="muted">
                    BOSS does not control or charge for Google API usage.
                  </p>
                </div>
              ),
            },
            {
              title: '8. How to Remove the Credential',
              content: (
                <div>
                  <p>
                    Click <b>Remove Key</b> at any time to permanently erase the key from the native encrypted vault.
                  </p>
                </div>
              ),
            },
          ] as GuideStep[],
        };
    }
  };

  const data = getGuideData();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(3, 7, 12, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#070c14',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-0)',
          }}
        >
          <div>
            <span className="eyebrow" style={{ margin: 0, color: 'var(--cyan)' }}>
              {data.tagline}
            </span>
            <h2 id="guide-title" style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 700 }}>
              {data.title}
            </h2>
          </div>
          <button
            type="button"
            className="button"
            onClick={onClose}
            style={{ padding: '4px 10px', fontSize: 13 }}
            aria-label="Close guide"
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#04080e' }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '10px 14px',
              background: activeTab === 'guide' ? 'var(--surface-1)' : 'transparent',
              color: activeTab === 'guide' ? 'var(--cyan)' : 'var(--muted)',
              border: 'none',
              borderBottom: activeTab === 'guide' ? '2px solid var(--cyan)' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
            onClick={() => setActiveTab('guide')}
          >
            📖 Step-by-Step Guide
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '10px 14px',
              background: activeTab === 'video' ? 'var(--surface-1)' : 'transparent',
              color: activeTab === 'video' ? 'var(--cyan)' : 'var(--muted)',
              border: 'none',
              borderBottom: activeTab === 'video' ? '2px solid var(--cyan)' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
            onClick={() => setActiveTab('video')}
          >
            🎬 Watch Video Guide
          </button>
        </div>

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {activeTab === 'guide' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Step Navigation Pill list */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {data.steps.map((s, idx) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => setActiveStepIndex(idx)}
                    style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      border: idx === activeStepIndex ? '1px solid var(--cyan)' : '1px solid var(--border)',
                      background: idx === activeStepIndex ? 'rgba(0, 217, 255, 0.12)' : 'var(--surface-1)',
                      color: idx === activeStepIndex ? 'var(--cyan)' : 'var(--muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Step {idx + 1}
                  </button>
                ))}
              </div>

              <div className="panel panel-pad" style={{ background: 'var(--surface-1)' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--text)' }}>
                  {data.steps[activeStepIndex].title}
                </h3>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
                  {data.steps[activeStepIndex].content}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button
                  type="button"
                  className="button"
                  disabled={activeStepIndex === 0}
                  onClick={() => setActiveStepIndex((i) => Math.max(0, i - 1))}
                  style={{ padding: '6px 14px', fontSize: 12 }}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={activeStepIndex === data.steps.length - 1}
                  onClick={() => setActiveStepIndex((i) => Math.min(data.steps.length - 1, i + 1))}
                  style={{ padding: '6px 14px', fontSize: 12 }}
                >
                  Next →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 10px' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(0, 217, 255, 0.1)',
                  border: '1px solid var(--cyan)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  marginBottom: 16,
                }}
              >
                🎬
              </div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  background: 'rgba(139, 92, 255, 0.15)',
                  border: '1px solid rgba(139, 92, 255, 0.4)',
                  color: '#c7b5ff',
                  marginBottom: 12,
                }}
              >
                PENDING PRODUCTION
              </span>
              <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>
                Instructional Video in Production
              </h3>
              <p className="muted" style={{ maxWidth: 440, fontSize: 12.5, lineHeight: 1.6, margin: '0 0 20px' }}>
                High-definition video walkthroughs are currently in production and will be packaged alongside the official BOSS launch media.
                In the meantime, please refer to the complete <b>Step-by-Step Guide</b> tab.
              </p>
              <button
                type="button"
                className="button primary"
                onClick={() => setActiveTab('guide')}
                style={{ padding: '8px 18px', fontSize: 12 }}
              >
                Open Step-by-Step Guide
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--surface-0)',
          }}
        >
          <button type="button" className="button" onClick={onClose} style={{ padding: '6px 16px', fontSize: 12 }}>
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
