# Data model

Identity tables hold global users and organizations, with a unique membership per organization/user pair. Membership roles are `admin`, `manager`, and `viewer`; membership status is checked from PostgreSQL on every protected request.

Property, unit, and lease rows carry a mandatory tenant ID. Composite foreign keys make each unit/property and lease/property/unit relationship tenant-consistent. A lease source document, when present, must be in the same tenant.

Document rows identify a private storage key and current processing state. Versions and chunks are tenant-aware; a chunk's version must belong to the same document. Chunks carry source page and offsets, a 384-dimensional vector with model identifier, and a generated PostgreSQL full-text vector. Ingestion jobs refer to both the document and its version through composite constraints.

Document grants identify a user or organization role, a permission, and an allow/deny effect. Current, unrevoked deny rules take precedence for nonadministrators. Chat sessions are owned by a user and tenant; assistant messages retain citation metadata, and reads reauthorize every cited lease or document chunk. Audit rows are organization-scoped and currently cover lease, property, membership, and document administration events.

`renewal_notice_required` and `renewal_notice_days` are nullable together so the database can represent an unknown notice obligation separately from a verified absence of notice requirements.
