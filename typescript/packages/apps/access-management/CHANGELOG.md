# Change Log - @sif/access-management

This log was last generated on Thu, 25 May 2023 14:48:59 GMT and should not be manually modified.

## 4.0.21
Thu, 25 May 2023 14:48:59 GMT

### Patches

- Fix Patch User, Tags

## 4.0.20
Mon, 22 May 2023 22:02:58 GMT

### Patches

- minor fixes

## 4.0.19
Mon, 22 May 2023 18:52:26 GMT

### Patches

- minor fixes

## 4.0.18
Wed, 03 May 2023 16:57:27 GMT

### Patches

- fixed issue with list group by tags

## 4.0.17
Thu, 20 Apr 2023 21:57:48 GMT

### Patches

- should always set the defaultGroup in the backend

## 4.0.16
Fri, 14 Apr 2023 16:13:35 GMT

### Patches

- enable cors headers to be returned in http response

## 4.0.15
Fri, 31 Mar 2023 06:04:14 GMT

### Patches

- plugin enhancements

## 4.0.14
Fri, 24 Feb 2023 22:03:30 GMT

_Version update only_

## 4.0.13
Fri, 24 Feb 2023 09:59:15 GMT

_Version update only_

## 4.0.12
Thu, 23 Feb 2023 03:06:01 GMT

_Version update only_

## 4.0.11
Wed, 22 Feb 2023 21:08:53 GMT

_Version update only_

## 4.0.10
Thu, 16 Feb 2023 16:46:28 GMT

_Version update only_

## 4.0.9
Thu, 09 Feb 2023 05:43:19 GMT

_Version update only_

## 4.0.8
Wed, 08 Feb 2023 23:51:58 GMT

_Version update only_

## 4.0.7
Wed, 08 Feb 2023 00:40:51 GMT

### Patches

- updated to fix ash issues

## 4.0.6
Tue, 07 Feb 2023 16:06:19 GMT

### Patches

- fix vulnerable dependencies

## 4.0.5
Mon, 06 Feb 2023 22:37:13 GMT

_Version update only_

## 4.0.4
Thu, 02 Feb 2023 23:02:21 GMT

### Patches

- Documentation updates as part of open sourcing.

## 4.0.3
Thu, 02 Feb 2023 18:01:35 GMT

### Patches

- Documentation updates as part of open sourcing.

## 4.0.2
Fri, 27 Jan 2023 05:24:10 GMT

### Patches

- List tag route now module specific.

## 4.0.1
Tue, 10 Jan 2023 10:07:04 GMT

_Version update only_

## 4.0.0
Fri, 16 Dec 2022 23:30:23 GMT

### Breaking changes

- add the capability to search users and groups up and down the hierearchy

## 3.0.0
Thu, 08 Dec 2022 23:33:16 GMT

### Breaking changes

- add includeChildGroups and includeParentGroups to allow list to search up and down the hierarchy

## 2.1.2
Tue, 22 Nov 2022 06:09:02 GMT

### Patches

- update docs

## 2.1.1
Tue, 22 Nov 2022 04:58:52 GMT

_Version update only_

## 2.1.0
Tue, 22 Nov 2022 03:49:43 GMT

### Minor changes

- create/update group not has the option to specify application configuration

## 2.0.0
Thu, 17 Nov 2022 01:00:36 GMT

### Breaking changes

- rename ssaas to sif

## 1.2.1
Wed, 16 Nov 2022 06:39:07 GMT

### Patches

- fix an issue where it throws 418 when listByIds return undefined

## 1.2.0
Tue, 15 Nov 2022 22:04:19 GMT

### Minor changes

- Added a defaultGroup to the user schema

## 1.1.0
Wed, 09 Nov 2022 02:59:50 GMT

### Minor changes

- changed sort order of listView to desc

## 1.0.5
Tue, 08 Nov 2022 23:58:39 GMT

_Version update only_

## 1.0.4
Fri, 04 Nov 2022 21:22:31 GMT

### Patches

- Removed global flag from revoke handler

## 1.0.3
Fri, 04 Nov 2022 00:18:16 GMT

_Version update only_

## 1.0.2
Wed, 02 Nov 2022 14:55:28 GMT

### Patches

- Local config generator updated to use SSMClient from latest AWS SDK.

## 1.0.1
Tue, 01 Nov 2022 15:42:15 GMT

### Patches

- listen to 0.0.0.0 to listen all available IPv4 address when needed when running inside container

## 1.0.0
Tue, 01 Nov 2022 04:21:49 GMT

### Breaking changes

- updated module to use SSM Parameters instead of CF exports

## 0.2.1
Fri, 14 Oct 2022 06:33:58 GMT

### Patches

- add --passWithNoTests when running jest

## 0.2.0
Fri, 14 Oct 2022 05:30:44 GMT

_Initial release_

