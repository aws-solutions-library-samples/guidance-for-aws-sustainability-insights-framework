# Events

Async communication between modules is handled via EventBridge acting as the event bus.

Each stack deployment will include its own custom event bus to ensure tenants are not affected by noisy neighbors, as well as to allow for cost allocation tagging, when deployed in a multi-tenant approach.

There is a maximum of 100 event buses per AWS Account, which will require the sharding of siloed tenant stacks across multiple AWS Accounts. This sharding will be managed by the Tenant Manager module.
