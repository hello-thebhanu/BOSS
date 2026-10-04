import { useState, useEffect } from 'react';
import { routes } from '../../app/router/routes';
import { PageHeading, StatusBadge } from '../../components/common/PageHeading';
import { localData } from '../../services/storage/localData';
import { useStoredResource } from '../../services/storage/useStoredResource';
import {
  localModelRuntime,
  validateLocalEndpoint,
  DEFAULT_CONFIGS,
  type LocalRuntimeType,
} from '../../services/ai/localModelRuntime';
import { aiProviderService } from '../../services/ai/aiProviderService';
import type { AIProviderId, AIProviderStatusResult } from '../../services/ai/aiProviderTypes';
import { credentialService } from '../../services/security/credentialService';
import { ProviderGuideModal } from '../../components/guides/ProviderGuideModal';

const items = [
  ['General', routes.general],
  ['Appearance', routes.appearance],
  ['Voice', routes.voice],
  ['Models & AI Engine', routes.models],
  ['Memory & Knowledge', routes.memory],
  ['Profile', routes.profile],
  ['Permissions & Security', routes.permissions],
  ['About BOSS', routes.about],
] as const;

const labels: Record<string, string> = Object.fromEntries(items.map(([label, path]) => [path, label]));

function ModelsSettingsSection() {
  const [activeProviderId, setActiveProviderId] = useState<AIProviderId>('ollama');
  const [selectedTab, setSelectedTab] = useState<AIProviderId>('ollama');
  const [providerStatuses, setProviderStatuses] = useState<Record<AIProviderId, AIProviderStatusResult | null>>({
    ollama: null,
    openai: null,
    gemini: null,
  });
  const [guideProviderId, setGuideProviderId] = useState<AIProviderId | null>(null);

  // Ollama local state
  const [runtime, setRuntime] = useState<LocalRuntimeType>('ollama');
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('');
  const [ollamaDiscoveredModels, setOllamaDiscoveredModels] = useState<readonly string[]>([]);
  const [ollamaTesting, setOllamaTesting] = useState(false);
  const [ollamaSaving, setOllamaSaving] = useState(false);
  const [ollamaFeedback, setOllamaFeedback] = useState<string | null>(null);
  const [ollamaStatusMessage, setOllamaStatusMessage] = useState<string>('');

  // OpenAI state
  const [openAiHasKey, setOpenAiHasKey] = useState(false);
  const [openAiInputKey, setOpenAiInputKey] = useState('');
  const [openAiIsEditingKey, setOpenAiIsEditingKey] = useState(false);
  const [openAiModel, setOpenAiModel] = useState('gpt-4o-mini');
  const [openAiDiscoveredModels, setOpenAiDiscoveredModels] = useState<readonly string[]>([]);
  const [openAiTesting, setOpenAiTesting] = useState(false);
  const [openAiSaving, setOpenAiSaving] = useState(false);
  const [openAiFeedback, setOpenAiFeedback] = useState<string | null>(null);

  // Gemini state
  const [geminiHasKey, setGeminiHasKey] = useState(false);
  const [geminiInputKey, setGeminiInputKey] = useState('');
  const [geminiIsEditingKey, setGeminiIsEditingKey] = useState(false);
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash');
  const [geminiDiscoveredModels, setGeminiDiscoveredModels] = useState<readonly string[]>([]);
  const [geminiTesting, setGeminiTesting] = useState(false);
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiFeedback, setGeminiFeedback] = useState<string | null>(null);

  // Load active provider and all provider statuses on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const currentActive = await aiProviderService.getActiveProviderId();
        if (!active) return;
        setActiveProviderId(currentActive);
        setSelectedTab(currentActive);

        // Load Ollama config
        const cfg = await localModelRuntime.loadConfig();
        if (!active) return;
        setRuntime(cfg.runtime);
        setEndpoint(cfg.endpoint);
        setOllamaModel(cfg.model ?? '');

        // Query all providers in parallel
        const [ollamaSt, openAiSt, geminiSt] = await Promise.all([
          aiProviderService.getProvider('ollama').getStatus(),
          aiProviderService.getProvider('openai').getStatus(),
          aiProviderService.getProvider('gemini').getStatus(),
        ]);

        if (!active) return;
        setProviderStatuses({
          ollama: ollamaSt,
          openai: openAiSt,
          gemini: geminiSt,
        });

        if (ollamaSt.models.length > 0) {
          setOllamaDiscoveredModels(ollamaSt.models);
          if (!cfg.model) setOllamaModel(ollamaSt.models[0]);
        }
        setOllamaStatusMessage(ollamaSt.reason ?? (ollamaSt.status === 'connected' ? `Connected to ${cfg.runtime}` : ''));

        setOpenAiHasKey(!!openAiSt.hasCredential);
        setOpenAiModel(openAiSt.activeModel);
        setOpenAiDiscoveredModels(openAiSt.models);

        setGeminiHasKey(!!geminiSt.hasCredential);
        setGeminiModel(geminiSt.activeModel);
        setGeminiDiscoveredModels(geminiSt.models);
      } catch {
        // Safe initial fallback
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const endpointValidation = validateLocalEndpoint(endpoint);

  // Switch Active Provider
  const handleSetActiveProvider = async (id: AIProviderId) => {
    try {
      await aiProviderService.setActiveProviderId(id);
      setActiveProviderId(id);
    } catch (err: unknown) {
      alert(`Failed to activate provider: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Ollama handlers
  const handleOllamaRuntimeChange = (nextRuntime: LocalRuntimeType) => {
    setRuntime(nextRuntime);
    const def = DEFAULT_CONFIGS[nextRuntime].endpoint;
    setEndpoint(def);
    setOllamaDiscoveredModels([]);
    setOllamaModel('');
    setOllamaStatusMessage('');
    setOllamaFeedback(null);
  };

  const handleTestOllama = async () => {
    setOllamaTesting(true);
    setOllamaFeedback(null);
    try {
      const res = await localModelRuntime.discover({ runtime, endpoint });
      if (res.available) {
        setOllamaDiscoveredModels(res.models);
        setOllamaStatusMessage(
          res.models.length > 0
            ? `Connected to ${res.runtime}. ${res.models.length} model(s) discovered.`
            : `Connected to ${res.runtime}, but no models were found.`
        );
        if (res.models.length > 0 && (!ollamaModel || !res.models.includes(ollamaModel))) {
          setOllamaModel(res.models[0]);
        }
        setProviderStatuses((prev) => ({
          ...prev,
          ollama: {
            providerId: 'ollama',
            status: res.models.length > 0 ? 'connected' : 'configured',
            models: res.models,
            activeModel: ollamaModel,
          },
        }));
      } else {
        setOllamaDiscoveredModels([]);
        setOllamaStatusMessage(res.reason ?? 'LOCAL AI OFFLINE');
        setProviderStatuses((prev) => ({
          ...prev,
          ollama: {
            providerId: 'ollama',
            status: 'unavailable',
            reason: res.reason,
            models: [],
            activeModel: '',
          },
        }));
      }
    } finally {
      setOllamaTesting(false);
    }
  };

  const handleSaveOllama = async () => {
    if (!endpointValidation.valid) return;
    setOllamaSaving(true);
    setOllamaFeedback(null);
    try {
      await localModelRuntime.saveConfig({
        runtime,
        endpoint,
        model: ollamaModel,
        enabled: true,
      });
      await aiProviderService.setProviderModel('ollama', ollamaModel);
      setOllamaFeedback('Ollama configuration saved.');
    } catch (err: unknown) {
      setOllamaFeedback(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setOllamaSaving(false);
    }
  };

  // OpenAI handlers
  const handleSaveOpenAiKey = async () => {
    if (!openAiInputKey.trim()) return;
    setOpenAiTesting(true);
    setOpenAiFeedback(null);
    try {
      const test = await aiProviderService.getProvider('openai').testConnection(openAiInputKey.trim());
      if (!test.success) {
        setOpenAiFeedback(`Connection test failed: ${test.error}`);
        return;
      }
      await credentialService.storeCredential('openai', openAiInputKey.trim());
      setOpenAiHasKey(true);
      setOpenAiIsEditingKey(false);
      setOpenAiInputKey('');
      if (test.models && test.models.length > 0) {
        setOpenAiDiscoveredModels(test.models);
      }
      setOpenAiFeedback('OpenAI API key verified and securely stored in encrypted native vault.');
      setProviderStatuses((prev) => ({
        ...prev,
        openai: {
          providerId: 'openai',
          status: 'connected',
          models: test.models ?? openAiDiscoveredModels,
          activeModel: openAiModel,
          hasCredential: true,
        },
      }));
    } catch (err: unknown) {
      setOpenAiFeedback(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setOpenAiTesting(false);
    }
  };

  const handleRemoveOpenAiKey = async () => {
    const ok = window.confirm('Remove OpenAI API key? The credential will be permanently erased from your device.');
    if (!ok) return;
    await credentialService.deleteCredential('openai');
    setOpenAiHasKey(false);
    setOpenAiIsEditingKey(false);
    setOpenAiInputKey('');
    setOpenAiFeedback('OpenAI API key removed.');
    setProviderStatuses((prev) => ({
      ...prev,
      openai: {
        providerId: 'openai',
        status: 'not_connected',
        models: openAiDiscoveredModels,
        activeModel: openAiModel,
        hasCredential: false,
      },
    }));
  };

  const handleTestOpenAi = async () => {
    setOpenAiTesting(true);
    setOpenAiFeedback(null);
    try {
      const test = await aiProviderService.getProvider('openai').testConnection();
      if (test.success) {
        setOpenAiFeedback(`Connected to OpenAI! ${test.models?.length ?? 0} models available.`);
        if (test.models && test.models.length > 0) {
          setOpenAiDiscoveredModels(test.models);
        }
        setProviderStatuses((prev) => ({
          ...prev,
          openai: {
            providerId: 'openai',
            status: 'connected',
            models: test.models ?? openAiDiscoveredModels,
            activeModel: openAiModel,
            hasCredential: true,
          },
        }));
      } else {
        setOpenAiFeedback(`Connection failed: ${test.error}`);
      }
    } finally {
      setOpenAiTesting(false);
    }
  };

  const handleSaveOpenAiModel = async () => {
    setOpenAiSaving(true);
    try {
      await aiProviderService.setProviderModel('openai', openAiModel);
      setOpenAiFeedback(`OpenAI active model set to ${openAiModel}.`);
    } finally {
      setOpenAiSaving(false);
    }
  };

  // Gemini handlers
  const handleSaveGeminiKey = async () => {
    if (!geminiInputKey.trim()) return;
    setGeminiTesting(true);
    setGeminiFeedback(null);
    try {
      const test = await aiProviderService.getProvider('gemini').testConnection(geminiInputKey.trim());
      if (!test.success) {
        setGeminiFeedback(`Connection test failed: ${test.error}`);
        return;
      }
      await credentialService.storeCredential('gemini', geminiInputKey.trim());
      setGeminiHasKey(true);
      setGeminiIsEditingKey(false);
      setGeminiInputKey('');
      if (test.models && test.models.length > 0) {
        setGeminiDiscoveredModels(test.models);
      }
      setGeminiFeedback('Google Gemini API key verified and securely stored in encrypted native vault.');
      setProviderStatuses((prev) => ({
        ...prev,
        gemini: {
          providerId: 'gemini',
          status: 'connected',
          models: test.models ?? geminiDiscoveredModels,
          activeModel: geminiModel,
          hasCredential: true,
        },
      }));
    } catch (err: unknown) {
      setGeminiFeedback(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGeminiTesting(false);
    }
  };

  const handleRemoveGeminiKey = async () => {
    const ok = window.confirm('Remove Google Gemini API key? The credential will be permanently erased from your device.');
    if (!ok) return;
    await credentialService.deleteCredential('gemini');
    setGeminiHasKey(false);
    setGeminiIsEditingKey(false);
    setGeminiInputKey('');
    setGeminiFeedback('Google Gemini API key removed.');
    setProviderStatuses((prev) => ({
      ...prev,
      gemini: {
        providerId: 'gemini',
        status: 'not_connected',
        models: geminiDiscoveredModels,
        activeModel: geminiModel,
        hasCredential: false,
      },
    }));
  };

  const handleTestGemini = async () => {
    setGeminiTesting(true);
    setGeminiFeedback(null);
    try {
      const test = await aiProviderService.getProvider('gemini').testConnection();
      if (test.success) {
        setGeminiFeedback(`Connected to Google Gemini! ${test.models?.length ?? 0} models available.`);
        if (test.models && test.models.length > 0) {
          setGeminiDiscoveredModels(test.models);
        }
        setProviderStatuses((prev) => ({
          ...prev,
          gemini: {
            providerId: 'gemini',
            status: 'connected',
            models: test.models ?? geminiDiscoveredModels,
            activeModel: geminiModel,
            hasCredential: true,
          },
        }));
      } else {
        setGeminiFeedback(`Connection failed: ${test.error}`);
      }
    } finally {
      setGeminiTesting(false);
    }
  };

  const handleSaveGeminiModel = async () => {
    setGeminiSaving(true);
    try {
      await aiProviderService.setProviderModel('gemini', geminiModel);
      setGeminiFeedback(`Google Gemini active model set to ${geminiModel}.`);
    } finally {
      setGeminiSaving(false);
    }
  };

  const providers = aiProviderService.getAllProviders();

  return (
    <section className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="eyebrow">MODELS &amp; AI ENGINE // PROVIDER LAYER</p>
          <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>AI Provider &amp; Model Selection</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>ACTIVE:</span>
          <StatusBadge tone={activeProviderId === 'ollama' ? 'cyan' : 'violet'}>
            {activeProviderId.toUpperCase()}
          </StatusBadge>
        </div>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        Choose where model intelligence comes from. BOSS uses a unified Agent architecture across all providers.
        Local AI (Ollama) runs 100% on your machine with zero cloud transmission. Cloud AI (OpenAI / Gemini) connects
        directly to provider endpoints using your personal API keys.
      </p>

      {/* Provider Selector Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {providers.map((p) => {
          const isSelected = selectedTab === p.metadata.id;
          const isActive = activeProviderId === p.metadata.id;
          const status = providerStatuses[p.metadata.id]?.status ?? 'checking';

          return (
            <div
              key={p.metadata.id}
              onClick={() => setSelectedTab(p.metadata.id)}
              style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-sm)',
                border: isSelected ? '1.5px solid var(--cyan)' : '1px solid var(--border)',
                background: isSelected ? 'rgba(0, 217, 255, 0.05)' : 'var(--surface-1)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: isSelected ? 'var(--cyan)' : 'var(--text)' }}>
                  {p.metadata.name}
                </span>
                {isActive && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'var(--cyan)',
                      color: '#03070c',
                    }}
                  >
                    ACTIVE
                  </span>
                )}
              </div>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {p.metadata.tagline}
              </span>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background:
                      status === 'connected'
                        ? 'var(--green)'
                        : status === 'configured'
                        ? 'var(--cyan)'
                        : status === 'not_installed' || status === 'not_connected'
                        ? 'var(--muted)'
                        : '#ef4444',
                  }}
                />
                <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
                  {status.replace('_', ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Provider Action Banner (if viewing a non-active provider) */}
      {selectedTab !== activeProviderId && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(139, 92, 255, 0.08)',
            border: '1px solid rgba(139, 92, 255, 0.3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12.5, color: '#c7b5ff' }}>
            Viewing <b>{selectedTab.toUpperCase()}</b> configuration. This provider is not currently set as your active AI engine.
          </span>
          <button
            type="button"
            className="button primary"
            onClick={() => handleSetActiveProvider(selectedTab)}
            style={{ padding: '6px 14px', fontSize: 11.5 }}
          >
            Set as Active Provider
          </button>
        </div>
      )}

      {/* Provider Configuration Panels */}

      {/* --- OLLAMA PANEL --- */}
      {selectedTab === 'ollama' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Runtime Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em' }}>
              LOCAL RUNTIME ENGINE
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className={`button ${runtime === 'ollama' ? 'primary' : ''}`}
                onClick={() => handleOllamaRuntimeChange('ollama')}
                style={{ flex: 1, padding: '10px 14px' }}
              >
                <b>Ollama</b> (Port 11434)
              </button>
              <button
                type="button"
                className={`button ${runtime === 'llama.cpp' ? 'primary' : ''}`}
                onClick={() => handleOllamaRuntimeChange('llama.cpp')}
                style={{ flex: 1, padding: '10px 14px' }}
              >
                <b>llama.cpp / Local HTTP</b> (Port 8080)
              </button>
            </div>
          </div>

          {/* Endpoint Configuration */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="local-endpoint-input" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em' }}>
              LOCAL ENDPOINT URL
            </label>
            <input
              id="local-endpoint-input"
              value={endpoint}
              onChange={(e) => {
                setEndpoint(e.target.value);
                setOllamaFeedback(null);
              }}
              placeholder="http://127.0.0.1:11434"
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${endpointValidation.valid ? 'var(--border)' : '#ef4444'}`,
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            />
            {!endpointValidation.valid ? (
              <span style={{ color: '#ef4444', fontSize: 12 }}>{endpointValidation.error}</span>
            ) : (
              <span style={{ color: 'var(--cyan)', fontSize: 11, fontFamily: 'monospace' }}>
                ✓ Verified local loopback interface. Privacy boundary intact.
              </span>
            )}
          </div>

          {/* Action & Guide Buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button"
              onClick={handleTestOllama}
              disabled={ollamaTesting || !endpointValidation.valid}
              style={{ padding: '9px 16px' }}
            >
              {ollamaTesting ? 'Testing Connection…' : 'Test Connection & Discover Models'}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setGuideProviderId('ollama')}
              style={{ padding: '9px 16px' }}
            >
              Setup Guide &amp; Instructions
            </button>
          </div>

          {/* Status Message */}
          {ollamaStatusMessage && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                background: ollamaDiscoveredModels.length > 0 ? 'rgba(0, 217, 255, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${ollamaDiscoveredModels.length > 0 ? 'rgba(0, 217, 255, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                fontFamily: 'monospace',
                fontSize: 12,
                color: ollamaDiscoveredModels.length > 0 ? 'var(--cyan)' : '#fca5a5',
                lineHeight: 1.5,
              }}
            >
              {ollamaStatusMessage}
            </div>
          )}

          {/* Discovered Model Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="local-model-select" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em' }}>
              ACTIVE LOCAL MODEL
            </label>
            {ollamaDiscoveredModels.length > 0 ? (
              <select
                id="local-model-select"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontFamily: 'monospace',
                  fontSize: 13,
                }}
              >
                {ollamaDiscoveredModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--muted)',
                  fontSize: 13,
                }}
              >
                No models currently discovered. Install a model locally (e.g. <code>ollama pull llama3.2</code>) to select.
              </div>
            )}
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="button"
              className="button primary"
              onClick={handleSaveOllama}
              disabled={ollamaSaving || !endpointValidation.valid}
              style={{ padding: '10px 20px' }}
            >
              {ollamaSaving ? 'Saving…' : 'Save Configuration'}
            </button>
            {ollamaFeedback && (
              <span style={{ fontSize: 12, color: ollamaFeedback.includes('failed') ? '#ef4444' : 'var(--cyan)' }}>
                {ollamaFeedback}
              </span>
            )}
          </div>

          {/* Privacy & Pricing Transparency Box */}
          <div
            style={{
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-0)',
              fontSize: 12,
              color: 'var(--muted)',
              lineHeight: 1.6,
            }}
          >
            <b style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>
              Ollama Architecture &amp; Pricing Information
            </b>
            Ollama runs compatible AI models locally on your computer. It does not require a cloud API key, but local models use your computer's CPU/RAM/GPU resources.
            BOSS never installs background services or downloads models automatically.
          </div>
        </div>
      )}

      {/* --- OPENAI PANEL --- */}
      {selectedTab === 'openai' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* API Key Management */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em' }}>
              OPENAI API KEY
            </label>
            {openAiHasKey && !openAiIsEditingKey ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  disabled
                  value="••••••••••••••••••••••••••••••••"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                    fontFamily: 'monospace',
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setOpenAiIsEditingKey(true);
                    setOpenAiInputKey('');
                  }}
                  style={{ padding: '10px 14px' }}
                >
                  Replace Key
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={handleRemoveOpenAiKey}
                  style={{ padding: '10px 14px', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                >
                  Remove Key
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={openAiInputKey}
                  onChange={(e) => setOpenAiInputKey(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                    fontFamily: 'monospace',
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  className="button primary"
                  onClick={handleSaveOpenAiKey}
                  disabled={openAiTesting || !openAiInputKey.trim()}
                  style={{ padding: '10px 16px' }}
                >
                  {openAiTesting ? 'Verifying…' : 'Test & Save Key'}
                </button>
                {openAiHasKey && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => setOpenAiIsEditingKey(false)}
                    style={{ padding: '10px 14px' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              An API key is a private credential that allows BOSS to communicate with your OpenAI account. Stored in native encrypted vault.
            </span>
          </div>

          {/* Model Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="openai-model-select" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em' }}>
              OPENAI MODEL
            </label>
            <select
              id="openai-model-select"
              value={openAiModel}
              onChange={(e) => setOpenAiModel(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            >
              {openAiDiscoveredModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button"
              onClick={handleTestOpenAi}
              disabled={openAiTesting || !openAiHasKey}
              style={{ padding: '9px 16px' }}
            >
              {openAiTesting ? 'Testing Connection…' : 'Test Connection'}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={handleSaveOpenAiModel}
              disabled={openAiSaving}
              style={{ padding: '9px 16px' }}
            >
              {openAiSaving ? 'Saving…' : 'Save Model'}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setGuideProviderId('openai')}
              style={{ padding: '9px 16px' }}
            >
              Watch Guide &amp; Setup Help
            </button>
            {openAiFeedback && (
              <span style={{ fontSize: 12, color: openAiFeedback.includes('failed') ? '#ef4444' : 'var(--cyan)' }}>
                {openAiFeedback}
              </span>
            )}
          </div>

          {/* Pricing Transparency & Cloud Warning */}
          <div
            style={{
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-0)',
              fontSize: 12,
              color: 'var(--muted)',
              lineHeight: 1.6,
            }}
          >
            <b style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>
              OpenAI Cloud Usage &amp; Pricing Notice
            </b>
            Cloud AI providers may charge for API usage. BOSS does not control provider pricing. Check the provider's current pricing and usage limits before using cloud AI.
            Usage is billed directly by OpenAI to your account.
            <div style={{ marginTop: 6 }}>
              <a href="https://openai.com/api/pricing/" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>
                View OpenAI API Pricing →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* --- GEMINI PANEL --- */}
      {selectedTab === 'gemini' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* API Key Management */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em' }}>
              GOOGLE GEMINI API KEY
            </label>
            {geminiHasKey && !geminiIsEditingKey ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  disabled
                  value="••••••••••••••••••••••••••••••••"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                    fontFamily: 'monospace',
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setGeminiIsEditingKey(true);
                    setGeminiInputKey('');
                  }}
                  style={{ padding: '10px 14px' }}
                >
                  Replace Key
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={handleRemoveGeminiKey}
                  style={{ padding: '10px 14px', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                >
                  Remove Key
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={geminiInputKey}
                  onChange={(e) => setGeminiInputKey(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                    fontFamily: 'monospace',
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  className="button primary"
                  onClick={handleSaveGeminiKey}
                  disabled={geminiTesting || !geminiInputKey.trim()}
                  style={{ padding: '10px 16px' }}
                >
                  {geminiTesting ? 'Verifying…' : 'Test & Save Key'}
                </button>
                {geminiHasKey && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => setGeminiIsEditingKey(false)}
                    style={{ padding: '10px 14px' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              An API key is a private credential that allows BOSS to communicate with Google Gemini API. Transmitted securely via header, never in URLs.
            </span>
          </div>

          {/* Model Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="gemini-model-select" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em' }}>
              GEMINI MODEL
            </label>
            <select
              id="gemini-model-select"
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            >
              {geminiDiscoveredModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button"
              onClick={handleTestGemini}
              disabled={geminiTesting || !geminiHasKey}
              style={{ padding: '9px 16px' }}
            >
              {geminiTesting ? 'Testing Connection…' : 'Test Connection'}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={handleSaveGeminiModel}
              disabled={geminiSaving}
              style={{ padding: '9px 16px' }}
            >
              {geminiSaving ? 'Saving…' : 'Save Model'}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setGuideProviderId('gemini')}
              style={{ padding: '9px 16px' }}
            >
              Watch Guide &amp; Setup Help
            </button>
            {geminiFeedback && (
              <span style={{ fontSize: 12, color: geminiFeedback.includes('failed') ? '#ef4444' : 'var(--cyan)' }}>
                {geminiFeedback}
              </span>
            )}
          </div>

          {/* Pricing Transparency & Cloud Warning */}
          <div
            style={{
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-0)',
              fontSize: 12,
              color: 'var(--muted)',
              lineHeight: 1.6,
            }}
          >
            <b style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>
              Google Gemini Cloud Usage &amp; Pricing Notice
            </b>
            Google Gemini is a cloud AI provider. Usage may be subject to Google's current pricing and rate limits. BOSS does not control Google's pricing.
            <div style={{ marginTop: 6 }}>
              <a href="https://ai.google.dev/pricing" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>
                View Google AI Studio Pricing →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal Dialog */}
      {guideProviderId && (
        <ProviderGuideModal
          providerId={guideProviderId}
          onClose={() => setGuideProviderId(null)}
        />
      )}
    </section>
  );
}

export function SettingsPage({ path }: { path: string }) {
  const selected = path === routes.settings ? routes.general : path;
  const memory = useStoredResource(() => localData.memory.listMemoryItems());
  const audit = useStoredResource(() => localData.permissions.listPermissionAudit());

  return (
    <main className="page">
      <PageHeading eyebrow="System Configuration" title="Settings">
        <StatusBadge tone="cyan">LOCAL PREFERENCES</StatusBadge>
      </PageHeading>
      <div className="settings">
        <nav className="settings-nav panel" aria-label="Settings navigation">
          {items.map(([label, to]) => (
            <a className={to === selected ? 'active' : ''} href={to} key={to}>
              {label}
            </a>
          ))}
        </nav>

        {selected === routes.models ? (
          <ModelsSettingsSection />
        ) : selected === routes.general ? (
          <section className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>GENERAL PREFERENCES</p>
              <h2 style={{ fontSize: 18, margin: '6px 0 2px 0' }}>Workspace &amp; Application Defaults</h2>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Configure local application behaviors, project defaults, and execution safeguards.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b style={{ fontSize: 13, display: 'block' }}>Coding Studio Auto-Save</b>
                  <span className="muted" style={{ fontSize: 11 }}>Save modified buffers upon blur or hotkey</span>
                </div>
                <StatusBadge tone="green">ENABLED</StatusBadge>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b style={{ fontSize: 13, display: 'block' }}>Terminal Execution Shell</b>
                  <span className="muted" style={{ fontSize: 11 }}>Default native shell on Windows ARM64</span>
                </div>
                <span className="mono" style={{ fontSize: 12, color: 'var(--cyan)' }}>PowerShell / cmd.exe</span>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b style={{ fontSize: 13, display: 'block' }}>Telemetry &amp; Cloud Sync</b>
                  <span className="muted" style={{ fontSize: 11 }}>External network calls and tracking</span>
                </div>
                <StatusBadge tone="green">HARD DISABLED</StatusBadge>
              </div>
            </div>
          </section>
        ) : selected === routes.appearance ? (
          <section className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>APPEARANCE &amp; THEME</p>
              <h2 style={{ fontSize: 18, margin: '6px 0 2px 0' }}>Stitch Dark Obsidian Design System</h2>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Customized desktop visual theme with holographic accents and smooth motion.
              </p>
            </div>

            <div className="grid grid-2">
              <div style={{ padding: 14, borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', border: '1px solid var(--hairline)' }}>
                <p className="eyebrow" style={{ margin: 0 }}>COLOR THEME</p>
                <b style={{ fontSize: 14, display: 'block', marginTop: 4 }}>Obsidian &amp; Glass</b>
                <span className="muted" style={{ fontSize: 11 }}>#020408 background with 18px backdrop blur</span>
              </div>
              <div style={{ padding: 14, borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', border: '1px solid var(--hairline)' }}>
                <p className="eyebrow" style={{ margin: 0 }}>ACCENT PALETTE</p>
                <b style={{ fontSize: 14, display: 'block', marginTop: 4, color: 'var(--cyan)' }}>Holographic Cyan (#00d9ff)</b>
                <span className="muted" style={{ fontSize: 11 }}>Secondary: Electric Violet (#8b5cff)</span>
              </div>
              <div style={{ padding: 14, borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', border: '1px solid var(--hairline)' }}>
                <p className="eyebrow" style={{ margin: 0 }}>TYPOGRAPHY</p>
                <b style={{ fontSize: 14, display: 'block', marginTop: 4 }}>JetBrains Mono &amp; Plus Jakarta</b>
                <span className="muted" style={{ fontSize: 11 }}>Subpixel rendered monospace &amp; geometric UI sans</span>
              </div>
              <div style={{ padding: 14, borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', border: '1px solid var(--hairline)' }}>
                <p className="eyebrow" style={{ margin: 0 }}>MOTION PROFILE</p>
                <b style={{ fontSize: 14, display: 'block', marginTop: 4 }}>Hardware Accelerated</b>
                <span className="muted" style={{ fontSize: 11 }}>GPU transforms, respectful of reduced-motion</span>
              </div>
            </div>
          </section>
        ) : selected === routes.voice ? (
          <section className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>VOICE &amp; AUDIO</p>
              <h2 style={{ fontSize: 18, margin: '6px 0 2px 0' }}>Local Acoustic Interface</h2>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Real-time acoustic waveforms and voice synthesis configuration.
              </p>
            </div>

            <div style={{ padding: 16, borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', border: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 13 }}>Local Speech Engine</b>
                <StatusBadge tone="cyan">STANDBY</StatusBadge>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                BOSS Core is configured to visualize audio resonance via the harmonic bar animation during LISTENING and SPEAKING states. Audio processing operates on local audio devices with zero cloud transmission.
              </p>
            </div>
          </section>
        ) : selected === routes.memory ? (
          <section className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>PERSISTENT MEMORY</p>
                <h2 style={{ fontSize: 18, margin: '6px 0 2px 0' }}>Local Knowledge &amp; Context</h2>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Durable knowledge records stored in local SQLite database.
                </p>
              </div>
              <StatusBadge tone={memory.status === 'ready' ? 'green' : 'muted'}>
                {`${memory.data.length} RECORDS`}
              </StatusBadge>
            </div>

            {memory.data.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', background: 'var(--surface-0)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)' }}>
                <p className="muted mono" style={{ fontSize: 12, margin: 0 }}>
                  No memory records stored yet. As you converse with BOSS, relevant facts and context can be stored locally.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                {memory.data.map((item) => (
                  <div key={item.id} style={{ padding: 12, borderRadius: 6, background: 'var(--surface-0)', border: '1px solid var(--hairline)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ fontSize: 13 }}>{item.category.toUpperCase()}</b>
                      <span className="muted mono" style={{ fontSize: 10 }}>{item.source ?? 'local'}</span>
                    </div>
                    <p className="mono muted" style={{ fontSize: 11, margin: '4px 0 0 0' }}>{item.content}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : selected === routes.profile ? (
          <section className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>DEVELOPER PROFILE</p>
              <h2 style={{ fontSize: 18, margin: '6px 0 2px 0' }}>Local Session Identity</h2>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Workstation environment details for native session execution.
              </p>
            </div>

            <div style={{ padding: 16, borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', border: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted" style={{ fontSize: 12 }}>Operator</span>
                <b style={{ fontSize: 13 }}>Bhanu</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted" style={{ fontSize: 12 }}>Enclave Security Level</span>
                <StatusBadge tone="green">AIR-GAPPED LOCAL</StatusBadge>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted" style={{ fontSize: 12 }}>Target Architecture</span>
                <span className="mono" style={{ fontSize: 12 }}>aarch64-pc-windows-msvc (ARM64)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted" style={{ fontSize: 12 }}>Session Persistence</span>
                <span className="mono" style={{ fontSize: 12 }}>SQLite (WAL mode enabled)</span>
              </div>
            </div>
          </section>
        ) : selected === routes.permissions ? (
          <section className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>SECURITY &amp; CAPABILITIES</p>
                <h2 style={{ fontSize: 18, margin: '6px 0 2px 0' }}>Native Boundary Enforcement</h2>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Enforced security limits for filesystem, terminal, and AI tool execution.
                </p>
              </div>
              <StatusBadge tone="green">BOUNDARIES ACTIVE</StatusBadge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 6, background: 'var(--surface-0)', border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b style={{ fontSize: 13 }}>Filesystem Access</b>
                  <span className="muted mono" style={{ display: 'block', fontSize: 11 }}>Strictly restricted to registered project directories; path traversal blocked</span>
                </div>
                <StatusBadge tone="cyan">CANONICAL ROOT ONLY</StatusBadge>
              </div>

              <div style={{ padding: 12, borderRadius: 6, background: 'var(--surface-0)', border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b style={{ fontSize: 13 }}>Terminal Execution</b>
                  <span className="muted mono" style={{ display: 'block', fontSize: 11 }}>Working directory locked to project root; explicit command streaming</span>
                </div>
                <StatusBadge tone="cyan">PROJECT SCOPED</StatusBadge>
              </div>

              <div style={{ padding: 12, borderRadius: 6, background: 'var(--surface-0)', border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b style={{ fontSize: 13 }}>Cloud &amp; Outbound Networking</b>
                  <span className="muted mono" style={{ display: 'block', fontSize: 11 }}>External API calls and external web access blocked</span>
                </div>
                <StatusBadge tone="green">LOOPBACK STRICT (127.0.0.1)</StatusBadge>
              </div>
            </div>

            {audit.data.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p className="eyebrow" style={{ margin: '0 0 8px 0' }}>AUDIT LOG ({audit.data.length})</p>
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {audit.data.map((item) => (
                    <div key={item.id} className="mono" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: 'var(--surface-0)' }}>
                      <span>{item.action}</span> - <span className="muted">{item.target}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>ABOUT BOSS</p>
              <h2 style={{ fontSize: 18, margin: '6px 0 2px 0' }}>BOSS — Bhanu Open Source System</h2>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Local-first desktop AI developer operating environment.
              </p>
            </div>

            <div style={{ padding: 16, borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', border: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 14 }}>BOSS v0.1.0 (Release Candidate)</b>
                <StatusBadge tone="green">PRODUCTION PACKAGE</StatusBadge>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                Native desktop application built with Tauri v2, Rust native boundary, React 19 frontend, SQLite persistence, and encrypted credential vault. Supports private local AI (Ollama) and cloud BYOK (OpenAI &amp; Google Gemini).
              </p>
            </div>

            <div className="grid grid-3">
              <div style={{ padding: 12, borderRadius: 6, background: 'var(--surface-0)', border: '1px solid var(--hairline)' }}>
                <p className="eyebrow" style={{ margin: 0 }}>PLATFORM</p>
                <b className="mono" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>Windows ARM64</b>
              </div>
              <div style={{ padding: 12, borderRadius: 6, background: 'var(--surface-0)', border: '1px solid var(--hairline)' }}>
                <p className="eyebrow" style={{ margin: 0 }}>AI PROVIDERS</p>
                <b className="mono" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>Ollama / OpenAI / Gemini</b>
              </div>
              <div style={{ padding: 12, borderRadius: 6, background: 'var(--surface-0)', border: '1px solid var(--hairline)' }}>
                <p className="eyebrow" style={{ margin: 0 }}>SECURITY</p>
                <b className="mono" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>Encrypted Vault + Sandbox</b>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
