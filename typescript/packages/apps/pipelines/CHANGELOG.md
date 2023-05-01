# Change Log - @sif/pipelines

This log was last generated on Mon, 01 May 2023 00:31:09 GMT and should not be manually modified.

## 4.6.7
Mon, 01 May 2023 00:31:09 GMT

_Version update only_

## 4.6.6
Fri, 28 Apr 2023 15:35:58 GMT

### Patches

- cdk version

## 4.6.5
Wed, 26 Apr 2023 03:24:22 GMT

_Version update only_

## 4.6.4
Fri, 14 Apr 2023 16:13:35 GMT

### Patches

- enable cors headers to be returned in http response

## 4.6.3
Wed, 05 Apr 2023 19:11:53 GMT

_Version update only_

## 4.6.2
Mon, 03 Apr 2023 22:24:19 GMT

_Version update only_

## 4.6.1
Fri, 31 Mar 2023 06:04:14 GMT

### Patches

- pipeline plugin feature related enhancement

## 4.6.0
Thu, 16 Mar 2023 04:36:57 GMT

### Minor changes

- add new configuration type for users to optionally specify aggregation

## 4.5.3
Mon, 27 Feb 2023 00:40:07 GMT

### Patches

- should not return pagination when querying using versionAsAt

## 4.5.2
Fri, 24 Feb 2023 22:03:30 GMT

_Version update only_

## 4.5.1
Fri, 24 Feb 2023 09:59:15 GMT

_Version update only_

## 4.5.0
Thu, 23 Feb 2023 03:06:01 GMT

### Minor changes

- should use calculator to perform formula validation

## 4.4.1
Wed, 22 Feb 2023 22:14:57 GMT

### Patches

- fix logic when checking query string

## 4.4.0
Wed, 22 Feb 2023 21:08:53 GMT

### Minor changes

- add activeAt field to allow user to filter request by activation ti

## 4.3.0
Thu, 16 Feb 2023 16:46:28 GMT

### Minor changes

- add new property to indicate what action the calculato

## 4.2.7
Thu, 09 Feb 2023 05:43:19 GMT

_Version update only_

## 4.2.6
Wed, 08 Feb 2023 23:51:58 GMT

_Version update only_

## 4.2.5
Wed, 08 Feb 2023 00:40:51 GMT

### Patches

- updated to fix ash issues

## 4.2.4
Tue, 07 Feb 2023 16:06:19 GMT

### Patches

- fix vulnerable dependencies

## 4.2.3
Mon, 06 Feb 2023 22:37:13 GMT

### Patches

- Calculator and calculations API infrastruct constructs separated.

## 4.2.2
Thu, 02 Feb 2023 23:02:22 GMT

### Patches

- Documentation updates as part of open sourcing.

## 4.2.1
Thu, 02 Feb 2023 18:01:35 GMT

### Patches

- Documentation updates as part of open sourcing.

## 4.2.0
Fri, 27 Jan 2023 05:24:10 GMT

### Minor changes

- Added support for managing metrics, as well as defining metrics as part of transforms.

## 4.1.0
Tue, 10 Jan 2023 10:07:04 GMT

### Minor changes

- allow cross tenant communication

## 4.0.0
Fri, 16 Dec 2022 23:30:23 GMT

### Breaking changes

- change pagination from using resource id to encoded token

## 3.0.2
Fri, 16 Dec 2022 15:38:18 GMT

_Version update only_

## 3.0.1
Wed, 14 Dec 2022 17:23:17 GMT

### Patches

- updated ulid depndency version

## 3.0.0
Thu, 08 Dec 2022 23:33:17 GMT

### Breaking changes

- add includeChildGroups and includeParentGroups to allow list to search up and down the hierarchy

## 2.0.4
Tue, 22 Nov 2022 18:09:10 GMT

### Patches

- support dry run on POST and PATCH API's

## 2.0.3
Tue, 22 Nov 2022 04:58:52 GMT

_Version update only_

## 2.0.2
Tue, 22 Nov 2022 03:49:43 GMT

_Version update only_

## 2.0.1
Fri, 18 Nov 2022 18:36:43 GMT

### Patches

- Use common attributes schema

## 2.0.0
Thu, 17 Nov 2022 01:00:36 GMT

### Breaking changes

- rename ssaas to sif

## 1.3.0
Tue, 15 Nov 2022 22:04:19 GMT

### Minor changes

- Added contextGroup validation

## 1.2.1
Wed, 09 Nov 2022 21:07:09 GMT

### Patches

- minor api error fix

## 1.2.0
Wed, 09 Nov 2022 02:59:50 GMT

### Minor changes

- changed sort order of listView to desc

## 1.1.6
Tue, 08 Nov 2022 23:58:39 GMT

_Version update only_

## 1.1.5
Mon, 07 Nov 2022 16:31:46 GMT

### Patches

-  update access role for create/update api to allow contributors access

## 1.1.4
Fri, 04 Nov 2022 00:18:16 GMT

_Version update only_

## 1.1.3
Thu, 03 Nov 2022 20:32:23 GMT

### Patches

-  fix extranoues attributes on create/updates api requests

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

## 0.3.4
Mon, 31 Oct 2022 16:26:46 GMT

### Patches

- add validation to ensure chunk size is between 1-5MB

## 0.3.3
Thu, 27 Oct 2022 15:32:20 GMT

### Patches

- walkthrough doc added

## 0.3.2
Tue, 18 Oct 2022 17:07:16 GMT

### Patches

- Updated pipelines module to use shared validator library to validate transform 

## 0.3.1
Tue, 18 Oct 2022 16:56:04 GMT

### Patches

- fix pipelines delete api response code

## 0.3.0
Tue, 18 Oct 2022 03:36:27 GMT

### Minor changes

- updated patch and get calls with state changes

## 0.2.1
Fri, 14 Oct 2022 06:33:58 GMT

### Patches

- add --passWithNoTests when running jest

