# Change Log - @sif/infrastructure-tenant

This log was last generated on Fri, 17 Mar 2023 04:01:21 GMT and should not be manually modified.

## 7.3.0
Fri, 17 Mar 2023 04:01:21 GMT

### Minor changes

- move deployment helper to its own construct for clarity

## 7.2.0
Thu, 16 Mar 2023 04:36:57 GMT

### Minor changes

- add new handler in pipeline processors to aggregate pipeline output

## 7.1.6
Mon, 27 Feb 2023 00:40:07 GMT

_Version update only_

## 7.1.5
Fri, 24 Feb 2023 22:03:30 GMT

_Version update only_

## 7.1.4
Fri, 24 Feb 2023 09:59:15 GMT

_Version update only_

## 7.1.3
Thu, 23 Feb 2023 17:52:11 GMT

### Patches

- stack name change from "activities" to "impacts"

## 7.1.2
Thu, 23 Feb 2023 03:06:01 GMT

_Version update only_

## 7.1.1
Wed, 22 Feb 2023 22:14:57 GMT

_Version update only_

## 7.1.0
Wed, 22 Feb 2023 21:08:53 GMT

### Minor changes

- Add new GSI to store resourece/activation time data

## 7.0.6
Sat, 18 Feb 2023 02:43:54 GMT

### Patches

- set the delete bucket policy properly

## 7.0.5
Thu, 16 Feb 2023 16:46:28 GMT

### Patches

- Fixed issue with wrong SSM parameter being read for the datetime table

## 7.0.4
Thu, 09 Feb 2023 05:43:19 GMT

### Patches

- appy fixes for guardiang findings

## 7.0.3
Wed, 08 Feb 2023 23:51:58 GMT

_Version update only_

## 7.0.2
Wed, 08 Feb 2023 00:40:51 GMT

### Patches

- updated to fix ash issues

## 7.0.1
Tue, 07 Feb 2023 16:06:19 GMT

### Patches

- fix vulnerable dependencies

## 7.0.0
Mon, 06 Feb 2023 22:37:13 GMT

### Breaking changes

- address cdk-nag findings

### Patches

- Calculator and calculations API infrastruct constructs separated.

## 6.1.0
Mon, 06 Feb 2023 02:11:05 GMT

### Minor changes

- kms should be created in shared stack to avoid dependency between calculation engine and pipeline processors

## 6.0.2
Thu, 02 Feb 2023 23:02:22 GMT

### Patches

- Documentation updates as part of open sourcing.

## 6.0.1
Thu, 02 Feb 2023 18:01:35 GMT

### Patches

- Documentation updates as part of open sourcing.

## 6.0.0
Fri, 27 Jan 2023 05:24:10 GMT

### Breaking changes

- Existing @sif/infrastructure module refactored to this module to be responsible for tenant specific infrastructure.

## 5.2.0
Tue, 10 Jan 2023 10:07:04 GMT

### Minor changes

- allow cross tenant communication

## 5.1.2
Thu, 22 Dec 2022 18:34:17 GMT

### Patches

- reference datasets enhancement: step function for indexing 

## 5.1.1
Mon, 19 Dec 2022 21:16:23 GMT

### Patches

- ensure that seeded admin email is stored in lowercase

## 5.1.0
Fri, 16 Dec 2022 23:30:23 GMT

### Minor changes

- seed users with approriate keys in GSI3

## 5.0.1
Fri, 16 Dec 2022 15:38:18 GMT

_Version update only_

## 5.0.0
Thu, 08 Dec 2022 23:33:17 GMT

### Breaking changes

- add includeChildGroups and includeParentGroups to allow list to search up and down the hierarchy

## 4.1.5
Mon, 05 Dec 2022 19:49:40 GMT

### Patches

- Remove pnpm dependency

## 4.1.4
Thu, 01 Dec 2022 00:37:46 GMT

### Patches

- fixed new deployment issue

## 4.1.3
Tue, 22 Nov 2022 18:09:10 GMT

### Patches

- minor fixes

## 4.1.2
Tue, 22 Nov 2022 06:09:02 GMT

_Version update only_

## 4.1.1
Tue, 22 Nov 2022 04:58:52 GMT

### Patches

- minor fixes

## 4.1.0
Tue, 22 Nov 2022 03:49:43 GMT

### Minor changes

- dynamodb seeder should include default configuration for root group

## 4.0.1
Thu, 17 Nov 2022 17:33:24 GMT

_Version update only_

## 4.0.0
Thu, 17 Nov 2022 01:00:36 GMT

### Breaking changes

- rename ssaas to sif

## 3.4.1
Wed, 16 Nov 2022 06:39:07 GMT

### Patches

- should see the admin user with default group and properly index the group

## 3.4.0
Tue, 15 Nov 2022 22:04:19 GMT

### Minor changes

- Added contextGroup validation

## 3.3.1
Mon, 14 Nov 2022 11:32:32 GMT

### Patches

- Updated activity construct

## 3.3.0
Wed, 09 Nov 2022 03:53:58 GMT

### Minor changes

- add option to upload reference dataset using signed url

## 3.2.1
Wed, 09 Nov 2022 02:59:50 GMT

_Version update only_

## 3.2.0
Tue, 08 Nov 2022 23:58:39 GMT

### Minor changes

- give putEvents access to bucketEvents lambda

## 3.1.7
Mon, 07 Nov 2022 16:31:46 GMT

_Version update only_

## 3.1.6
Fri, 04 Nov 2022 21:22:31 GMT

_Version update only_

## 3.1.5
Fri, 04 Nov 2022 00:18:16 GMT

_Version update only_

## 3.1.4
Thu, 03 Nov 2022 20:32:23 GMT

_Version update only_

## 3.1.3
Wed, 02 Nov 2022 14:55:28 GMT

### Patches

- Clean up of unused outputs.

## 3.1.2
Tue, 01 Nov 2022 15:42:15 GMT

### Patches

- remove non existing export

## 3.1.1
Tue, 01 Nov 2022 09:25:18 GMT

### Patches

- fix merge conflict where ENABLE_DELETE_RESOURCE is not being passed to lambda

## 3.1.0
Tue, 01 Nov 2022 08:37:45 GMT

### Minor changes

- introduce feature toggle for delete resource

## 3.0.0
Tue, 01 Nov 2022 04:21:49 GMT

### Breaking changes

- updated module to use SSM Parameters instead of CF exports

## 2.0.1
Mon, 31 Oct 2022 16:26:46 GMT

### Patches

- modify the chunksize default and increase memory for calculator task

## 2.0.0
Thu, 27 Oct 2022 15:32:20 GMT

### Breaking changes

- refactor the handler to move the logic to tasks class and add error checking, also change the signed url request to POST

## 0.4.2
Tue, 25 Oct 2022 21:11:03 GMT

### Patches

- End to End Test CICD Fix for Pipeline Processor API URL

## 0.4.1
Tue, 18 Oct 2022 17:07:16 GMT

_Version update only_

## 0.4.0
Tue, 18 Oct 2022 04:05:12 GMT

### Minor changes

- add the ability to specify SES when handling Cognito email deliveries

## 0.3.1
Tue, 18 Oct 2022 03:36:27 GMT

_Version update only_

## 0.3.0
Tue, 18 Oct 2022 02:54:01 GMT

### Minor changes

- creating a shared s3 bucket for all modules in the same tenant to use

## 0.2.1
Fri, 14 Oct 2022 06:33:58 GMT

### Patches

- add --passWithNoTests when running jest

## 1.0.0
Fri, 14 Oct 2022 02:39:30 GMT

### Breaking changes

- use ssm parameter for stack depedencies
