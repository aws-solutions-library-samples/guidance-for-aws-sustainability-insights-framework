# Change Log - @sif/resource-api-base

This log was last generated on Mon, 22 May 2023 22:02:58 GMT and should not be manually modified.

## 3.7.0
Mon, 22 May 2023 22:02:58 GMT

### Minor changes

- list and get alias allow new parameter to search for different resource type in the same DynamoDB table

## 3.6.0
Mon, 22 May 2023 18:52:26 GMT

### Minor changes

- list and get alias allow new parameter to search for different resource type in the same DynamoDB table

## 3.5.4
Fri, 31 Mar 2023 06:04:14 GMT

_Version update only_

## 3.5.3
Fri, 24 Feb 2023 22:03:30 GMT

_Version update only_

## 3.5.2
Fri, 24 Feb 2023 09:59:15 GMT

_Version update only_

## 3.5.1
Thu, 23 Feb 2023 03:06:01 GMT

### Patches

- fix environment variable issue that requires parsing to integer

## 3.5.0
Wed, 22 Feb 2023 21:08:53 GMT

### Minor changes

- add activeAt field to be used on all resources

## 3.4.0
Thu, 16 Feb 2023 16:46:28 GMT

### Minor changes

- add notImplementedResponse type

## 3.3.0
Thu, 09 Feb 2023 05:43:19 GMT

### Minor changes

- add xray wrapper to aws-sdk

## 3.2.6
Wed, 08 Feb 2023 23:51:58 GMT

_Version update only_

## 3.2.5
Wed, 08 Feb 2023 00:40:51 GMT

_Version update only_

## 3.2.4
Tue, 07 Feb 2023 16:06:19 GMT

### Patches

- fix vulnerable dependencies

## 3.2.3
Mon, 06 Feb 2023 22:37:13 GMT

_Version update only_

## 3.2.2
Thu, 02 Feb 2023 23:02:22 GMT

### Patches

- Documentation updates as part of open sourcing.

## 3.2.1
Thu, 02 Feb 2023 18:01:35 GMT

### Patches

- Documentation updates as part of open sourcing.

## 3.2.0
Fri, 27 Jan 2023 05:24:10 GMT

### Minor changes

- Removed common list tag route.

## 3.1.0
Tue, 10 Jan 2023 10:07:04 GMT

### Minor changes

- allow cross tenant communication

## 3.0.0
Fri, 16 Dec 2022 23:30:23 GMT

### Breaking changes

- update listIds implementation to cater for user and groups

## 2.0.0
Thu, 08 Dec 2022 23:33:17 GMT

### Breaking changes

- add includeChildGroups and includeParentGroups to allow list to search up and down the hierarchy

## 1.1.1
Tue, 22 Nov 2022 04:58:52 GMT

_Version update only_

## 1.1.0
Tue, 22 Nov 2022 03:49:43 GMT

### Minor changes

- add configuration and configurationSource types/schemas to be used by multiple modules

## 1.0.0
Thu, 17 Nov 2022 01:00:36 GMT

### Breaking changes

- rename ssaas to sif

## 0.2.0
Tue, 15 Nov 2022 22:04:19 GMT

### Minor changes

- Updated Cognito constructs to use SRP auth flow

### Patches

- when listing based on alias should query all groups not limited to 1

## 0.1.1
Fri, 04 Nov 2022 00:18:16 GMT

### Patches

- common headers should include 'accept'

## 0.1.0
Mon, 31 Oct 2022 16:26:46 GMT

_Initial release_

