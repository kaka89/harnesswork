/**
 * Auth Page — 登录 / 注册
 *
 * Entry gate for xingjing. Shown when no valid session exists.
 * Design: dark tech aesthetic, centered card, tab-switch login/register.
 */

import { createSignal, Show, type Component } from 'solid-js';
import { login, register } from '../../services/auth-service';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AuthPageProps {
  onSuccess: () => void;
}

type Tab = 'login' | 'register';

// ── Component ──────────────────────────────────────────────────────────────────

const AuthPage: Component<AuthPageProps> = (props) => {
  const [tab, setTab] = createSignal<Tab>('login');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Login form
  const [loginEmail, setLoginEmail] = createSignal('');
  const [loginPassword, setLoginPassword] = createSignal('');

  // Register form
  const [regEmail, setRegEmail] = createSignal('');
  const [regPassword, setRegPassword] = createSignal('');
  const [regName, setRegName] = createSignal('');
  const [regCompany, setRegCompany] = createSignal('');

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
  };

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    if (busy()) return;
    setError(null);
    setBusy(true);
    try {
      await login(loginEmail().trim(), loginPassword());
      props.onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: Event) => {
    e.preventDefault();
    if (busy()) return;
    setError(null);
    if (!regEmail().trim() || !regPassword() || !regName().trim() || !regCompany().trim()) {
      setError('请填写所有必填项');
      return;
    }
    setBusy(true);
    try {
      await register(regEmail().trim(), regPassword(), regName().trim(), regCompany().trim());
      props.onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="relative flex items-center justify-center min-h-screen w-full overflow-hidden bg-[var(--dls-app-bg)]">
      {/* Background grid */}
      <div
        class="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          'background-image': `
            linear-gradient(var(--dls-border) 1px, transparent 1px),
            linear-gradient(90deg, var(--dls-border) 1px, transparent 1px)
          `,
          'background-size': '40px 40px',
        }}
      />

      {/* Radial glow */}
      <div
        class="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(139,92,246,0.08) 0%, transparent 70%)',
        }}
      />

      {/* Card */}
      <div class="relative z-10 w-full max-w-[380px] mx-4">

        {/* Logo */}
        <div class="mb-8 text-center">
          <div class="inline-flex items-center gap-2.5 mb-2">
            <span class="text-3xl leading-none select-none">🌙</span>
            <span
              class="text-2xl font-semibold tracking-tight text-gray-12"
              style={{ 'letter-spacing': '-0.02em' }}
            >
              星静
            </span>
          </div>
          <p class="text-xs text-gray-10 tracking-widest uppercase mt-1">
            All-in-One 研发平台
          </p>
        </div>

        {/* Panel */}
        <div
          class="rounded-2xl border border-[var(--dls-border)] overflow-hidden"
          style={{ background: 'var(--dls-sidebar-bg, rgba(255,255,255,0.03))' }}
        >
          {/* Tabs */}
          <div class="flex border-b border-[var(--dls-border)]">
            {(['login', 'register'] as Tab[]).map((t) => (
              <button
                type="button"
                class="flex-1 py-3 text-sm font-medium transition-colors relative"
                classList={{
                  'text-gray-12': tab() === t,
                  'text-gray-10 hover:text-gray-11': tab() !== t,
                }}
                onClick={() => switchTab(t)}
              >
                {t === 'login' ? '登录' : '注册'}
                <Show when={tab() === t}>
                  <span class="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-purple-9" />
                </Show>
              </button>
            ))}
          </div>

          {/* Form area */}
          <div class="p-6">
            {/* Error */}
            <Show when={error()}>
              {(msg) => (
                <div class="mb-4 rounded-lg border border-red-7/30 bg-red-2/20 px-3 py-2 text-xs text-red-11">
                  {msg()}
                </div>
              )}
            </Show>

            {/* ── Login form ── */}
            <Show when={tab() === 'login'}>
              <form onSubmit={handleLogin} class="space-y-4">
                <Field
                  label="邮箱"
                  type="email"
                  value={loginEmail()}
                  onInput={setLoginEmail}
                  placeholder="your@email.com"
                  disabled={busy()}
                  required
                />
                <Field
                  label="密码"
                  type="password"
                  value={loginPassword()}
                  onInput={setLoginPassword}
                  placeholder="••••••••"
                  disabled={busy()}
                  required
                />
                <SubmitButton busy={busy()} label="登录" />
              </form>
            </Show>

            {/* ── Register form ── */}
            <Show when={tab() === 'register'}>
              <form onSubmit={handleRegister} class="space-y-4">
                <Field
                  label="邮箱"
                  type="email"
                  value={regEmail()}
                  onInput={setRegEmail}
                  placeholder="your@email.com"
                  disabled={busy()}
                  required
                />
                <Field
                  label="密码"
                  type="password"
                  value={regPassword()}
                  onInput={setRegPassword}
                  placeholder="至少 6 位"
                  disabled={busy()}
                  required
                />
                <Field
                  label="姓名"
                  type="text"
                  value={regName()}
                  onInput={setRegName}
                  placeholder="张三"
                  disabled={busy()}
                  required
                />
                <Field
                  label="公司 / 团队名称"
                  type="text"
                  value={regCompany()}
                  onInput={setRegCompany}
                  placeholder="我的团队"
                  disabled={busy()}
                  required
                />
                <SubmitButton busy={busy()} label="创建账号" />
              </form>
            </Show>
          </div>
        </div>

        {/* Footer hint */}
        <p class="mt-5 text-center text-[11px] text-gray-9">
          {tab() === 'login' ? '还没有账号？' : '已有账号？'}
          <button
            type="button"
            class="ml-1 text-gray-11 hover:text-purple-11 transition-colors"
            onClick={() => switchTab(tab() === 'login' ? 'register' : 'login')}
          >
            {tab() === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
      </div>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  type: 'email' | 'password' | 'text';
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

const Field: Component<FieldProps> = (p) => (
  <div class="space-y-1.5">
    <label class="block text-xs font-medium text-gray-10">{p.label}</label>
    <input
      type={p.type}
      value={p.value}
      onInput={(e) => p.onInput(e.currentTarget.value)}
      placeholder={p.placeholder}
      disabled={p.disabled}
      required={p.required}
      class="w-full rounded-lg border border-[var(--dls-border)] bg-[var(--dls-app-bg)] px-3 py-2 text-sm text-gray-12 placeholder:text-gray-8 outline-none transition-colors focus:border-purple-8 disabled:opacity-50 disabled:cursor-not-allowed"
    />
  </div>
);

interface SubmitButtonProps {
  busy: boolean;
  label: string;
}

const SubmitButton: Component<SubmitButtonProps> = (p) => (
  <button
    type="submit"
    disabled={p.busy}
    class="mt-2 w-full rounded-lg bg-purple-9 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-purple-10 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
  >
    <Show when={!p.busy} fallback={
      <span class="flex items-center justify-center gap-2">
        <svg class="animate-spin h-4 w-4 text-white/80" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4l-3 3-3-3h4z" />
        </svg>
        处理中...
      </span>
    }>
      {p.label}
    </Show>
  </button>
);

export default AuthPage;
