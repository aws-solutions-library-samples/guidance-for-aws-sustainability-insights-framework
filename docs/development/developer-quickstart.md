# Developer Quickstart

## Introduction

The following describes the steps involved to initialize a SIF Core from scratch, to build, run and test a project, then finally on how to commit modifications to the source code.

Due to the scripts used as part of both the build and deployment steps, only linux type environments (including macOS) are officially supported.

## Configuring the development environment

The following is a one-time setup to configure the development environment:

+ Ensure that you have all [development prerequisites](prereqs.md) installed.

+ clone the project:****

```shell
> git clone https://github.com/aws-solutions-library-samples/guidance-for-aws-sustainability-insights-framework.git
```

+ initialize the project dependencies:

```shell
> cd guidance-for-aws-sustainability-insights-framework/typescript
guidance-for-aws-sustainability-insights-framework/typescript> rush install
guidance-for-aws-sustainability-insights-framework/typescript> rush update
```

## Build

The guidance-for-aws-sustainability-insights-framework Typescript monorepo is managed by [rush](https://rushjs.io) which under the covers is configured to use [pnpm](http://pnpm.js.org) as its package manager. The following is a brief introduction of how to use _rush_:

```sh
# If this is your first time at using Rush for this project, remove any node_modules
# that may have been installed as part of a non-Rush (npm/pnpm) release:
guidance-for-aws-sustainability-insights-framework/typescript> rm -rf node_modules

# One time setup only, initialize the project after cloning from git
guidance-for-aws-sustainability-insights-framework/typescript> rush install

# Install/refresh the dependencies
guidance-for-aws-sustainability-insights-framework/typescript> rush update

# When running the `clean`, `build`, `lint` or `test` commands you have the option to
# run globally (for all packages), or for a specific package. To run for all packages
# run as follows:
#
#           rush <command>
#
# To run for a specific package you can either provide a target filter as follows:
#
#           rush <command> -t <package_name>
#
# or alternatively run the following within the package's directory (which is a shortcut
# for `rush <command> -t .`):
#
#           rushx <command>
#

# Taking the above comments into consideration, to build run the following. Note that the first build
# may take time, but subsequent builds will be quicker delta builds:
guidance-for-aws-sustainability-insights-framework/typescript> rush build

# To lint:
guidance-for-aws-sustainability-insights-framework/typescript> rush lint

# And to run unit tests:
guidance-for-aws-sustainability-insights-framework/typescript> rush test

# If you experience issues and need to reset everything you have the following 2 commands available:
#   To remove all build artifacts:
guidance-for-aws-sustainability-insights-framework/typescript> rush purge        # to purge all node_modules:
guidance-for-aws-sustainability-insights-framework/typescript> rush update       # refresh dependencies
guidance-for-aws-sustainability-insights-framework/typescript> rush clean        # perform a deep clean
guidance-for-aws-sustainability-insights-framework/typescript> rush update       # refresh dependencies again

```

## Understanding the directory structure

| Directory                            | Description                                               |
|--------------------------------------|-----------------------------------------------------------|
| docs/                                | Project documentation                                     |
| infrastructure                       | Infrastructure and deployment related source              |
| typescript/common/                   | all build and bundling, monorepo management related files |
| typescript/packages/                 | All modules are located within packages                   |
| typescript/packages/apps             | Houses the individual microservice module                 |
| typescript/packages/libraries        | Houses all common libraries used among the app modules    |
| typescript/packages/integrationTests | Integration tests related source                          |

## Running a module locally

```shell
guidance-for-aws-sustainability-insights-framework/typescript> cd packages/apps/<module_name>
guidance-for-aws-sustainability-insights-framework/typescript/packages/apps/<module_name> > npm run start
```

## Manually Testing API(s)

The project includes postman collection which can be imported and configured to make API calls to specific modules either running locally or deployed in the cloud

refer to the [following document](../integration/postman.md) for more information

## Automated Integration Tests

The project includes an integration test suit. The integration tests can be executed against a deployed env or a local.

Refer to the [following document](../../typescript/packages/integrationTests/README.md) for more information:

## Making changes to an existing module

We adhere to what is known as a [GitHub flow](https://guides.github.com/introduction/flow/) as far as our approach to branching is concerned.  Basically this boils down to:

+ The `main` branch always represents a working version of the code, including latest (maybe unofficially released) updates, that may be deployed to a production environment
+ Under no circumstances ever commit directly to `main`!
+ When starting a new feature or fixing a bug, create a new branch from `main`. Name the branch `feat_***` for new features or `fix_***` for hotfixes:

```sh
guidance-for-aws-sustainability-insights-framework> git switch -c <new_branch_name>

Switched to a new branch '<new_branch_name>'
```

+ At suitable points, commit your work by running the following, and following the prompts to describe your commit. Note that you must run `rush commit` inside the `source/` directory whereas you can run the `git` commands anywhere within the repo.

```sh
guidance-for-aws-sustainability-insights-framework> git add -A
guidance-for-aws-sustainability-insights-framework> cd source
guidance-for-aws-sustainability-insights-framework> rush commit
```

+ When you have finished with your implementation, and ensured that all existing unit tests pass as well as creating any new tests, the following steps are required:

	+ Merge changes with the `main` branch:

```sh
# pull in main into your branch
guidance-for-aws-sustainability-insights-framework> git merge origin/main

# once any conflicts have been resolved, test
guidance-for-aws-sustainability-insights-framework> cd typescript
guidance-for-aws-sustainability-insights-framework/typescript> rush test

# commit changes
guidance-for-aws-sustainability-insights-framework/typescript> git add -A
guidance-for-aws-sustainability-insights-framework/typescript> rush commit
```

+
	+ Generate release notes. the `rush change` command will analyze all commits on the branch, filter out the projects that changed, then prompt you to enter release notes for the updated project:

```sh
# generate release notes
guidance-for-aws-sustainability-insights-framework/typescript> rush change

# commit release notes
guidance-for-aws-sustainability-insights-framework/typescript> git add -A
guidance-for-aws-sustainability-insights-framework/typescript> rush commit
```

+
	+ Push the branch to the git repo

```sh
guidance-for-aws-sustainability-insights-framework/typescript> git push
```
+
	+ Create a pull request


+ Once your pull request has been reviewed, and any issues addressed, merge your implementation back into the main code branch.
