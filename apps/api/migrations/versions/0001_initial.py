"""Multi-Tenant RAG schema, runtime role grants, and forced RLS policies."""

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

TABLES = [
    "memberships",
    "properties",
    "units",
    "leases",
    "documents",
    "document_versions",
    "document_grants",
    "document_chunks",
    "ingestion_jobs",
    "chat_sessions",
    "chat_messages",
    "audit_events",
]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    schema = """
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text NOT NULL,
      password_hash text NOT NULL, is_active boolean NOT NULL DEFAULT true, auth_version integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE tenants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE memberships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
      user_id uuid NOT NULL REFERENCES users(id), role text NOT NULL CHECK (role IN ('admin','manager','viewer')),
      status text NOT NULL CHECK (status IN ('active','revoked','invited')),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id,user_id)
    );
    CREATE TABLE properties (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
      name text NOT NULL, address text NOT NULL, timezone text NOT NULL DEFAULT 'UTC',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id,id)
    );
    CREATE TABLE units (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
      property_id uuid NOT NULL, unit_number text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (tenant_id,property_id) REFERENCES properties(tenant_id,id), UNIQUE (property_id,unit_number), UNIQUE (tenant_id,id)
    );
    CREATE TABLE documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
      uploaded_by uuid NOT NULL REFERENCES users(id), title text NOT NULL, original_filename text NOT NULL,
      content_type text NOT NULL, storage_key text NOT NULL UNIQUE, visibility text NOT NULL CHECK (visibility IN ('tenant','restricted')),
      processing_status text NOT NULL CHECK (processing_status IN ('queued','processing','ready','failed','unsupported')),
      current_version integer NOT NULL DEFAULT 1, checksum text NOT NULL, deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
      FOREIGN KEY(tenant_id,uploaded_by) REFERENCES memberships(tenant_id,user_id)
    );
    CREATE TABLE document_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, document_id uuid NOT NULL,
      version_number integer NOT NULL, checksum text NOT NULL, storage_key text NOT NULL, processing_status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY (tenant_id,document_id) REFERENCES documents(tenant_id,id),
      UNIQUE(document_id,version_number), UNIQUE(tenant_id,id), UNIQUE(document_id,id)
    );
    CREATE TABLE leases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
      property_id uuid NOT NULL, unit_id uuid NOT NULL, reference text NOT NULL, tenant_name text NOT NULL,
      starts_on date NOT NULL, expires_on date NOT NULL, renewal_notice_required boolean DEFAULT false,
      renewal_notice_days integer CHECK(renewal_notice_days >= 0),
      CHECK ((renewal_notice_required IS TRUE AND renewal_notice_days IS NOT NULL) OR
        (renewal_notice_required IS FALSE AND (renewal_notice_days IS NULL OR renewal_notice_days=0)) OR
        (renewal_notice_required IS NULL AND renewal_notice_days IS NULL)),
      status text NOT NULL DEFAULT 'active',
      source_document_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (tenant_id,property_id) REFERENCES properties(tenant_id,id),
      FOREIGN KEY (tenant_id,unit_id) REFERENCES units(tenant_id,id),
      FOREIGN KEY (tenant_id,source_document_id) REFERENCES documents(tenant_id,id), UNIQUE(tenant_id,reference)
    );
    CREATE TABLE document_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, document_id uuid NOT NULL,
      principal_type text NOT NULL CHECK(principal_type IN ('user','role')), principal_id text NOT NULL,
      permission text NOT NULL CHECK(permission IN ('read','write','manage')),
      effect text NOT NULL CHECK(effect IN ('allow','deny')), created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
      FOREIGN KEY (tenant_id,document_id) REFERENCES documents(tenant_id,id)
    );
    CREATE TABLE document_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, document_id uuid NOT NULL,
      document_version_id uuid NOT NULL, chunk_index integer NOT NULL, content text NOT NULL, page_number integer,
      section_title text, source_start_offset integer, source_end_offset integer, token_count integer NOT NULL DEFAULT 0,
      embedding vector(384), embedding_model text NOT NULL, search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english',content)) STORED,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(tenant_id,document_id) REFERENCES documents(tenant_id,id),
      FOREIGN KEY(tenant_id,document_version_id) REFERENCES document_versions(tenant_id,id),
      FOREIGN KEY(document_id,document_version_id) REFERENCES document_versions(document_id,id), UNIQUE(document_version_id,chunk_index)
    );
    CREATE TABLE ingestion_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, document_id uuid NOT NULL,
      document_version_id uuid NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','retry','complete','failed')),
      attempt_count integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
      locked_by text, error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(tenant_id,document_id) REFERENCES documents(tenant_id,id),
      FOREIGN KEY(tenant_id,document_version_id) REFERENCES document_versions(tenant_id,id),
      FOREIGN KEY(document_id,document_version_id) REFERENCES document_versions(document_id,id), UNIQUE(document_version_id)
    );
    CREATE TABLE chat_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
      title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
      FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id)
    );
    CREATE TABLE chat_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, session_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
      role text NOT NULL CHECK(role IN ('user','assistant','system')), content text NOT NULL, response_metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(tenant_id,session_id) REFERENCES chat_sessions(tenant_id,id),
      FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id)
    );
    CREATE TABLE audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid REFERENCES users(id),
      event_type text NOT NULL, resource_type text NOT NULL, resource_id uuid, outcome text NOT NULL,
      request_id text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX leases_tenant_expiration_idx ON leases(tenant_id,expires_on);
    CREATE INDEX chunks_search_idx ON document_chunks USING gin(search_vector);
    CREATE INDEX chunks_embedding_idx ON document_chunks USING hnsw(embedding vector_cosine_ops);
    CREATE INDEX jobs_claim_idx ON ingestion_jobs(status,next_attempt_at,created_at);
    CREATE INDEX grants_document_idx ON document_grants(tenant_id,document_id,revoked_at);
    """
    for statement in schema.split(";"):
        if statement.strip():
            op.execute(statement)
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} USING (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)"
        )
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY user_self ON users USING (id = nullif(current_setting('app.user_id',true),'')::uuid OR current_setting('app.auth_lookup',true)='true') WITH CHECK (id = nullif(current_setting('app.user_id',true),'')::uuid)"
    )
    op.execute(
        "CREATE POLICY tenant_admin_user_read ON users FOR SELECT USING (current_setting('app.role',true)='admin' AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=users.id AND m.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid))"
    )
    # The broad grant policy is document scoped and non-recursive: it only reads grants.
    op.execute("""
      CREATE POLICY document_read_policy ON documents AS RESTRICTIVE FOR SELECT USING (
        tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid AND (deleted_at IS NULL OR current_setting('app.role',true)='admin') AND (
          current_setting('app.role',true)='admin' OR (
            (visibility='tenant' OR uploaded_by=nullif(current_setting('app.user_id',true),'')::uuid OR
             EXISTS (SELECT 1 FROM document_grants g WHERE g.document_id=documents.id AND g.tenant_id=documents.tenant_id
               AND g.permission='read' AND g.effect='allow' AND g.revoked_at IS NULL
               AND ((g.principal_type='user' AND g.principal_id=current_setting('app.user_id',true)) OR
                    (g.principal_type='role' AND g.principal_id=current_setting('app.role',true)))))
            AND NOT EXISTS (SELECT 1 FROM document_grants deny WHERE deny.document_id=documents.id AND deny.tenant_id=documents.tenant_id
              AND deny.permission='read' AND deny.effect='deny' AND deny.revoked_at IS NULL
              AND ((deny.principal_type='user' AND deny.principal_id=current_setting('app.user_id',true)) OR
                   (deny.principal_type='role' AND deny.principal_id=current_setting('app.role',true))))
          )
        )
      )
    """)
    # Search material is independently checked against the same currently readable document policy.
    for table, doc_id in (
        ("document_chunks", "document_id"),
        ("document_versions", "document_id"),
        ("ingestion_jobs", "document_id"),
    ):
        op.execute(
            f"CREATE POLICY {table}_document_scope ON {table} AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM documents d WHERE d.id={table}.{doc_id} AND d.tenant_id={table}.tenant_id))"
        )
    op.execute("GRANT USAGE ON SCHEMA public TO tenantground,tenantground_worker")
    op.execute(
        "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO tenantground,tenantground_worker"
    )
    op.execute(
        "GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO tenantground,tenantground_worker"
    )
    op.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON users,tenants TO tenantground_migrator")
    # Read membership + user data for authentication, scoped tenant tables remain RLS-protected.
    op.execute("GRANT SELECT ON users,tenants,memberships TO tenantground")
    # User and tenant mutation remain unavailable; membership changes use the admin policies below.
    op.execute("REVOKE INSERT,UPDATE,DELETE ON users,tenants,memberships FROM tenantground")
    op.execute("GRANT UPDATE(auth_version) ON users TO tenantground")
    # Membership administration uses an explicit policy: the generic tenant policy
    # would otherwise make every member row writable due to permissive-policy OR.
    op.execute("DROP POLICY tenant_isolation ON memberships")
    op.execute(
        "CREATE POLICY membership_read ON memberships FOR SELECT USING (user_id=nullif(current_setting('app.user_id',true),'')::uuid OR (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND current_setting('app.role',true)='admin'))"
    )
    op.execute(
        "CREATE POLICY membership_admin_insert ON memberships FOR INSERT WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND current_setting('app.role',true)='admin')"
    )
    op.execute(
        "CREATE POLICY membership_admin_update ON memberships FOR UPDATE USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND current_setting('app.role',true)='admin') WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND current_setting('app.role',true)='admin')"
    )
    op.execute(
        "CREATE POLICY membership_admin_delete ON memberships FOR DELETE USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND current_setting('app.role',true)='admin')"
    )
    op.execute("GRANT INSERT,UPDATE,DELETE ON memberships TO tenantground")
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO tenantground,tenantground_worker"
    )


def downgrade() -> None:
    op.execute(
        "DROP TABLE IF EXISTS audit_events,chat_messages,chat_sessions,ingestion_jobs,document_chunks,document_grants,leases,document_versions,documents,units,properties,memberships,tenants,users CASCADE"
    )
