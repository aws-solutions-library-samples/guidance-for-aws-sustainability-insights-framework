# Change Log - @sif/infrastructure-platform

This log was last generated on Thu, 17 Aug 2023 02:44:14 GMT and should not be manually modified.

## 2.6.0
Thu, 17 Aug 2023 02:44:14 GMT

### Minor changes

- Add use of ARM Lambda architecture

## 2.5.2
Fri, 21 Jul 2023 23:58:18 GMT

### Patches

- Update CDK version.

## 2.5.1
Fri, 21 Jul 2023 01:41:57 GMT

### Patches

- fix semaphore event bridge rule to use the right suffix

## 2.5.0
Thu, 20 Jul 2023 00:30:14 GMT

### Minor changes

- add construct for deploying CaML sagemker endpoint
- update node version to 18.x

### Patches

- repo cleaning script added

## 2.4.2
Wed, 14 Jun 2023 00:22:26 GMT

### Patches

- fix ecs service linked role on new deployments

## 2.4.1
Thu, 08 Jun 2023 12:58:17 GMT

### Patches

- set environment specific name for the update schema task definition

## 2.4.0
Thu, 08 Jun 2023 01:01:56 GMT

### Minor changes

- new ecs cluster construct to spin up database migration task

## 2.3.0
Mon, 29 May 2023 05:49:43 GMT

### Minor changes

- new construct for semaphore functionalitry

## 2.2.0
Mon, 01 May 2023 00:31:09 GMT

### Minor changes

- expose the RDS cluster endpoint

## 2.1.0
Fri, 28 Apr 2023 15:35:58 GMT

### Minor changes

- convert acl to bucket policy

## 2.0.4
Sat, 18 Feb 2023 02:43:54 GMT

### Patches

- should create rds service linked role if it does not exist

## 2.0.3
Thu, 09 Feb 2023 05:43:19 GMT

### Patches

- appy fixes for guardiang findings

## 2.0.2
Tue, 07 Feb 2023 16:06:19 GMT

### Patches

- fix vulnerable dependencies

## 2.0.1
Mon, 06 Feb 2023 23:17:01 GMT

### Patches

- should put nag suppressions for cluster deletion protection

## 2.0.0
Mon, 06 Feb 2023 22:37:13 GMT

### Breaking changes

- address cdk-nag findings

## 1.0.0
Fri, 27 Jan 2023 05:24:10 GMT

### Breaking changes

- New module to be responsible for platform wide infrastructure.

### Patches

- included common platform level infrastructure

