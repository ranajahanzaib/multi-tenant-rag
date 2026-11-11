# Security policy

Multi-Tenant RAG is a reference implementation, not a security certification. See [the threat model](docs/threat-model.md) for its controls and limitations.

## Reporting a vulnerability

Please do not open a public issue containing exploit details or tenant data. Use [GitHub's private vulnerability reporting](https://github.com/ranajahanzaib/multi-tenant-rag/security/advisories/new). Include the affected commit or version, impact, reproduction steps, and any safe mitigation. Do not include real customer data or credentials.

The project does not currently publish a response-time commitment.

## Deployment warning

Local credentials are generated into an ignored `.env` file for development. Do not deploy that file or enable demo seeding in production. Supply production credentials through a secret manager and complete an independent security review before exposing the application to untrusted users. See [deployment notes](docs/deployment.md).
