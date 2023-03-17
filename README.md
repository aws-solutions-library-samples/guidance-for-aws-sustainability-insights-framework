# AWS Sustainability Insights Framework (SIF)

## Introduction

The AWS Sustainability Insights Framework (SIF) provides foundational software building blocks to help accelerate the design and implementation of a customers own application to automate their carbon footprint tracking.

Key features include:

- **Account management** - Manage hierarchical groups representing organizational reporting boundaries. Manage user access, roles, and their access to different resource within the framework.
- **Calculations** - Extensible calculator allowing the definition of custom calculations.
- **Emission factors** - Extensible emission factory catalog, allowing the addition of custom impact factors.
- **Reference datasets** - Custom datasets can be used as part of the data pipelines to augment data.
- **Data ingestion pipelines** -Import csv files of business activities in any format, applying calculations and transforming to customizable outputs.
- **Metrics (KPI's)** - Define metrics to be automatically aggregated based on data ingest pipeline outputs, rolled up to the organizational reporting boundaries and different time units.
- **Versioning** - All pipeline outputs, metrics, calculations, emission factors, and reference datasets, are versioned, for full traceability.
- **Auditability** - Full traceability of how a data pipeline output was achieved allowing repeatability of calculations and results.

Key benefits include:

- **Automation of carbon tracking** - Reducing manual hours and human error. Near real time actionable insights on a centralized platform.
- **Flexibility** - Modular, fully customizable, 100% customer ownership. The software building blocks are presented as individual modules accessed via a REST API, therefore any language can be used to interact with it.
- **Scalability** - Highly available, durable, and scalable, built upon AWS serverless technologies and services.
- **Transparency** - No black-box approach.
- **No recurring license fees** - Only pay for the underlying AWS services consumed.
- **Security** - Follows security best practices (least privilege permissions, data encryption, etc).
- **Implementation best practices** - Adheres to software architecture, design, and AWS best practices.

## Next Steps

If you are interested in how to deploy it, follow this [deployment walkthrough](docs/deployment/walkthrough.md).

Once deployed, if you are interested in how to use it, follow this [user guide walkthrough](docs/walkthrough.md).

Deploying SIF in production? Check out [path to production](docs/deployment/path_to_production.md).

If you are interested in how SIF was architected, and what underlying AWS services and being used, see the [design documentation](docs/design.md).

If you are a developer wishing to dive into SIF itself, possibly wanting to modify the source code, follow this [developer walkthrough](docs/developer_walkthrough.md).

## Changelog

Changelog and release artifacts can be found [here](https://gitlab.aws.dev/sif/sif-core/-/releases).

Details on any major changes along with migration instructions can be found in the [Migration Guide](./docs/migration.md).
