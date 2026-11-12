import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronDown,
  FileText,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const api = import.meta.env.VITE_API_URL || "";
const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
const demoEmail = import.meta.env.VITE_DEMO_EMAIL || "";
type Org = { id: string; name: string; role: string };
type Lease = {
  id: string;
  reference: string;
  tenant_name: string;
  expires_on: string;
  renewal_notice_required: boolean | null;
  renewal_notice_days: number | null;
  days_until_expiration: number;
  property_name: string;
  unit_number: string;
};
type LeaseDetail = Lease & { starts_on: string; status: string };
type Doc = {
  id: string;
  title: string;
  original_filename: string;
  uploaded_by: string;
  visibility: string;
  processing_status: string;
  created_at: string;
};
type DocVersion = {
  id: string;
  version_number: number;
  processing_status: string;
  created_at: string;
  is_current: boolean;
};
type Property = { id: string; name: string; address: string; timezone: string };
type Unit = { id: string; unit_number: string };
type Chat = { id: string; title: string };
type Citation = {
  id: string;
  label: string;
  type: string;
  page?: number | null;
};
type ChatMessage = {
  role: string;
  content: string;
  response_metadata?: {
    status?: string;
    generation_mode?: string;
    citations?: Citation[];
  };
};
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};
type AuditEvent = {
  id: string;
  event_type: string;
  resource_type: string;
  resource_id: string | null;
  outcome: string;
  created_at: string;
};
type SecurityReport = {
  status: string;
  checks: { id: string; passed: boolean }[];
};

async function request<T>(
  path: string,
  tenant?: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(tenant ? { "X-Tenant-ID": tenant } : {}),
      ...(init?.headers || {}),
    },
  });
  if (response.status === 401)
    window.dispatchEvent(new Event("tenantground:unauthorized"));
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).detail ||
        `Request failed (${response.status})`,
    );
  return response.status === 204 ? (undefined as T) : response.json();
}

export default function App() {
  const [identity, setIdentity] = useState<{
    user: { id: string; name: string; email: string };
    organizations: Org[];
  } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tenant, setTenant] = useState("");
  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [section, setSection] = useState("Overview");
  const [question, setQuestion] = useState(
    "Which leases expire in the next 60 days, and which need a renewal notice?",
  );
  const [answer, setAnswer] = useState<{
    answer: string;
    status: string;
    citations: Citation[];
    generation_mode?: string;
  } | null>(null);
  const [sourcePreview, setSourcePreview] = useState<{
    title: string;
    content: string;
  } | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [securityReport, setSecurityReport] = useState<SecurityReport | null>(
    null,
  );
  const [leaseFormOpen, setLeaseFormOpen] = useState(false);
  const [leaseToEdit, setLeaseToEdit] = useState<LeaseDetail | null>(null);
  const [editNotice, setEditNotice] = useState<"required" | "none" | "unknown">(
    "unknown",
  );
  const [propertyFormOpen, setPropertyFormOpen] = useState(false);
  const [editingPropertyId, setEditingPropertyId] = useState("");
  const [propertyDraft, setPropertyDraft] = useState({
    name: "",
    address: "",
    timezone: "Asia/Karachi",
    units: "",
  });
  const [leaseDraft, setLeaseDraft] = useState({
    propertyId: "",
    unitId: "",
    reference: "",
    tenantName: "",
    startsOn: "",
    expiresOn: "",
    noticeRequired: true as boolean | null,
    noticeDays: "60",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState(demoMode ? demoEmail : "");
  const [password, setPassword] = useState("");
  const dateLabel = new Date()
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();

  async function refresh(t = tenant, currentIdentity = identity) {
    if (!t) return;
    try {
      const results = await Promise.allSettled([
        request<Lease[]>("/api/leases", t),
        request<Doc[]>("/api/documents", t),
        request<Property[]>("/api/properties", t),
        request<Chat[]>("/api/chats", t),
      ]);
      if (results[0].status === "fulfilled") setLeases(results[0].value);
      if (results[1].status === "fulfilled") setDocs(results[1].value);
      if (results[2].status === "fulfilled") setProperties(results[2].value);
      if (results[3].status === "fulfilled") setChats(results[3].value);

      const activeIdent = currentIdentity ?? identity;
      if (activeIdent?.organizations.find((o) => o.id === t)?.role === "admin") {
        const [mRes, aRes] = await Promise.allSettled([
          request<Member[]>("/api/tenants/current/members", t),
          request<AuditEvent[]>("/api/audit/events?limit=100", t),
        ]);
        if (mRes.status === "fulfilled") setMembers(mRes.value);
        if (aRes.status === "fulfilled") setAuditEvents(aRes.value);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    request<typeof identity>("/api/auth/me")
      .then((x) => {
        setIdentity(x);
        if (x?.organizations[0]) {
          setTenant(x.organizations[0].id);
          void refresh(x.organizations[0].id, x);
        }
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    const expire = () => setIdentity(null);
    window.addEventListener("tenantground:unauthorized", expire);
    return () =>
      window.removeEventListener("tenantground:unauthorized", expire);
  }, []);
  useEffect(() => {
    if (tenant) void refresh(tenant);
  }, [tenant]);
  useEffect(() => {
    setActiveChat("");
    setMessages([]);
  }, [tenant]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/auth/login", undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const me = await request<NonNullable<typeof identity>>("/api/auth/me");
      setIdentity(me);
      const targetTenant = me.organizations[0]?.id || "";
      setTenant(targetTenant);
      await refresh(targetTenant, me);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      let chat = activeChat;
      if (!chat) {
        const created = await request<{ id: string }>("/api/chats", tenant, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: question.slice(0, 120) }),
        });
        chat = created.id;
        setActiveChat(chat);
      }
      const result = await request<{
        answer: string;
        status: string;
        citations: Citation[];
        generation_mode?: string;
      }>(`/api/chats/${chat}/messages`, tenant, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: question }),
      });
      setAnswer(result);
      setMessages((current) => [
        ...current,
        { role: "user", content: question },
        {
          role: "assistant",
          content: result.answer,
          response_metadata: { citations: result.citations },
        },
      ]);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openChat(id: string) {
    try {
      const result = await request<{ messages: ChatMessage[] }>(
        `/api/chats/${id}`,
        tenant,
      );
      setActiveChat(id);
      setMessages(result.messages);
      setAnswer(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function newChat() {
    setActiveChat("");
    setMessages([]);
    setAnswer(null);
  }
  async function openCitation(citation: Citation) {
    try {
      const path =
        citation.type === "lease"
          ? `/api/leases/${citation.id}`
          : `/api/knowledge/sources/${citation.id}`;
      const source = await request<Record<string, unknown>>(path, tenant);
      setSourcePreview({
        title: String(source.title || source.reference || citation.label),
        content: String(source.content || JSON.stringify(source, null, 2)),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    setError("");
    try {
      await request("/api/documents", tenant, { method: "POST", body: form });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  async function submitLease(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/leases", tenant, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: leaseDraft.propertyId,
          unit_id: leaseDraft.unitId,
          reference: leaseDraft.reference,
          tenant_name: leaseDraft.tenantName,
          starts_on: leaseDraft.startsOn,
          expires_on: leaseDraft.expiresOn,
          renewal_notice_required: leaseDraft.noticeRequired,
          renewal_notice_days:
            leaseDraft.noticeRequired === true
              ? Number(leaseDraft.noticeDays)
              : leaseDraft.noticeRequired === false
                ? 0
                : null,
        }),
      });
      setLeaseFormOpen(false);
      setLeaseDraft({
        propertyId: "",
        unitId: "",
        reference: "",
        tenantName: "",
        startsOn: "",
        expiresOn: "",
        noticeRequired: true,
        noticeDays: "60",
      });
      setUnits([]);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function selectProperty(propertyId: string) {
    setLeaseDraft((draft) => ({ ...draft, propertyId, unitId: "" }));
    setUnits([]);
    if (!propertyId) return;
    try {
      setUnits(
        await request<Unit[]>(`/api/properties/${propertyId}/units`, tenant),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submitProperty(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const editing = Boolean(editingPropertyId);
      await request(
        editing ? `/api/properties/${editingPropertyId}` : "/api/properties",
        tenant,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editing
              ? {
                  name: propertyDraft.name,
                  address: propertyDraft.address,
                  timezone: propertyDraft.timezone,
                }
              : {
                  name: propertyDraft.name,
                  address: propertyDraft.address,
                  timezone: propertyDraft.timezone,
                  units: propertyDraft.units
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .map((unit_number) => ({ unit_number })),
                },
          ),
        },
      );
      setPropertyFormOpen(false);
      setEditingPropertyId("");
      setPropertyDraft({
        name: "",
        address: "",
        timezone: "Asia/Karachi",
        units: "",
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openLeaseEditor(id: string) {
    try {
      const lease = await request<LeaseDetail>(`/api/leases/${id}`, tenant);
      setLeaseToEdit(lease);
      setEditNotice(
        lease.renewal_notice_required === null
          ? "unknown"
          : lease.renewal_notice_required
            ? "required"
            : "none",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveLeaseEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!leaseToEdit) return;
    const form = new FormData(e.currentTarget);
    const notice = form.get("notice");
    const required = notice === "unknown" ? null : notice === "required";
    setBusy(true);
    setError("");
    try {
      await request(`/api/leases/${leaseToEdit.id}`, tenant, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: form.get("reference"),
          tenant_name: form.get("tenant_name"),
          starts_on: form.get("starts_on"),
          expires_on: form.get("expires_on"),
          renewal_notice_required: required,
          renewal_notice_days:
            required === true
              ? Number(form.get("notice_days"))
              : required === false
                ? 0
                : null,
        }),
      });
      setLeaseToEdit(null);
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading)
    return (
      <main className="login">
        <div className="login-card">
          <div className="brand-mark">
            <Building2 size={21} />
          </div>
          <p className="muted">Opening your secure workspace…</p>
        </div>
      </main>
    );
  if (!identity)
    return (
      <main className="login">
        <div className="login-card">
          <div className="brand-mark">
            <Building2 size={21} />
          </div>
          <p className="eyebrow">MULTI-TENANT RAG · SECURE KNOWLEDGE</p>
          <h1>
            Your portfolio,
            <br />
            with the full picture.
          </h1>
          <p className="muted">
            Sign in to your organization's knowledge workspace.
          </p>
          <form onSubmit={signIn} className="login-form">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"} <ArrowUpRight size={16} />
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          {demoMode && (
            <p className="hint">
              Demo account: {demoEmail}. Enter the password generated in your
              local `.env` file.
            </p>
          )}
        </div>
      </main>
    );

  const nav = [
    { label: "Overview", icon: Building2 },
    { label: "Properties", icon: Building2 },
    { label: "Leases", icon: CalendarDays },
    { label: "Knowledge", icon: FileText },
    { label: "Assistant", icon: Sparkles },
    ...(identity.organizations.find((o) => o.id === tenant)?.role === "admin"
      ? [
          { label: "Members", icon: Building2 },
          { label: "Audit", icon: ShieldCheck },
        ]
      : []),
    { label: "Security Lab", icon: ShieldCheck },
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark small">
            <Building2 size={17} />
          </div>
          <span>
            tenant<span className="brand-light">ground</span>
          </span>
          <span className="version">DEMO</span>
        </div>
        <button
          className="org-switch"
          title="Switch organization"
          onClick={() => {
            const index = identity.organizations.findIndex(
              (o) => o.id === tenant,
            );
            const next =
              identity.organizations[
                (index + 1) % identity.organizations.length
              ];
            if (next) setTenant(next.id);
          }}
        >
          <span className="org-avatar">N</span>
          <span className="org-text">
            <b>
              {identity.organizations.find((o) => o.id === tenant)?.name ||
                "Choose organization"}
            </b>
            <small>Click to switch organization</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {nav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${section === label ? "active" : ""}`}
              onClick={() => {
                setSection(label);
                if (label === "Members" || label === "Audit" || label === "Overview" || label === "Leases" || label === "Knowledge" || label === "Properties" || label === "Assistant") {
                  void refresh();
                }
              }}
            >
              <Icon size={17} />
              {label}
              {label === "Security Lab" && <span className="new">LAB</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure">
            <ShieldCheck size={16} />
            <span>
              <b>RLS configured</b>
              <small>Restricted runtime role</small>
            </span>
          </div>
          <div className="profile">
            <div className="profile-avatar">
              {identity.user.name.slice(0, 1)}
            </div>
            <div>
              <b>{identity.user.name}</b>
              <small>
                {identity.organizations.find((o) => o.id === tenant)?.role ||
                  "Member"}
              </small>
            </div>
            <button
              title="Sign out"
              onClick={async () => {
                try {
                  await request("/api/auth/logout", undefined, {
                    method: "POST",
                  });
                } finally {
                  setIdentity(null);
                }
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="crumb">Workspace</span>
            <span className="slash">/</span>
            <b>{section}</b>
          </div>
          <div className="top-actions">
            <span className="live">
              <i /> Local demo workspace
            </span>
            <span className="date">{dateLabel}</span>
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="alert">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {sourcePreview && (
            <section className="panel source-preview">
              <div className="panel-head">
                <div>
                  <h2>{sourcePreview.title}</h2>
                  <p>Rechecked under your current organization access.</p>
                </div>
                <button
                  className="icon-link"
                  aria-label="Close source preview"
                  onClick={() => setSourcePreview(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <pre>{sourcePreview.content}</pre>
            </section>
          )}
          {section === "Overview" && (
            <>
              <div className="welcome">
                <div>
                  <p className="eyebrow">{dateLabel} · YOUR PORTFOLIO</p>
                  <h1>Good morning, {identity.user.name.split(" ")[0]}.</h1>
                  <p>
                    Here’s what needs your attention across the properties you
                    manage.
                  </p>
                </div>
                <button
                  className="outline"
                  onClick={() => setSection("Assistant")}
                >
                  <Sparkles size={16} /> Ask your knowledge base
                </button>
              </div>
              <div className="stats">
                <article className="stat-card">
                  <div className="stat-top">
                    <span>LEASES EXPIRING</span>
                    <Building2 size={16} />
                  </div>
                  <strong>
                    {
                      leases.filter(
                        (l) =>
                          l.days_until_expiration >= 0 &&
                          l.days_until_expiration <= 60,
                      ).length
                    }
                  </strong>
                  <small>within the next 60 days</small>
                  <div className="stat-foot">
                    Across properties you can access
                  </div>
                </article>
                <article className="stat-card accent">
                  <div className="stat-top">
                    <span>NOTICE REVIEWS</span>
                    <CalendarDays size={16} />
                  </div>
                  <strong>
                    {
                      leases.filter(
                        (l) =>
                          l.days_until_expiration >= 0 &&
                          l.days_until_expiration <= 60 &&
                          l.renewal_notice_required === true,
                      ).length
                    }
                  </strong>
                  <small>require a renewal notice</small>
                  <div className="stat-foot">
                    Review deadlines in lease details
                  </div>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span>KNOWLEDGE FILES</span>
                    <FileText size={16} />
                  </div>
                  <strong>{docs.length}</strong>
                  <small>documents in your library</small>
                  <div className="stat-foot">Private to this organization</div>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span>SECURITY STATUS</span>
                    <ShieldCheck size={16} />
                  </div>
                  <strong className="status-text">RLS configured</strong>
                  <small>runtime-role policies</small>
                  <div className="stat-foot">
                    Database integration verification pending
                  </div>
                </article>
              </div>
              <div className="grid-main">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>Upcoming lease expirations</h2>
                      <p>Leases with an expiration date in the next 60 days.</p>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => setSection("Leases")}
                    >
                      All leases <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <LeaseTable
                    leases={leases
                      .filter(
                        (l) =>
                          l.days_until_expiration >= 0 &&
                          l.days_until_expiration <= 60,
                      )
                      .slice(0, 5)}
                  />
                </section>
                <section className="panel assistant-card">
                  <div className="panel-head">
                    <div>
                      <div className="icon-tile">
                        <Sparkles size={17} />
                      </div>
                      <h2>Ask Multi-Tenant RAG</h2>
                      <p>Answers grounded in records you can access.</p>
                    </div>
                  </div>
                  <form onSubmit={ask}>
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      rows={4}
                    />
                    <div className="ask-foot">
                      <span>
                        <ShieldCheck size={13} /> Grounded evidence · Sources
                        checked
                      </span>
                      <button className="primary" disabled={busy}>
                        {busy ? "Thinking…" : "Ask"} <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </form>
                  {answer && <Answer answer={answer} onOpen={openCitation} />}
                </section>
              </div>
              <section className="panel lower-panel">
                <div className="panel-head">
                  <div>
                    <h2>Knowledge library</h2>
                    <p>Private documents available for authorized retrieval.</p>
                  </div>
                  <label className="outline upload-btn">
                    <Upload size={15} /> Add document
                    <input
                      type="file"
                      accept=".pdf,.txt,.md"
                      onChange={upload}
                    />
                  </label>
                </div>
                <DocsTable
                  docs={docs.slice(0, 4)}
                  tenant={tenant}
                  canManage={
                    identity.organizations.find((o) => o.id === tenant)
                      ?.role === "admin"
                  }
                  currentUserId={identity.user.id}
                  onChange={refresh}
                />
              </section>
            </>
          )}
          {section === "Properties" && (
            <>
              <div className="welcome compact">
                <div>
                  <p className="eyebrow">PROPERTY OPERATIONS</p>
                  <h1>Properties</h1>
                  <p>Properties available in the selected organization.</p>
                </div>
                {identity.organizations.find((o) => o.id === tenant)?.role !==
                  "viewer" && (
                  <button
                    className="primary"
                    onClick={() => {
                      setPropertyFormOpen((open) => !open);
                      setEditingPropertyId("");
                    }}
                  >
                    <Plus size={15} />
                    {propertyFormOpen ? "Close form" : "Add property"}
                  </button>
                )}
              </div>
              {propertyFormOpen && (
                <section className="panel lease-form-panel">
                  <div className="panel-head">
                    <div>
                      <h2>
                        {editingPropertyId
                          ? "Edit property"
                          : "Register a property"}
                      </h2>
                      <p>
                        {editingPropertyId
                          ? "Update property details."
                          : "Add unit numbers separated by commas."}
                      </p>
                    </div>
                    <button
                      className="icon-link"
                      aria-label="Close property form"
                      onClick={() => setPropertyFormOpen(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <form className="lease-form" onSubmit={submitProperty}>
                    <label>
                      Property name
                      <input
                        value={propertyDraft.name}
                        onChange={(e) =>
                          setPropertyDraft((d) => ({
                            ...d,
                            name: e.target.value,
                          }))
                        }
                        required
                        maxLength={160}
                      />
                    </label>
                    <label>
                      Address
                      <input
                        value={propertyDraft.address}
                        onChange={(e) =>
                          setPropertyDraft((d) => ({
                            ...d,
                            address: e.target.value,
                          }))
                        }
                        required
                        maxLength={400}
                      />
                    </label>
                    <label>
                      Timezone
                      <input
                        value={propertyDraft.timezone}
                        onChange={(e) =>
                          setPropertyDraft((d) => ({
                            ...d,
                            timezone: e.target.value,
                          }))
                        }
                        required
                        maxLength={80}
                      />
                    </label>
                    {!editingPropertyId && (
                      <label>
                        Unit numbers
                        <input
                          value={propertyDraft.units}
                          onChange={(e) =>
                            setPropertyDraft((d) => ({
                              ...d,
                              units: e.target.value,
                            }))
                          }
                          placeholder="4A, 4B, 5A"
                        />
                      </label>
                    )}
                    <div className="form-actions">
                      <button
                        className="outline"
                        type="button"
                        onClick={() => setPropertyFormOpen(false)}
                      >
                        Cancel
                      </button>
                      <button className="primary" disabled={busy}>
                        {busy
                          ? "Saving…"
                          : editingPropertyId
                            ? "Save changes"
                            : "Save property"}
                      </button>
                    </div>
                  </form>
                </section>
              )}
              <section className="panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>PROPERTY</th>
                        <th>ADDRESS</th>
                        <th>TIMEZONE</th>
                        {identity.organizations.find((o) => o.id === tenant)
                          ?.role !== "viewer" && <th>ACTIONS</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {properties.map((property) => (
                        <tr key={property.id}>
                          <td>
                            <b>{property.name}</b>
                          </td>
                          <td>{property.address}</td>
                          <td>{property.timezone}</td>
                          {identity.organizations.find((o) => o.id === tenant)
                            ?.role !== "viewer" && (
                            <td>
                              <button
                                className="outline"
                                onClick={() => {
                                  setEditingPropertyId(property.id);
                                  setPropertyDraft({
                                    name: property.name,
                                    address: property.address,
                                    timezone: property.timezone,
                                    units: "",
                                  });
                                  setPropertyFormOpen(true);
                                }}
                              >
                                Edit
                              </button>
                              {identity.organizations.find(
                                (o) => o.id === tenant,
                              )?.role === "admin" && (
                                <button
                                  className="outline"
                                  onClick={async () => {
                                    if (
                                      !window.confirm(
                                        `Delete ${property.name}?`,
                                      )
                                    )
                                      return;
                                    try {
                                      await request(
                                        `/api/properties/${property.id}`,
                                        tenant,
                                        { method: "DELETE" },
                                      );
                                      await refresh();
                                    } catch (error) {
                                      setError((error as Error).message);
                                    }
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {section === "Leases" && (
            <>
              <div className="welcome compact">
                <div>
                  <p className="eyebrow">PROPERTY OPERATIONS</p>
                  <h1>Lease portfolio</h1>
                  <p>Upcoming expirations and documented notice periods.</p>
                </div>
                {identity.organizations.find((o) => o.id === tenant)?.role !==
                  "viewer" && (
                  <button
                    className="primary"
                    onClick={() => setLeaseFormOpen((open) => !open)}
                  >
                    <Plus size={15} />
                    {leaseFormOpen ? "Close form" : "Add lease"}
                  </button>
                )}
              </div>
              {leaseToEdit && (
                <section className="panel lease-form-panel">
                  <div className="panel-head">
                    <div>
                      <h2>Edit lease {leaseToEdit.reference}</h2>
                      <p>Update verified lease facts.</p>
                    </div>
                    <button
                      className="icon-link"
                      aria-label="Close lease editor"
                      onClick={() => setLeaseToEdit(null)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <form className="lease-form" onSubmit={saveLeaseEdit}>
                    <label>
                      Lease reference
                      <input
                        name="reference"
                        defaultValue={leaseToEdit.reference}
                        required
                        maxLength={100}
                      />
                    </label>
                    <label>
                      Resident name
                      <input
                        name="tenant_name"
                        defaultValue={leaseToEdit.tenant_name}
                        required
                        maxLength={200}
                      />
                    </label>
                    <label>
                      Starts on
                      <input
                        name="starts_on"
                        type="date"
                        defaultValue={leaseToEdit.starts_on}
                        required
                      />
                    </label>
                    <label>
                      Expires on
                      <input
                        name="expires_on"
                        type="date"
                        defaultValue={leaseToEdit.expires_on}
                        required
                      />
                    </label>
                    <label>
                      Renewal notice requirement
                      <select
                        name="notice"
                        value={editNotice}
                        onChange={(event) =>
                          setEditNotice(
                            event.target.value as
                              | "required"
                              | "none"
                              | "unknown",
                          )
                        }
                      >
                        <option value="required">Required</option>
                        <option value="none">Not required</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </label>
                    <label>
                      Notice period (days)
                      <input
                        name="notice_days"
                        type="number"
                        min={0}
                        max={3650}
                        defaultValue={leaseToEdit.renewal_notice_days ?? 0}
                        required={editNotice === "required"}
                        disabled={editNotice !== "required"}
                      />
                    </label>
                    <div className="form-actions">
                      <button
                        className="outline"
                        type="button"
                        onClick={() => setLeaseToEdit(null)}
                      >
                        Cancel
                      </button>
                      <button className="primary" disabled={busy}>
                        {busy ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </form>
                </section>
              )}
              {leaseFormOpen && (
                <section className="panel lease-form-panel">
                  <div className="panel-head">
                    <div>
                      <h2>Record a lease</h2>
                      <p>
                        Enter verified business facts and notice requirements.
                      </p>
                    </div>
                    <button
                      className="icon-link"
                      aria-label="Close lease form"
                      onClick={() => setLeaseFormOpen(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <form className="lease-form" onSubmit={submitLease}>
                    <label>
                      Property
                      <select
                        value={leaseDraft.propertyId}
                        onChange={(e) => void selectProperty(e.target.value)}
                        required
                      >
                        <option value="">Select a property</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Unit
                      <select
                        value={leaseDraft.unitId}
                        onChange={(e) =>
                          setLeaseDraft((d) => ({
                            ...d,
                            unitId: e.target.value,
                          }))
                        }
                        required
                        disabled={!units.length}
                      >
                        <option value="">Select a unit</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.unit_number}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Lease reference
                      <input
                        value={leaseDraft.reference}
                        onChange={(e) =>
                          setLeaseDraft((d) => ({
                            ...d,
                            reference: e.target.value,
                          }))
                        }
                        required
                        maxLength={100}
                      />
                    </label>
                    <label>
                      Resident name
                      <input
                        value={leaseDraft.tenantName}
                        onChange={(e) =>
                          setLeaseDraft((d) => ({
                            ...d,
                            tenantName: e.target.value,
                          }))
                        }
                        required
                        maxLength={200}
                      />
                    </label>
                    <label>
                      Starts on
                      <input
                        type="date"
                        value={leaseDraft.startsOn}
                        onChange={(e) =>
                          setLeaseDraft((d) => ({
                            ...d,
                            startsOn: e.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Expires on
                      <input
                        type="date"
                        value={leaseDraft.expiresOn}
                        onChange={(e) =>
                          setLeaseDraft((d) => ({
                            ...d,
                            expiresOn: e.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Renewal notice requirement
                      <select
                        value={
                          leaseDraft.noticeRequired === null
                            ? "unknown"
                            : leaseDraft.noticeRequired
                              ? "required"
                              : "none"
                        }
                        onChange={(e) =>
                          setLeaseDraft((d) => ({
                            ...d,
                            noticeRequired:
                              e.target.value === "unknown"
                                ? null
                                : e.target.value === "required",
                          }))
                        }
                      >
                        <option value="required">Required</option>
                        <option value="none">Not required</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </label>
                    <label>
                      Notice period (days)
                      <input
                        type="number"
                        min={0}
                        max={3650}
                        value={leaseDraft.noticeDays}
                        onChange={(e) =>
                          setLeaseDraft((d) => ({
                            ...d,
                            noticeDays: e.target.value,
                          }))
                        }
                        required
                        disabled={!leaseDraft.noticeRequired}
                      />
                    </label>
                    <div className="form-actions">
                      <button
                        className="outline"
                        type="button"
                        onClick={() => setLeaseFormOpen(false)}
                      >
                        Cancel
                      </button>
                      <button className="primary" disabled={busy}>
                        {busy ? "Saving…" : "Save lease"}
                      </button>
                    </div>
                  </form>
                </section>
              )}
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Expiring in the next 60 days</h2>
                    <p>
                      Dates and notice requirements from structured lease
                      records.
                    </p>
                  </div>
                </div>
                <LeaseTable
                  leases={leases}
                  onEdit={(id) => void openLeaseEditor(id)}
                  canEdit={
                    identity.organizations.find((o) => o.id === tenant)
                      ?.role !== "viewer"
                  }
                />
              </section>
            </>
          )}
          {section === "Knowledge" && (
            <>
              <div className="welcome compact">
                <div>
                  <p className="eyebrow">AUTHORIZED SOURCES</p>
                  <h1>Knowledge library</h1>
                  <p>
                    Upload policies and lease documents for grounded answers.
                  </p>
                </div>
                <label className="primary upload-btn">
                  <Upload size={15} /> Upload file
                  <input type="file" accept=".pdf,.txt,.md" onChange={upload} />
                </label>
              </div>
              <section className="panel">
                <DocsTable
                  docs={docs}
                  tenant={tenant}
                  canManage={
                    identity.organizations.find((o) => o.id === tenant)
                      ?.role === "admin"
                  }
                  currentUserId={identity.user.id}
                  onChange={refresh}
                />
              </section>
            </>
          )}
          {section === "Assistant" && (
            <>
              <div className="welcome compact">
                <div>
                  <p className="eyebrow">EVIDENCE-LED ANSWERS</p>
                  <h1>Ask your knowledge base</h1>
                  <p>
                    Structured records and authorized source documents,
                    together.
                  </p>
                </div>
                <span className="mode-tag">
                  <ShieldCheck size={14} /> Local model optional · sources
                  rechecked
                </span>
              </div>
              <div className="chat-layout">
                <aside className="panel chat-list">
                  <div className="panel-head">
                    <h2>Conversations</h2>
                    <button className="outline" onClick={newChat}>
                      <Plus size={14} /> New
                    </button>
                  </div>
                  {chats.map((chat) => (
                    <button
                      key={chat.id}
                      className={`nav-item ${activeChat === chat.id ? "active" : ""}`}
                      onClick={() => void openChat(chat.id)}
                    >
                      {chat.title}
                    </button>
                  ))}
                </aside>
                <section className="panel ask-panel">
                  <div className="chat-messages">
                    {messages.map((message, index) => (
                      <article
                        className={`chat-message ${message.role}`}
                        key={`${index}-${message.role}`}
                      >
                        <b>
                          {message.role === "assistant"
                            ? "Multi-Tenant RAG"
                            : "You"}
                        </b>
                        {message.role === "assistant" && (
                          <small>
                            {message.response_metadata?.generation_mode ===
                            "ollama"
                              ? "Local model with cited evidence"
                              : "Evidence-only response"}
                          </small>
                        )}
                        {message.role === "assistant" &&
                          message.response_metadata?.status && (
                            <span
                              className={`pill ${message.response_metadata.status === "conflicting_evidence" ? "warning" : "success"}`}
                            >
                              {message.response_metadata.status.replaceAll(
                                "_",
                                " ",
                              )}
                            </span>
                          )}
                        <p>{message.content}</p>
                        {message.role === "assistant" &&
                          message.response_metadata?.citations?.map(
                            (citation, i) => (
                              <button
                                className="citation-link"
                                key={`${citation.label}-${i}`}
                                onClick={() => void openCitation(citation)}
                              >
                                Source: {citation.label} · {citation.type}
                              </button>
                            ),
                          )}
                      </article>
                    ))}
                  </div>
                  <form onSubmit={ask}>
                    <label className="field-label">
                      Your question
                      <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        rows={3}
                      />
                    </label>
                    <div className="ask-foot">
                      <span>
                        Answers are limited to verified records and readable
                        documents.
                      </span>
                      <button className="primary" disabled={busy}>
                        {busy ? "Researching…" : "Get answer"}{" "}
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </form>
                  {answer && messages.length === 0 && (
                    <Answer answer={answer} onOpen={openCitation} />
                  )}
                </section>
              </div>
            </>
          )}
          {section === "Members" && (
            <>
              <div className="welcome compact">
                <div>
                  <p className="eyebrow">ORGANIZATION ACCESS</p>
                  <h1>Members</h1>
                  <p>
                    Change roles or revoke access for existing organization
                    members.
                  </p>
                </div>
              </div>
              <section className="panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>MEMBER</th>
                        <th>ROLE</th>
                        <th>STATUS</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.id}>
                          <td>
                            <b>{member.name}</b>
                            <small>{member.email}</small>
                          </td>
                          <td>
                            <select
                              aria-label={`Role for ${member.name}`}
                              value={member.role}
                              disabled={member.status !== "active"}
                              onChange={async (e) => {
                                try {
                                  await request(
                                    `/api/tenants/current/members/${member.id}`,
                                    tenant,
                                    {
                                      method: "PATCH",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        role: e.target.value,
                                      }),
                                    },
                                  );
                                  await refresh();
                                } catch (err) {
                                  setError((err as Error).message);
                                }
                              }}
                            >
                              <option value="admin">Administrator</option>
                              <option value="manager">Manager</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          </td>
                          <td>{member.status}</td>
                          <td>
                            {member.status === "active" && (
                              <button
                                className="outline"
                                onClick={async () => {
                                  try {
                                    await request(
                                      `/api/tenants/current/members/${member.id}`,
                                      tenant,
                                      { method: "DELETE" },
                                    );
                                    await refresh();
                                  } catch (err) {
                                    setError((err as Error).message);
                                  }
                                }}
                              >
                                Revoke access
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {section === "Audit" && (
            <>
              <div className="welcome compact">
                <div>
                  <p className="eyebrow">ACCOUNTABILITY</p>
                  <h1>Audit history</h1>
                  <p>
                    Recent organization scoped administrative and document
                    events.
                  </p>
                </div>
              </div>
              <section className="panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>EVENT</th>
                        <th>RESOURCE</th>
                        <th>RESULT</th>
                        <th>WHEN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditEvents.map((event) => (
                        <tr key={event.id}>
                          <td>
                            <b>{event.event_type}</b>
                          </td>
                          <td>
                            {event.resource_type}
                            {event.resource_id
                              ? ` · ${event.resource_id.slice(0, 8)}`
                              : ""}
                          </td>
                          <td>{event.outcome}</td>
                          <td>{new Date(event.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {section === "Security Lab" && (
            <>
              <div className="welcome compact">
                <div>
                  <p className="eyebrow">DEFENSE IN DEPTH</p>
                  <h1>Security Lab</h1>
                  <p>
                    Run live checks against the current demo database role and
                    tenant context.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      setSecurityReport(
                        await request<SecurityReport>(
                          "/api/security/scenarios",
                          tenant,
                          { method: "POST" },
                        ),
                      );
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Running…" : "Run security scenarios"}
                </button>
              </div>
              <div className="security-grid">
                {[
                  [
                    "Tenant isolation",
                    "Cross-tenant property lookup under the current tenant context.",
                  ],
                  [
                    "Runtime role",
                    "Database role, table ownership, and forced RLS flags.",
                  ],
                  [
                    "Connection pooling",
                    "Tenant context cleared when the same connection is reused.",
                  ],
                  [
                    "Role grants",
                    "A current manager role grant permits restricted document access.",
                  ],
                  [
                    "Revocation",
                    "A revoked user grant no longer permits document access.",
                  ],
                  [
                    "Deletion",
                    "Soft-deleted documents are unavailable to retrieval.",
                  ],
                ].map(([title, body]) => (
                  <article className="panel security-card" key={title}>
                    <div className="icon-tile">
                      <ShieldCheck size={17} />
                    </div>
                    <h2>{title}</h2>
                    <p>{body}</p>
                    <span className="check-label">
                      <i /> Scenario available
                    </span>
                  </article>
                ))}
              </div>
              {securityReport && (
                <section className="panel scenario-report">
                  <div className="panel-head">
                    <div>
                      <h2>Scenario report</h2>
                      <p>Results from the latest run against this database.</p>
                    </div>
                    <span
                      className={`pill ${securityReport.status === "passed" ? "success" : "warning"}`}
                    >
                      {securityReport.status}
                    </span>
                  </div>
                  {securityReport.checks.map((check) => (
                    <div className="scenario-row" key={check.id}>
                      <span>{check.id.replaceAll("_", " ")}</span>
                      <b
                        className={
                          check.passed ? "scenario-pass" : "scenario-fail"
                        }
                      >
                        {check.passed ? "PASS" : "FAIL"}
                      </b>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function LeaseTable({
  leases,
  onEdit,
  canEdit = false,
}: {
  leases: Lease[];
  onEdit?: (id: string) => void;
  canEdit?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>LEASE / RESIDENT</th>
            <th>PROPERTY</th>
            <th>EXPIRES</th>
            <th>NOTICE WINDOW</th>
            <th>STATUS</th>
            {canEdit && <th>ACTIONS</th>}
          </tr>
        </thead>
        <tbody>
          {leases.length ? (
            leases.map((lease) => (
              <tr key={lease.id}>
                <td>
                  <b>{lease.reference}</b>
                  <small>
                    {lease.tenant_name} · Unit {lease.unit_number}
                  </small>
                </td>
                <td>{lease.property_name}</td>
                <td>
                  {new Date(`${lease.expires_on}T12:00:00`).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                </td>
                <td>
                  {lease.renewal_notice_required === true
                    ? `${lease.renewal_notice_days ?? "Unknown"} days`
                    : lease.renewal_notice_required === false
                      ? "Not required"
                      : "Unknown"}
                </td>
                <td>
                  <span
                    className={`pill ${lease.days_until_expiration < 0 ? "neutral" : lease.days_until_expiration <= 60 ? "warning" : "success"}`}
                  >
                    {lease.days_until_expiration < 0
                      ? "Expired"
                      : lease.days_until_expiration <= 60
                        ? "Expiring soon"
                        : "Active"}
                  </span>
                </td>
                {canEdit && (
                  <td>
                    <button
                      className="outline"
                      onClick={() => onEdit?.(lease.id)}
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={canEdit ? 6 : 5} className="empty">
                No authorized leases in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function DocsTable({
  docs,
  tenant,
  canManage,
  currentUserId,
  onChange,
}: {
  docs: Doc[];
  tenant: string;
  canManage: boolean;
  currentUserId: string;
  onChange: () => Promise<void>;
}) {
  const [notice, setNotice] = useState("");
  const [grantPrincipalType, setGrantPrincipalType] = useState<"role" | "user">(
    "role",
  );
  const [grants, setGrants] = useState<
    Record<
      string,
      {
        id: string;
        principal_type: string;
        principal_id: string;
        permission: string;
        effect: string;
        revoked_at: string | null;
      }[]
    >
  >({});
  const [versions, setVersions] = useState<Record<string, DocVersion[]>>({});

  async function loadGrants(documentId: string) {
    try {
      const list = await request<
        {
          id: string;
          principal_type: string;
          principal_id: string;
          permission: string;
          effect: string;
          revoked_at: string | null;
        }[]
      >(`/api/documents/${documentId}/permissions`, tenant);
      setGrants((value) => ({ ...value, [documentId]: list }));
    } catch (error) {
      setNotice((error as Error).message);
    }
  }

  async function replaceVersion(documentId: string, input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      await request(`/api/documents/${documentId}/versions`, tenant, {
        method: "PUT",
        body: form,
      });
      setNotice("New document version queued for indexing.");
      setVersions((value) => {
        const next = { ...value };
        delete next[documentId];
        return next;
      });
      await onChange();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      input.value = "";
    }
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>DOCUMENT</th>
            <th>ACCESS</th>
            <th>INDEX STATUS</th>
            <th>ADDED</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {docs.length ? (
            docs.map((document) => (
              <tr key={document.id}>
                <td>
                  <span className="file-icon">
                    <FileText size={15} />
                  </span>
                  <span className="docname">
                    <b>{document.title}</b>
                    <small>{document.original_filename}</small>
                  </span>
                </td>
                <td>
                  <span className="pill neutral">
                    {document.visibility === "tenant"
                      ? "Organization"
                      : "Restricted"}
                  </span>
                </td>
                <td>
                  <span
                    className={`pill ${document.processing_status === "ready" ? "success" : "neutral"}`}
                  >
                    {document.processing_status}
                  </span>
                </td>
                <td>{new Date(document.created_at).toLocaleDateString()}</td>
                <td className="doc-actions">
                  <a
                    className="icon-link"
                    href={`${api}/api/documents/${document.id}/download`}
                    title="Download"
                  >
                    <ArrowUpRight size={15} />
                  </a>
                  {(canManage || document.uploaded_by === currentUserId) && (
                    <label
                      className="icon-link upload-version"
                      title="Upload a replacement version"
                    >
                      <Upload size={14} />
                      <input
                        aria-label={`Replace ${document.title}`}
                        type="file"
                        accept=".pdf,.txt,.md"
                        onChange={(event) =>
                          void replaceVersion(document.id, event.target)
                        }
                      />
                    </label>
                  )}
                  <details
                    className="version-details"
                    onToggle={async (event) => {
                      if (event.currentTarget.open && !versions[document.id]) {
                        try {
                          const list = await request<DocVersion[]>(
                            `/api/documents/${document.id}/versions`,
                            tenant,
                          );
                          setVersions((value) => ({
                            ...value,
                            [document.id]: list,
                          }));
                        } catch (error) {
                          setNotice((error as Error).message);
                        }
                      }
                    }}
                  >
                    <summary>Versions</summary>
                    {versions[document.id]?.map((version) => (
                      <small key={version.id}>
                        v{version.version_number} · {version.processing_status}
                        {version.is_current ? " · current" : ""}
                      </small>
                    ))}
                  </details>
                  {canManage && (
                    <details
                      className="grant-details"
                      onToggle={(event) => {
                        if (event.currentTarget.open && !grants[document.id])
                          void loadGrants(document.id);
                      }}
                    >
                      <summary>Access</summary>
                      <div className="grant-popover">
                        <div className="grant-list">
                          {grants[document.id]
                            ?.filter((grant) => !grant.revoked_at)
                            .map((grant) => (
                              <div key={grant.id}>
                                <span>
                                  {grant.principal_type}: {grant.principal_id} ·{" "}
                                  {grant.effect}
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await request(
                                        `/api/document-grants/${grant.id}`,
                                        tenant,
                                        { method: "DELETE" },
                                      );
                                      await loadGrants(document.id);
                                    } catch (error) {
                                      setNotice((error as Error).message);
                                    }
                                  }}
                                >
                                  Revoke
                                </button>
                              </div>
                            ))}
                        </div>
                        <form
                          onSubmit={async (event) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            try {
                              await request(
                                `/api/documents/${document.id}/grants`,
                                tenant,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    principal_type: grantPrincipalType,
                                    principal_id: form.get(
                                      grantPrincipalType === "role"
                                        ? "role"
                                        : "user_id",
                                    ),
                                    permission: "read",
                                    effect: form.get("effect"),
                                  }),
                                },
                              );
                              await loadGrants(document.id);
                              setNotice("Access rule saved.");
                            } catch (error) {
                              setNotice((error as Error).message);
                            }
                          }}
                        >
                          <label>
                            Grant to
                            <select
                              value={grantPrincipalType}
                              onChange={(event) =>
                                setGrantPrincipalType(
                                  event.target.value as "role" | "user",
                                )
                              }
                            >
                              <option value="role">Organization role</option>
                              <option value="user">Individual user</option>
                            </select>
                          </label>
                          {grantPrincipalType === "role" ? (
                            <label>
                              Role
                              <select name="role">
                                <option value="viewer">Viewer</option>
                                <option value="manager">Manager</option>
                              </select>
                            </label>
                          ) : (
                            <label>
                              User ID
                              <input
                                name="user_id"
                                required
                                placeholder="UUID of an organization member"
                                pattern="[0-9a-fA-F-]{36}"
                              />
                            </label>
                          )}
                          <label>
                            Rule
                            <select name="effect">
                              <option value="allow">Allow reading</option>
                              <option value="deny">Deny reading</option>
                            </select>
                          </label>
                          <button className="primary">Save rule</button>
                          <p>Deny rules override ordinary grants.</p>
                        </form>
                      </div>
                    </details>
                  )}
                  {(canManage || document.uploaded_by === currentUserId) && (
                    <button
                      className="icon-link"
                      title="Delete document"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Delete ${document.title}? It will immediately disappear from retrieval.`,
                          )
                        )
                          return;
                        try {
                          await request(
                            `/api/documents/${document.id}`,
                            tenant,
                            { method: "DELETE" },
                          );
                          await onChange();
                        } catch (error) {
                          setNotice((error as Error).message);
                        }
                      }}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="empty">
                No documents yet. Add a PDF, text, or Markdown file.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {notice && (
        <p className="table-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>Dismiss</button>
        </p>
      )}
    </div>
  );
}
function Answer({
  answer,
  onOpen,
}: {
  answer: {
    answer: string;
    status: string;
    citations: Citation[];
    generation_mode?: string;
  };
  onOpen: (citation: Citation) => void;
}) {
  return (
    <div className="answer">
      <div className="answer-head">
        <span>
          <Sparkles size={15} />{" "}
          {answer.generation_mode === "ollama"
            ? "Local model · cited evidence"
            : "Evidence-backed response"}
        </span>
        <span
          className={`pill ${answer.status === "conflicting_evidence" ? "warning" : answer.status === "answered" ? "success" : "neutral"}`}
        >
          {answer.status === "answered"
            ? "Grounded"
            : answer.status === "conflicting_evidence"
              ? "Conflicting evidence"
              : "Insufficient evidence"}
        </span>
      </div>
      <p>{answer.answer}</p>
      {answer.citations.length > 0 && (
        <div className="citations">
          <b>Sources</b>
          {answer.citations.map((c, i) => (
            <button
              className="citation-link"
              key={`${c.label}-${i}`}
              onClick={() => void onOpen(c)}
            >
              <FileText size={13} />
              {c.label}
              <small>{c.type}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
