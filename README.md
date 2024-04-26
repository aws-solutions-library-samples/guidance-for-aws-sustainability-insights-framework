# AWS Sustainability Insights Framework (SIF)

## Introduction

The AWS Sustainability Insights Framework (SIF) offers foundational software components that accelerate the design and implementation of applications to automate carbon footprint tracking.

Key features include:

- **Account management** - Manage organizational reporting boundaries. Control user access, roles, and their permissions within the framework.
- **Impacts** - Catalog activity impacts, such as GHG emission factors. Populate with emission factors published by organizations, or define your proprietary factors.
- **Reference datasets** - Incorporate custom datasets in data pipelines to enhance data.
- **Calculations** - A low-code way of defining custom calculations.
- **Metrics (KPI's)** - Define metrics for automatic aggregation based on processed activities, aligned with organizational reporting boundaries and various time units.
- **Data ingestion pipelines** - Import data from any CSV format, directly from AWS Clean Rooms, or use the input data connector framework to fetch business activities from other sources. Apply calculations to transform data into desired outputs.
- **Auditability** -Achieve full traceability and repeatability of calculations and results.
- **Multi-tenancy** - Support both single tenant and multi-tenant modes. Cater to organizations wanting to calculate their emissions, as well as those aiming to build a SaaS offering. It also offers the capability to securely share data between isolated tenants when necessary. For instance, when building a SaaS offering where top-tier customers access pre-defined calculations (e.g., industry-specific calculations), a central tenant can store the calculations, ensuring centralized management. Top-tier tenants can then be granted permission to remotely access and use these calculations.

Key benefits include:

- **Automation** - Reduce manual tasks and errors with near real-time insights on a centralized platform.
- **Flexibility** - Modular, fully customizable with 100% customer ownership. Access individual modules via a REST API, allowing interaction in any language.
- **Scalability** - Built on AWS serverless technologies and services, ensuring high availability, durability, and scalability.
- **Transparency** - No black-box approach.
- **Cost-Effective** - No recurring license fees. Pay only for the AWS services used.
- **Security** - Adheres to security best practices, such as least privilege permissions and data encryption at rest.
- **Best practices** - FAligns with software architecture, design, and AWS best practices.
- **Open sourced** - Licensed under Apache License Version 2.0.

## First steps

- For deployment instructions, refer to the [deployment walkthrough](docs/deployment/cli_walkthrough.md).
- After deployment, consult the [end to end walkthrough](docs/cli_walkthrough.md).

## Deeper dive

- For architectural details and information on the underlying AWS services used, refer to the [design documentation](docs/design.md).
- Interested in understanding more about each module? Explore their specific overviews:
	- [Access Management](./typescript/packages/apps/access-management/README.md)
    - [Calculations](./typescript/packages/apps/calculations/README.md)
	- [Pipelines](./typescript/packages/apps/pipelines/README.md)
    - [Impacts](./typescript/packages/apps/impacts/README.md)
	- [Reference Datasets](./typescript/packages/apps/reference-datasets/README.md)
	- [Pipeline Processors](./typescript/packages/apps/pipeline-processors/README.md)
- Interested in understanding more about different connectors supported by SIF? Explore their specific overviews:
  - [AWS Clean Rooms Connector](typescript/packages/connectors/clean-rooms/README.md)
  - [AWS DataZone Connector](typescript/packages/connectors/datazone/README.md)
  - [Amazon Kinesis Connector](typescript/packages/connectors/kinesis/README.md)
- Planning to deploy SIF in production? Review the [path to production](docs/deployment/path_to_production.md).

## Changelog

Find the changelog and release artifacts [here](https://github.com/aws-solutions-library-samples/guidance-for-aws-sustainability-insights-framework/releases).

For details on significant changes and associated migration instructions, refer to the [Migration Guide](./docs/migration.md).
