# Change Log - @sif/pipeline-processors

This log was last generated on Thu, 17 Aug 2023 02:44:14 GMT and should not be manually modified.

## 4.13.2
Thu, 17 Aug 2023 02:44:14 GMT

### Patches

- added cloudwatch metrics to our step functions
- added additional validation for pipeline aggregation

## 4.13.1
Fri, 28 Jul 2023 00:50:20 GMT

_Version update only_

## 4.13.0
Thu, 20 Jul 2023 00:30:14 GMT

### Minor changes

- updated audit log query log in accordance with new designs
- update node version to 18.x

### Patches

- added new endpoint to download output of data and emission_factor type pipeline
- repo cleaning script added
- run local bugfix

## 4.12.3
Mon, 03 Jul 2023 02:39:22 GMT

### Patches

- fix query activies with showHistory set to true to make sure we return results from multiple version of pipeline configuration

## 4.12.2
Fri, 30 Jun 2023 17:08:59 GMT

### Patches

- fix show history query issue

## 4.12.1
Mon, 19 Jun 2023 02:37:22 GMT

### Patches

- Add dynamic group processing for activites and metrics to support ASSIGN_TO_GROUP

## 4.12.0
Fri, 09 Jun 2023 20:40:06 GMT

### Minor changes

- Add bulk insert feature to allow for bulk creation of activities via s3 import

### Patches

- added metrics migration task 

## 4.11.0
Thu, 08 Jun 2023 12:58:17 GMT

### Minor changes

- Add bulk insert feature to allow for bulk creation of activities via s3 import

## 4.10.0
Mon, 22 May 2023 22:02:58 GMT

### Minor changes

- add new feature to store metric in aurora

## 4.9.0
Mon, 22 May 2023 18:52:26 GMT

### Minor changes

- add new feature to store metric in aurora

## 4.8.0
Mon, 01 May 2023 00:31:09 GMT

### Minor changes

- refactor pipeline-processors to use latest value tables

## 4.7.2
Wed, 26 Apr 2023 03:24:22 GMT

### Patches

- optimize step function

## 4.7.1
Fri, 14 Apr 2023 16:13:35 GMT

### Patches

- enable cors headers to be returned in http response

## 4.7.0
Wed, 05 Apr 2023 19:11:53 GMT

### Minor changes

- allow user to do inline execution of pipeline

## 4.6.3
Tue, 04 Apr 2023 03:26:15 GMT

### Patches

- fix an issue where we're still expecting the nextToken to be returned

## 4.6.2
Mon, 03 Apr 2023 22:24:19 GMT

### Patches

- implement authorization check when using pipeline processor api

## 4.6.1
Mon, 03 Apr 2023 20:15:09 GMT

### Patches

- fix to return the correct pagination token for activities

## 4.6.0
Fri, 31 Mar 2023 09:43:49 GMT

### Minor changes

-  new audit log query endpoint based on activity id

## 4.5.2
Fri, 31 Mar 2023 06:04:14 GMT

### Patches

- pipeline plugin feature related enhancement

## 4.5.1
Thu, 23 Mar 2023 19:27:15 GMT

### Patches

- Remove unused dependency

## 4.5.0
Thu, 16 Mar 2023 04:36:57 GMT

### Minor changes

- add logic to insert and query aggregated data

## 4.4.6
Fri, 24 Feb 2023 22:03:30 GMT

_Version update only_

## 4.4.5
Fri, 24 Feb 2023 09:59:15 GMT

_Version update only_

## 4.4.4
Fri, 24 Feb 2023 05:33:21 GMT

### Patches

- reverting change

## 4.4.3
Thu, 23 Feb 2023 03:06:01 GMT

_Version update only_

## 4.4.2
Wed, 22 Feb 2023 21:08:53 GMT

_Version update only_

## 4.4.1
Thu, 16 Feb 2023 16:46:28 GMT

### Patches

- Updated Activity queries so they can ignore null value fields when showHistory is false
- should take into account the time range when aggregating output

## 4.4.0
Thu, 09 Feb 2023 05:43:19 GMT

### Minor changes

- add xray wrapper to aws-sdk

## 4.3.6
Thu, 09 Feb 2023 00:04:04 GMT

### Patches

- Updated docs.

## 4.3.5
Wed, 08 Feb 2023 23:51:58 GMT

_Version update only_

## 4.3.4
Wed, 08 Feb 2023 00:40:51 GMT

### Patches

- updated to fix ash issues

## 4.3.3
Tue, 07 Feb 2023 16:06:19 GMT

### Patches

- fix vulnerable dependencies

## 4.3.2
Mon, 06 Feb 2023 22:37:13 GMT

_Version update only_

## 4.3.1
Mon, 06 Feb 2023 19:20:10 GMT

### Patches

- fixes metric list api members query

## 4.3.0
Mon, 06 Feb 2023 02:11:05 GMT

### Minor changes

- add new endpoint to return list of audit files

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

- A new aggregation task added to the step function to aggregate metrics. Updated to support new calculation engine interface. 

### Patches

- refactored aggregations related implementation form timestream to aurora

## 4.1.0
Tue, 10 Jan 2023 10:07:04 GMT

### Minor changes

- allow cross tenant communication

## 4.0.2
Fri, 16 Dec 2022 23:30:23 GMT

### Patches

- remove count from list response

## 4.0.1
Wed, 14 Dec 2022 17:23:17 GMT

### Patches

- replaced short-unique-id with ulid

## 4.0.0
Thu, 08 Dec 2022 23:33:17 GMT

### Breaking changes

- add includeChildGroups and includeParentGroups to allow list to search up and down the hierarchy

## 3.1.3
Tue, 22 Nov 2022 04:58:52 GMT

_Version update only_

## 3.1.2
Tue, 22 Nov 2022 03:49:43 GMT

_Version update only_

## 3.1.1
Fri, 18 Nov 2022 18:36:43 GMT

### Patches

- Invoke calculator in S3 mode, handle errors

## 3.1.0
Thu, 17 Nov 2022 17:33:24 GMT

### Minor changes

- generating upload signed url should also return pipeline and execution id

## 3.0.0
Thu, 17 Nov 2022 01:00:36 GMT

### Breaking changes

- rename ssaas to sif

## 2.2.0
Tue, 15 Nov 2022 22:04:19 GMT

### Minor changes

- Added contextGroup validation

## 2.1.0
Wed, 09 Nov 2022 02:59:50 GMT

### Minor changes

- changed sort order of listView to desc

## 2.0.6
Tue, 08 Nov 2022 23:58:39 GMT

### Patches

- should publish events to eventbridge if upload file failed when signed url being used

## 2.0.5
Tue, 08 Nov 2022 02:50:17 GMT

### Patches

- add common header configuration for pipeline processors

## 2.0.4
Mon, 07 Nov 2022 16:31:46 GMT

### Patches

-  update access role for create/update api to allow contributors access

## 2.0.3
Thu, 03 Nov 2022 20:32:23 GMT

### Patches

-  fix extranoues attributes on create/updates api requests

## 2.0.2
Wed, 02 Nov 2022 14:55:28 GMT

### Patches

- Local config generator updated to use SSMClient from latest AWS SDK.

## 2.0.1
Tue, 01 Nov 2022 15:42:15 GMT

### Patches

- listen to 0.0.0.0 to listen all available IPv4 address when needed when running inside container

## 2.0.0
Tue, 01 Nov 2022 04:21:49 GMT

### Breaking changes

- updated module to use SSM Parameters instead of CF exports

## 1.0.1
Mon, 31 Oct 2022 16:26:46 GMT

### Patches

- fix issue when reading file from s3 using select range

## 1.0.0
Wed, 26 Oct 2022 22:42:43 GMT

### Breaking changes

- refactor the handler to move the logic to tasks class and add error checking, also change the signed url request to POST

## 0.4.0
Tue, 18 Oct 2022 03:36:27 GMT

### Minor changes

- updated patch and get calls with state changes

## 0.3.0
Tue, 18 Oct 2022 02:54:01 GMT

### Minor changes

- updated to use shared S3 bucket

## 0.2.2
Fri, 14 Oct 2022 06:33:58 GMT

### Patches

- add --passWithNoTests when running jest

## 0.2.1
Fri, 14 Oct 2022 04:37:00 GMT

### Patches

- use \n as delimiter when processing csv and fix the authorization context

