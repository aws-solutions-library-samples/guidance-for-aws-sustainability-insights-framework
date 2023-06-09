# Change Log - @sif/impacts

This log was last generated on Mon, 22 May 2023 22:02:58 GMT and should not be manually modified.

## 4.4.0
Mon, 22 May 2023 22:02:58 GMT

### Minor changes

- should pass in key prefix when calling list alias

## 4.3.0
Mon, 22 May 2023 18:52:26 GMT

### Minor changes

- should pass in key prefix when calling list alias

## 4.2.10
Fri, 28 Apr 2023 15:35:58 GMT

### Patches

- cdk version

## 4.2.9
Fri, 14 Apr 2023 16:13:35 GMT

### Patches

- enable cors headers to be returned in http response

## 4.2.8
Fri, 31 Mar 2023 06:04:14 GMT

_Version update only_

## 4.2.7
Mon, 27 Feb 2023 23:02:40 GMT

### Patches

- update swagger

## 4.2.6
Mon, 27 Feb 2023 00:40:07 GMT

### Patches

- should not return pagination when querying using versionAsAt

## 4.2.5
Fri, 24 Feb 2023 22:03:30 GMT

_Version update only_

## 4.2.4
Fri, 24 Feb 2023 09:59:15 GMT

_Version update only_

## 4.2.3
Thu, 23 Feb 2023 17:52:11 GMT

### Patches

- module name change from "activities" to "impacts"

## 4.2.2
Thu, 23 Feb 2023 03:06:01 GMT

_Version update only_

## 4.2.1
Wed, 22 Feb 2023 22:14:57 GMT

### Patches

- fix logic when checking query string

## 4.2.0
Wed, 22 Feb 2023 21:08:53 GMT

### Minor changes

- add activeAt field to allow user to filter request by activation time

## 4.1.9
Thu, 16 Feb 2023 16:46:28 GMT

_Version update only_

## 4.1.8
Thu, 09 Feb 2023 05:43:19 GMT

_Version update only_

## 4.1.7
Wed, 08 Feb 2023 23:51:58 GMT

_Version update only_

## 4.1.6
Wed, 08 Feb 2023 00:40:51 GMT

### Patches

- updated to fix ash issues

## 4.1.5
Tue, 07 Feb 2023 16:06:19 GMT

### Patches

- fix vulnerable dependencies

## 4.1.4
Mon, 06 Feb 2023 22:37:13 GMT

### Patches

- Removed cdk dependency.

## 4.1.3
Thu, 02 Feb 2023 23:02:21 GMT

### Patches

- Documentation updates as part of open sourcing.

## 4.1.2
Thu, 02 Feb 2023 18:01:35 GMT

### Patches

- Documentation updates as part of open sourcing.

## 4.1.1
Fri, 27 Jan 2023 05:24:10 GMT

### Patches

- List tag route now module specific.

## 4.1.0
Tue, 10 Jan 2023 10:07:04 GMT

### Minor changes

- allow cross tenant communication

## 4.0.0
Fri, 16 Dec 2022 23:30:23 GMT

### Breaking changes

- change pagination from using resource id to encoded token

## 3.0.1
Wed, 14 Dec 2022 17:23:17 GMT

### Patches

- removed unnecessary dependencies

## 3.0.0
Thu, 08 Dec 2022 23:33:16 GMT

### Breaking changes

- add includeChildGroups and includeParentGroups to allow list to search up and down the hierarchy

## 2.0.2
Tue, 22 Nov 2022 04:58:52 GMT

### Patches

- activity tasks fixes

## 2.0.1
Tue, 22 Nov 2022 03:49:43 GMT

_Version update only_

## 2.0.0
Thu, 17 Nov 2022 01:00:36 GMT

### Breaking changes

- rename ssaas to sif

## 1.4.0
Tue, 15 Nov 2022 22:04:19 GMT

### Minor changes

- Added contextGroup validation

## 1.3.0
Mon, 14 Nov 2022 11:32:32 GMT

### Minor changes

- added the ability to corrolate between tasks and activities also some bug fixes

## 1.2.0
Wed, 09 Nov 2022 02:59:50 GMT

### Minor changes

- changed sort order of listView to desc

## 1.1.5
Mon, 07 Nov 2022 16:31:46 GMT

### Patches

- update access role for create/update api to allow contributors access

## 1.1.4
Fri, 04 Nov 2022 00:18:16 GMT

_Version update only_

## 1.1.3
Thu, 03 Nov 2022 20:32:23 GMT

### Patches

- fix extranoues attributes on create/updates api requests

## 1.1.2
Wed, 02 Nov 2022 14:55:28 GMT

### Patches

- Local config generator updated to use SSMClient from latest AWS SDK.

## 1.1.1
Tue, 01 Nov 2022 15:42:15 GMT

### Patches

- listen to 0.0.0.0 to listen all available IPv4 address when needed when running inside container

## 1.1.0
Tue, 01 Nov 2022 08:37:45 GMT

### Minor changes

- introduce feature toggle for delete resource

## 1.0.0
Tue, 01 Nov 2022 04:21:49 GMT

### Breaking changes

- updated module to use SSM Parameters instead of CF exports

## 0.3.0
Tue, 18 Oct 2022 03:36:27 GMT

### Minor changes

- updated patch and get calls with state changes

## 0.2.1
Fri, 14 Oct 2022 06:33:58 GMT

### Patches

- add --passWithNoTests when running jest

## 0.1.1
Fri, 14 Oct 2022 02:39:30 GMT

### Patches

- make sure that the schema definition is not duplicated and properly exported

