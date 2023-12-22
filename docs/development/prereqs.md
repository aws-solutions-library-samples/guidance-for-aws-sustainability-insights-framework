## Prerequisites for Development

| Tool / Technology                                                                  | Reason                                                                                                                               |
|------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)                       | Simple way to manage multiple versions of Node.js                                                                                    |
| [rush](https://rushjs.io/pages/developer/new_developer/)                           | Build/Bundle tool                                                                                                                    |
| Node.js v18.x                                                                      | Install using `nvm install 18`, and/or switch to it using `nvm use 18`                                                               |
| [cdk](https://aws.amazon.com/getting-started/guides/setup-cdk/module-two/) v2.87.0 | Framework for defining cloud infrastructure in code and provisioning it through AWS CloudFormation                                   |
| [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)               | Version control                                                                                                                      |
| [Git Large File Storage](https://git-lfs.com/)                                     | Required **only** if `CaML` is enabled. The git repository for `CaML` pre-trained model contains pytorch.bin which is 438 MB in size |
| [Docker](https://docs.docker.com/get-docker/)                                      | Used by `sif-cli` to build Java modules.                                                                                             |
Please reference each tool's documentation for full installation instructions, linked above.

## Prerequisites for Deployment

| Tool / Technology                                                                                                  | Reason                                                                                                                               |
|--------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| [sif-cli](https://github.com/aws-solutions-library-samples/guidance-for-aws-sustainability-insights-framework-cli) | Tool to manage the deployment of SIF environment and tenant(s)                                                                       |
| [Docker](https://docs.docker.com/get-docker/)                                                                      | Used by `sif-cli` to build Java modules.                                                                                             |
| [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)                                               | Used by `sif-cli` to checkout SIF version to deploy.                                                                                 |
| [Git Large File Storage](https://git-lfs.com/)                                                                     | Required **only** if `CaML` is enabled. The git repository for `CaML` pre-trained model contains pytorch.bin which is 438 MB in size |


