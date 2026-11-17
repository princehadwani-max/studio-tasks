import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';

const FEATURE_LABELS = [
  { key: 'whatsapp', label: 'WhatsApp Alerts' },
  { key: 'routines', label: 'Daily/Monthly Routines' },
  { key: 'remarks', label: 'Task Remarks' },
  { key: 'team_management', label: 'Team Management' },
];

export default function SuperAdminPanel({ token, activeTenant, onSelectTenant }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCommissionForm, setShowCommissionForm] = useState(false);

  // Commission New Company form state
  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [features, setFeatures] = useState({
    whatsapp: true,
    routines: true,
    remarks: true,
    team_management: true,
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Per-tenant Add Admin inline form state
  const [addingAdminTenantId, setAddingAdminTenantId] = useState(null);
  const [newAdmin, setNewAdmin] = useState({ name: '', username: '', phone: '', password: '' });
  const [adminFormError, setAdminFormError] = useState('');
  const [busyTenantId, setBusyTenantId] = useState(null);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listTenants(token);
      setTenants(res.tenants || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const handleCompanyNameChange = (val) => {
    setCompanyName(val);
    if (!slugTouched) {
      const autoSlug = val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30);
      setCompanySlug(autoSlug);
    }
  };

  const handleCommissionSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      const { tenant, admin } = await api.createTenant(token, {
        companyName,
        companySlug,
        adminName,
        adminUsername,
        adminPhone,
        adminPassword,
        features,
      });
      setFormSuccess(
        `Commissioned "${tenant.name}" (Code: ${tenant.slug}) with Company Admin @${admin.username}!`
      );
      setCompanyName('');
      setCompanySlug('');
      setSlugTouched(false);
      setAdminName('');
      setAdminUsername('');
      setAdminPhone('');
      setAdminPassword('');
      await loadTenants();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleFeature = async (tenant, featureKey) => {
    setBusyTenantId(tenant.id);
    try {
      const currentVal = tenant.features?.[featureKey] !== false;
      const nextFeatures = { ...(tenant.features || {}), [featureKey]: !currentVal };
      const { tenant: updated } = await api.updateTenant(token, tenant.id, {
        features: nextFeatures,
      });
      if (activeTenant?.id === tenant.id && onSelectTenant) {
        onSelectTenant(updated, false);
      }
      await loadTenants();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusyTenantId(null);
    }
  };

  const handleToggleActive = async (tenant) => {
    const nextActive = !tenant.active;
    if (!nextActive) {
      const ok = window.confirm(
        `Suspend "${tenant.name}"? All users in this company will be blocked from signing in until reactivated.`
      );
      if (!ok) return;
    }
    setBusyTenantId(tenant.id);
    try {
      await api.updateTenant(token, tenant.id, { active: nextActive });
      await loadTenants();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusyTenantId(null);
    }
  };

  const handleAddAdminSubmit = async (e, tenantId) => {
    e.preventDefault();
    setAdminFormError('');
    setBusyTenantId(tenantId);
    try {
      await api.createTenantAdmin(token, tenantId, newAdmin);
      setNewAdmin({ name: '', username: '', phone: '', password: '' });
      setAddingAdminTenantId(null);
      await loadTenants();
    } catch (err) {
      setAdminFormError(err.message);
    } finally {
      setBusyTenantId(null);
    }
  };

  const totalCompanies = tenants.length;
  const activeCompanies = tenants.filter((t) => t.active).length;
  const totalUsers = tenants.reduce((acc, t) => acc + (t.total_users || 0), 0);
  const totalTasks = tenants.reduce((acc, t) => acc + (t.total_tasks || 0), 0);
  const totalRoutines = tenants.reduce((acc, t) => acc + (t.total_routines || 0), 0);

  return (
    <div className="saas-command-center">
      <div className="saas-kpi-grid">
        <div className="saas-kpi-card">
          <div className="saas-kpi-label">Tenants Active</div>
          <div className="saas-kpi-val">
            {activeCompanies} <span style={{ fontSize: 16, color: 'var(--text-faint)' }}>/ {totalCompanies}</span>
          </div>
        </div>
        <div className="saas-kpi-card">
          <div className="saas-kpi-label">Total Platform Users</div>
          <div className="saas-kpi-val">{totalUsers}</div>
        </div>
        <div className="saas-kpi-card">
          <div className="saas-kpi-label">Total Tasks Created</div>
          <div className="saas-kpi-val">{totalTasks}</div>
        </div>
        <div className="saas-kpi-card">
          <div className="saas-kpi-label">Active Routines</div>
          <div className="saas-kpi-val">{totalRoutines}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Tenant Companies &amp; Permissions</h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>
            Manage isolated company workspaces, toggle module permissions, or commission a new company on the go.
          </p>
        </div>
        <button
          type="button"
          className={`btn ${showCommissionForm ? 'btn-ghost' : 'btn-primary'}`}
          onClick={() => setShowCommissionForm((v) => !v)}
        >
          {showCommissionForm ? 'Close Form' : '+ Commission New Company'}
        </button>
      </div>

      {formSuccess && <div className="form-success">{formSuccess}</div>}

      {showCommissionForm && (
        <div className="form-card" style={{ maxWidth: 680, marginBottom: 24 }}>
          <h3 style={{ marginBottom: 6 }}>Commission a New Company Workspace</h3>
          <p style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 16 }}>
            Provisions an isolated tenant workspace along with its initial Company Admin account in one step.
          </p>
          {formError && <div className="form-error">{formError}</div>}

          <form onSubmit={handleCommissionSubmit}>
            <div className="field-row">
              <div className="field">
                <label>Company Name *</label>
                <input
                  value={companyName}
                  onChange={(e) => handleCompanyNameChange(e.target.value)}
                  placeholder="e.g. Acme Productions"
                  required
                />
              </div>
              <div className="field">
                <label>Company Code (Slug) *</label>
                <input
                  value={companySlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
                  }}
                  placeholder="e.g. acme"
                  required
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Company Admin Name *</label>
                <input
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g. Rohan Mehta"
                  required
                />
              </div>
              <div className="field">
                <label>Admin Username *</label>
                <input
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="e.g. rohan"
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Admin Phone Number *</label>
                <input
                  type="tel"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  required
                />
              </div>
              <div className="field">
                <label>Temporary Password *</label>
                <input
                  type="text"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>Enabled Modules &amp; Tenant Permissions</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6 }}>
                {FEATURE_LABELS.map((f) => (
                  <label
                    key={f.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      color: 'var(--text)',
                      textTransform: 'none',
                      letterSpacing: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={features[f.key] !== false}
                      onChange={(e) =>
                        setFeatures((prev) => ({ ...prev, [f.key]: e.target.checked }))
                      }
                      style={{ width: 15, height: 15, accentColor: 'var(--amber)' }}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
              {submitting ? 'Commissioning Company…' : 'Commission Company & Create Admin'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-faint)' }}>Loading tenant companies…</p>
      ) : (
        <div className="tenant-grid">
          {tenants.map((t) => {
            const isCurrentWorkspace = activeTenant?.id === t.id;
            return (
              <div
                key={t.id}
                className={`tenant-card ${!t.active ? 'suspended' : ''} ${
                  isCurrentWorkspace ? 'current-workspace' : ''
                }`}
              >
                <div className="tenant-card-head">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 19 }}>{t.name}</h3>
                      <span className="task-code">@{t.slug}</span>
                      <span className={`status-pill ${t.active ? 'completed' : 'pending'}`}>
                        <span className="pip" />
                        {t.active ? 'Active' : 'Suspended'}
                      </span>
                      {isCurrentWorkspace && (
                        <span className="you-tag" style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}>
                          Active View
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>
                      <b>{t.active_users}</b> active users ({t.total_users} total) · <b>{t.total_tasks}</b> tasks ·{' '}
                      <b>{t.total_routines}</b> routines
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-teal btn-sm"
                      onClick={() => onSelectTenant && onSelectTenant(t, true)}
                    >
                      {isCurrentWorkspace ? 'Viewing Workspace' : 'Enter Workspace →'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setAddingAdminTenantId(addingAdminTenantId === t.id ? null : t.id);
                        setAdminFormError('');
                      }}
                    >
                      + Add Admin
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${t.active ? 'btn-ghost btn-danger-text' : 'btn-green'}`}
                      disabled={busyTenantId === t.id}
                      onClick={() => handleToggleActive(t)}
                    >
                      {t.active ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                </div>

                <div className="tenant-permissions-row">
                  <span className="tenant-sec-label">Permissions:</span>
                  {FEATURE_LABELS.map((f) => {
                    const enabled = t.features?.[f.key] !== false;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        disabled={busyTenantId === t.id}
                        className={`perm-chip ${enabled ? 'enabled' : 'disabled'}`}
                        onClick={() => handleToggleFeature(t, f.key)}
                        title="Click to toggle permission for this company"
                      >
                        {enabled ? '✓' : '✕'} {f.label}
                      </button>
                    );
                  })}
                </div>

                <div className="tenant-admins-row">
                  <span className="tenant-sec-label">Company Admins / Leadership:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(t.admins || []).map((a) => (
                      <span key={a.id} className="admin-chip">
                        <b>{a.name}</b> (@{a.username} · {a.roleLabel}
                        {a.phone ? ` · ${a.phone}` : ''})
                      </span>
                    ))}
                  </div>
                </div>

                {addingAdminTenantId === t.id && (
                  <form
                    onSubmit={(e) => handleAddAdminSubmit(e, t.id)}
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: '1px solid var(--border-soft)',
                    }}
                  >
                    {adminFormError && (
                      <div className="form-error" style={{ padding: '6px 10px', fontSize: 12 }}>
                        {adminFormError}
                      </div>
                    )}
                    <div className="field-row" style={{ gap: 8 }}>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <input
                          placeholder="Admin Name *"
                          value={newAdmin.name}
                          onChange={(e) => setNewAdmin((p) => ({ ...p, name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <input
                          placeholder="Username *"
                          value={newAdmin.username}
                          onChange={(e) => setNewAdmin((p) => ({ ...p, username: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <input
                          placeholder="Phone *"
                          value={newAdmin.phone}
                          onChange={(e) => setNewAdmin((p) => ({ ...p, phone: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <input
                          placeholder="Password (6+ chars) *"
                          value={newAdmin.password}
                          onChange={(e) => setNewAdmin((p) => ({ ...p, password: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        type="submit"
                        disabled={busyTenantId === t.id}
                      >
                        Save Company Admin
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => setAddingAdminTenantId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
